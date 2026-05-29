import express from 'express';
import cors from 'cors';
import multer from 'multer';
import Tesseract from 'tesseract.js';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Gemini AI Client (initialized ONCE at startup, never mutated per-request) ─
const geminiApiKey = process.env.GEMINI_API_KEY;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const visionModel = genAI
  ? genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
  : null;

if (genAI) {
  console.log('🤖 [Gemini Vision] API Key detected — PRIMARY OCR engine = Gemini Vision.');
} else {
  console.log('⚠️  [Gemini Vision] No GEMINI_API_KEY — falling back to Tesseract.js.');
}

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'] }));
app.use(express.json());

// ─── Multer (memory, max 10 MB) ───────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) =>
    file.mimetype.startsWith('image/')
      ? cb(null, true)
      : cb(new Error('Invalid file type — only images are supported.')),
});

// ─── Sharp Pre-processing (Tesseract fallback only) ───────────────────────────
async function preprocessImage(buffer, options = {}) {
  try {
    let p = sharp(buffer);
    const meta = await p.metadata();
    if (meta.width && meta.width < 1200) {
      p = p.resize({ width: Math.round(meta.width * 2), kernel: sharp.kernel.lanczos3 });
    }
    p = p.greyscale();
    if (options.preprocessMode === 'threshold') {
      p = p.threshold(parseInt(options.thresholdLevel) || 135);
    } else {
      p = p.normalize().sharpen({ sigma: 1.0, m1: 2.0, m2: 2.0 });
    }
    return await p.toFormat('png').toBuffer();
  } catch (err) {
    console.warn('[Sharp] Pre-processing failed, using raw buffer:', err.message);
    return buffer;
  }
}

// ─── PRIMARY: Gemini Vision OCR ───────────────────────────────────────────────
async function ocrWithGemini(imageBuffer, mimeType, lang) {
  const isMultilang = lang.includes('tha') && lang.includes('eng');
  const isThai = lang.includes('tha');

  let langInstruction = '';
  if (isMultilang) {
    langInstruction = 'The image may contain both Thai and English text. Preserve both languages exactly as written.';
  } else if (isThai) {
    langInstruction = 'The image contains Thai text. Preserve it exactly as written.';
  } else {
    langInstruction = 'The image contains English text. Preserve it exactly as written.';
  }

  const prompt = `You are a precise OCR (Optical Character Recognition) system.
Your ONLY job is to extract and return every visible text character from the image.

STRICT RULES:
1. Output ONLY the raw text you see in the image — nothing else.
2. Do NOT translate, summarize, explain, or reformat the text.
3. Do NOT add greetings, labels, or markdown code blocks.
4. Preserve the original line structure as faithfully as possible.
5. Keep Thai text in Thai script and English text in English — do NOT mix or convert.
6. If text appears in columns (left and right side), separate them with a tab character.
7. Remove only obvious decorative noise (dashed border lines, repeating symbols). Keep all real text.
8. Output every word, number, and punctuation mark that is visible.

${langInstruction}

Begin extraction now:`;

  const result = await visionModel.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType: mimeType || 'image/png',
        data: imageBuffer.toString('base64'),
      },
    },
  ]);

  let text = result.response.text();
  // Strip any accidental markdown wrapper
  text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
  return text;
}

// ─── FALLBACK: Tesseract.js OCR ───────────────────────────────────────────────
function reconstructLayout(lines) {
  if (!lines || lines.length === 0) return '';
  let out = '';
  for (const line of lines) {
    if (!line.words || line.words.length === 0) {
      out += (line.text || '') + '\n';
      continue;
    }
    let lineStr = '';
    for (let i = 0; i < line.words.length; i++) {
      const cur = line.words[i];
      const wordText = cur.text || '';
      if (i === 0) {
        lineStr += wordText;
      } else {
        const prev = line.words[i - 1];
        const gap = cur.bbox.x0 - prev.bbox.x1;
        const charW = (prev.bbox.x1 - prev.bbox.x0) / Math.max(1, prev.text.length);
        if (gap > 45 && gap > charW * 4.0) {
          lineStr += ' '.repeat(Math.min(28, Math.max(4, Math.round(gap / charW)))) + wordText;
        } else if (gap > charW * 1.2) {
          lineStr += ' ' + wordText;
        } else {
          lineStr += gap > 2 ? ' ' + wordText : wordText;
        }
      }
    }
    out += lineStr + '\n';
  }
  return out;
}

function correctOcrText(text) {
  if (!text) return text;
  let t = text;
  const rules = [
    [/เเ/g, 'แ'],
    [/โอนเเงิน/g, 'โอนเงิน'],
    [/โอนเฃิน/g, 'โอนเงิน'],
    [/รายรับคงหปล/g, 'รายรับคงเหลือ'],
    [/ยอดเงินคงหปล/g, 'ยอดเงินคงเหลือ'],
    [/รายวาย/g, 'รายจ่าย'],
    [/เทือหนว/g, 'ทั้งหมด'],
    [/วันที\b/g, 'วันที่'],
    [/จํานวนเงิน/g, 'จำนวนเงิน'],
    [/ช้อมูล/g, 'ข้อมูล'],
    [/เสร็จสิ้บ/g, 'เสร็จสิ้น'],
    [/สําเร็จ/g, 'สำเร็จ'],
    [/ใข้/g, 'ใช้'],
    [/ผู้้/g, 'ผู้'],
    [/ค่่า/g, 'ค่า'],
  ];
  for (const [p, r] of rules) t = t.replace(p, r);
  return t;
}

async function ocrWithTesseract(buffer, lang, psmMode) {
  const { data } = await Tesseract.recognize(buffer, lang, {
    tessedit_pageseg_mode: psmMode,
    logger: (m) => {
      if (m.status === 'recognizing text') {
        process.stdout.write(`\r[Tesseract] ${(m.progress * 100).toFixed(0)}%  `);
      }
    },
  });
  process.stdout.write('\n');
  return {
    text: correctOcrText(reconstructLayout(data.lines)),
    confidence: data.confidence,
  };
}

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      primaryOcr: genAI ? 'gemini-vision' : 'tesseract.js',
      preprocessor: 'sharp',
      geminiActive: genAI !== null,
    },
  });
});

// ─── Main Extract-Text Endpoint ────────────────────────────────────────────────
app.post('/api/extract-text', upload.single('image'), async (req, res) => {
  const t0 = Date.now();

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided.' });
    }

    let lang = req.body.languages || 'eng+tha';
    if (Array.isArray(lang)) lang = lang.join('+');
    lang = lang.replace(/,/g, '+');

    const doPreprocess = req.body.preprocess === 'true';
    const preprocessMode = req.body.preprocessMode || 'enhance';
    const thresholdLevel = req.body.thresholdLevel || '135';
    const psmMode = req.body.psm || '3';
    const mimeType = req.file.mimetype || 'image/png';

    console.log(
      `\n[OCR] "${req.file.originalname}" | ${req.file.size}B | lang:${lang} | engine:${genAI ? 'Gemini' : 'Tesseract'}`
    );

    let extractedText = '';
    let confidence = null;
    let engineUsed = '';

    // ── Path A: Gemini Vision (Primary) ───────────────────────────────────────
    if (visionModel) {
      try {
        console.log('[Gemini Vision] Sending image for OCR...');
        extractedText = await ocrWithGemini(req.file.buffer, mimeType, lang);
        engineUsed = 'gemini-vision';
        console.log(`[Gemini Vision] ✓ ${extractedText.length} chars extracted.`);
      } catch (err) {
        // Log the error but do NOT mutate visionModel — fall through to Tesseract
        console.error('[Gemini Vision] ✗ Failed:', err.message);
        console.log('[Gemini Vision] Falling back to Tesseract for this request...');
        engineUsed = ''; // mark as not set so Tesseract runs
      }
    }

    // ── Path B: Tesseract (Fallback) ──────────────────────────────────────────
    if (engineUsed === '') {
      let buf = req.file.buffer;
      if (doPreprocess) {
        buf = await preprocessImage(buf, { preprocessMode, thresholdLevel });
      }
      const result = await ocrWithTesseract(buf, lang, psmMode);
      extractedText = result.text;
      confidence = result.confidence;
      engineUsed = 'tesseract';
      console.log(`[Tesseract] ✓ Confidence: ${confidence?.toFixed(1)}%`);
    }

    const dur = Date.now() - t0;
    console.log(`[OCR Done] ${engineUsed} | ${dur}ms`);

    return res.json({
      success: true,
      text: extractedText,
      confidence,
      language: lang,
      durationMs: dur,
      engineUsed,
      tuning: {
        preprocessed: doPreprocess,
        preprocessModeUsed: doPreprocess ? preprocessMode : null,
        thresholdUsed: doPreprocess ? thresholdLevel : null,
        psmUsed: engineUsed === 'tesseract' ? psmMode : null,
        geminiUsed: engineUsed === 'gemini-vision',
      },
      metadata: {
        filename: req.file.originalname,
        sizeBytes: req.file.size,
        mimetype: req.file.mimetype,
      },
    });
  } catch (error) {
    const dur = Date.now() - t0;
    console.error(`[OCR Error] ${dur}ms:`, error.message);
    return res.status(500).json({ success: false, error: error.message || 'Text extraction failed.' });
  }
});

// ─── Multer Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, error: 'File too large. Maximum is 10MB.' });
  }
  return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
});

// ─── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════');
  console.log(`🚀 Smart Clipboard OCR — Port ${PORT}`);
  console.log(`🤖 Engine: ${genAI ? '✅ Gemini Vision (Primary)' : '⚠️  Tesseract (no API key)'}`);
  console.log('═══════════════════════════════════════════════');
});

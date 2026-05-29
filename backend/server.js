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

// ─── Gemini AI Client ────────────────────────────────────────────────────────
const geminiApiKey = process.env.GEMINI_API_KEY;
let genAI = null;
let visionModel = null;

if (geminiApiKey) {
  console.log('🤖 [Gemini Vision] API Key detected — using Gemini as PRIMARY OCR engine.');
  genAI = new GoogleGenerativeAI(geminiApiKey);
  // gemini-1.5-flash supports image input and is fast + accurate
  visionModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
} else {
  console.log('⚠️  [Gemini Vision] No GEMINI_API_KEY in .env — falling back to Tesseract.js OCR.');
}

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ─── Multer (memory storage, max 10 MB) ──────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Invalid file type. Only image files are supported.'));
  }
});

// ─── Sharp Pre-processing (used for Tesseract fallback) ──────────────────────
async function preprocessImage(buffer, options = {}) {
  try {
    let pipeline = sharp(buffer);
    const metadata = await pipeline.metadata();

    // Upscale small images to improve text density
    if (metadata.width && metadata.width < 1200) {
      pipeline = pipeline.resize({
        width: Math.round(metadata.width * 2),
        kernel: sharp.kernel.lanczos3
      });
    }

    pipeline = pipeline.greyscale();

    const mode = options.preprocessMode || 'enhance';
    if (mode === 'threshold') {
      const thresholdVal = parseInt(options.thresholdLevel) || 135;
      pipeline = pipeline.threshold(thresholdVal);
    } else {
      // Smart Enhance: normalise dynamic range + sharpen edges
      pipeline = pipeline.normalize().sharpen({ sigma: 1.0, m1: 2.0, m2: 2.0 });
    }

    return await pipeline.toFormat('png').toBuffer();
  } catch (err) {
    console.warn('[Preprocessing] Falling back to raw buffer:', err.message);
    return buffer;
  }
}

// ─── Convert buffer to base64 data URL for Gemini inline_data ────────────────
function bufferToBase64(buffer, mimeType = 'image/png') {
  return buffer.toString('base64');
}

// ─── PRIMARY: Gemini Vision OCR ──────────────────────────────────────────────
async function ocrWithGemini(imageBuffer, mimeType, lang) {
  const langHint = lang.includes('tha')
    ? 'The image may contain Thai and/or English text.'
    : 'The image contains English text.';

  const prompt = `You are a precise OCR (Optical Character Recognition) engine.

Your ONLY task is to extract ALL visible text from this image exactly as it appears.

Rules you MUST follow:
1. Read and output every word, number, and symbol you can see — do NOT skip anything.
2. Preserve the original language. Do NOT translate anything (Thai stays Thai, English stays English).
3. Preserve the original line breaks and layout as closely as possible.
4. Do NOT add explanations, comments, greetings, or extra text.
5. Do NOT wrap output in markdown code blocks or quotes.
6. If two columns of text appear side-by-side, put a tab character between them.
7. Remove decorative noise (dashes, repeated symbols that form borders) but keep real text.
8. Output ONLY the raw extracted text — nothing else.

${langHint}`;

  const result = await visionModel.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType: mimeType || 'image/png',
        data: bufferToBase64(imageBuffer)
      }
    }
  ]);

  let text = result.response.text();

  // Strip accidental markdown wrappers
  text = text
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  return text;
}

// ─── FALLBACK: Tesseract.js OCR ──────────────────────────────────────────────
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
          const spaces = Math.min(28, Math.max(4, Math.round(gap / charW)));
          lineStr += ' '.repeat(spaces) + wordText;
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
    { p: /เเ/g, r: 'แ' },
    { p: /โอนเเงิน/g, r: 'โอนเงิน' },
    { p: /โอนเฃิน/g, r: 'โอนเงิน' },
    { p: /รายรับคงหปล/g, r: 'รายรับคงเหลือ' },
    { p: /ยอดเงินคงหปล/g, r: 'ยอดเงินคงเหลือ' },
    { p: /รายวาย/g, r: 'รายจ่าย' },
    { p: /เทือหนว/g, r: 'ทั้งหมด' },
    { p: /รองรน/g, r: 'รองรับ' },
    { p: /วันที\b/g, r: 'วันที่' },
    { p: /จํานวนเงิน/g, r: 'จำนวนเงิน' },
    { p: /ช้อมูล/g, r: 'ข้อมูล' },
    { p: /เสร็จสิ้บ/g, r: 'เสร็จสิ้น' },
    { p: /สําเร็จ/g, r: 'สำเร็จ' },
    { p: /บัญชีู/g, r: 'บัญชี' },
    { p: /ใข้/g, r: 'ใช้' },
    { p: /ผู้้/g, r: 'ผู้' },
    { p: /ค่่า/g, r: 'ค่า' },
    { p: /สลิิป/g, r: 'สลิป' },
  ];
  for (const { p, r } of rules) t = t.replace(p, r);
  return t;
}

async function ocrWithTesseract(buffer, lang, psmMode) {
  const { data } = await Tesseract.recognize(buffer, lang, {
    tessedit_pageseg_mode: psmMode,
    logger: (m) => {
      if (m.status === 'recognizing text') {
        process.stdout.write(`\r[Tesseract] ${(m.progress * 100).toFixed(0)}%`);
      }
    }
  });
  console.log(''); // newline after progress
  const structured = reconstructLayout(data.lines);
  return { text: correctOcrText(structured), confidence: data.confidence };
}

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      primaryOcr: genAI ? 'gemini-vision' : 'tesseract.js',
      preprocessor: 'sharp',
      geminiActive: genAI !== null
    }
  });
});

// ─── Main Extract-Text Endpoint ───────────────────────────────────────────────
app.post('/api/extract-text', upload.single('image'), async (req, res) => {
  const startTime = Date.now();

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

    console.log(`[OCR Request] File: ${req.file.originalname} (${req.file.size} bytes) | Lang: ${lang} | Engine: ${genAI ? 'Gemini Vision' : 'Tesseract'}`);

    let extractedText = '';
    let confidence = null;
    let engineUsed = '';

    // ── Path A: Gemini Vision (Primary) ────────────────────────────────────
    if (genAI) {
      try {
        console.log('[Gemini Vision] Sending image to Gemini for OCR...');
        extractedText = await ocrWithGemini(req.file.buffer, mimeType, lang);
        engineUsed = 'gemini-vision';
        confidence = null; // Gemini doesn't return a confidence score
        console.log(`[Gemini Vision] Done. Extracted ${extractedText.length} characters.`);
      } catch (geminiErr) {
        console.error('[Gemini Vision] Failed, falling back to Tesseract:', geminiErr.message);
        // Fall through to Tesseract
        genAI = null; // Disable for this request so we fall to Tesseract below
      }
    }

    // ── Path B: Tesseract (Fallback / no API key) ───────────────────────────
    if (!genAI || engineUsed === '') {
      console.log('[Tesseract] Running OCR...');
      let buffer = req.file.buffer;
      if (doPreprocess) {
        buffer = await preprocessImage(buffer, { preprocessMode, thresholdLevel });
      }
      const result = await ocrWithTesseract(buffer, lang, psmMode);
      extractedText = result.text;
      confidence = result.confidence;
      engineUsed = 'tesseract';
    }

    const duration = Date.now() - startTime;
    console.log(`[OCR Done] Engine: ${engineUsed} | Length: ${extractedText.length} chars | ${duration}ms`);

    return res.json({
      success: true,
      text: extractedText,
      confidence: confidence,
      language: lang,
      durationMs: duration,
      engineUsed,
      tuning: {
        preprocessed: doPreprocess,
        preprocessModeUsed: doPreprocess ? preprocessMode : null,
        thresholdUsed: doPreprocess ? thresholdLevel : null,
        psmUsed: engineUsed === 'tesseract' ? psmMode : null,
        geminiUsed: engineUsed === 'gemini-vision'
      },
      metadata: {
        filename: req.file.originalname,
        sizeBytes: req.file.size,
        mimetype: req.file.mimetype,
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[OCR Error] ${duration}ms:`, error);
    return res.status(500).json({ success: false, error: error.message || 'Text extraction failed.' });
  }
});

// ─── Multer Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: 'File too large. Max 10MB.' });
    }
    return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
  }
  return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('===============================================');
  console.log(`🚀 Smart Clipboard OCR — Port ${PORT}`);
  console.log(`🤖 OCR Engine: ${genAI ? '✅ Gemini Vision (Primary)' : '⚠️  Tesseract.js (Fallback — add GEMINI_API_KEY)'}`);
  console.log(`📂 Max upload: 10MB`);
  console.log('===============================================');
});

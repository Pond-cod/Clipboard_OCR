import express from 'express';
import cors from 'cors';
import multer from 'multer';
import Tesseract from 'tesseract.js';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

// ─── Gemini AI Client Setup ───────────────────────────────────────────────────
const geminiApiKey = process.env.GEMINI_API_KEY;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const visionModel = genAI
  ? genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
  : null;

if (genAI) {
  console.log('🤖 [Gemini Engine] API Key detected — Cloud AI services enabled.');
} else {
  console.log('⚠️  [Gemini Engine] No GEMINI_API_KEY detected — running Tesseract-only fallback.');
}

const app = express();
const PORT = process.env.PORT || 5000;

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

// ═══════════════════════════════════════════════════════════════════════════════
//  PHASE 1: PRE-OCR VERIFICATION — ตรวจสอบภาพก่อนแปลง
// ═══════════════════════════════════════════════════════════════════════════════

async function analyzeImage(buffer) {
  const meta = await sharp(buffer).metadata();
  const stats = await sharp(buffer).stats();

  const channels = stats.channels;
  const avgBrightness = channels.reduce((sum, ch) => sum + ch.mean, 0) / channels.length;
  const isDark = avgBrightness < 128;

  // Contrast ratio: difference between min and max brightness channels
  const minMean = Math.min(...channels.map(c => c.mean));
  const maxMean = Math.max(...channels.map(c => c.mean));
  const contrastRatio = maxMean - minMean;

  // Standard deviation (how spread out pixel values are — higher = more detail)
  const avgStdDev = channels.reduce((sum, ch) => sum + ch.stdev, 0) / channels.length;

  const width = meta.width || 0;
  const height = meta.height || 0;
  const megapixels = (width * height) / 1_000_000;

  // Quality assessment
  const issues = [];
  const suggestions = [];

  if (width < 300 || height < 100) {
    issues.push('Image resolution is very low — text may be unreadable');
    suggestions.push('Use a higher resolution screenshot or photo');
  } else if (width < 600) {
    issues.push('Image resolution is low');
    suggestions.push('Will auto-upscale 4x for better accuracy');
  }

  if (avgStdDev < 15) {
    issues.push('Very low contrast — image appears flat or washed out');
    suggestions.push('Try using Strict Binarize mode with threshold adjustment');
  }

  if (isDark) {
    suggestions.push('Dark background detected — colors will be auto-inverted');
  }

  if (contrastRatio > 80) {
    suggestions.push('Multi-colored image — Auto Multi-Pass will test all strategies');
  }

  const qualityScore = Math.min(100, Math.max(0,
    Math.round(
      (avgStdDev > 30 ? 40 : avgStdDev * 1.3) +
      (width >= 800 ? 30 : width / 800 * 30) +
      (avgBrightness > 20 && avgBrightness < 240 ? 30 : 15)
    )
  ));

  return {
    width, height, megapixels,
    isDark, avgBrightness,
    contrastRatio, avgStdDev,
    qualityScore,
    issues,
    suggestions,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PREPROCESSING STRATEGIES
// ═══════════════════════════════════════════════════════════════════════════════

async function preprocessEnhance(buffer, info) {
  let p = sharp(buffer);
  if (info.width && info.width < 1800) {
    const scale = info.width < 800 ? 4 : 3;
    p = p.resize({ width: Math.round(info.width * scale), kernel: sharp.kernel.lanczos3 });
  }
  if (info.isDark) p = p.negate({ alpha: false });
  p = p.greyscale().normalize().sharpen({ sigma: 1.5, m1: 2.5, m2: 2.5 }).median(1);
  return await p.toFormat('png').toBuffer();
}

async function preprocessBinarize(buffer, info, thresholdVal = 140) {
  let p = sharp(buffer);
  if (info.width && info.width < 1800) {
    const scale = info.width < 800 ? 4 : 3;
    p = p.resize({ width: Math.round(info.width * scale), kernel: sharp.kernel.lanczos3 });
  }
  if (info.isDark) p = p.negate({ alpha: false });
  p = p.greyscale().normalize().threshold(thresholdVal);
  return await p.toFormat('png').toBuffer();
}

async function preprocessMaxContrast(buffer, info) {
  let p = sharp(buffer);
  if (info.width && info.width < 1800) {
    const scale = info.width < 800 ? 4 : 3;
    p = p.resize({ width: Math.round(info.width * scale), kernel: sharp.kernel.lanczos3 });
  }
  if (info.isDark) p = p.negate({ alpha: false });
  p = p.greyscale().normalize().linear(1.8, -60).sharpen({ sigma: 2.0, m1: 3.0, m2: 3.0 }).threshold(150);
  return await p.toFormat('png').toBuffer();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TESSERACT RUNNER
// ═══════════════════════════════════════════════════════════════════════════════

async function runTesseract(buffer, lang, psmMode = '3') {
  const { data } = await Tesseract.recognize(buffer, lang, {
    tessedit_pageseg_mode: psmMode,
    logger: () => {},
  });
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LAYOUT RECONSTRUCTION (bounding-box column-gap alignment)
// ═══════════════════════════════════════════════════════════════════════════════

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
        } else if (gap > charW * 0.6) {
          lineStr += ' ' + wordText;
        } else {
          lineStr += wordText;
        }
      }
    }
    out += lineStr + '\n';
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PHASE 2: POST-OCR FORMATTER — จัดเรียงข้อความหลังแปลง
// ═══════════════════════════════════════════════════════════════════════════════

// ── 2A: Thai Spellcheck & Character Merging ──────────────────────────────────
function correctOcrText(text) {
  if (!text) return text;
  let t = text;

  // --- Thai character merging rules ---
  // Common Tesseract mistakes: splits Thai consonant clusters with spaces
  const mergeRules = [
    // Double เ → แ
    [/เเ/g, 'แ'],
    // Specific word-level corrections
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
    [/สลิิป/g, 'สลิป'],
    // Common split-word merging for Thai OCR
    [/ระ บบ/g, 'ระบบ'],
    [/บ ริ หาร/g, 'บริหาร'],
    [/พั ส ดุ/g, 'พัสดุ'],
    [/อั จ ฉริ ยะ/g, 'อัจฉริยะ'],
    [/ฉ บั บ/g, 'ฉบับ'],
    [/ส ม บู ร ณ์/g, 'สมบูรณ์'],
    [/จั ด กา ร/g, 'จัดการ'],
    [/อ นุ มั ติ/g, 'อนุมัติ'],
    [/ป ระ ห ยั ด/g, 'ประหยัด'],
    [/ต ร ว จ ส อ บ/g, 'ตรวจสอบ'],
    [/ตร ว จส อ บ/g, 'ตรวจสอบ'],
    [/ป ระ วั ติ/g, 'ประวัติ'],
    [/รา ย กา ร/g, 'รายการ'],
    [/ข้ อ มู ล/g, 'ข้อมูล'],
    [/ค ลิ ก/g, 'คลิก'],
    [/อั ป โห ล ด/g, 'อัปโหลด'],
    [/ดา ว น์ โห ล ด/g, 'ดาวน์โหลด'],
    [/ร ะ บ บ/g, 'ระบบ'],
    [/ส ร้ า ง/g, 'สร้าง'],
    [/แ ม่ น ยำ/g, 'แม่นยำ'],
    [/ค ว า ม/g, 'ความ'],
    [/สู ง สุ ด/g, 'สูงสุด'],
    [/เ พื่ อ/g, 'เพื่อ'],
    [/ผ ล ง า น/g, 'ผลงาน'],
    [/วิ นา ที/g, 'วินาที'],
    [/ไ ฟ ล์/g, 'ไฟล์'],
    [/ข้ อ/g, 'ข้อ'],
    [/มู ล/g, 'มูล'],
  ];

  for (const [p, r] of mergeRules) t = t.replace(p, r);

  // --- Generic Thai word-fragment stitching ---
  // If a single Thai vowel/tonemark is isolated between spaces, merge it with adjacent chars
  // Thai vowels: สระ above/below/leading/following
  const thaiVowelTone = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/;
  t = t.replace(/ ([\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]) /g, '$1');

  // Merge single Thai consonant fragments: "ก " + consonant → remove space
  // Pattern: Thai_char + space + Thai_char where both are single → likely split
  t = t.replace(/([\u0E01-\u0E2E]) ([\u0E01-\u0E2E][\u0E31\u0E34-\u0E3A\u0E47-\u0E4E])/g, '$1$2');

  return t;
}

// ── 2B: Remove Noise Lines ───────────────────────────────────────────────────
function removeNoiseLines(text) {
  return text.split('\n').filter(line => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return false;

    // Remove lines that are only symbols/punctuation (border decorations)
    const stripped = trimmed.replace(/[\s\-_=|.,:;!@#$%^&*(){}[\]<>~`'"\\\/+]/g, '');
    if (stripped.length === 0) return false;

    // Remove lines with very few unique characters but high length (repeating patterns)
    const uniq = new Set(stripped).size;
    if (stripped.length > 10 && uniq <= 3) return false;

    // Remove single-character orphan lines (usually OCR noise)
    if (stripped.length === 1 && /[^\w\u0E01-\u0E4E]/.test(stripped)) return false;

    return true;
  }).join('\n');
}

// ── 2C: Smart Text Formatter — จัดเรียงให้สวยงามเหมือนต้นฉบับ ─────────────
function formatExtractedText(text) {
  if (!text) return text;

  let lines = text.split('\n');

  // 1. Trim trailing whitespace per line but keep leading alignment
  lines = lines.map(l => l.trimEnd());

  // 2. Collapse 3+ consecutive blank lines into 1 blank line
  let formatted = [];
  let blankCount = 0;
  for (const line of lines) {
    if (line.trim() === '') {
      blankCount++;
      if (blankCount <= 1) formatted.push('');
    } else {
      blankCount = 0;
      formatted.push(line);
    }
  }

  // 3. Remove leading blank lines
  while (formatted.length > 0 && formatted[0].trim() === '') formatted.shift();
  // 4. Remove trailing blank lines
  while (formatted.length > 0 && formatted[formatted.length - 1].trim() === '') formatted.pop();

  // 5. Detect and align multi-column tabular data
  let result = formatted.map(line => {
    // Replace 4+ consecutive spaces with a clean tab alignment
    return line.replace(/ {4,}/g, (match) => {
      // Use consistent spacing: round to nearest tab-stop (every 4 spaces)
      const tabCount = Math.max(1, Math.round(match.length / 4));
      return '\t'.repeat(tabCount);
    });
  });

  return result.join('\n').trim();
}

// ── 2D: Full Post-Processing Pipeline ────────────────────────────────────────
function postProcessText(rawLayoutText) {
  let text = rawLayoutText;

  // Step 1: Thai spellcheck & character merging
  text = correctOcrText(text);

  // Step 2: Remove noise/junk lines
  text = removeNoiseLines(text);

  // Step 3: Smart formatting
  text = formatExtractedText(text);

  return text;
}

// ─── PRIMARY: Gemini Vision OCR ───────────────────────────────────────────────
async function ocrWithGemini(imageBuffer, mimeType, lang) {
  if (!visionModel) throw new Error('Gemini Vision engine is not configured.');

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
3. Do NOT add greetings, labels, or markdown code blocks (do NOT wrap in \`\`\` or similar).
4. Preserve the original line structure and visual layout as faithfully as possible.
5. Keep Thai text in Thai script and English text in English — do NOT mix or convert.
6. If text appears in columns (left and right side) or tables, separate them with tab characters to maintain visual spacing.
7. Remove only obvious decorative noise (dashed border lines, repeating symbols). Keep all real text.
8. Output every word, number, and punctuation mark that is visible.

${langInstruction}

Begin extraction now:`;

  try {
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
    text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
    return text;
  } catch (err) {
    if (err.message.includes('429') || err.message.includes('exhausted') || err.message.includes('ResourceExhausted')) {
      console.warn('⚠️ [Gemini OCR] gemini-2.0-flash rate limited. Trying gemini-1.5-flash fallback...');
      try {
        const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await fallbackModel.generateContent([
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType || 'image/png',
              data: imageBuffer.toString('base64'),
            },
          },
        ]);
        let text = result.response.text();
        text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
        return text;
      } catch (fallbackErr) {
        console.error('❌ [Gemini OCR Fallback] gemini-1.5-flash also failed:', fallbackErr.message);
        throw err;
      }
    }
    throw err;
  }
}

// ─── POST-PROCESSOR: Gemini Context Proofreader ───────────────────────────────
async function proofreadWithGemini(text, lang) {
  if (!genAI || !text) return text;
  
  const prompt = `You are an expert OCR post-processor and proofreader.
The following text is the raw result from an OCR extraction of an image (languages: ${lang}).
Your task is to fix spelling mistakes, reconstruct columns, align tabular data, and arrange the text to look as beautiful and close to the original layout as possible.

STRICT RULES:
1. Fix common Thai/English OCR spelling mistakes (e.g. "เเ" to "แ", split words like "ระ บบ" to "ระบบ", "วันที" to "วันที่", "จํานวนเงิน" to "จำนวนเงิน", "รายรับคงหปล" to "รายรับคงเหลือ").
2. Align columns and table grids using tab spacing or multiple spaces where appropriate.
3. WIPE OUT obvious OCR noise lines, border characters (e.g. "|", "_", "-", "=", "+", "*"), and repeating random junk characters (e.g. "ณา ณาหาณะ").
4. Output ONLY the proofread, beautifully formatted, and arranged text. Do NOT add any introductory text, greetings, explanations, or markdown code block wrappers (do NOT wrap in \`\`\` or similar).
5. Preserve all original content and numbers. Do not summarize or delete real information.

Raw OCR Text:
${text}

Proofread & Arranged Text:`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(prompt);
    let out = result.response.text();
    out = out.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
    return out;
  } catch (err) {
    if (err.message.includes('429') || err.message.includes('exhausted') || err.message.includes('ResourceExhausted')) {
      console.warn('⚠️ [Gemini Proofread] gemini-2.0-flash rate limited. Trying gemini-1.5-flash fallback...');
      try {
        const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await fallbackModel.generateContent(prompt);
        let out = result.response.text();
        out = out.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
        return out;
      } catch (fallbackErr) {
        console.error('❌ [Gemini Proofread Fallback] gemini-1.5-flash also failed:', fallbackErr.message);
        throw err;
      }
    }
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MULTI-PASS OCR ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

async function multiPassOCR(buffer, lang, options = {}) {
  const info = await analyzeImage(buffer);

  console.log(`[Pre-Check] Image: ${info.width}×${info.height} | Brightness: ${info.avgBrightness.toFixed(0)} | Contrast: ${info.contrastRatio.toFixed(0)} | Quality: ${info.qualityScore}/100`);
  if (info.isDark) console.log('[Pre-Check] 🌙 Dark background detected → will auto-invert');
  if (info.issues.length > 0) console.log(`[Pre-Check] ⚠️  Issues: ${info.issues.join('; ')}`);
  if (info.suggestions.length > 0) console.log(`[Pre-Check] 💡 Suggestions: ${info.suggestions.join('; ')}`);

  const psmMode = options.psm || '3';
  const userMode = options.preprocessMode || 'auto';
  const thresholdLevel = parseInt(options.thresholdLevel) || 140;

  let strategies = [];
  if (userMode === 'auto') {
    strategies = [
      { name: 'enhance', fn: () => preprocessEnhance(buffer, info) },
      { name: 'binarize', fn: () => preprocessBinarize(buffer, info, thresholdLevel) },
      { name: 'max-contrast', fn: () => preprocessMaxContrast(buffer, info) },
    ];
  } else if (userMode === 'threshold') {
    strategies = [{ name: 'binarize', fn: () => preprocessBinarize(buffer, info, thresholdLevel) }];
  } else {
    strategies = [{ name: 'enhance', fn: () => preprocessEnhance(buffer, info) }];
  }

  let bestResult = null;
  let bestScore = -1;
  let bestStrategy = '';

  for (const strat of strategies) {
    try {
      console.log(`[Multi-Pass] Running "${strat.name}"...`);
      const processedBuffer = await strat.fn();
      const data = await runTesseract(processedBuffer, lang, psmMode);

      // Apply post-processing pipeline
      const rawLayout = reconstructLayout(data.lines);
      const text = postProcessText(rawLayout);
      const conf = data.confidence || 0;

      // Scoring: confidence + text quality bonus
      const textLen = text.replace(/\s/g, '').length;
      const thaiCharCount = (text.match(/[\u0E01-\u0E4E]/g) || []).length;
      const engCharCount = (text.match(/[a-zA-Z0-9]/g) || []).length;
      const meaningfulChars = thaiCharCount + engCharCount;

      // Better scoring: reward meaningful content, penalize gibberish
      const score = conf
        + Math.min(meaningfulChars * 0.08, 15)   // bonus for real text
        - (textLen > 0 ? Math.max(0, (textLen - meaningfulChars) / textLen * 10) : 0); // penalty for noise ratio

      console.log(`[Multi-Pass] "${strat.name}" → conf: ${conf.toFixed(1)}% | chars: ${textLen} | thai: ${thaiCharCount} | eng: ${engCharCount} | score: ${score.toFixed(1)}`);

      if (score > bestScore) {
        bestScore = score;
        bestResult = { text, confidence: conf, rawText: data.text };
        bestStrategy = strat.name;
      }
    } catch (err) {
      console.warn(`[Multi-Pass] "${strat.name}" failed:`, err.message);
    }
  }

  // Also try raw buffer if auto mode and low confidence
  if (userMode === 'auto' && bestResult && bestResult.confidence < 60) {
    try {
      console.log('[Multi-Pass] Low confidence — trying raw buffer...');
      const data = await runTesseract(buffer, lang, psmMode);
      const text = postProcessText(reconstructLayout(data.lines));
      const conf = data.confidence || 0;
      const meaningfulChars = (text.match(/[\u0E01-\u0E4Ea-zA-Z0-9]/g) || []).length;
      const textLen = text.replace(/\s/g, '').length;
      const score = conf + Math.min(meaningfulChars * 0.08, 15) - (textLen > 0 ? Math.max(0, (textLen - meaningfulChars) / textLen * 10) : 0);

      if (score > bestScore) {
        bestScore = score;
        bestResult = { text, confidence: conf, rawText: data.text };
        bestStrategy = 'raw';
      }
    } catch (err) {
      console.warn('[Multi-Pass] Raw pass failed:', err.message);
    }
  }

  if (!bestResult) throw new Error('All OCR strategies failed.');

  console.log(`[Multi-Pass] ✓ Winner: "${bestStrategy}" (confidence: ${bestResult.confidence.toFixed(1)}%)`);
  return { ...bestResult, strategy: bestStrategy, imageAnalysis: info };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      ocr: 'tesseract.js (multi-pass)',
      preprocessor: 'sharp (auto-invert + multi-strategy)',
      postProcessor: 'thai-merge + noise-filter + formatter',
    },
  });
});

// ─── Image Pre-Check Endpoint (optional quick analysis) ──────────────────────
app.post('/api/pre-check', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided.' });
    }
    const analysis = await analyzeImage(req.file.buffer);
    return res.json({
      success: true,
      analysis: {
        width: analysis.width,
        height: analysis.height,
        isDark: analysis.isDark,
        avgBrightness: Math.round(analysis.avgBrightness),
        contrastRatio: Math.round(analysis.contrastRatio),
        qualityScore: analysis.qualityScore,
        issues: analysis.issues,
        suggestions: analysis.suggestions,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
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

    const doPreprocess = req.body.preprocess !== 'false';
    const preprocessMode = doPreprocess ? (req.body.preprocessMode || 'auto') : 'enhance';
    const thresholdLevel = req.body.thresholdLevel || '140';
    const psmMode = req.body.psm || '3';
    
    const ocrEngine = req.body.ocrEngine || 'auto'; // 'gemini' | 'tesseract' | 'auto'
    const useGemini = req.body.useGemini === 'true';
    const mimeType = req.file.mimetype || 'image/png';

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[OCR] "${req.file.originalname}" | ${(req.file.size / 1024).toFixed(1)}KB | lang:${lang} | engine:${ocrEngine} | proofread:${useGemini}`);

    // Fast image diagnostics
    const analysis = await analyzeImage(req.file.buffer);

    let extractedText = '';
    let confidence = null;
    let strategy = '';
    let engineUsed = '';

    const canUseGemini = visionModel !== null;
    const shouldRunGemini = ocrEngine === 'gemini' || (ocrEngine === 'auto' && canUseGemini);

    if (shouldRunGemini) {
      try {
        console.log(`[Gemini OCR] Running Vision OCR on base64 buffer...`);
        extractedText = await ocrWithGemini(req.file.buffer, mimeType, lang);
        engineUsed = 'gemini-vision';
        confidence = 99.5; // High confidence indicator for Gemini Vision
        strategy = 'gemini-vision';
      } catch (err) {
        console.warn(`[Gemini OCR] Failed, automatically falling back to Tesseract:`, err.message);
        // Fall back to Tesseract below
      }
    }

    if (!engineUsed) {
      console.log(`[Tesseract OCR] Running Multi-Pass engine...`);
      const result = await multiPassOCR(req.file.buffer, lang, {
        preprocessMode,
        thresholdLevel,
        psm: psmMode,
      });
      extractedText = result.text;
      confidence = result.confidence;
      strategy = result.strategy;
      engineUsed = `tesseract-${result.strategy}`;
    }

    // Apply Gemini Context Proofreading / Formatting ONLY if Gemini OCR was NOT already used!
    let isProofreadApplied = false;
    if (useGemini && genAI && engineUsed !== 'gemini-vision') {
      try {
        console.log(`[Gemini Proofreading] Restructuring lines and formatting layout...`);
        const cleanText = await proofreadWithGemini(extractedText, lang);
        extractedText = cleanText;
        isProofreadApplied = true;
      } catch (err) {
        console.warn(`[Gemini Proofreading] Failed, keeping raw OCR text:`, err.message);
      }
    }

    const dur = Date.now() - t0;
    console.log(`[OCR Done] ${dur}ms | Engine: ${engineUsed} | Proofread: ${isProofreadApplied}`);
    console.log('═'.repeat(60));

    return res.json({
      success: true,
      text: extractedText,
      confidence: confidence,
      language: lang,
      durationMs: dur,
      engineUsed,
      imageAnalysis: {
        width: analysis.width,
        height: analysis.height,
        isDark: analysis.isDark,
        qualityScore: analysis.qualityScore,
        issues: analysis.issues,
        suggestions: analysis.suggestions,
      },
      tuning: {
        preprocessed: doPreprocess,
        preprocessModeUsed: preprocessMode,
        thresholdUsed: thresholdLevel,
        psmUsed: ocrEngine === 'gemini' ? null : psmMode,
        strategyUsed: strategy,
        ocrEngineUsed: ocrEngine,
        geminiProofreadUsed: isProofreadApplied,
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
  console.log(`🤖 Engine: ${genAI ? '✅ Gemini Vision (Primary)' : '⚠️  Tesseract Multi-Pass'}`);
  console.log('🔍 Pre-Check: Image quality analysis');
  console.log('✨ Post-Process: Thai merge + noise filter + formatter');
  console.log('🌓 Auto dark-background detection & inversion');
  console.log('═══════════════════════════════════════════════');
});

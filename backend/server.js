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

// Initialize Gemini API client if API key is present in environment
const geminiApiKey = process.env.GEMINI_API_KEY;
let genAI = null;
if (geminiApiKey) {
  console.log('🤖 [Gemini AI] API Key detected. AI Auto-Correct & Proofreader helper enabled.');
  genAI = new GoogleGenerativeAI(geminiApiKey);
} else {
  console.log('⚠️ [Gemini AI] No GEMINI_API_KEY in .env. Falling back to local rule-based corrector.');
}

// Enable CORS with support for development origins
app.use(cors({
  origin: '*', // In production, replace with specific frontend domain
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Set up Multer with Memory Storage (keeps files entirely in RAM)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB maximum file size
  },
  fileFilter: (req, file, cb) => {
    // Accept only standard image formats
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only image files are supported.'));
    }
  }
});

// Pre-processing helper utilizing Sharp to format images for maximum OCR readability
async function preprocessImage(buffer, options = {}) {
  try {
    let pipeline = sharp(buffer);
    const metadata = await pipeline.metadata();
    
    // 1. Upscale if image is too small (width < 1200px) to boost text density (DPI)
    if (metadata.width && metadata.width < 1200) {
      const scaleFactor = 2;
      pipeline = pipeline.resize({
        width: Math.round(metadata.width * scaleFactor),
        kernel: sharp.kernel.lanczos3
      });
    }

    // 2. Grayscale: Eliminate color noise
    pipeline = pipeline.greyscale();

    // 3. Dynamic Preprocessing Modes
    const mode = options.preprocessMode || 'enhance'; // 'enhance' | 'threshold'
    
    if (mode === 'threshold') {
      // High-Contrast threshold binarization (strict black/white)
      const thresholdVal = parseInt(options.thresholdLevel) || 135;
      pipeline = pipeline.threshold(thresholdVal);
    } else {
      // AI Smart Enhance: Normalizes dynamic range and sharpens edges.
      // This is extremely safe and prevents low-contrast text (e.g. light grey on white) from disappearing!
      pipeline = pipeline.normalize().sharpen({
        sigma: 1.0,
        m1: 2.0,
        m2: 2.0
      });
    }

    // 4. Export as highly optimized PNG buffer
    return await pipeline.toFormat('png').toBuffer();
  } catch (err) {
    console.warn('[Preprocessing Warning] Custom pre-processing failed, falling back to raw buffer:', err);
    return buffer; // Fallback to original buffer
  }
}

// Thai Spellcheck / Auto-Correct Dictionary for OCR slips
function correctOcrText(text) {
  if (!text) return text;
  
  let corrected = text;
  
  const corrections = [
    // Standard character merging / segmentation errors
    { pattern: /เเ/g, replacement: 'แ' }, // Double 'เ' to 'แ'
    { pattern: /โอนเเงิน/g, replacement: 'โอนเงิน' },
    { pattern: /โอนเฃิน/g, replacement: 'โอนเงิน' },
    
    // Core Thai slip terms mapped from common OCR errors
    { pattern: /รายรับคงหปล/g, replacement: 'รายรับคงเหลือ' },
    { pattern: /ยอดเงินคงหปล/g, replacement: 'ยอดเงินคงเหลือ' },
    { pattern: /รายวายเทือหนว/g, replacement: 'รายจ่ายทั้งหมด' },
    { pattern: /รายวาย/g, replacement: 'รายจ่าย' },
    { pattern: /เทือหนว/g, replacement: 'ทั้งหมด' },
    { pattern: /รองรน/g, replacement: 'รองรับ' },
    { pattern: /ร วผิ/g, replacement: 'รูปภาพ' },
    { pattern: /คลิกเฟเพื่ออัปโหลด/g, replacement: 'คลิกเพื่ออัปโหลด' },
    { pattern: /ข้อมูลรายทาร/g, replacement: 'ข้อมูลรายการ' },
    { pattern: /ยังไม่มีข้อมูลรายทาร/g, replacement: 'ยังไม่มีข้อมูลรายการ' },
    
    // Grammatical fixes
    { pattern: /วันที\b|วันที /g, replacement: 'วันที่ ' },
    { pattern: /จํานวนเงิน/g, replacement: 'จำนวนเงิน' },
    { pattern: /ช้อมูล/g, replacement: 'ข้อมูล' },
    { pattern: /เสร็จสิ้บ/g, replacement: 'เสร็จสิ้น' },
    { pattern: /สําเร็จ/g, replacement: 'สำเร็จ' },
    { pattern: /บัญชีู/g, replacement: 'บัญชี' },
    { pattern: /ใข้/g, replacement: 'ใช้' },
    { pattern: /ผู้้/g, replacement: 'ผู้' },
    { pattern: /ค่่า/g, replacement: 'ค่า' },
    { pattern: /สลิิป/g, replacement: 'สลิป' }
  ];

  for (const item of corrections) {
    corrected = corrected.replace(item.pattern, item.replacement);
  }
  
  return corrected;
}

// Bounding-box column-gap detection to reconstruct original tabular / multi-column layout
function reconstructLayout(lines) {
  if (!lines || lines.length === 0) return '';
  
  let formattedText = '';
  
  for (const line of lines) {
    // Fallback to default raw line text if word tracking isn't populated
    if (!line.words || line.words.length === 0) {
      formattedText += (line.text || '') + '\n';
      continue;
    }
    
    let lineStr = '';
    
    for (let i = 0; i < line.words.length; i++) {
      const currentWord = line.words[i];
      let wordText = currentWord.text || '';
      
      if (i === 0) {
        lineStr += wordText;
      } else {
        const prevWord = line.words[i - 1];
        
        // Calculate horizontal positions
        const prevX1 = prevWord.bbox.x1;
        const currentX0 = currentWord.bbox.x0;
        const gap = currentX0 - prevX1;
        
        // Calculate average character width of previous word as a scaling reference
        const prevW = prevWord.bbox.x1 - prevWord.bbox.x0;
        const charW = prevW / Math.max(1, prevWord.text.length);
        
        // Gap checks: Require at least a 45px threshold distance to consider it a column boundary.
        // This stops close letters inside single words from being spaced out (e.g. ป ระวั ติ รายกา ร)
        if (gap > 45 && gap > charW * 4.0) {
          // Large horizontal gap: Represents column/table borders.
          const spaceCount = Math.min(28, Math.max(4, Math.round(gap / charW)));
          lineStr += ' '.repeat(spaceCount) + wordText;
        } else if (gap > charW * 1.2) {
          // Normal word spacing
          lineStr += ' ' + wordText;
        } else {
          // Tight text binding
          if (gap > 2) {
            lineStr += ' ' + wordText;
          } else {
            lineStr += wordText;
          }
        }
      }
    }
    
    formattedText += lineStr + '\n';
  }
  
  return formattedText;
}

// Ultimate AI OCR Proofreading & Data Cleaning Helper utilizing Gemini
async function proofreadWithGemini(text) {
  if (!genAI) return text;
  
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `
You are an expert OCR proofreader and data cleaning assistant.
Your task is to take raw OCR text extracted from a banking slip or financial tracker dashboard, clean it up, and make it perfectly readable.

Follow these strict guidelines:
1. Clean up and remove any garbled gibberish noise, repeating letters, or nonsense characters caused by Tesseract attempting to read decorative border lines (like dashed borders, lines, or icons, e.g., "รอ งรั บ JPG, PNG", "ณา ณาหาณะทาท-า ทา").
2. Correct any obvious spelling typos in both Thai and English (e.g., KBank, SCB terms, "ยอดเงินคงเหลือ", "รายรับทั้งหมด", "รายจ่ายทั้งหมด", "ประวัติรายการ").
3. Maintain the structured column or grid layout alignment of the text (keep spaces and vertical columns aligned).
4. Do not summarize or add any conversational text. Return ONLY the cleaned, corrected, and beautifully formatted text.

Raw OCR Text:
"""
${text}
"""
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Clean up markdown block wraps if model wraps the output in ```text ... ```
    return responseText
      .replace(/^```[a-zA-Z]*\n/, '')
      .replace(/\n```$/, '')
      .trim();
  } catch (err) {
    console.error('[Gemini Proofreading Error] Failed to proofread text, falling back to local text:', err);
    return text; // Fallback to raw text
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      ocr: 'tesseract.js',
      preprocessor: 'sharp',
      geminiActive: genAI !== null
    }
  });
});

// Main text extraction API
app.post('/api/extract-text', upload.single('image'), async (req, res) => {
  const startTime = Date.now();
  
  try {
    // 1. Validate if a file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided. Please paste or upload an image.'
      });
    }

    // 2. Determine target languages (default to English + Thai)
    let lang = req.body.languages || 'eng+tha';
    if (Array.isArray(lang)) {
      lang = lang.join('+');
    }
    lang = lang.replace(/,/g, '+');

    // 3. Read custom tuning flags from request body
    const doPreprocess = req.body.preprocess === 'true';
    const preprocessMode = req.body.preprocessMode || 'enhance'; // 'enhance' | 'threshold'
    const thresholdLevel = req.body.thresholdLevel || '135';
    const psmMode = req.body.psm || '3'; // Default to '3' (Automatic page segmentation)
    const doGemini = req.body.useGemini === 'true' && genAI !== null;

    console.log(`[OCR Request] File: ${req.file.originalname} (${req.file.size} bytes), Languages: ${lang}, Preprocess: ${doPreprocess}, Mode: ${preprocessMode}, PSM: ${psmMode}, GeminiProofread: ${doGemini}`);

    // 4. Select buffer to analyze (apply pre-processing pipeline if requested)
    let finalBuffer = req.file.buffer;
    if (doPreprocess) {
      finalBuffer = await preprocessImage(req.file.buffer, { 
        preprocessMode,
        thresholdLevel 
      });
    }

    // 5. Process buffer using Tesseract configured with target options
    const { data } = await Tesseract.recognize(
      finalBuffer,
      lang,
      {
        tessedit_pageseg_mode: psmMode,
        // Option to track worker logs (e.g., download progress)
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`[OCR Processing] Progress: ${(m.progress * 100).toFixed(1)}%`);
          }
        }
      }
    );

    // 6. Format layout column structures and perform autocorrect spellcheck
    const structuredText = reconstructLayout(data.lines);
    let correctedText = correctOcrText(structuredText);
    
    // 7. Perform Gemini advanced AI proofreading if requested and active
    if (doGemini) {
      console.log(`[Gemini Proofreading] Running advanced context corrections...`);
      correctedText = await proofreadWithGemini(correctedText);
    }
    
    const duration = Date.now() - startTime;
    console.log(`[OCR Completed] Success. Original text length: ${data.text?.length || 0}, Formatted text length: ${correctedText?.length || 0}. Confidence: ${data.confidence}%. Duration: ${duration}ms`);

    // 8. Return standard success JSON response
    return res.json({
      success: true,
      text: correctedText,
      rawText: data.text, // Kept for debugging / audit logs
      confidence: data.confidence,
      language: lang,
      durationMs: duration,
      tuning: {
        preprocessed: doPreprocess,
        preprocessModeUsed: doPreprocess ? preprocessMode : null,
        thresholdUsed: doPreprocess ? thresholdLevel : null,
        psmUsed: psmMode,
        geminiUsed: doGemini
      },
      metadata: {
        filename: req.file.originalname,
        sizeBytes: req.file.size,
        mimetype: req.file.mimetype,
      }
    });
    

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[OCR Error] Failed in ${duration}ms:`, error);
    
    return res.status(500).json({
      success: false,
      error: error.message || 'An error occurred during text extraction.'
    });
  }
});

// Global error boundary middleware for Multer / standard errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File size limit exceeded. Maximum image size is 10MB.'
      });
    }
    return res.status(400).json({
      success: false,
      error: `Upload error: ${err.message}`
    });
  }
  
  return res.status(500).json({
    success: false,
    error: err.message || 'Internal server error.'
  });
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Smart Clipboard OCR server running on port ${PORT}`);
  console.log(`🔧 CORS allowed for all origins (*)`);
  console.log(`📂 Maximum upload size: 10MB`);
  console.log(`===============================================`);
});

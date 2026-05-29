import express from 'express';
import cors from 'cors';
import multer from 'multer';
import Tesseract from 'tesseract.js';
import dotenv from 'dotenv';
import sharp from 'sharp';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

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

    // 3. High-Contrast threshold binarization
    // (Values between 120-140 generally give optimal text-to-background contrast)
    const thresholdVal = parseInt(options.thresholdLevel) || 135;
    pipeline = pipeline.threshold(thresholdVal);

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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      ocr: 'tesseract.js',
      preprocessor: 'sharp'
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
    const thresholdLevel = req.body.thresholdLevel || '135';
    const psmMode = req.body.psm || '3'; // Default to '3' (Automatic page segmentation)

    console.log(`[OCR Request] File: ${req.file.originalname} (${req.file.size} bytes), Languages: ${lang}, Preprocess: ${doPreprocess}, PSM: ${psmMode}`);

    // 4. Select buffer to analyze (apply pre-processing pipeline if requested)
    let finalBuffer = req.file.buffer;
    if (doPreprocess) {
      finalBuffer = await preprocessImage(req.file.buffer, { thresholdLevel });
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

    const correctedText = correctOcrText(data.text);
    const duration = Date.now() - startTime;
    console.log(`[OCR Completed] Success. Original text length: ${data.text?.length || 0}, Corrected text length: ${correctedText?.length || 0}. Confidence: ${data.confidence}%. Duration: ${duration}ms`);

    // 6. Return standard success JSON response
    return res.json({
      success: true,
      text: correctedText,
      rawText: data.text, // Kept for debugging / audit logs
      confidence: data.confidence,
      language: lang,
      durationMs: duration,
      tuning: {
        preprocessed: doPreprocess,
        thresholdUsed: doPreprocess ? thresholdLevel : null,
        psmUsed: psmMode
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

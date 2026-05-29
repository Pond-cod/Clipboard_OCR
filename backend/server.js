import express from 'express';
import cors from 'cors';
import multer from 'multer';
import Tesseract from 'tesseract.js';
import dotenv from 'dotenv';

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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      ocr: 'tesseract.js'
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
    // Supports languages passed as comma-separated or plus-separated strings
    let lang = req.body.languages || 'eng+tha';
    if (Array.isArray(lang)) {
      lang = lang.join('+');
    }
    // Standardize to '+' separated syntax for Tesseract
    lang = lang.replace(/,/g, '+');

    console.log(`[OCR Request] File: ${req.file.originalname} (${req.file.size} bytes), Mime: ${req.file.mimetype}, Languages: ${lang}`);

    // 3. Process image buffer directly using Tesseract
    const { data } = await Tesseract.recognize(
      req.file.buffer,
      lang,
      {
        // Option to track worker logs (e.g., download progress)
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`[OCR Processing] Progress: ${(m.progress * 100).toFixed(1)}%`);
          }
        }
      }
    );

    const duration = Date.now() - startTime;
    console.log(`[OCR Completed] Success. Text length: ${data.text?.length || 0}. Confidence: ${data.confidence}%. Duration: ${duration}ms`);

    // 4. Return standard success JSON response
    return res.json({
      success: true,
      text: data.text,
      confidence: data.confidence,
      language: lang,
      durationMs: duration,
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

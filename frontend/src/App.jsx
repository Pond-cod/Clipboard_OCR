import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import LanguageSelector from './components/LanguageSelector';
import DropZone from './components/DropZone';
import ImagePreview from './components/ImagePreview';
import ResultViewer from './components/ResultViewer';
import { AlertCircle, RotateCcw, Clipboard, HelpCircle } from 'lucide-react';

export default function App() {
  // Original source file and active processing file (which can be original or cropped)
  const [file, setFile] = useState(null);
  const [activeFile, setActiveFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  
  const [selectedLanguages, setSelectedLanguages] = useState(['eng', 'tha']);
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'error'
  const [ocrText, setOcrText] = useState('');
  const [confidence, setConfidence] = useState(null);
  const [durationMs, setDurationMs] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // AI Precision Tuning States (Default active for near 100% accuracy)
  const [preprocess, setPreprocess] = useState(true);
  const [preprocessMode, setPreprocessMode] = useState('auto'); // 'auto' | 'enhance' | 'threshold'
  const [thresholdLevel, setThresholdLevel] = useState(135);
  const [psm, setPsm] = useState('3');
  
  // Gemini Engine & Post-Processing states
  const [ocrEngine, setOcrEngine] = useState('gemini'); // 'gemini' | 'tesseract' | 'auto'
  const [useGemini, setUseGemini] = useState(true); // default true for AI Proofreader formatting
  const [imageAnalysis, setImageAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [geminiFailed, setGeminiFailed] = useState(false);

  // Debounce ref for threshold slider triggers
  const thresholdTimeoutRef = useRef(null);

  // Setup Global Paste Interception Listener
  useEffect(() => {
    const handleGlobalPaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      let imageItem = null;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          imageItem = items[i];
          break;
        }
      }

      if (imageItem) {
        e.preventDefault();
        const imageFile = imageItem.getAsFile();
        if (imageFile) {
          console.log('[Global Paste] Intercepted image:', imageFile.name);
          handleImageSelect(imageFile);
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [selectedLanguages, preprocess, preprocessMode, thresholdLevel, psm, useGemini]); // re-bind when tuning changes

  // Fetch image diagnostics pre-check
  const fetchImageDiagnostics = async (targetFile) => {
    if (!targetFile) return;
    setAnalysisLoading(true);
    const formData = new FormData();
    formData.append('image', targetFile);
    try {
      const response = await fetch('http://localhost:5000/api/pre-check', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (data.success && data.analysis) {
        setImageAnalysis(data.analysis);
      }
    } catch (err) {
      console.warn('[Diagnostics Error]:', err.message);
    } finally {
      setAnalysisLoading(false);
    }
  };

  // Generate URL preview and trigger OCR process
  const handleImageSelect = (selectedFile) => {
    if (!selectedFile) return;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(selectedFile);
    setActiveFile(selectedFile);
    setPreviewUrl(URL.createObjectURL(selectedFile));
    setOcrText('');
    setConfidence(null);
    setDurationMs(null);
    setErrorMessage('');
    setImageAnalysis(null);
    
    // Quick async pre-check diagnostics
    fetchImageDiagnostics(selectedFile);

    // Trigger extraction on the original file
    performOCR(selectedFile, selectedLanguages);
  };

  // Triggered when user selects a specific crop coordinates region
  const handleCropApply = (croppedFile) => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setActiveFile(croppedFile);
    setPreviewUrl(URL.createObjectURL(croppedFile));
    setOcrText('');
    setConfidence(null);
    setDurationMs(null);
    setErrorMessage('');
    setImageAnalysis(null);

    // Quick async pre-check diagnostics
    fetchImageDiagnostics(croppedFile);

    // Trigger extraction on the cropped file
    performOCR(croppedFile, selectedLanguages);
  };

  // Restore the original full image
  const handleRestoreFull = () => {
    if (!file) return;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setActiveFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setOcrText('');
    setConfidence(null);
    setDurationMs(null);
    setErrorMessage('');
    setImageAnalysis(null);

    // Quick async pre-check diagnostics
    fetchImageDiagnostics(file);

    // Trigger extraction back on the original file
    performOCR(file, selectedLanguages);
  };

  // Perform backend OCR request
  const performOCR = async (targetFile, langs, customOptions = {}) => {
    if (!targetFile) return;
    setStatus('loading');
    
    // Resolve dynamic values to prevent synchronization latency
    const activePreprocess = customOptions.hasOwnProperty('preprocess') ? customOptions.preprocess : preprocess;
    const activePreprocessMode = customOptions.hasOwnProperty('preprocessMode') ? customOptions.preprocessMode : preprocessMode;
    const activeThreshold = customOptions.hasOwnProperty('thresholdLevel') ? customOptions.thresholdLevel : thresholdLevel;
    const activePsm = customOptions.hasOwnProperty('psm') ? customOptions.psm : psm;
    const activeOcrEngine = customOptions.hasOwnProperty('ocrEngine') ? customOptions.ocrEngine : ocrEngine;
    const activeUseGemini = customOptions.hasOwnProperty('useGemini') ? customOptions.useGemini : useGemini;

    const formData = new FormData();
    formData.append('image', targetFile);
    formData.append('languages', langs.join('+'));
    formData.append('preprocess', activePreprocess ? 'true' : 'false');
    formData.append('preprocessMode', activePreprocessMode);
    formData.append('thresholdLevel', activeThreshold.toString());
    formData.append('psm', activePsm);
    formData.append('ocrEngine', activeOcrEngine);
    formData.append('useGemini', activeUseGemini ? 'true' : 'false');

    try {
      const response = await fetch('http://localhost:5000/api/extract-text', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Server returned an error during text recognition.');
      }

      setOcrText(data.text || '');
      setConfidence(data.confidence || 0);
      setDurationMs(data.durationMs || 0);
      setGeminiFailed(!!data.tuning?.geminiFailedFallback);
      if (data.imageAnalysis) {
        setImageAnalysis(data.imageAnalysis);
      }
      setStatus('success');

    } catch (error) {
      console.error('[OCR Frontend Error]:', error);
      
      // Friendly, descriptive error translations
      let friendlyError = error.message;
      if (error.message.includes('Failed to fetch')) {
        friendlyError = 'Could not connect to the OCR backend. Please ensure the server in "/backend" is running on port 5000.';
      } else if (error.message.includes('sharp')) {
        friendlyError = 'Image pre-processing failed. Please try turning off "AI Image Pre-Processing" or adjusting the crop region.';
      }
      
      setErrorMessage(friendlyError);
      setStatus('error');
    }
  };

  // State trigger wrappers for instant dynamic processing
  const handlePreprocessChange = (val) => {
    setPreprocess(val);
    if (activeFile) {
      performOCR(activeFile, selectedLanguages, { preprocess: val });
    }
  };

  const handlePreprocessModeChange = (val) => {
    setPreprocessMode(val);
    if (activeFile) {
      performOCR(activeFile, selectedLanguages, { preprocessMode: val });
    }
  };

  const handleThresholdChange = (val) => {
    setThresholdLevel(val);
    if (activeFile) {
      if (thresholdTimeoutRef.current) {
        clearTimeout(thresholdTimeoutRef.current);
      }
      thresholdTimeoutRef.current = setTimeout(() => {
        performOCR(activeFile, selectedLanguages, { thresholdLevel: val });
      }, 400);
    }
  };

  const handlePsmChange = (val) => {
    setPsm(val);
    if (activeFile) {
      performOCR(activeFile, selectedLanguages, { psm: val });
    }
  };

  const handleOcrEngineChange = (val) => {
    setOcrEngine(val);
    if (activeFile) {
      performOCR(activeFile, selectedLanguages, { ocrEngine: val });
    }
  };

  const handleUseGeminiChange = (val) => {
    setUseGemini(val);
    if (activeFile) {
      performOCR(activeFile, selectedLanguages, { useGemini: val });
    }
  };

  // Clear current image and state
  const handleReset = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setFile(null);
    setActiveFile(null);
    setPreviewUrl(null);
    setOcrText('');
    setConfidence(null);
    setDurationMs(null);
    setErrorMessage('');
    setGeminiFailed(false);
    setImageAnalysis(null);
    setStatus('idle');
  };

  // Handle manual edits in textarea
  const handleTextChange = (updatedText) => {
    setOcrText(updatedText);
  };

  // Quick Action: Inject a demo screenshot file to test application quickly
  const loadDemoSample = async () => {
    try {
      setStatus('loading');
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');
      
      const grad = ctx.createLinearGradient(0, 0, 600, 300);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 600, 300);
      
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 24px Inter, sans-serif';
      ctx.fillText('Smart Clipboard OCR - Demo Sample', 40, 60);
      
      ctx.fillStyle = '#f8fafc';
      ctx.font = '16px Inter, sans-serif';
      ctx.fillText('Success: Dual character engine configuration works perfectly!', 40, 110);
      ctx.fillText('Tesseract.js parsed this text from an in-memory buffer.', 40, 140);
      
      ctx.fillStyle = '#818cf8';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('การทดสอบการรู้จำอักขระภาษาไทย', 40, 200);
      
      ctx.fillStyle = '#f8fafc';
      ctx.font = '16px sans-serif';
      ctx.fillText('ระบบสามารถถอดข้อความภาษาอังกฤษและภาษาไทยร่วมกันได้', 40, 240);

      canvas.toBlob((blob) => {
        const demoFile = new File([blob], 'demo-sample-ocr.png', { type: 'image/png' });
        handleImageSelect(demoFile);
      }, 'image/png');

    } catch (e) {
      console.error(e);
      setStatus('error');
      setErrorMessage('Could not generate sample image.');
    }
  };

  return (
    <div className="relative min-h-screen bg-[#070b14] overflow-x-hidden flex flex-col font-sans pb-12">
      
      {/* Decorative Glow Ambient Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full radial-glow animate-glow-pulse pointer-events-none" />
      <div className="absolute bottom-[10%] right-[-10%] w-[60%] h-[60%] rounded-full radial-glow animate-glow-pulse pointer-events-none" style={{ animationDelay: '2s' }} />

      {/* Main Header Container */}
      <Header status={status} />

      <main className="relative z-10 w-full max-w-6xl mx-auto px-4 flex-1 flex flex-col">
        
        {/* Core Settings / Language Selector & Precision Tuning Controls */}
        <LanguageSelector
          selectedLanguages={selectedLanguages}
          onChange={(langs) => {
            setSelectedLanguages(langs);
            if (activeFile) {
              performOCR(activeFile, langs);
            }
          }}
          preprocess={preprocess}
          onPreprocessChange={handlePreprocessChange}
          preprocessMode={preprocessMode}
          onPreprocessModeChange={handlePreprocessModeChange}
          thresholdLevel={thresholdLevel}
          onThresholdChange={handleThresholdChange}
          psm={psm}
          onPsmChange={handlePsmChange}
          ocrEngine={ocrEngine}
          onOcrEngineChange={handleOcrEngineChange}
          useGemini={useGemini}
          onUseGeminiChange={handleUseGeminiChange}
        />

        {/* Dynamic Display Grid */}
        <div className="flex-1 flex flex-col gap-6">
          {status === 'idle' ? (
            <div className="flex flex-col gap-4">
              <DropZone onFileSelect={handleImageSelect} />
              
              {/* Demo Action Trigger */}
              <div className="flex justify-center mt-2">
                <button
                  type="button"
                  onClick={loadDemoSample}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/30 text-xs text-indigo-300 font-semibold cursor-pointer transition-all duration-200"
                >
                  <HelpCircle className="w-4 h-4" />
                  No image ready? Try our premium Dual-Lang sample
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              {/* Left Column: Source Image */}
              <div className="h-full">
                <ImagePreview
                  file={file}
                  previewUrl={previewUrl}
                  onClear={handleReset}
                  status={status}
                  onCropApply={handleCropApply}
                  onRestoreFull={handleRestoreFull}
                  imageAnalysis={imageAnalysis}
                  analysisLoading={analysisLoading}
                />
              </div>

              {/* Right Column: OCR Results */}
              <div className="h-full">
                {status === 'error' ? (
                  <div className="glass-panel p-8 rounded-3xl border-rose-500/20 shadow-2xl flex flex-col items-center justify-center text-center h-full min-h-[400px]">
                    <div className="p-4 bg-rose-500/10 text-rose-400 rounded-full border border-rose-500/20 mb-4 animate-bounce">
                      <AlertCircle className="w-10 h-10" />
                    </div>
                    <h3 className="font-display font-semibold text-lg text-white">Extraction Failed</h3>
                    <p className="text-slate-400 text-xs md:text-sm max-w-sm mt-2 leading-relaxed">
                      {errorMessage}
                    </p>
                    <div className="flex gap-3 mt-6">
                      <button
                        type="button"
                        onClick={() => performOCR(activeFile, selectedLanguages)}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold border border-slate-700 cursor-pointer transition-colors"
                      >
                        Retry OCR
                      </button>
                      <button
                        type="button"
                        onClick={handleReset}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold cursor-pointer transition-all hover:scale-105 active:scale-95"
                      >
                        Upload Another
                      </button>
                    </div>
                  </div>
                ) : (
                  <ResultViewer
                    text={ocrText}
                    confidence={confidence}
                    durationMs={durationMs}
                    onTextChange={handleTextChange}
                    status={status}
                    geminiFailed={geminiFailed}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Persistent global keyboard tips */}
      <footer className="relative z-10 w-full max-w-6xl mx-auto px-4 mt-8 flex flex-col sm:flex-row items-center justify-between text-slate-500 text-[10px] gap-2">
        <div>Smart Clipboard OCR v1.4.0 — AI Smart Enhance, Cropping & Gemini Proofread active</div>
        <div className="flex items-center gap-1.5 bg-slate-900/30 px-3 py-1 rounded-full border border-slate-900/60">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500"></span>
          <span>Tip: paste screenshot instantly from snip-tool at any moment!</span>
        </div>
      </footer>
    </div>
  );
}

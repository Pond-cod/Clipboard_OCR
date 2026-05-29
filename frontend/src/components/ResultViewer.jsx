import React, { useState } from 'react';
import { Copy, Check, Download, AlertTriangle, FileSpreadsheet, Hourglass, HelpCircle } from 'lucide-react';

export default function ResultViewer({ text, confidence, durationMs, onTextChange, status }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const handleDownload = () => {
    if (!text) return;
    const element = document.createElement('a');
    const file = new Blob([text], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `extracted-ocr-text-${Date.now()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Determine OCR confidence scale colors
  const getConfidenceLevel = (val) => {
    if (val >= 85) return { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', label: 'High Confidence' };
    if (val >= 60) return { color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', label: 'Medium Confidence' };
    return { color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', label: 'Low Confidence' };
  };

  const confidenceMetric = confidence ? getConfidenceLevel(confidence) : null;
  const wordCount = text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  const charCount = text ? text.length : 0;

  // Language auto-validation from extracted character set ranges (Text-only for Windows flag compatibility)
  const detectLanguages = (str) => {
    if (!str) return [];
    const list = [];
    const hasThai = /[\u0e00-\u0e7f]/.test(str);
    const hasEnglish = /[a-zA-Z]/.test(str);
    
    if (hasThai) list.push({ code: 'TH', name: 'Thai', color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' });
    if (hasEnglish) list.push({ code: 'EN', name: 'English', color: 'bg-brand-500/10 border-brand-500/20 text-brand-400' });
    
    return list;
  };

  const detectedLangs = detectLanguages(text);

  return (
    <div className="glass-panel p-6 rounded-3xl shadow-2xl h-full flex flex-col justify-between min-h-[400px]">
      <div className="flex flex-col gap-4 h-full flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-brand-400" />
            <h3 className="font-display font-semibold text-white">Extracted Text</h3>
            
            {/* Auto-detected Language Validation Badges */}
            {text && detectedLangs.length > 0 && (
              <div className="flex gap-1.5 ml-1.5">
                {detectedLangs.map((lang) => (
                  <span 
                    key={lang.code} 
                    title={`Verified ${lang.name} character set in output`}
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border select-none cursor-help ${lang.color}`}
                  >
                    {lang.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {text && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all duration-200 ${
                  copied 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 scale-[1.03]'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:bg-slate-800 text-xs text-slate-300 font-semibold cursor-pointer transition-all duration-200"
              >
                <Download className="w-3.5 h-3.5" />
                Save
              </button>
            </div>
          )}
        </div>

        {/* Text Area Frame */}
        <div className="relative flex-1 flex flex-col mt-2">
          {status === 'loading' ? (
            <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center p-6 text-slate-400">
              <div className="flex gap-1.5 items-center justify-center mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2.5 h-2.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2.5 h-2.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs font-medium tracking-wide uppercase text-slate-500 mt-2">Waiting for OCR...</span>
            </div>
          ) : null}

          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="Pasted image text will instantly render here. You can edit this text directly once extraction succeeds."
            disabled={status === 'loading' || !text}
            className="w-full flex-1 min-h-[220px] p-5 rounded-2xl bg-slate-950/50 border border-slate-800/80 text-slate-200 placeholder-slate-600 font-sans text-sm md:text-base leading-relaxed focus:outline-none focus:border-brand-500/40 resize-none transition-colors scrollbar"
          />
        </div>
      </div>

      {/* Dynamic Suggestions for Low OCR confidence */}
      {text && confidence && confidence < 78 && (
        <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-2.5 text-xs text-amber-300 animate-fade-in">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
          <div className="flex-1">
            <span className="font-bold block mb-0.5">Tuning Tip for 100% Accuracy:</span>
            <span>The current confidence score is lower. Try using the **Crop Area** button on the image to scan just the text, or toggle **AI Image Pre-Processing** and adjust the slider to sharpen the characters!</span>
          </div>
        </div>
      )}

      {/* Metrics Row */}
      {text && confidenceMetric && (
        <div className="mt-5 pt-4 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            {/* Confidence scale rating */}
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${confidenceMetric.color}`}>
              <AlertTriangle className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="font-semibold">{confidenceMetric.label}: {confidence.toFixed(1)}%</span>
            </div>

            {/* Time elapsed */}
            {durationMs && (
              <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400">
                <Hourglass className="w-3.5 h-3.5" />
                <span>Parsed in: <strong className="text-slate-300 font-semibold">{durationMs}ms</strong></span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 text-slate-500 font-medium bg-slate-950/20 px-3 py-1 rounded-full border border-slate-900/60">
            <span>Words: <strong className="text-slate-300">{wordCount}</strong></span>
            <span className="w-1.5 h-1.5 rounded-full bg-slate-800" />
            <span>Chars: <strong className="text-slate-300">{charCount}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}

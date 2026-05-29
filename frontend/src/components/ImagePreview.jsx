import React from 'react';
import { X, FileText, CheckCircle, Flame } from 'lucide-react';

export default function ImagePreview({ file, previewUrl, onClear, progress, status }) {
  // Helper to format bytes into readable scale
  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <div className="glass-panel p-6 rounded-3xl shadow-2xl relative overflow-hidden h-full flex flex-col justify-between">
      {/* Absolute top action button */}
      <button
        onClick={onClear}
        type="button"
        title="Clear current image"
        className="absolute top-4 right-4 z-20 p-2 rounded-full bg-slate-900/80 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 border border-slate-800 hover:border-rose-500/30 transition-all duration-200 cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex flex-col gap-4 h-full">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-5 h-5 text-brand-400" />
          <h3 className="font-display font-semibold text-white">Source Image</h3>
        </div>

        {/* Polaroid Style Image Preview Box */}
        <div className="relative flex-1 min-h-[220px] max-h-[340px] bg-slate-950/80 rounded-2xl overflow-hidden border border-slate-800/80 flex items-center justify-center p-3">
          <img
            src={previewUrl}
            alt="Clipboard Paste Preview"
            className="max-w-full max-h-full object-contain rounded-lg shadow-md"
          />

          {/* Progress / Status overlay */}
          {status === 'loading' && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-10 transition-all duration-300">
              <div className="w-16 h-16 rounded-full border-4 border-slate-800 border-t-brand-500 animate-spin mb-4" />
              <div className="font-display font-semibold text-white text-sm">Analyzing Image Characters...</div>
              <p className="text-slate-400 text-xs mt-1 max-w-[200px] leading-relaxed">
                Tesseract is OCR-profiling the pixels.
              </p>
            </div>
          )}
        </div>

        {/* Image Info Panel */}
        <div className="mt-4 pt-4 border-t border-slate-800/60 grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-900/60">
            <span className="text-slate-500 block font-medium mb-0.5">Filename</span>
            <span className="text-slate-300 font-semibold truncate block" title={file.name}>
              {file.name || 'Pasted Clipboard Image'}
            </span>
          </div>

          <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-900/60">
            <span className="text-slate-500 block font-medium mb-0.5">File Size</span>
            <span className="text-slate-300 font-semibold block">
              {formatBytes(file.size)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

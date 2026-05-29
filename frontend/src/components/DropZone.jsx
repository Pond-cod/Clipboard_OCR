import React, { useRef, useState } from 'react';
import { UploadCloud, Image as ImageIcon, ClipboardPaste, Scissors } from 'lucide-react';

export default function DropZone({ onFileSelect, onCaptureScreen, captureDelay, setCaptureDelay }) {
  const fileInputRef = useRef(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type.startsWith('image/')) {
        onFileSelect(file);
      }
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        onFileSelect(file);
      }
    }
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      className={`glass-panel-interactive relative group w-full rounded-3xl p-8 md:p-12 flex flex-col items-center justify-center text-center min-h-[300px] overflow-hidden ${
        isDragActive ? 'bg-brand-500/10 border-brand-400 scale-[1.01]' : ''
      }`}
    >
      {/* Background Animated Glow Glow effect */}
      <div className="absolute inset-0 radial-glow opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      {/* Decorative floating grids */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="relative z-10 flex flex-col items-center gap-4 max-w-md">
        {/* Animated Icon Container */}
        <div className={`p-5 rounded-2xl border transition-all duration-300 ${
          isDragActive 
            ? 'bg-brand-500 text-white border-brand-400 shadow-lg shadow-brand-500/30' 
            : 'bg-slate-900/60 border-slate-800 text-slate-400 group-hover:bg-brand-500/10 group-hover:text-brand-400 group-hover:border-brand-500/30 group-hover:scale-110'
        }`}>
          {isDragActive ? (
            <UploadCloud className="w-10 h-10 animate-bounce" />
          ) : (
            <ClipboardPaste className="w-10 h-10" />
          )}
        </div>

        <div>
          <h2 className="font-display font-semibold text-lg md:text-xl text-white group-hover:text-brand-300 transition-colors">
            {isDragActive ? 'Drop your image here' : 'Capture Image to Extract Text'}
          </h2>
          <p className="text-slate-400 text-xs md:text-sm mt-2 leading-relaxed">
            Press <kbd className="px-2 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700 shadow-sm text-xs font-mono">Ctrl + V</kbd> (or <kbd className="px-2 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700 shadow-sm text-xs font-mono">Cmd + V</kbd>) anywhere on this page to paste a screenshot.
          </p>
        </div>

        <div className="flex items-center gap-2 text-slate-500 text-xs my-1">
          <span className="h-[1px] w-8 bg-slate-800"></span>
          <span>OR</span>
          <span className="h-[1px] w-8 bg-slate-800"></span>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleClick}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-slate-700 active:scale-95 text-slate-200 text-xs font-semibold hover:scale-105 transition-all duration-200 cursor-pointer"
          >
            <ImageIcon className="w-4 h-4 text-brand-400" />
            Browse Files
          </button>

          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl overflow-hidden focus-within:border-brand-500 transition-colors">
            <button
              type="button"
              onClick={onCaptureScreen}
              className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-500 active:bg-brand-700 text-white text-xs font-semibold shadow-lg shadow-brand-600/20 transition-all duration-200 cursor-pointer border-r border-slate-800"
            >
              <Scissors className="w-4 h-4" />
              Snipping Tool (ถ่ายภาพหน้าจอ)
            </button>
            <select
              value={captureDelay}
              onChange={(e) => setCaptureDelay(parseInt(e.target.value))}
              className="px-2 py-2.5 bg-slate-900 text-slate-300 text-xs font-semibold border-none focus:outline-none focus:ring-0 cursor-pointer"
              title="ตั้งเวลาก่อนถ่ายภาพ (Capture Delay)"
            >
              <option value={0}>⏱️ No delay</option>
              <option value={3}>⏱️ 3s delay</option>
              <option value={5}>⏱️ 5s delay</option>
              <option value={10}>⏱️ 10s delay</option>
            </select>
          </div>
        </div>

        <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mt-2">
          Supports PNG, JPEG, WEBP, BMP (Max 10MB)
        </p>
      </div>
    </div>
  );
}

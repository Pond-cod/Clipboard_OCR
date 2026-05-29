import React, { useState, useRef, useEffect } from 'react';
import { X, FileText, Crop, RefreshCcw, Check, Sparkles } from 'lucide-react';

export default function ImagePreview({ 
  file, 
  previewUrl, 
  onClear, 
  status, 
  onCropApply, 
  onRestoreFull,
  imageAnalysis,
  analysisLoading
}) {
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  
  // Cropper states
  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState({ x: 15, y: 15, w: 70, h: 70 }); // percentages
  const [imgDims, setImgDims] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [dragMode, setDragMode] = useState(null); // 'move' | 'nw' | 'ne' | 'sw' | 'se'
  const [startPos, setStartPos] = useState({ x: 0, y: 0, boxX: 0, boxY: 0, boxW: 0, boxH: 0 });
  const [croppedLabel, setCroppedLabel] = useState(false);

  // Update dimensions of crop overlay matching scale in image tag
  const updateImgDims = () => {
    if (imgRef.current && containerRef.current) {
      const rect = imgRef.current.getBoundingClientRect();
      const parentRect = containerRef.current.getBoundingClientRect();
      setImgDims({
        top: rect.top - parentRect.top,
        left: rect.left - parentRect.left,
        width: rect.width,
        height: rect.height
      });
    }
  };

  useEffect(() => {
    if (isCropping) {
      updateImgDims();
      window.addEventListener('resize', updateImgDims);
    } else {
      window.removeEventListener('resize', updateImgDims);
    }
    return () => {
      window.removeEventListener('resize', updateImgDims);
    };
  }, [isCropping]);

  const handleImgLoad = () => {
    if (isCropping) {
      updateImgDims();
    }
  };

  // Drag handles
  const handlePointerDown = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    setDragMode(mode);
    setStartPos({
      x: e.clientX,
      y: e.clientY,
      boxX: crop.x,
      boxY: crop.y,
      boxW: crop.w,
      boxH: crop.h
    });
  };

  const handlePointerMove = (e) => {
    if (!dragMode || !imgDims.width) return;
    e.preventDefault();

    const deltaX = ((e.clientX - startPos.x) / imgDims.width) * 100;
    const deltaY = ((e.clientY - startPos.y) / imgDims.height) * 100;

    let nextCrop = { ...crop };

    if (dragMode === 'move') {
      // Reposition box, maintaining limits [0, 100]
      nextCrop.x = Math.max(0, Math.min(100 - crop.w, startPos.boxX + deltaX));
      nextCrop.y = Math.max(0, Math.min(100 - crop.h, startPos.boxY + deltaY));
    } else {
      // Resize modes
      if (dragMode.includes('n')) {
        const potentialH = startPos.boxH - deltaY;
        if (potentialH > 10) {
          nextCrop.y = Math.max(0, Math.min(startPos.boxY + startPos.boxH - 10, startPos.boxY + deltaY));
          nextCrop.h = startPos.boxY + startPos.boxH - nextCrop.y;
        }
      }
      if (dragMode.includes('s')) {
        nextCrop.h = Math.max(10, Math.min(100 - crop.y, startPos.boxH + deltaY));
      }
      if (dragMode.includes('w')) {
        const potentialW = startPos.boxW - deltaX;
        if (potentialW > 10) {
          nextCrop.x = Math.max(0, Math.min(startPos.boxX + startPos.boxW - 10, startPos.boxX + deltaX));
          nextCrop.w = startPos.boxX + startPos.boxW - nextCrop.x;
        }
      }
      if (dragMode.includes('e')) {
        nextCrop.w = Math.max(10, Math.min(100 - crop.x, startPos.boxW + deltaX));
      }
    }

    setCrop(nextCrop);
  };

  const handlePointerUp = () => {
    setDragMode(null);
  };

  // Convert canvas crop coordinates into new File buffer
  const triggerCropProcess = () => {
    if (!file) return;

    const img = new Image();
    img.src = previewUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Convert percentages to absolute image dimensions
      const pxX = img.width * (crop.x / 100);
      const pxY = img.height * (crop.y / 100);
      const pxW = img.width * (crop.w / 100);
      const pxH = img.height * (crop.h / 100);

      canvas.width = pxW;
      canvas.height = pxH;

      // Draw cropped area
      ctx.drawImage(img, pxX, pxY, pxW, pxH, 0, 0, pxW, pxH);

      canvas.toBlob((blob) => {
        const croppedFile = new File([blob], `cropped-${file.name || 'image.png'}`, { type: file.type || 'image/png' });
        
        onCropApply(croppedFile);
        setCroppedLabel(true);
        setIsCropping(false);
      }, file.type || 'image/png');
    };
  };

  const handleRestoreFullImage = () => {
    onRestoreFull();
    setCroppedLabel(false);
    setIsCropping(false);
  };

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-400" />
            <h3 className="font-display font-semibold text-white">Source Image</h3>
            {croppedLabel && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                <Sparkles className="w-2.5 h-2.5" />
                Cropped Area
              </span>
            )}
          </div>

          {/* Action Buttons for Cropping */}
          <div className="flex gap-2 relative z-10">
            {croppedLabel ? (
              <button
                type="button"
                onClick={handleRestoreFullImage}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-brand-500/30 text-slate-300 hover:text-brand-300 text-xs font-semibold cursor-pointer transition-all duration-200"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                Full Image
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsCropping(!isCropping);
                  if (!isCropping) {
                    setTimeout(updateImgDims, 50);
                  }
                }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all duration-200 ${
                  isCropping 
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-md' 
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <Crop className="w-3.5 h-3.5" />
                {isCropping ? 'Cancel Crop' : 'Crop Area'}
              </button>
            )}
          </div>
        </div>

        {/* Polaroid Style Image Preview Box */}
        <div 
          ref={containerRef}
          className="relative flex-1 min-h-[260px] max-h-[360px] bg-slate-950/80 rounded-2xl overflow-hidden border border-slate-800/80 flex items-center justify-center p-3"
        >
          <img
            ref={imgRef}
            src={previewUrl}
            onLoad={handleImgLoad}
            alt="Clipboard Paste Preview"
            className="max-w-full max-h-full object-contain rounded-lg shadow-md select-none"
            draggable="false"
          />

          {/* Interactive HTML5 Crop Overlay Container */}
          {isCropping && imgDims.width > 0 && (
            <div
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              style={{
                position: 'absolute',
                top: `${imgDims.top}px`,
                left: `${imgDims.left}px`,
                width: `${imgDims.width}px`,
                height: `${imgDims.height}px`,
              }}
              className="z-10 bg-black/60 touch-none select-none rounded-lg"
            >
              {/* Draggable Selector Box */}
              <div
                style={{
                  position: 'absolute',
                  top: `${crop.y}%`,
                  left: `${crop.x}%`,
                  width: `${crop.w}%`,
                  height: `${crop.h}%`,
                }}
                onPointerDown={(e) => handlePointerDown(e, 'move')}
                className="border-2 border-brand-400 shadow-[0_0_15px_rgba(14,165,233,0.4)] cursor-move flex items-center justify-center"
              >
                {/* Visual guidelines */}
                <div className="absolute inset-0 bg-transparent opacity-10 border border-dashed border-white pointer-events-none grid grid-cols-3 grid-rows-3">
                  <div></div><div></div><div></div>
                  <div></div><div></div><div></div>
                </div>

                {/* Handles at corners */}
                <div
                  onPointerDown={(e) => handlePointerDown(e, 'nw')}
                  className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-brand-500 rounded-full cursor-nwse-resize z-20 shadow-md"
                />
                <div
                  onPointerDown={(e) => handlePointerDown(e, 'ne')}
                  className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-brand-500 rounded-full cursor-nesw-resize z-20 shadow-md"
                />
                <div
                  onPointerDown={(e) => handlePointerDown(e, 'sw')}
                  className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-brand-500 rounded-full cursor-nesw-resize z-20 shadow-md"
                />
                <div
                  onPointerDown={(e) => handlePointerDown(e, 'se')}
                  className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-brand-500 rounded-full cursor-nwse-resize z-20 shadow-md"
                />
              </div>
            </div>
          )}

          {/* Progress / Status overlay */}
          {status === 'loading' && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-15 transition-all duration-300">
              <div className="w-16 h-16 rounded-full border-4 border-slate-800 border-t-brand-500 animate-spin mb-4" />
              <div className="font-display font-semibold text-white text-sm">Analyzing Image Characters...</div>
              <p className="text-slate-400 text-xs mt-1 max-w-[200px] leading-relaxed">
                Tesseract is OCR-profiling the pixels.
              </p>
            </div>
          )}
        </div>

        {/* Apply Crop Panel button */}
        {isCropping && (
          <div className="mt-2 flex gap-3 animate-fade-in">
            <button
              type="button"
              onClick={triggerCropProcess}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 active:bg-brand-700 text-white text-xs font-semibold shadow-lg shadow-brand-600/20 hover:scale-[1.01] active:scale-[0.99] transition-all duration-150 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Apply Crop & Re-Scan (สแกนจุดนี้)
            </button>
            <button
              type="button"
              onClick={() => setIsCropping(false)}
              className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold cursor-pointer transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Image Quality Diagnostics Panel ("ตรวจสอบคุณภาพรูปภาพ") */}
        {analysisLoading && (
          <div className="mt-4 p-4 rounded-2xl bg-slate-950/30 border border-slate-900/60 flex flex-col gap-2.5 animate-pulse">
            <div className="flex justify-between items-center">
              <div className="h-3 w-32 bg-slate-800 rounded" />
              <div className="h-3 w-16 bg-slate-800 rounded" />
            </div>
            <div className="h-1.5 w-full bg-slate-900 rounded-full" />
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div className="h-7 bg-slate-900/60 rounded-xl border border-slate-900/40" />
              <div className="h-7 bg-slate-900/60 rounded-xl border border-slate-900/40" />
            </div>
          </div>
        )}

        {imageAnalysis && !analysisLoading && (
          <div className="mt-4 p-4 rounded-2xl bg-slate-950/50 border border-slate-800/80 flex flex-col gap-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">Image Pre-Check Status</span>
              </div>
              <div className="flex items-center gap-1">
                <span className={`w-2.5 h-2.5 rounded-full ${
                  imageAnalysis.qualityScore >= 80 ? 'bg-emerald-500' :
                  imageAnalysis.qualityScore >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                }`} />
                <span className="text-[10px] text-slate-400 font-semibold">
                  Score: <strong className="text-slate-200">{imageAnalysis.qualityScore}/100</strong>
                </span>
              </div>
            </div>

            {/* Quality Score Bar */}
            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  imageAnalysis.qualityScore >= 80 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' :
                  imageAnalysis.qualityScore >= 50 ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]' :
                  'bg-rose-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]'
                }`}
                style={{ width: `${imageAnalysis.qualityScore}%` }}
              />
            </div>

            {/* Specs checklist grid */}
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-900/80 flex items-center justify-between text-[10px]">
                <span className="text-slate-500">Dimensions</span>
                <span className="text-slate-300 font-semibold font-mono">{imageAnalysis.width}×{imageAnalysis.height}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-900/80 flex items-center justify-between text-[10px]">
                <span className="text-slate-500">Background</span>
                <span className={`font-semibold ${imageAnalysis.isDark ? 'text-indigo-400' : 'text-slate-400'}`}>
                  {imageAnalysis.isDark ? '🌙 Dark (Auto-Invert)' : '☀️ Normal'}
                </span>
              </div>
            </div>

            {/* Issues or Suggestions */}
            {(imageAnalysis.issues?.length > 0 || imageAnalysis.suggestions?.length > 0) && (
              <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-900">
                {imageAnalysis.issues?.map((issue, idx) => (
                  <div key={`issue-${idx}`} className="flex items-start gap-1.5 text-[10px] text-rose-300 leading-normal">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                    <span>{issue}</span>
                  </div>
                ))}
                {imageAnalysis.suggestions?.map((sug, idx) => (
                  <div key={`sug-${idx}`} className="flex items-start gap-1.5 text-[10px] text-emerald-300/90 leading-normal">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <span>{sug}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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

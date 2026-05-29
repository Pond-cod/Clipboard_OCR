import React, { useState } from 'react';
import { Globe, Check, Sliders, ChevronDown, ChevronUp, Zap, HelpCircle, Eye, EyeOff } from 'lucide-react';

export default function LanguageSelector({
  selectedLanguages,
  onChange,
  preprocess,
  onPreprocessChange,
  preprocessMode,
  onPreprocessModeChange,
  thresholdLevel,
  onThresholdChange,
  psm,
  onPsmChange
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Available OCR languages
  const options = [
    { code: 'eng', name: 'English', desc: 'Latin characters, symbols, and code', icon: '🇬🇧' },
    { code: 'tha', name: 'Thai (ภาษาไทย)', desc: 'Thai script, letters, and numbers', icon: '🇹🇭' }
  ];

  const handleToggle = (code) => {
    if (selectedLanguages.includes(code)) {
      if (selectedLanguages.length > 1) {
        onChange(selectedLanguages.filter(lang => lang !== code));
      }
    } else {
      onChange([...selectedLanguages, code]);
    }
  };

  const psmOptions = [
    { code: '3', name: 'Automatic Layout (Default)', desc: 'Fully automatic page segmentation' },
    { code: '6', name: 'Single Text Block', desc: 'Assumes a single uniform block of text' },
    { code: '7', name: 'Single Text Line', desc: 'Treats the image as a single horizontal line' },
    { code: '8', name: 'Single Word', desc: 'Treats the image as a single word' }
  ];

  return (
    <div className="glass-panel p-6 rounded-3xl mb-6 shadow-2xl shadow-black/30 transition-all duration-300">
      {/* Top Section: Languages selection */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-brand-400" />
          <h3 className="font-display font-semibold text-white">OCR Engine Language & Tuning</h3>
        </div>

        {/* Advanced Expander Button */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all duration-200 ${
            showAdvanced 
              ? 'bg-brand-500/10 border-brand-500/30 text-brand-300' 
              : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>AI Enhancements & Precision Tuning</span>
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>
      
      <p className="text-slate-400 text-xs mb-4 leading-relaxed max-w-3xl">
        Adjust language options depending on the target image. Using both languages allows mixed-text extraction. To maximize accuracy, toggle advanced image processing enhancements below.
      </p>

      {/* Language Button Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {options.map((option) => {
          const isSelected = selectedLanguages.includes(option.code);
          return (
            <button
              key={option.code}
              type="button"
              onClick={() => handleToggle(option.code)}
              className={`relative flex items-center justify-between p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer outline-none group ${
                isSelected
                  ? 'bg-brand-500/10 border-brand-500/50 shadow-md shadow-brand-500/5 text-white'
                  : 'bg-slate-900/40 border-slate-800 text-slate-300 hover:bg-slate-900/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl" role="img" aria-label={option.name}>
                  {option.icon}
                </span>
                <div>
                  <div className="font-medium text-sm flex items-center gap-1.5">
                    {option.name}
                    {isSelected && (
                      <span className="text-[10px] uppercase font-bold tracking-wider bg-brand-500/20 text-brand-300 px-1.5 py-0.5 rounded border border-brand-500/30">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-slate-500 text-xs mt-0.5 group-hover:text-slate-400 transition-colors">
                    {option.desc}
                  </div>
                </div>
              </div>
              
              <div className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all duration-200 ${
                isSelected 
                  ? 'bg-brand-500 border-brand-500 text-white shadow-sm shadow-brand-500/30'
                  : 'border-slate-700 text-transparent'
              }`}>
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Collapsible Advanced Fine-Tuning Panel */}
      {showAdvanced && (
        <div className="mt-4 pt-4 border-t border-slate-800/80 animate-fade-in grid grid-cols-1 lg:grid-cols-2 gap-6 bg-slate-950/20 p-5 rounded-2xl border border-slate-900">
          
          {/* Col 1: Sharp Image Preprocessor Control */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-white">AI Image Pre-Processing</span>
              </div>
              
              {/* Custom Switch Switch */}
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={preprocess}
                  onChange={(e) => onPreprocessChange(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-500"></div>
              </label>
            </div>
            
            <p className="text-slate-400 text-xs leading-relaxed">
              Auto-sharpens edges, scales small images to increase resolution (DPI), and enhances pixel contrast for near 100% character detection.
            </p>

            {preprocess && (
              <div className="mt-2 flex flex-col gap-3">
                {/* Preprocessing Mode Toggle */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950/60 rounded-xl border border-slate-900">
                  <button
                    type="button"
                    onClick={() => onPreprocessModeChange('enhance')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      preprocessMode === 'enhance'
                        ? 'bg-brand-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    AI Smart Enhance
                  </button>
                  <button
                    type="button"
                    onClick={() => onPreprocessModeChange('threshold')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      preprocessMode === 'threshold'
                        ? 'bg-brand-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Strict Binarize
                  </button>
                </div>

                {preprocessMode === 'enhance' ? (
                  <span className="text-[10px] text-slate-500 bg-slate-900/50 p-2 rounded border border-slate-900">
                    ℹ️ **AI Smart Enhance (Recommended)**: Keeps all texts visible, including light grey or low-contrast numbers on white card backgrounds.
                  </span>
                ) : (
                  <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-900 flex flex-col gap-2">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-slate-400">Strict Contrast Threshold:</span>
                      <span className="text-brand-300 font-bold font-mono">{thresholdLevel}</span>
                    </div>
                    <input
                      type="range"
                      min="100"
                      max="180"
                      value={thresholdLevel}
                      onChange={(e) => onThresholdChange(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
                    />
                    <span className="text-[10px] text-slate-500">
                      Warning: High levels may erase thin light-grey numbers.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Col 2: Tesseract Page Segmentation Mode (PSM) */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-semibold text-white">Page Layout Segmentation (PSM)</span>
            </div>
            
            <p className="text-slate-400 text-xs leading-relaxed">
              Instruct the OCR engine how to parse layout geometry. Matching this to your snippet structure drastically reduces character errors.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
              {psmOptions.map((opt) => {
                const isActive = psm === opt.code;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => onPsmChange(opt.code)}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      isActive 
                        ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-300'
                        : 'bg-slate-950/20 border-slate-900 text-slate-400 hover:border-slate-800 hover:text-slate-300'
                    }`}
                  >
                    <div className="font-semibold text-xs">{opt.name}</div>
                    <div className="text-[9px] text-slate-500 mt-0.5 truncate">{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

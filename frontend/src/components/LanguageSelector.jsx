import React from 'react';
import { Globe, Check } from 'lucide-react';

export default function LanguageSelector({ selectedLanguages, onChange }) {
  // Available OCR languages
  const options = [
    { code: 'eng', name: 'English', desc: 'Latin characters, symbols, and code', icon: '🇬🇧' },
    { code: 'tha', name: 'Thai (ภาษาไทย)', desc: 'Thai script, letters, and numbers', icon: '🇹🇭' }
  ];

  const handleToggle = (code) => {
    // If clicking a language, ensure at least one language remains selected
    if (selectedLanguages.includes(code)) {
      if (selectedLanguages.length > 1) {
        onChange(selectedLanguages.filter(lang => lang !== code));
      }
    } else {
      onChange([...selectedLanguages, code]);
    }
  };

  return (
    <div className="glass-panel p-6 rounded-3xl mb-6 shadow-2xl shadow-black/30">
      <div className="flex items-center gap-2 mb-4">
        <Globe className="w-5 h-5 text-brand-400" />
        <h3 className="font-display font-semibold text-white">OCR Engine Language</h3>
      </div>
      
      <p className="text-slate-400 text-xs mb-4 leading-relaxed">
        Select one or both languages depending on the target image. Using both languages allows mixed-text extraction, but single selection may improve recognition accuracy.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
    </div>
  );
}

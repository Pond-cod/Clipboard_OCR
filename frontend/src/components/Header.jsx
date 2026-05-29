import React from 'react';
import { Cpu, Languages } from 'lucide-react';

export default function Header({ status }) {
  const getStatusBadge = () => {
    switch (status) {
      case 'loading':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-brand-500/10 text-brand-400 border border-brand-500/20 animate-pulse">
            <span className="w-1.5 h-1.5 mr-2 rounded-full bg-brand-400 animate-ping"></span>
            Extracting text...
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <span className="w-1.5 h-1.5 mr-2 rounded-full bg-rose-400"></span>
            OCR Failed
          </span>
        );
      case 'success':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 mr-2 rounded-full bg-emerald-400"></span>
            OCR Successful
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
            <span className="w-1.5 h-1.5 mr-2 rounded-full bg-slate-400"></span>
            System Idle
          </span>
        );
    }
  };

  return (
    <header className="relative z-10 w-full max-w-6xl mx-auto mb-8 flex flex-col md:flex-row items-center justify-between gap-4 p-4">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-gradient-to-tr from-brand-600 to-indigo-500 rounded-2xl shadow-lg shadow-brand-500/20 animate-float">
          <Cpu className="w-8 h-8 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display font-bold text-2xl md:text-3xl text-white tracking-tight">
              Smart Clipboard <span className="text-gradient">OCR</span>
            </h1>
            {getStatusBadge()}
          </div>
          <p className="text-slate-400 text-xs md:text-sm mt-0.5 font-sans">
            Instantly capture and extract text from images in English & Thai
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2 bg-slate-900/60 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-800">
        <Languages className="w-4 h-4 text-brand-400" />
        <span className="text-xs text-slate-300 font-medium">Dual-Language Engine: </span>
        <span className="text-xs font-semibold bg-brand-500/10 text-brand-300 px-2 py-0.5 rounded border border-brand-500/20">EN</span>
        <span className="text-xs font-semibold bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/20">TH</span>
      </div>
    </header>
  );
}

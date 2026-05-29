import React, { useState, useRef } from 'react';
import { Copy, Check, Download, AlertTriangle, FileSpreadsheet, Hourglass, HelpCircle, BookOpen, Search, Sparkles, RefreshCw, ArrowRight, ExternalLink, X } from 'lucide-react';

export default function ResultViewer({ text, confidence, durationMs, onTextChange, status, geminiFailed }) {
  const [copied, setCopied] = useState(false);
  
  // ORST spelling & dictionary checker states
  const [showSpellCheck, setShowSpellCheck] = useState(false);
  const [lookupWord, setLookupWord] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [selectedWord, setSelectedWord] = useState('');
  const [typos, setTypos] = useState([]);
  const [spellCheckLoading, setSpellCheckLoading] = useState(false);
  const [spellCheckScanDone, setSpellCheckScanDone] = useState(false);
  
  const textareaRef = useRef(null);

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

  // Language auto-validation
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

  // Monitor text highlighting in the textarea
  const handleTextareaSelect = (e) => {
    const start = e.target.selectionStart;
    const end = e.target.selectionEnd;
    if (start !== end) {
      const selText = e.target.value.substring(start, end).trim();
      // Filter out long sentences, keep individual Thai/English word lookups
      if (selText.length > 0 && selText.length < 25) {
        setSelectedWord(selText);
      }
    } else {
      setSelectedWord('');
    }
  };

  // Click on active selection to trigger search
  const triggerSelectionLookup = () => {
    if (!selectedWord) return;
    setLookupWord(selectedWord);
    setShowSpellCheck(true);
    setTimeout(() => {
      handleLookup(null, selectedWord);
    }, 100);
  };

  // Run dynamic word spelling lookup on backend
  const handleLookup = async (e, customWord = null) => {
    if (e) e.preventDefault();
    const query = (customWord || lookupWord).trim();
    if (!query) return;

    setLookupLoading(true);
    setLookupResult(null);
    try {
      const response = await fetch(`http://localhost:5000/api/dictionary/lookup?word=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (data.success) {
        setLookupResult(data);
      }
    } catch (err) {
      console.warn('[ORST Lookup Error]:', err.message);
    } finally {
      setLookupLoading(false);
    }
  };

  // Scan full text for dictionary anomalies
  const handleSpellCheckScan = async () => {
    if (!text) return;
    setSpellCheckLoading(true);
    setSpellCheckScanDone(false);
    try {
      const response = await fetch('http://localhost:5000/api/dictionary/spellcheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (data.success) {
        setTypos(data.typos || []);
        setSpellCheckScanDone(true);
      }
    } catch (err) {
      console.warn('[ORST Spellcheck Error]:', err.message);
    } finally {
      setSpellCheckLoading(false);
    }
  };

  // Replace spelling typo inside active textarea
  const handleReplaceWord = (oldWord, newWord) => {
    if (!text) return;
    const updated = text.replaceAll(oldWord, newWord);
    onTextChange(updated);
    // Remove from active issues list
    setTypos(prev => prev.filter(t => t.word !== oldWord));
  };

  return (
    <div className="glass-panel p-6 rounded-3xl shadow-2xl h-full flex flex-col justify-between min-h-[400px]">
      <div className="flex flex-col gap-4 h-full flex-1">
        
        {/* Title Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-brand-400" />
            <h3 className="font-display font-semibold text-white">Extracted Text</h3>
            
            {/* Auto-detected Language badges */}
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
              {/* ORST Spellchecker Toggle */}
              <button
                type="button"
                onClick={() => {
                  setShowSpellCheck(!showSpellCheck);
                  if (!showSpellCheck && typos.length === 0) {
                    handleSpellCheckScan();
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all duration-200 ${
                  showSpellCheck 
                    ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300 scale-[1.02]'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>ตรวจสะกดคำ (ORST)</span>
              </button>

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

        {/* Highlight Word Floating Hint */}
        {selectedWord && (
          <div className="flex items-center justify-between bg-slate-900/90 border border-indigo-500/30 rounded-xl px-4 py-2 text-xs text-slate-300 animate-slide-in">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>ต้องการตรวจคำว่า <strong className="text-white font-semibold">"{selectedWord}"</strong> ใช่หรือไม่?</span>
            </div>
            <button
              type="button"
              onClick={triggerSelectionLookup}
              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-[10px] cursor-pointer transition-colors"
            >
              ค้นพจนานุกรม ORST
            </button>
          </div>
        )}

        {/* Text Area Frame & Double Split Spell Check Panel */}
        <div className="flex-1 flex flex-col gap-4 mt-2">
          <div className="relative flex-1 flex flex-col min-h-[220px]">
            {status === 'loading' ? (
              <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center p-6 text-slate-400">
                <div className="flex gap-1.5 items-center justify-center mb-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs font-medium tracking-wide uppercase text-slate-500 mt-2 animate-pulse">Waiting for OCR...</span>
              </div>
            ) : null}

            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              onSelect={handleTextareaSelect}
              placeholder="Pasted image text will instantly render here. You can edit this text directly once extraction succeeds."
              disabled={status === 'loading' || !text}
              className="w-full flex-1 min-h-[220px] p-5 rounded-2xl bg-slate-950/50 border border-slate-800/80 text-slate-200 placeholder-slate-600 font-sans text-sm md:text-base leading-relaxed focus:outline-none focus:border-brand-500/40 resize-none transition-colors scrollbar"
            />
          </div>

          {/* Collapsible Spelling / ORST Dictionary checking dashboard */}
          {showSpellCheck && text && (
            <div className="bg-slate-950/40 border border-slate-800/90 rounded-2xl p-4 flex flex-col gap-4 animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">พจนานุกรมราชบัณฑิตฯ (orst.go.th)</span>
                </div>
                <button 
                  type="button" 
                  onClick={() => setShowSpellCheck(false)}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Grid split: Search Dictionary vs Scan results */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Section A: Search term directly */}
                <div className="bg-slate-900/50 p-3.5 border border-slate-800/60 rounded-xl flex flex-col gap-2">
                  <span className="text-[11px] font-bold text-slate-400">🔍 ค้นหาคำรายตัว (Word Lookup)</span>
                  <form onSubmit={handleLookup} className="flex gap-2">
                    <input
                      type="text"
                      value={lookupWord}
                      onChange={(e) => setLookupWord(e.target.value)}
                      placeholder="พิมพ์คำศัพท์ เช่น กฎหมาย, สลิป"
                      className="flex-1 px-3 py-1.5 text-xs bg-slate-950/60 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/40"
                    />
                    <button
                      type="submit"
                      disabled={lookupLoading || !lookupWord.trim()}
                      className="px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs cursor-pointer flex items-center justify-center min-w-[50px] transition-colors"
                    >
                      {lookupLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'ค้นหา'}
                    </button>
                  </form>

                  {/* Lookup result display */}
                  {lookupResult && (
                    <div className="mt-2 text-xs bg-slate-950/30 p-2.5 rounded-lg border border-slate-800/50 animate-fade-in">
                      {lookupResult.exists ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-emerald-400 font-bold">✅ คำสะกดถูกต้องตามมาตรฐาน ORST</span>
                          <span className="text-slate-400 text-[10px]">พบในพจนานุกรมราชบัณฑิตยสถาน</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <span className="text-amber-400 font-bold">❌ สะกดไม่ตรงตามมาตรฐาน ORST</span>
                          {lookupResult.suggestions && lookupResult.suggestions.length > 0 ? (
                            <div>
                              <span className="text-[10px] text-slate-500 block mb-1">คำใกล้เคียงที่แนะนำ:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {lookupResult.suggestions.map(sug => (
                                  <button
                                    key={sug}
                                    type="button"
                                    onClick={() => setLookupWord(sug)}
                                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-white text-[10px] rounded border border-slate-700 cursor-pointer font-medium"
                                  >
                                    {sug}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-500">ไม่มีในฐานข้อมูลสำนักงานราชบัณฑิตยสภา</span>
                          )}
                        </div>
                      )}
                      
                      {/* Direct External Search Redirect */}
                      <a
                        href={lookupResult.googleSearchUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-indigo-400 hover:underline mt-2.5"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>เปิดตรวจคำนิยามใน dictionary.orst.go.th</span>
                      </a>
                    </div>
                  )}
                </div>

                {/* Section B: Document Spell-Checking report */}
                <div className="bg-slate-900/50 p-3.5 border border-slate-800/60 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400">📝 รายงานสแกนตัวสะกด (Full Text Scan)</span>
                    <button
                      type="button"
                      onClick={handleSpellCheckScan}
                      disabled={spellCheckLoading}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[10px] text-slate-300 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      {spellCheckLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      สแกนซ้ำ
                    </button>
                  </div>

                  {spellCheckLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-4 text-slate-500 text-[10px] gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
                      <span>กำลังวิเคราะห์อักขระเปรียบเทียบกับคำศัพท์ 19,000 คำ...</span>
                    </div>
                  ) : (
                    <div className="flex-1 min-h-[110px] max-h-[160px] overflow-y-auto scrollbar">
                      {typos.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center p-4 text-center text-[10px] text-slate-500">
                          {spellCheckScanDone ? '🎉 ตรวจสอบเสร็จสิ้น ไม่พบคำสะกดผิดภาษาไทยที่สงสัย!' : 'คลิกปุ่มสแกนด้านบน เพื่อค้นหาคำสะกดผิด'}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2.5 pr-1">
                          {typos.map((item) => (
                            <div key={item.word} className="bg-slate-950/40 p-2 rounded-lg border border-slate-800/55 text-[10px] flex flex-col gap-1.5">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-rose-400">คำที่ต้องสงสัย: "{item.word}"</span>
                                <a 
                                  href={item.googleSearchUrl} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  title="ตรวจกับราชบัณฑิตยสถาน"
                                  className="text-slate-500 hover:text-indigo-400"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>

                              {item.suggestions && item.suggestions.length > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-slate-500 text-[9px]">คลิกเพื่อแก้ไขเป็น:</span>
                                  <div className="flex flex-wrap gap-1">
                                    {item.suggestions.map(sug => (
                                      <button
                                        key={sug}
                                        type="button"
                                        onClick={() => handleReplaceWord(item.word, sug)}
                                        className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded cursor-pointer font-bold transition-all hover:scale-105"
                                      >
                                        {sug}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[9px] text-slate-500">ไม่พบคำแนะนำใกล้เคียงในสารบบ</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Gemini API Quota Exhausted Fallback Warning */}
      {geminiFailed && (
        <div className="mt-4 p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-2xl flex items-start gap-2.5 text-xs text-rose-300 animate-fade-in animate-pulse-subtle">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
          <div className="flex-1 leading-relaxed">
            <span className="font-bold block mb-0.5 text-rose-200">⚠️ Gemini Vision API Quota Exhausted</span>
            <span>Your Gemini Daily API Key quota has been exhausted for today (limit: 0). The system has automatically fallen back to the local, offline **Tesseract.js Multi-Pass Engine**.</span>
            <span className="block mt-1.5 text-[10px] text-slate-400 font-semibold leading-normal">
              💡 Tip for Tesseract: Since the image contains mostly Thai text, turn off **English** in the language selector at the top! Running in Thai-only mode prevents English character confusion (like `cD` instead of `เป๋าตัง`, or `SoU` instead of `รวม`).
            </span>
          </div>
        </div>
      )}

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

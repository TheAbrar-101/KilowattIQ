import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  RotateCcw,
  Sparkles,
  AlertCircle,
  HelpCircle,
  Send,
  CheckCircle2,
  Zap,
  TrendingDown,
  Layers,
  Flame,
  AudioWaveform as Waveform,
  Keyboard
} from 'lucide-react';
import { VoiceAdvisoryOutput } from '../../server/voice/promptTemplate';
import { Household } from '../../../shared/types/household';

interface BanglaVoiceInputProps {
  household?: Household;
  token?: string | null;
  onAdvisoryReceived?: (advisory: VoiceAdvisoryOutput) => void;
}

export const BanglaVoiceInput: React.FC<BanglaVoiceInputProps> = ({
  household,
  token,
  onAdvisoryReceived,
}) => {
  // Speech Recognition & State
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('আমার বিল কেন এত বেশি?');
  const [interimText, setInterimText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [speechSupported, setSpeechSupported] = useState<boolean>(true);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [fallbackMode, setFallbackMode] = useState<boolean>(false);

  // Response state
  const [advisoryResult, setAdvisoryResult] = useState<VoiceAdvisoryOutput | null>(null);

  // Audio recording fallback ref
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const synthUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Check Web Speech API support
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      setFallbackMode(true);
    }
  }, []);

  // Cleanup speech synthesis on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Speak Bangla Response using Web Speech Synthesis
  const speakBanglaResponse = useCallback((textToSpeak: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'bn-BD';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    // Look for available Bangla voices
    const voices = window.speechSynthesis.getVoices();
    const bnVoice = voices.find(v => v.lang === 'bn-BD' || v.lang === 'bn_BD' || v.lang.startsWith('bn'));
    if (bnVoice) {
      utterance.voice = bnVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = (e) => {
      console.warn('[Web Speech TTS] Playback notice:', e);
      setIsSpeaking(false);
    };

    synthUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  // Submit Query to Backend Voice Advisory Endpoint
  const handleQuerySubmit = async (queryText?: string) => {
    const query = (queryText || transcript || interimText).trim();
    if (!query) return;

    setIsProcessing(true);
    setSpeechError(null);
    stopSpeaking();

    try {
      const res = await fetch('/api/v1/voice/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          query,
          householdId: household?.id || '11111111-1111-4111-a111-111111111111',
        }),
      });

      const json = await res.json();
      if (res.ok && json.status === 'success' && json.data) {
        const data: VoiceAdvisoryOutput = json.data;
        setAdvisoryResult(data);
        if (onAdvisoryReceived) onAdvisoryReceived(data);

        // Auto-play spoken Bangla summary via Web Speech Synthesis
        if (data.spokenSummary) {
          speakBanglaResponse(data.spokenSummary);
        }
      } else {
        setSpeechError(json.message || 'ভয়েস অ্যাডভাইজর উত্তর তৈরি করতে পারেনি।');
      }
    } catch (err: any) {
      setSpeechError(err?.message || 'সার্ভার যোগাযোগে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setIsProcessing(false);
    }
  };

  // Toggle Web Speech Recognition (bn-BD)
  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const startListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      // Fallback to media recorder or manual typing
      setFallbackMode(true);
      startMediaRecorderFallback();
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'bn-BD';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
        setInterimText('');
      };

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            currentInterim += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          setTranscript(finalTranscript.trim());
          setInterimText('');
        } else if (currentInterim) {
          setInterimText(currentInterim);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('[Web Speech API Error]:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setSpeechError('মাইক্রোফোন পারমিশন প্রয়োজন। ব্রাউজার সেটিংসে অনুমতি দিন।');
        } else if (event.error === 'no-speech') {
          // Keep current transcript
        } else if (event.error === 'language-not-supported' || event.error === 'network') {
          setFallbackMode(true);
          setSpeechError('আপনার ব্রাউজারে বাংলা ভয়েস সরাসরি সমর্থিত নয়। দয়া করে বাংলায় টাইপ করুন (Type in Bangla instead)');
        } else {
          setFallbackMode(true);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.warn('[Speech Recognition Init Failed]:', err);
      setFallbackMode(true);
      startMediaRecorderFallback();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsListening(false);
  };

  // Audio blob recording fallback via Gemini Audio STT
  const startMediaRecorderFallback = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Convert blob to base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          if (base64Data) {
            setIsProcessing(true);
            try {
              const res = await fetch('/api/v1/voice/stt', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ audioBase64: base64Data, mimeType: 'audio/webm' }),
              });
              const json = await res.json();
              if (json.status === 'success' && json.data?.transcript) {
                setTranscript(json.data.transcript);
                handleQuerySubmit(json.data.transcript);
              }
            } catch (err) {
              console.warn('[Gemini Audio STT Fallback Failed]:', err);
            } finally {
              setIsProcessing(false);
            }
          }
        };
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsListening(true);
      setSpeechError(null);
    } catch (err: any) {
      setIsListening(false);
      setFallbackMode(true);
      setSpeechError('মাইক্রোফোন সংযোগ পাওয়া যায়নি। নিচে বাংলায় প্রশ্ন টাইপ করুন।');
    }
  };

  const quickPrompts = [
    'আমার বিল কেন এত বেশি?',
    'এসি চালালে কত টাকা বিল আসবে?',
    'কোন সময়ে বিদ্যুৎ খরচ কম?',
    'ভ্যাম্পায়ার পাওয়ার কিভাবে বন্ধ করব?',
  ];

  return (
    <div className="space-y-4">
      {/* Top Banner Card for Bangla Voice Assistant */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 border border-amber-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400 shrink-0">
              <Mic className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-white tracking-wide font-display">
                  বাংলা ভয়েস এনার্জি অ্যাসিস্ট্যান্ট (Bangla Voice Interaction)
                </h3>
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  bn-BD Web Speech
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                মাইক্রোফোনে বাংলায় প্রশ্ন করুন অথবা দ্রুত সিলেক্ট করুন — এআই উপদেষ্টা বাংলায় উত্তর দেবে ও পড়ে শোনাবে
              </p>
            </div>
          </div>

          {/* Fallback Mode Toggle or Status */}
          <div className="flex items-center gap-2">
            {isSpeaking && (
              <button
                onClick={stopSpeaking}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold font-display cursor-pointer transition-all animate-pulse"
                title="ভয়েস বন্ধ করুন"
              >
                <VolumeX className="w-4 h-4" />
                <span>অডিও থামান</span>
              </button>
            )}

            <button
              onClick={() => setFallbackMode(!fallbackMode)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold font-display cursor-pointer transition-all"
              title="টাইপিং মোড চালু/বন্ধ করুন"
            >
              <Keyboard className="w-3.5 h-3.5 text-amber-400" />
              <span>{fallbackMode ? 'ভয়েস মোড' : 'কীবোর্ড মোড'}</span>
            </button>
          </div>
        </div>

        {/* Browser Unsupported Notice / Fallback Message */}
        {(!speechSupported || fallbackMode) && (
          <div className="mt-4 p-3.5 bg-amber-950/40 border border-amber-800/80 rounded-xl flex items-start justify-between gap-3 text-amber-200 text-xs">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">
                  আপনার ব্রাউজারে বাংলা ভয়েস সরাসরি সমর্থিত নয়। দয়া করে বাংলায় টাইপ করুন (Type in Bangla instead)
                </p>
                <p className="text-[11px] text-amber-300/80 mt-0.5">
                  নিচের টেক্সট ফিল্ডে যেকোনো প্রশ্ন লিখুন অথবা রেডিমেড প্রশ্নে ক্লিক করুন। এআই স্বয়ংক্রিয়ভাবে বাংলায় বিশ্লেষণ করবে।
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-900/60 text-amber-300 border border-amber-800 shrink-0">
              Text Fallback Active
            </span>
          </div>
        )}

        {/* Error Notice */}
        {speechError && (
          <div className="mt-3 p-3 bg-rose-950/50 border border-rose-800 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{speechError}</span>
          </div>
        )}

        {/* Main Mic & Interaction Bar */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          
          {/* Big Tactile Mic Button with Pulsing Wave */}
          <div className="lg:col-span-4 flex items-center justify-center p-3 bg-slate-950/60 rounded-2xl border border-slate-800">
            <div className="flex flex-col items-center gap-2.5">
              <div className="relative">
                {isListening && (
                  <>
                    <span className="absolute inset-0 rounded-full bg-amber-500/30 animate-ping scale-125" />
                    <span className="absolute inset-0 rounded-full bg-amber-500/20 animate-pulse scale-150" />
                  </>
                )}

                <button
                  onClick={toggleListening}
                  disabled={isProcessing}
                  title={isListening ? 'শোনা বন্ধ করতে ক্লিক করুন' : 'বাংলায় কথা বলতে ক্লিক করুন (bn-BD)'}
                  className={`relative w-20 h-20 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer shadow-xl ${
                    isListening
                      ? 'bg-rose-500 text-white ring-4 ring-rose-500/40 animate-pulse'
                      : isProcessing
                      ? 'bg-slate-800 text-slate-500'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950 hover:scale-105 active:scale-95 shadow-amber-500/30'
                  }`}
                >
                  {isListening ? (
                    <MicOff className="w-8 h-8" />
                  ) : (
                    <Mic className="w-8 h-8" />
                  )}
                  <span className="text-[9px] font-black uppercase tracking-wider font-display mt-0.5">
                    {isListening ? 'Listening' : 'Talk'}
                  </span>
                </button>
              </div>

              <div className="text-center">
                <p className="text-xs font-bold text-white font-display">
                  {isListening
                    ? 'বাংলায় কথা বলুন... (শুনছি)'
                    : isProcessing
                    ? 'এআই বিশ্লেষণ করছে...'
                    : 'মাইকে ক্লিক করে বাংলায় বলুন'}
                </p>
                <p className="text-[10px] text-slate-400 font-mono">
                  {isListening ? 'Language: bn-BD (Web Speech API)' : 'বা নিচের রেডিমেড প্রশ্নে ক্লিক করুন'}
                </p>
              </div>
            </div>
          </div>

          {/* Transcript & Input Box (Rendered in JetBrains Mono for accessibility) */}
          <div className="lg:col-span-8 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 font-display flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>আপনার প্রশ্ন (Transcript in JetBrains Mono):</span>
              </label>
              <span className="text-[10px] font-mono text-slate-400">
                Font: JetBrains Mono • High Accessibility
              </span>
            </div>

            <div className="relative">
              <input
                type="text"
                value={interimText ? `${transcript} ${interimText}` : transcript}
                onChange={(e) => setTranscript(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuerySubmit()}
                placeholder="বাংলায় লিখুন বা বলুন... যেমন: আমার বিল কেন এত বেশি?"
                className="w-full bg-slate-950 border border-slate-700/80 focus:border-amber-500 rounded-xl px-4 py-3 text-sm text-amber-300 placeholder-slate-500 font-mono focus:outline-hidden focus:ring-1 focus:ring-amber-500 transition-all pr-24"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              />

              <button
                onClick={() => handleQuerySubmit()}
                disabled={isProcessing || !transcript.trim()}
                className="absolute right-2 top-2 bottom-2 px-3.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 text-xs font-bold font-display rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                {isProcessing ? (
                  <span className="animate-spin text-sm">⏳</span>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>জিজ্ঞাসা</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Prompt Chips */}
            <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1 scrollbar-none">
              <span className="text-[11px] text-slate-400 font-display shrink-0 flex items-center gap-1">
                <HelpCircle className="w-3 h-3 text-amber-400" />
                <span>উদাহরণ:</span>
              </span>
              {quickPrompts.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setTranscript(q);
                    handleQuerySubmit(q);
                  }}
                  className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer whitespace-nowrap font-display ${
                    transcript === q
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
                >
                  "{q}"
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Advisory Result View in Bangla & TTS Audio Playback */}
      <AnimatePresence>
        {advisoryResult && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-5 shadow-xl space-y-4"
          >
            {/* Header: Audio Speak / Replay & Source Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  ✓
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white font-display">
                    {advisoryResult.headline}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-mono">
                    User Query: "{advisoryResult.query}"
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Voice Replay Button */}
                <button
                  onClick={() => speakBanglaResponse(advisoryResult.spokenSummary)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold font-display cursor-pointer transition-all shadow-xs ${
                    isSpeaking
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black animate-pulse'
                      : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                  }`}
                  title="বাংলায় অডিও শুনুন"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{isSpeaking ? 'পড়ছি...' : 'অডিও শুনুন (TTS)'}</span>
                </button>

                <span className="text-[10px] font-mono px-2 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  {advisoryResult.source === 'GEMINI_AI' ? 'Gemini 3.8 Flash' : 'Deterministic Engine'}
                </span>
              </div>
            </div>

            {/* Spoken Summary Card (The direct spoken answer) */}
            <div className="p-4 bg-emerald-950/30 border border-emerald-800/60 rounded-xl space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 font-display">
                <Volume2 className="w-4 h-4" />
                <span>মৌখিক উত্তর (Spoken Summary - bn-BD):</span>
              </div>
              <p className="text-sm text-slate-100 font-medium leading-relaxed">
                "{advisoryResult.spokenSummary}"
              </p>
            </div>

            {/* Detailed Explanation */}
            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
              <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-display flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>বিস্তারিত কারণ ও বিশ্লেষণ (Detailed Breakdown)</span>
              </h5>
              <p className="text-xs text-slate-300 leading-relaxed">
                {advisoryResult.detailedExplanation}
              </p>
            </div>

            {/* Root Causes Cards */}
            {advisoryResult.causes && advisoryResult.causes.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-display flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-rose-400" />
                  <span>বিল বৃদ্ধির প্রধান কারণসমূহ (Contributing Factors)</span>
                </h5>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {advisoryResult.causes.map((c, i) => (
                    <div
                      key={i}
                      className="bg-slate-950 border border-slate-800/90 rounded-xl p-3.5 space-y-1.5 flex flex-col justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white font-display">
                            {c.title}
                          </span>
                          <span
                            className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded uppercase ${
                              c.severity === 'high'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'bg-amber-950 text-amber-300 border border-amber-800'
                            }`}
                          >
                            {c.severity}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-snug">
                          {c.description}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">প্রভাব:</span>
                        <span className="font-mono font-bold text-amber-400">
                          +৳{c.impactBDT}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Immediate Actionable Steps & Savings */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2">
              <div className="md:col-span-8 bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                <h5 className="text-xs font-bold text-emerald-400 font-display flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>বিল কমাতে করণীয় পদক্ষেপসমূহ (Action Items)</span>
                </h5>
                <ul className="space-y-1.5">
                  {advisoryResult.actionableSteps.map((step, idx) => (
                    <li key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                      <span className="text-emerald-400 font-bold">•</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="md:col-span-4 bg-emerald-950/20 border border-emerald-800/40 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-400 font-display">
                    সম্ভাব্য মাসিক সাশ্রয়
                  </span>
                  <div className="text-2xl font-black text-white font-mono mt-1">
                    ৳{advisoryResult.estimatedMonthlySavingsBDT}
                    <span className="text-xs font-normal text-emerald-400 ml-1">টাকা/মাস</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    পরামর্শগুলো মেনে চললে আগামী মাসের ডেসকো বিল এই পরিমাণ কমবে।
                  </p>
                </div>

                <button
                  onClick={() => handleQuerySubmit('আমার বিল কেন এত বেশি?')}
                  className="mt-3 w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold font-display rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3 text-amber-400" />
                  <span>পুনরায় প্রশ্ন করুন</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

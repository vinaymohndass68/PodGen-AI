import React, { useState, useRef, useEffect } from 'react';
import { PodcastConfig, Speaker, VoiceName, GenerationState, PodcastMood, InteractionType } from './types';
import SpeakerConfig from './components/SpeakerConfig';
import AudioVisualizer from './components/AudioVisualizer';
import { generatePodcastScript, generatePodcastAudio } from './services/geminiService';
import { audioBufferToWav } from './utils/audioUtils';
import { Mic2, Play, Pause, Download, FileAudio, RefreshCw, Wand2, AlertCircle, Clock, RotateCcw, Sparkles, FileText, Smile, Users, MessageSquare } from 'lucide-react';
import { jsPDF } from "jspdf";

const INITIAL_SPEAKERS: Speaker[] = [
  { id: '1', name: 'Host', voice: VoiceName.Kore, language: 'English (US)', pitch: 1.0, bass: 0, tone: 0 },
  { id: '2', name: 'Guest', voice: VoiceName.Fenrir, language: 'English (US)', pitch: 1.0, bass: 0, tone: 0 }
];

const MOODS: PodcastMood[] = ['Normal', 'Happy', 'Sad', 'Funny', 'Serious', 'Relaxed', 'Suspenseful', 'Educational'];
const INTERACTIONS: { type: InteractionType, label: string }[] = [
  { type: 'Neutral', label: 'Neutral discussion' },
  { type: 'Agreement', label: 'Agreeing / Friendly' },
  { type: 'Debate', label: 'Disagreeing / Debate' }
];

const App: React.FC = () => {
  const [config, setConfig] = useState<PodcastConfig>({
    topic: '',
    durationMinutes: 2,
    mood: 'Normal',
    interaction: 'Neutral',
    speakers: INITIAL_SPEAKERS
  });

  const [state, setState] = useState<GenerationState>({
    isGeneratingScript: false,
    isGeneratingAudio: false,
    script: null,
    audioUrl: null,
    error: null,
    progress: ''
  });

  // Audio Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);

  // Initialize Audio Context
  useEffect(() => {
    // Only init if needed to unlock autoplay policies
    const initAudio = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
      }
    };
    window.addEventListener('click', initAudio, { once: true });
    return () => window.removeEventListener('click', initAudio);
  }, []);

  const handleGenerateScript = async () => {
    if (!config.topic) {
      setState(prev => ({ ...prev, error: "Please enter a topic." }));
      return;
    }
    
    stopAudio();

    setState({
      isGeneratingScript: true,
      isGeneratingAudio: false,
      script: null,
      audioUrl: null, // Reset audio when generating new script
      error: null,
      progress: 'Writing script...'
    });

    try {
      // Step 1: Generate Script Only
      const script = await generatePodcastScript(config);
      setState(prev => ({ 
        ...prev, 
        isGeneratingScript: false, 
        script, 
        progress: 'Script ready. Review and convert to audio.',
        error: null
      }));
      
      // Clear previous audio buffer if any
      audioBufferRef.current = null;

    } catch (err: any) {
      setState(prev => ({
        ...prev,
        isGeneratingScript: false,
        error: err.message || "An unknown error occurred.",
        progress: ''
      }));
    }
  };

  const handleGenerateAudio = async () => {
    if (!state.script) return;

    // Stop any playing audio
    stopAudio();

    setState(prev => ({
      ...prev,
      isGeneratingAudio: true,
      progress: 'Generating audio...',
      error: null
    }));

    try {
      // Step 2: Generate Audio from current script state
      // This now performs line-by-line processing to apply speaker effects
      const buffer = await generatePodcastAudio(state.script, config.speakers);
      
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
      }

      audioBufferRef.current = buffer;

      // Create downloadable WAV
      const wavBlob = audioBufferToWav(buffer);
      const url = URL.createObjectURL(wavBlob);

      setState(prev => ({
        ...prev,
        isGeneratingAudio: false,
        audioUrl: url,
        progress: 'Audio ready!',
        error: null
      }));

    } catch (err: any) {
      setState(prev => ({
        ...prev,
        isGeneratingAudio: false,
        error: err.message || "Audio generation failed.",
        progress: ''
      }));
    }
  };

  const handleDownloadPDF = () => {
    if (!state.script) return;
    
    const doc = new jsPDF();
    
    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("Podcast Transcript", 20, 20);
    
    // Metadata
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Topic: ${config.topic}`, 20, 30);
    doc.text(`Mood: ${config.mood}`, 20, 35);
    doc.text(`Style: ${config.interaction}`, 20, 40);
    doc.text(`Generated by PodGen AI on ${new Date().toLocaleDateString()}`, 20, 50);
    
    // Content
    doc.setTextColor(0);
    doc.setFontSize(12);
    doc.setFont("times", "roman"); // Scripts often look better in serif
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const maxWidth = pageWidth - (margin * 2);
    
    // Split text into lines that fit the page width
    const splitText = doc.splitTextToSize(state.script, maxWidth);
    
    let y = 60;
    const lineHeight = 7;
    const pageHeight = doc.internal.pageSize.getHeight();
    
    splitText.forEach((line: string) => {
        if (y > pageHeight - margin) {
            doc.addPage();
            y = margin;
        }
        doc.text(line, margin, y);
        y += lineHeight;
    });
    
    doc.save("podcast-transcript.pdf");
  };

  const handleStartOver = () => {
    if (config.topic || state.script) {
        if (!window.confirm("Are you sure you want to start over? All current progress will be lost.")) {
            return;
        }
    }
    
    stopAudio();
    
    setConfig({
        topic: '',
        durationMinutes: 2,
        mood: 'Normal',
        interaction: 'Neutral',
        speakers: [
          { id: '1', name: 'Host', voice: VoiceName.Kore, language: 'English (US)', pitch: 1.0, bass: 0, tone: 0 },
          { id: '2', name: 'Guest', voice: VoiceName.Fenrir, language: 'English (US)', pitch: 1.0, bass: 0, tone: 0 }
        ]
    });

    setState({
        isGeneratingScript: false,
        isGeneratingAudio: false,
        script: null,
        audioUrl: null,
        error: null,
        progress: ''
    });

    audioBufferRef.current = null;
  };

  const playAudio = async () => {
    if (!audioContextRef.current || !audioBufferRef.current || !analyserRef.current) return;
    
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.connect(analyserRef.current);
    analyserRef.current.connect(audioContextRef.current.destination);
    
    // Handle pause/resume offset
    const offset = pauseTimeRef.current % audioBufferRef.current.duration;
    source.start(0, offset);
    startTimeRef.current = audioContextRef.current.currentTime - offset;

    sourceNodeRef.current = source;
    setIsPlaying(true);

    source.onended = () => {
      // Only reset if it ended naturally (not stopped by user)
      setIsPlaying(false);
      pauseTimeRef.current = 0;
    };
  };

  const pauseAudio = () => {
    if (sourceNodeRef.current && audioContextRef.current) {
      sourceNodeRef.current.stop();
      pauseTimeRef.current = audioContextRef.current.currentTime - startTimeRef.current;
      sourceNodeRef.current = null;
      setIsPlaying(false);
    }
  };

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) { /* ignore */ }
    }
    sourceNodeRef.current = null;
    pauseTimeRef.current = 0;
    setIsPlaying(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center p-4 md:p-8">
      
      {/* Header */}
      <header className="w-full max-w-6xl mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
            <Mic2 className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              PodGen AI
            </h1>
            <p className="text-xs text-slate-500">Powered by Gemini 2.5</p>
          </div>
        </div>
        
        <button 
            onClick={handleStartOver}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-sm font-medium border border-slate-700"
        >
            <RotateCcw size={16} />
            Start Over
        </button>
      </header>

      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Configuration */}
        <section className="lg:col-span-4 space-y-6">
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Wand2 size={18} className="text-indigo-400" /> Podcast Setup
            </h2>
            
            <div className="space-y-6">
              {/* Topic */}
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Topic & Style</label>
                <textarea
                  value={config.topic}
                  onChange={(e) => setConfig({ ...config, topic: e.target.value })}
                  placeholder="E.g., The future of space travel, explained for 5-year-olds..."
                  className="w-full h-24 bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
                />
              </div>

              {/* Mood */}
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                    <Smile size={14} /> Mood & Tone
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {MOODS.map((m) => (
                        <button
                            key={m}
                            onClick={() => setConfig({ ...config, mood: m })}
                            className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-all truncate
                                ${config.mood === m 
                                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' 
                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                                }`}
                        >
                            {m}
                        </button>
                    ))}
                </div>
              </div>

              {/* Interaction Type (New) */}
              {config.speakers.length > 1 && (
                <div className="animate-in fade-in duration-500">
                  <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                      <MessageSquare size={14} /> Interaction Style
                  </label>
                  <div className="flex flex-col gap-2">
                      {INTERACTIONS.map((i) => (
                          <button
                              key={i.type}
                              onClick={() => setConfig({ ...config, interaction: i.type })}
                              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all flex items-center justify-between
                                  ${config.interaction === i.type 
                                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-lg shadow-indigo-500/10' 
                                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                                  }`}
                          >
                              {i.label}
                              {config.interaction === i.type && <Users size={12} />}
                          </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Duration */}
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                    <Clock size={14} /> Duration
                  </label>
                  <span className="text-xs text-indigo-400 font-bold">{config.durationMinutes} min</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={config.durationMinutes}
                  onChange={(e) => setConfig({ ...config, durationMinutes: parseInt(e.target.value) })}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              {/* Speakers */}
              <SpeakerConfig 
                speakers={config.speakers} 
                setSpeakers={(s) => setConfig({ ...config, speakers: typeof s === 'function' ? s(config.speakers) : s })} 
              />
            </div>

            {/* Action Button: Generate Script */}
            <div className="mt-8">
              <button
                onClick={handleGenerateScript}
                disabled={state.isGeneratingScript || state.isGeneratingAudio || !config.topic}
                className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-semibold transition-all shadow-lg
                  ${state.isGeneratingScript || state.isGeneratingAudio 
                    ? 'bg-slate-800 text-slate-400 cursor-wait' 
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white hover:shadow-indigo-500/25 active:scale-[0.98]'
                  }
                `}
              >
                {state.isGeneratingScript ? (
                  <>
                    <RefreshCw className="animate-spin" size={18} />
                    Writing Script...
                  </>
                ) : (
                  <>
                    <Wand2 size={18} /> {state.script ? 'Regenerate Script' : 'Generate Script'}
                  </>
                )}
              </button>
              {state.error && (
                <div className="mt-3 p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-start gap-2 text-xs text-red-200">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  {state.error}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right Column: Results */}
        <section className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Audio Player Card (Only visible if audio is generated) */}
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-xl min-h-[200px] flex flex-col justify-center relative overflow-hidden transition-all duration-500">
            {!state.audioUrl ? (
              <div className="text-center text-slate-500">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileAudio size={32} className="opacity-50" />
                </div>
                <p>
                  {state.script 
                    ? "Script ready. Click 'Convert to Audio' above to generate the podcast." 
                    : "Generate a script to start creating your podcast."}
                </p>
                {state.isGeneratingAudio && (
                   <div className="mt-4 flex items-center justify-center gap-2 text-indigo-400">
                     <RefreshCw className="animate-spin" size={16} />
                     <span className="text-sm">Converting script to audio...</span>
                   </div>
                )}
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
                 <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">Podcast Audio</h3>
                    <div className="flex gap-2">
                       <a 
                        href={state.audioUrl} 
                        download={`podcast-${Date.now()}.wav`}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors"
                       >
                         <Download size={16} /> Download .WAV
                       </a>
                    </div>
                 </div>

                 {/* Visualizer */}
                 <div className="bg-slate-950 rounded-xl p-4 border border-slate-800">
                   <AudioVisualizer 
                      isPlaying={isPlaying} 
                      audioBuffer={audioBufferRef.current} 
                      analyser={analyserRef.current} 
                   />
                 </div>

                 {/* Controls */}
                 <div className="flex justify-center">
                    <button
                      onClick={isPlaying ? pauseAudio : playAudio}
                      className="w-16 h-16 rounded-full bg-indigo-500 hover:bg-indigo-400 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30 transition-all hover:scale-105 active:scale-95"
                    >
                      {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
                    </button>
                 </div>
              </div>
            )}
          </div>

          {/* Script Preview & Edit */}
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-xl flex-1 min-h-[400px]">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">Script Transcript</h3>
                <div className="flex gap-2">
                    {state.script && (
                        <button
                          onClick={handleDownloadPDF}
                          className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-sm font-medium transition-colors border border-slate-700"
                          title="Download Script as PDF"
                        >
                          <FileText size={16} /> <span className="hidden sm:inline">PDF</span>
                        </button>
                    )}
                    {state.script && (
                      <button
                        onClick={handleGenerateAudio}
                        disabled={state.isGeneratingAudio}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                      >
                        {state.isGeneratingAudio ? (
                          <>
                            <RefreshCw className="animate-spin" size={16} /> Processing...
                          </>
                        ) : (
                          <>
                            <Sparkles size={16} /> Convert to Audio
                          </>
                        )}
                      </button>
                    )}
                </div>
            </div>
            
            <textarea
                value={state.script || ''}
                onChange={(e) => setState(prev => ({ ...prev, script: e.target.value }))}
                disabled={!state.script || state.isGeneratingAudio}
                placeholder="Script content will be generated here..."
                className="w-full h-[400px] bg-slate-950 rounded-xl p-4 border border-slate-800 text-sm text-slate-300 font-mono leading-relaxed whitespace-pre-wrap shadow-inner resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

        </section>
      </main>
    </div>
  );
};

export default App;
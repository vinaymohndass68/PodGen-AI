import React, { useState, useEffect } from 'react';
import { Speaker, VoiceName, SpeakerPreset } from '../types';
import { Trash2, Plus, Play, Loader2, Save, BookOpen, X, SlidersHorizontal, Music2, Activity, Settings2, Check, RotateCcw } from 'lucide-react';
import { generatePreviewAudio } from '../services/geminiService';
import { base64ToUint8Array, decodeAudioData, applyAudioEffects } from '../utils/audioUtils';

interface SpeakerConfigProps {
  speakers: Speaker[];
  setSpeakers: React.Dispatch<React.SetStateAction<Speaker[]>>;
}

const LANGUAGES = [
  "English (US)", "English (UK)", "Spanish", "French", "German", 
  "Japanese", "Korean", "Chinese", "Hindi", "Bengali", "Tamil", 
  "Maithili", "Sanskrit", "Portuguese", "Italian"
];

const SpeakerConfig: React.FC<SpeakerConfigProps> = ({ speakers, setSpeakers }) => {
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [presets, setPresets] = useState<SpeakerPreset[]>([]);
  const [managingPresetsId, setManagingPresetsId] = useState<string | null>(null);
  
  // Inline Save State
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");

  // Load presets on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('podgen_voice_presets');
      if (saved) {
        setPresets(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load presets", e);
    }
  }, []);

  const savePresetsToStorage = (newPresets: SpeakerPreset[]) => {
    setPresets(newPresets);
    localStorage.setItem('podgen_voice_presets', JSON.stringify(newPresets));
  };

  const addSpeaker = () => {
    if (speakers.length >= 2) return; 
    
    const newId = Date.now().toString();
    const newSpeaker: Speaker = {
      id: newId,
      name: `Speaker ${speakers.length + 1}`,
      voice: VoiceName.Puck,
      language: 'English (US)',
      pitch: 1.0,
      bass: 0,
      tone: 0
    };
    setSpeakers([...speakers, newSpeaker]);
  };

  const removeSpeaker = (id: string) => {
    if (speakers.length <= 1) return;
    setSpeakers(speakers.filter(s => s.id !== id));
  };

  const updateSpeaker = (id: string, field: keyof Speaker, value: string | number) => {
    setSpeakers(speakers.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const startSave = (speaker: Speaker) => {
    setSaveName(`${speaker.name}`);
    setSavingId(speaker.id);
    setManagingPresetsId(null); // Close manage view if open
  };

  const cancelSave = () => {
    setSavingId(null);
    setSaveName("");
  };

  const confirmSave = (speaker: Speaker) => {
    if (!saveName.trim()) return;
    
    const newPreset: SpeakerPreset = {
        presetName: saveName.trim(),
        speakerName: speaker.name,
        voice: speaker.voice,
        language: speaker.language,
        pitch: speaker.pitch,
        bass: speaker.bass ?? 0,
        tone: speaker.tone ?? 0
    };

    const existingIndex = presets.findIndex(p => p.presetName === newPreset.presetName);
    let updatedPresets = [...presets];

    if (existingIndex >= 0) {
        if (!window.confirm(`Profile "${newPreset.presetName}" already exists. Overwrite?`)) return;
        updatedPresets[existingIndex] = newPreset;
    } else {
        updatedPresets.push(newPreset);
    }
    
    savePresetsToStorage(updatedPresets);
    setSavingId(null);
  };

  const handleLoadPreset = (speakerId: string, presetName: string) => {
    if (!presetName) return;
    const preset = presets.find(p => p.presetName === presetName);
    if (!preset) return;

    setSpeakers(speakers.map(s => {
        if (s.id !== speakerId) return s;
        return {
            ...s,
            name: preset.speakerName,
            voice: preset.voice,
            language: preset.language,
            pitch: preset.pitch,
            bass: preset.bass ?? 0,
            tone: preset.tone ?? 0
        };
    }));
  };

  const handleDeletePreset = (presetName: string) => {
    if (window.confirm(`Delete preset "${presetName}"?`)) {
      const updated = presets.filter(p => p.presetName !== presetName);
      savePresetsToStorage(updated);
    }
  };

  const handlePreview = async (speaker: Speaker) => {
    if (previewingId) return;
    setPreviewingId(speaker.id);

    try {
      const text = `Hello, I am ${speaker.name}. Checking my voice levels.`;
      const base64 = await generatePreviewAudio(speaker, text);
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const rawBuffer = await decodeAudioData(base64ToUint8Array(base64), audioCtx);
      
      const processedBuffer = await applyAudioEffects(
          rawBuffer, 
          speaker.pitch, 
          speaker.bass ?? 0, 
          speaker.tone ?? 0
      );
      
      const source = audioCtx.createBufferSource();
      source.buffer = processedBuffer;
      source.connect(audioCtx.destination);
      source.start();
      
      source.onended = () => {
        setPreviewingId(null);
        audioCtx.close();
      };
    } catch (error) {
      console.error(error);
      setPreviewingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm font-medium text-slate-300">Speakers ({speakers.length}/2)</label>
        <button
          onClick={addSpeaker}
          disabled={speakers.length >= 2}
          className="flex items-center gap-1 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-2 py-1 rounded transition-colors"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      <div className="space-y-3">
        {speakers.map((speaker, index) => (
          <div key={speaker.id} className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 animate-in fade-in slide-in-from-left-4 duration-300 relative group">
             
             {/* Header / Preset Bar */}
             <div className="mb-3 pb-3 border-b border-slate-700/50 min-h-[32px] flex items-center">
               
               {/* Mode: Saving Preset */}
               {savingId === speaker.id ? (
                 <div className="flex items-center gap-2 w-full animate-in fade-in slide-in-from-top-1 duration-200">
                    <input 
                        autoFocus
                        type="text"
                        value={saveName}
                        onChange={(e) => setSaveName(e.target.value)}
                        placeholder="Profile Name"
                        className="flex-1 bg-slate-900 border border-indigo-500/50 rounded px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button 
                        onClick={() => confirmSave(speaker)}
                        className="p-1 text-emerald-400 hover:bg-emerald-400/10 rounded"
                        title="Confirm Save"
                    >
                        <Check size={14} />
                    </button>
                    <button 
                        onClick={cancelSave}
                        className="p-1 text-slate-400 hover:text-slate-300 hover:bg-slate-700 rounded"
                        title="Cancel"
                    >
                        <X size={14} />
                    </button>
                 </div>
               ) : managingPresetsId === speaker.id ? (
                 /* Mode: Manage Presets */
                 <div className="w-full space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                   <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-400">Manage Profiles</span>
                      <button 
                        onClick={() => setManagingPresetsId(null)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                      >
                        Done
                      </button>
                   </div>
                   {presets.length === 0 ? (
                     <p className="text-xs text-slate-500 italic">No saved profiles.</p>
                   ) : (
                     <div className="flex flex-wrap gap-2">
                       {presets.map(p => (
                         <div key={p.presetName} className="flex items-center gap-2 bg-slate-900 px-2 py-1 rounded border border-slate-700">
                            <span className="text-xs text-slate-300">{p.presetName}</span>
                            <button 
                              onClick={() => handleDeletePreset(p.presetName)}
                              className="text-slate-500 hover:text-red-400"
                            >
                              <X size={12} />
                            </button>
                         </div>
                       ))}
                     </div>
                   )}
                 </div>
               ) : (
                 /* Mode: Default */
                 <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2 flex-1 max-w-[65%]">
                        <BookOpen size={14} className="text-slate-500 shrink-0" />
                        <select
                            className="bg-transparent text-xs text-slate-300 focus:outline-none w-full cursor-pointer hover:text-indigo-400 transition-colors truncate pr-4"
                            onChange={(e) => handleLoadPreset(speaker.id, e.target.value)}
                            value=""
                        >
                            <option value="" disabled>Load Profile...</option>
                            {presets.map(p => (
                                <option key={p.presetName} value={p.presetName}>{p.presetName}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <button
                            onClick={() => setManagingPresetsId(speaker.id)}
                            className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-700 rounded transition-colors"
                            title="Manage Profiles"
                        >
                            <Settings2 size={14} />
                        </button>
                        <button
                            onClick={() => startSave(speaker)}
                            className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-700 rounded transition-colors"
                            title="Save as Profile"
                        >
                            <Save size={14} />
                        </button>
                    </div>
                 </div>
               )}
             </div>

             <div className="grid gap-4">
               {/* Name Input */}
               <div>
                  <label className="text-xs text-slate-500 block mb-1">Speaker Name</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={speaker.name}
                      onChange={(e) => updateSpeaker(speaker.id, 'name', e.target.value)}
                      placeholder="e.g. Host, Interviewer"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                    />
                    {speakers.length > 1 && (
                      <button 
                        onClick={() => removeSpeaker(speaker.id)}
                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                        title="Remove Speaker"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
               </div>

               {/* Voice & Language */}
               <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Voice</label>
                  <select
                    value={speaker.voice}
                    onChange={(e) => updateSpeaker(speaker.id, 'voice', e.target.value as VoiceName)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 focus:ring-1 focus:ring-indigo-500 outline-none"
                  >
                    {Object.values(VoiceName).map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Language</label>
                  <select
                    value={speaker.language}
                    onChange={(e) => updateSpeaker(speaker.id, 'language', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 focus:ring-1 focus:ring-indigo-500 outline-none"
                  >
                    {LANGUAGES.map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Adjustments: Pitch, Bass, Tone */}
              <div className="space-y-3 pt-2 border-t border-slate-700/50">
                {/* Pitch */}
                <div>
                    <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
                        <Activity size={10} /> Speed & Pitch
                    </label>
                    <span className="text-[10px] text-indigo-400 font-mono">{speaker.pitch.toFixed(1)}x</span>
                    </div>
                    <input
                        type="range"
                        min="0.5"
                        max="1.5"
                        step="0.1"
                        value={speaker.pitch}
                        onChange={(e) => updateSpeaker(speaker.id, 'pitch', parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                </div>

                {/* Tone (Treble) */}
                <div>
                    <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
                        <Music2 size={10} /> Tone (Treble)
                    </label>
                    <span className="text-[10px] text-indigo-400 font-mono">{(speaker.tone ?? 0) > 0 ? '+' : ''}{speaker.tone ?? 0}dB</span>
                    </div>
                    <input
                        type="range"
                        min="-10"
                        max="10"
                        step="1"
                        value={speaker.tone ?? 0}
                        onChange={(e) => updateSpeaker(speaker.id, 'tone', parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-sky-500"
                    />
                </div>

                {/* Bass */}
                <div>
                    <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
                        <SlidersHorizontal size={10} /> Base (Bass)
                    </label>
                    <span className="text-[10px] text-indigo-400 font-mono">{(speaker.bass ?? 0) > 0 ? '+' : ''}{speaker.bass ?? 0}dB</span>
                    </div>
                    <input
                        type="range"
                        min="-10"
                        max="10"
                        step="1"
                        value={speaker.bass ?? 0}
                        onChange={(e) => updateSpeaker(speaker.id, 'bass', parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                </div>
              </div>

              {/* Preview Button */}
              <div className="flex justify-end pt-2">
                  <button
                    onClick={() => handlePreview(speaker)}
                    disabled={previewingId !== null}
                    className="flex items-center gap-2 text-xs bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 px-3 py-1.5 rounded transition-all"
                  >
                     {previewingId === speaker.id ? (
                       <Loader2 size={12} className="animate-spin" />
                     ) : (
                       <Play size={12} fill="currentColor" />
                     )}
                     Preview Voice
                  </button>
              </div>

             </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SpeakerConfig;
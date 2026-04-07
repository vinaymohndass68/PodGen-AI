export enum VoiceName {
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr',
  Aoede = 'Aoede'
}

export interface Speaker {
  id: string;
  name: string;
  voice: VoiceName;
  language: string;
  pitch: number;
  bass: number;
  tone: number;
}

export interface SpeakerPreset {
  presetName: string;
  speakerName: string;
  voice: VoiceName;
  language: string;
  pitch: number;
  bass: number;
  tone: number;
}

export type PodcastMood = 'Normal' | 'Happy' | 'Sad' | 'Funny' | 'Serious' | 'Relaxed' | 'Suspenseful' | 'Educational';
export type InteractionType = 'Neutral' | 'Agreement' | 'Debate';

export interface PodcastConfig {
  topic: string;
  durationMinutes: number; // Approximate
  mood: PodcastMood;
  interaction: InteractionType;
  speakers: Speaker[];
}

export interface GenerationState {
  isGeneratingScript: boolean;
  isGeneratingAudio: boolean;
  script: string | null;
  audioUrl: string | null;
  error: string | null;
  progress: string;
}
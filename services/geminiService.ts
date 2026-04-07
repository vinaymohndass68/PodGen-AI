import { GoogleGenAI, Modality } from "@google/genai";
import { Speaker, PodcastConfig } from "../types";
import { base64ToUint8Array, decodeAudioData, applyAudioEffects, concatenateAudioBuffers } from "../utils/audioUtils";

// Initialize the client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const generatePodcastScript = async (config: PodcastConfig): Promise<string> => {
  const { topic, durationMinutes, speakers, mood, interaction } = config;
  
  const speakerDescriptions = speakers.map(s => 
    `- ${s.name} (Voice: ${s.voice}, Language: ${s.language})`
  ).join('\n');

  let interactionInstruction = "";
  if (interaction === 'Agreement') {
    interactionInstruction = "The speakers should largely agree with each other, build on each other's points, and maintain a supportive, collaborative tone throughout the conversation.";
  } else if (interaction === 'Debate') {
    interactionInstruction = "The speakers should have opposing viewpoints or perceptions on the topic. They should respectfully disagree, challenge each other's assumptions, and provide contrasting perspectives. It should feel like a healthy debate or a discussion between people with different opinions.";
  } else {
    interactionInstruction = "The speakers should have a balanced discussion, exploring different sides of the topic in a neutral manner.";
  }

  // Adjust prompt based on speaker count
  let formattingInstruction = "";
  if (speakers.length === 1) {
    formattingInstruction = `
    - The output must be the direct monologue text.
    - Do NOT use speaker names or prefixes.
    - Do NOT include any stage directions, sound effects, or text in brackets/parentheses.
    `;
  } else {
    formattingInstruction = `
    - The output must be ONLY the dialogue.
    - Use the exact speaker names provided above as prefixes.
    - Format: "SpeakerName: [Text]"
    - Do NOT include scene descriptions, sound effects in brackets [], parentheses (), or asterisks *.
    - Do NOT include metadata like "End of script".
    `;
  }

  const prompt = `
    You are an expert podcast script writer.
    Create a compelling, natural-sounding podcast script.
    
    Topic: ${topic}
    Mood/Tone: ${mood}. Ensure the dialogue reflects this mood.
    Interaction Style: ${interactionInstruction}
    Target Duration: Approx. ${durationMinutes} minutes (about ${durationMinutes * 150} words).
    
    Speakers:
    ${speakerDescriptions}
    
    Strict Format Requirements:
    ${formattingInstruction}
    - Ensure each speaker speaks in their assigned language.
    
    Script:
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    
    const text = response.text;
    if (!text) throw new Error("No script generated.");
    return text;
  } catch (error) {
    console.error("Script generation error:", error);
    throw error;
  }
};

export const generatePreviewAudio = async (speaker: Speaker, text: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: speaker.voice }
          }
        }
      }
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio data received.");
    return base64Audio;
  } catch (error) {
    console.error("Preview generation error:", error);
    throw error;
  }
};

// Helper to generate audio for a single segment with retry logic
const generateSegmentAudio = async (text: string, voiceName: string, retryCount = 0): Promise<Uint8Array | null> => {
     if (!text || !text.trim()) return null;
     const MAX_RETRIES = 5;
     const BASE_DELAY = 2000; // Start with 2 seconds

     try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-preview-tts',
          contents: [{ parts: [{ text }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceName }
              }
            }
          }
        });
        const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64) {
             console.warn(`Gemini TTS returned no audio for text: "${text.substring(0, 30)}..."`);
             return null;
        }
        return base64ToUint8Array(base64);
     } catch (e: any) {
         // Check for Rate Limit (429) errors
         const isRateLimit = e.status === 429 || e.message?.includes('429') || e.message?.includes('RESOURCE_EXHAUSTED');
         
         if (isRateLimit && retryCount < MAX_RETRIES) {
             const waitTime = BASE_DELAY * Math.pow(2, retryCount); // 2s, 4s, 8s, 16s, 32s
             console.warn(`Rate limit hit (429). Retrying segment in ${waitTime}ms... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
             await delay(waitTime);
             return generateSegmentAudio(text, voiceName, retryCount + 1);
         }

         console.error(`Error generating segment audio for text: "${text.substring(0, 30)}..."`, e);
         // Don't throw here, return null so we can skip this segment gracefully
         return null; 
     }
}

export const generatePodcastAudio = async (script: string, speakers: Speaker[]): Promise<AudioBuffer> => {
  if (speakers.length === 0) throw new Error("No speakers defined.");
  
  // Use OfflineAudioContext for processing
  const tempCtx = new OfflineAudioContext(1, 1, 24000); 

  // Single Speaker (Monologue)
  if (speakers.length === 1) {
    try {
        // Remove stage directions
        const cleanText = script.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').replace(/\*.*?\*/g, '').trim();
        const rawBytes = await generateSegmentAudio(cleanText, speakers[0].voice);
        
        if (!rawBytes) throw new Error("Failed to generate audio for monologue.");

        const buffer = await decodeAudioData(rawBytes, tempCtx);
        const processed = await applyAudioEffects(
            buffer, 
            speakers[0].pitch, 
            speakers[0].bass, 
            speakers[0].tone
        );
        return processed;
    } catch (error) {
        console.error("Audio generation error (Single Speaker):", error);
        throw error;
    }
  }

  // Multi Speaker - Parse and Stitch
  try {
      // 1. Parse Script
      const lines = script.split('\n').filter(l => l.trim().length > 0);
      const segments: { speaker: Speaker, text: string }[] = [];
      
      let currentSpeaker = speakers[0];
      
      for (const line of lines) {
          const match = line.match(/^([^:]+):\s*(.*)$/);
          if (match) {
              const name = match[1].trim();
              const content = match[2].trim();
              
              const found = speakers.find(s => s.name === name);
              if (found) {
                  currentSpeaker = found;
                  segments.push({ speaker: found, text: content });
              } else {
                   segments.push({ speaker: currentSpeaker, text: content }); 
              }
          } else {
              if (segments.length > 0) {
                  segments[segments.length - 1].text += " " + line;
              } else {
                  segments.push({ speaker: speakers[0], text: line });
              }
          }
      }

      // 2. Generate Audio for each segment
      const chunkBuffers: AudioBuffer[] = [];

      for (const segment of segments) {
          // Remove stage directions [...] (...) *...*
          const cleanText = segment.text
            .replace(/\[.*?\]/g, '')
            .replace(/\(.*?\)/g, '')
            .replace(/\*.*?\*/g, '')
            .trim();
          
          if (!cleanText) continue;
          
          try {
            // Add a small delay between requests to be polite and avoid sudden bursts
            if (segments.length > 1) {
                await delay(800); 
            }

            const rawBytes = await generateSegmentAudio(cleanText, segment.speaker.voice);
            
            if (!rawBytes) {
                // Skip silence or failed segments
                continue;
            }

            const buffer = await decodeAudioData(rawBytes, tempCtx);
            
            // 3. Apply Effects per segment
            const processed = await applyAudioEffects(
                buffer, 
                segment.speaker.pitch, 
                segment.speaker.bass, 
                segment.speaker.tone
            );
            chunkBuffers.push(processed);
          } catch (segError) {
              console.warn("Skipping bad segment:", cleanText, segError);
              continue;
          }
      }

      if (chunkBuffers.length === 0) {
          throw new Error("No audio could be generated from the script.");
      }

      // 4. Concatenate
      return concatenateAudioBuffers(chunkBuffers, tempCtx);

  } catch (error) {
    console.error("Audio generation error (Multi Speaker):", error);
    throw error;
  }
};
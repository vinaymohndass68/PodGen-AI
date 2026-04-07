// Convert base64 string to Uint8Array
export const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// Decode raw PCM data into an AudioBuffer
export const decodeAudioData = async (
  data: Uint8Array,
  ctx: AudioContext | OfflineAudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> => {
  // 16-bit PCM is standard from Gemini
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Convert Int16 to Float32 [-1.0, 1.0]
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
};

// Apply Audio Effects (Pitch/Speed, Bass, Tone)
export const applyAudioEffects = async (
    buffer: AudioBuffer,
    pitch: number, // Acts as playback rate
    bass: number, // dB
    tone: number // dB (Treble)
): Promise<AudioBuffer> => {
    // Calculate new duration based on pitch/speed
    // Note: pitch > 1 makes it shorter (faster), pitch < 1 makes it longer (slower)
    const newLength = Math.ceil(buffer.length / pitch);
    
    // We use OfflineAudioContext to render the effects
    const offlineCtx = new OfflineAudioContext(
        buffer.numberOfChannels,
        newLength,
        buffer.sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitch;

    // Bass Filter (LowShelf)
    const bassFilter = offlineCtx.createBiquadFilter();
    bassFilter.type = 'lowshelf';
    bassFilter.frequency.value = 200; // Standard bass cutoff
    bassFilter.gain.value = bass; 

    // Treble/Tone Filter (HighShelf)
    const trebleFilter = offlineCtx.createBiquadFilter();
    trebleFilter.type = 'highshelf';
    trebleFilter.frequency.value = 2000; // Standard treble cutoff
    trebleFilter.gain.value = tone;

    // Connect: Source -> Bass -> Treble -> Destination
    source.connect(bassFilter);
    bassFilter.connect(trebleFilter);
    trebleFilter.connect(offlineCtx.destination);

    source.start(0);

    return await offlineCtx.startRendering();
};

// Concatenate multiple AudioBuffers
export const concatenateAudioBuffers = (
    buffers: AudioBuffer[],
    ctx: AudioContext | OfflineAudioContext
): AudioBuffer => {
    if (buffers.length === 0) return ctx.createBuffer(1, 0, 24000);

    const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
    const numberOfChannels = buffers[0].numberOfChannels; // Assume same channels
    const sampleRate = buffers[0].sampleRate;

    const result = ctx.createBuffer(numberOfChannels, totalLength, sampleRate);

    let offset = 0;
    for (const buffer of buffers) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const channelData = buffer.getChannelData(channel);
            result.copyToChannel(channelData, channel, offset);
        }
        offset += buffer.length;
    }

    return result;
};


// Helper to write string to DataView
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Export AudioBuffer to WAV Blob
export const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  let result: Float32Array;
  
  // Interleave channels if necessary
  if (numChannels === 2) {
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);
      result = new Float32Array(left.length + right.length);
      for (let i = 0; i < left.length; i++) {
          result[i * 2] = left[i];
          result[i * 2 + 1] = right[i];
      }
  } else {
      result = buffer.getChannelData(0);
  }

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  const bufferLength = 44 + result.length * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // RIFF chunk length
  view.setUint32(4, 36 + result.length * bytesPerSample, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, format, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * blockAlign, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, blockAlign, true);
  // bits per sample
  view.setUint16(34, bitDepth, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, result.length * bytesPerSample, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < result.length; i++) {
    // Clamp sample to [-1, 1]
    const s = Math.max(-1, Math.min(1, result[i]));
    // Scale to 16-bit integer range
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    view.setInt16(offset, val, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
};
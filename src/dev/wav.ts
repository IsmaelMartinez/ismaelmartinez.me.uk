/**
 * Mono 16-bit PCM WAV encoding for the development jukebox (`jukebox.astro`).
 *
 * Kept DOM-free so it can be unit-tested in node: the jukebox hands it the
 * channel data of the `AudioBuffer` that `renderScore` resolves to. The output
 * is the canonical 44-byte RIFF header followed by the samples, so two renders
 * of the same score compare byte for byte with `cmp`.
 */

/** Length of the canonical RIFF/WAVE header for PCM data, in bytes. */
export const WAV_HEADER_BYTES = 44;

/**
 * Encodes `samples` (floats in -1..1; anything outside is clipped) as a mono
 * 16-bit little-endian PCM WAV file at `sampleRate`.
 */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2;
  const dataBytes = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size for PCM
  view.setUint16(20, 1, true); // audio format: PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    // Asymmetric scale so -1 reaches -32768 and +1 reaches 32767 exactly.
    view.setInt16(WAV_HEADER_BYTES + i * bytesPerSample, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

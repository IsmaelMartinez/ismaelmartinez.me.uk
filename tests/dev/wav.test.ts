import { describe, it, expect } from 'vitest';
import { encodeWav, WAV_HEADER_BYTES } from '../../src/dev/wav';

describe('encodeWav', () => {
  const text = (view: DataView, offset: number, length: number) =>
    String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(offset + i)));

  it('writes a 44-byte mono 16-bit PCM RIFF header', () => {
    const view = new DataView(encodeWav(new Float32Array(10), 44100));
    expect(view.byteLength).toBe(WAV_HEADER_BYTES + 20);
    expect(text(view, 0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + 20);
    expect(text(view, 8, 8)).toBe('WAVEfmt ');
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(28, true)).toBe(88200);
    expect(view.getUint16(34, true)).toBe(16);
    expect(text(view, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(20);
  });

  it('maps the full scale to the int16 extremes and clips beyond it', () => {
    const view = new DataView(encodeWav(new Float32Array([1, -1, 0, 2, -2, 0.5]), 8000));
    const sample = (i: number) => view.getInt16(WAV_HEADER_BYTES + i * 2, true);
    expect([0, 1, 2, 3, 4].map(sample)).toEqual([32767, -32768, 0, 32767, -32768]);
    expect(sample(5)).toBe(16383);
  });
});

import { describe, it, expect } from 'vitest';
import { getReadingTime } from '../../src/utils/reading-time';

describe('getReadingTime', () => {
  it('returns 1 for empty string', () => {
    expect(getReadingTime('')).toBe(1);
  });

  it('returns 1 for short text under 200 words', () => {
    expect(getReadingTime('Hello world')).toBe(1);
  });

  it('returns 1 for exactly 200 words', () => {
    const text = Array(200).fill('word').join(' ');
    expect(getReadingTime(text)).toBe(1);
  });

  it('returns 2 for 201-400 words', () => {
    const text = Array(250).fill('word').join(' ');
    expect(getReadingTime(text)).toBe(2);
  });

  it('strips HTML tags before counting', () => {
    const text = '<p>' + Array(250).fill('word').join(' ') + '</p>';
    expect(getReadingTime(text)).toBe(2);
  });

  it('collapses whitespace before counting', () => {
    const text = Array(250).fill('word').join('   \n  ');
    expect(getReadingTime(text)).toBe(2);
  });
});

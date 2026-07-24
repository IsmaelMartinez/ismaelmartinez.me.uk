import { describe, it, expect } from 'vitest';
import {
  unlockedCount,
  levelSelectItems,
  legacyClearedFromScore
} from '../../src/games/lemmings/progress';

describe('Critter Rescue level unlocking', () => {
  describe('unlockedCount', () => {
    it('always unlocks at least level 1, even from a cold start', () => {
      expect(unlockedCount(0, 9)).toBe(1);
      expect(unlockedCount(-3, 9)).toBe(1);
    });

    it('unlocks 1..N+1 where N is the highest level cleared (clearing one opens the next)', () => {
      expect(unlockedCount(1, 9)).toBe(2);
      expect(unlockedCount(4, 9)).toBe(5);
      expect(unlockedCount(8, 9)).toBe(9);
    });

    it('never unlocks more levels than exist', () => {
      expect(unlockedCount(9, 9)).toBe(9);
      expect(unlockedCount(50, 9)).toBe(9);
    });

    it('floors fractional and falls back to level 1 for non-finite progress values', () => {
      expect(unlockedCount(3.9, 9)).toBe(4);
      expect(unlockedCount(NaN, 9)).toBe(1);
      expect(unlockedCount(Infinity, 9)).toBe(1);
    });

    it('unlocks nothing when there are no levels', () => {
      expect(unlockedCount(5, 0)).toBe(0);
      expect(unlockedCount(5, -1)).toBe(0);
    });
  });

  describe('levelSelectItems', () => {
    it('emits one entry per level with 1-based display numbers', () => {
      const items = levelSelectItems(9, 0);
      expect(items).toHaveLength(9);
      expect(items[0]).toEqual({ index: 0, number: 1, unlocked: true });
      expect(items[8]).toEqual({ index: 8, number: 9, unlocked: false });
    });

    it('unlocks the cleared levels plus the next reachable one', () => {
      // Cleared through level 4 -> levels 1..5 selectable.
      const items = levelSelectItems(9, 4);
      const unlocked = items.filter(i => i.unlocked).map(i => i.number);
      expect(unlocked).toEqual([1, 2, 3, 4, 5]);
    });

    it('unlocks every level once the game is completed', () => {
      const items = levelSelectItems(9, 9);
      expect(items.every(i => i.unlocked)).toBe(true);
    });
  });

  describe('legacyClearedFromScore', () => {
    it('reads a small integer table score as pre-rework level progress', () => {
      expect(legacyClearedFromScore(1, 13)).toBe(1);
      expect(legacyClearedFromScore(9, 13)).toBe(9);
      expect(legacyClearedFromScore(13, 13)).toBe(13);
    });

    it('rejects point scores and out-of-range values', () => {
      // Post-rework scores are at least RESCUE_POINTS (100) per critter.
      expect(legacyClearedFromScore(100, 13)).toBe(0);
      expect(legacyClearedFromScore(2450, 13)).toBe(0);
      expect(legacyClearedFromScore(14, 13)).toBe(0);
      expect(legacyClearedFromScore(0, 13)).toBe(0);
      expect(legacyClearedFromScore(-2, 13)).toBe(0);
      expect(legacyClearedFromScore(3.5, 13)).toBe(0);
      expect(legacyClearedFromScore(NaN, 13)).toBe(0);
    });
  });
});

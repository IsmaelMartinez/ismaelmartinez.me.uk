import { describe, it, expect } from 'vitest';
import {
  unlockedCount,
  isLevelUnlocked,
  levelSelectItems
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

  describe('isLevelUnlocked', () => {
    it('treats indices below the unlocked count as available', () => {
      // Cleared level 4 -> indices 0..4 (levels 1..5) unlocked.
      expect(isLevelUnlocked(0, 4, 9)).toBe(true);
      expect(isLevelUnlocked(4, 4, 9)).toBe(true);
      expect(isLevelUnlocked(5, 4, 9)).toBe(false);
    });

    it('rejects out-of-range and non-integer indices', () => {
      expect(isLevelUnlocked(-1, 9, 9)).toBe(false);
      expect(isLevelUnlocked(2.5, 9, 9)).toBe(false);
    });

    it('keeps level 1 (index 0) reachable from a cold start', () => {
      expect(isLevelUnlocked(0, 0, 9)).toBe(true);
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
});

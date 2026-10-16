/**
 * What lands on the floor: the prizes the show hands out and the gear that
 * keeps a contestant alive. Prizes are cash straight to the score, gear
 * changes the contestant for a while, and a key counts toward the bonus room.
 * Each has its figure here; what picking one up does is `run.ts`'s.
 */
import type { WeaponId } from './weapons';

export type ItemId =
  | 'cash'
  | 'toaster'
  | 'vcr'
  | 'car'
  | 'key'
  | 'spread'
  | 'grenade'
  | 'rocket'
  | 'shield'
  | 'boots'
  | 'bomb'
  | 'life';

export interface ItemDef {
  /** Cash paid on pickup. */
  worth: number;
  /** The gun it hands over, if it is one. */
  weapon?: WeaponId;
  /** How many seconds it lies on the floor before the stage hands take it back. */
  ttl: number;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  cash: { worth: 1000, ttl: 9 },
  toaster: { worth: 2500, ttl: 9 },
  vcr: { worth: 5000, ttl: 9 },
  car: { worth: 25000, ttl: 10 },
  key: { worth: 500, ttl: 11 },
  spread: { worth: 0, weapon: 'spread', ttl: 12 },
  grenade: { worth: 0, weapon: 'grenade', ttl: 12 },
  rocket: { worth: 0, weapon: 'rocket', ttl: 12 },
  shield: { worth: 0, ttl: 11 },
  boots: { worth: 0, ttl: 11 },
  bomb: { worth: 0, ttl: 9 },
  life: { worth: 0, ttl: 14 }
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** Seconds a shield lasts, and speed boots. */
export const SHIELD_SECONDS = 8;
export const BOOTS_SECONDS = 15;
export const BOOTS_FACTOR = 1.35;
/** Cash a key is worth at the end of its studio, on top of what it paid on the floor. */
export const KEY_BONUS = 1000;
/** Keys that open the bonus prize room after the last boss. */
export const DOME_KEYS = 5;

export interface Item {
  id: number;
  item: ItemId;
  x: number;
  y: number;
  /** Seconds left on the floor. */
  ttl: number;
  r: number;
}

/** The collision radius every item shares: generous, because a pickup should feel like a reward. */
export const ITEM_R = 14;

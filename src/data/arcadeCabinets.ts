import type { TranslationKey } from '../i18n/translations';
import type { UNLOCK_CHAIN } from '../games/engine/progress';

export type ChainGameId = (typeof UNLOCK_CHAIN)[number];

export interface CabinetMeta {
  /** Marquee title; a proper name, identical across locales. */
  title: string;
  taglineKey: TranslationKey;
  genreKey: TranslationKey;
  twoPlayer: boolean;
  icon: string;
  color: string;
  path: string;
  /** Year of the classic the cabinet homages, for its "EST. 1974" plaque. */
  estYear: number;
}

/**
 * Cabinet artwork for the /fun floor, keyed by unlock-chain id. This module is
 * imported both server-side (to render the always-on first cabinet) and by the
 * floor's client script, which clones that cabinet and patches these fields in
 * for each unlocked game — so no still-hidden cabinet ever appears in the
 * page's static HTML (see the floor page for the reveal rules).
 */
export const CABINETS: Record<ChainGameId, CabinetMeta> = {
  tanks: {
    title: 'TANK DUEL',
    taglineKey: 'fun.tanks.description',
    genreKey: 'fun.arcade.genre.tanks',
    twoPlayer: true,
    icon: '🎯',
    color: '#3b82f6',
    path: '/fun/tanks',
    estYear: 1974
  },
  snake: {
    title: 'SNAKE',
    taglineKey: 'fun.snake.description',
    genreKey: 'fun.arcade.genre.snake',
    twoPlayer: false,
    icon: '🐍',
    color: '#14b8a6',
    path: '/fun/snake',
    estYear: 1976
  },
  cascade: {
    title: 'CASCADE',
    taglineKey: 'fun.cascade.description',
    genreKey: 'fun.arcade.genre.cascade',
    twoPlayer: false,
    icon: '🧱',
    color: '#a855f7',
    path: '/fun/cascade',
    estYear: 1985
  },
  city: {
    title: 'MICROCITY',
    taglineKey: 'fun.city.description',
    genreKey: 'fun.arcade.genre.city',
    twoPlayer: false,
    icon: '🏙️',
    color: '#38bdf8',
    path: '/fun/city',
    estYear: 1989
  },
  lemmings: {
    title: 'CRITTER RESCUE',
    taglineKey: 'fun.lemmings.description',
    genreKey: 'fun.arcade.genre.lemmings',
    twoPlayer: false,
    icon: '🐛',
    color: '#84cc16',
    path: '/fun/lemmings',
    estYear: 1991
  },
  towerdefense: {
    title: 'LINE HOLD',
    taglineKey: 'fun.towerdefense.description',
    genreKey: 'fun.arcade.genre.towerdefense',
    twoPlayer: false,
    icon: '🏰',
    color: '#f59e0b',
    path: '/fun/towerdefense',
    estYear: 2007
  }
};

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
  /** Shows the localized "New" ribbon on the cabinet. */
  isNew?: boolean;
}

/**
 * Cabinet artwork for the /fun floor, keyed by unlock-chain id. Server-side
 * only: the floor page renders the always-on first cabinet from it and
 * serializes the rest into a base64 JSON island for its client script — this
 * module must NOT be imported by client code, or every hidden cabinet's name,
 * icon, and colour would ship in plaintext in the floor's JS bundle (see the
 * floor page for the reveal rules and the precise no-spoiler invariant).
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
    estYear: 1985,
    isNew: true
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

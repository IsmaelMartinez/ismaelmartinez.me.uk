/**
 * The arcade's release gate: how much of the unlock chain the public site
 * carries. The site relaunches with the arcade under construction and opens
 * the cabinets in waves (see docs/plans/2026-10-10-release-phases.md), so
 * `RELEASED` is the one number a wave changes.
 *
 * A wave is a prefix of `UNLOCK_CHAIN`, because `visibleCabinets` measures
 * progress along the chain and the chain is deliberately chronological. An
 * unreleased cabinet is unpublished the way a draft article is: its page
 * emits no route (so no sitemap entry and nothing links it; Astro still
 * writes its script chunk as an orphan under `_astro/`, accepted since the
 * cabinets were public before the relaunch), the floor and the home terminal
 * never list it, and the home teaser, footer link and Konami overlay go with
 * the floor when nothing is released. Dev and Vercel
 * previews show the whole chain, exactly as they show draft articles, so a
 * wave can be played at its real URL before it ships.
 *
 * Server-side only: this reads the build's env. Client code gets the
 * released chain through the islands the pages compose (the floor's
 * base64 data, the terminal's `games`), never by importing this module.
 */

import { UNLOCK_CHAIN } from '../games/engine/progress';
import { locales } from '../i18n/translations';
import { showsDrafts, type DraftEnv } from '../utils/drafts';

export type ChainGameId = (typeof UNLOCK_CHAIN)[number];

/** Cabinets open to the public, counted from the front of `UNLOCK_CHAIN`. */
export const RELEASED = 0;

/** The chain prefix the public site carries; the whole chain in dev and previews. */
export function releasedChain(env: DraftEnv = import.meta.env, count = RELEASED): readonly ChainGameId[] {
  return UNLOCK_CHAIN.slice(0, showsDrafts(env) ? UNLOCK_CHAIN.length : count);
}

export function isReleased(id: string, env: DraftEnv = import.meta.env): boolean {
  return (releasedChain(env) as readonly string[]).includes(id);
}

/** False while nothing is released: the floor and every link to it stay unbuilt. */
export function arcadeOpen(env: DraftEnv = import.meta.env): boolean {
  return releasedChain(env).length > 0;
}

/**
 * `getStaticPaths` for an arcade page: every locale when the cabinet (or,
 * with no id, the floor) is released, and no paths at all otherwise, which is
 * how Astro leaves a page out of the build.
 */
export function arcadePaths(id?: ChainGameId, env: DraftEnv = import.meta.env) {
  const built = id ? isReleased(id, env) : arcadeOpen(env);
  return built ? locales.map(lang => ({ params: { lang } })) : [];
}

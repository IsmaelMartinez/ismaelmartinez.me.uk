/**
 * Whether an article is shown. Drafts stay out of production builds but
 * render in `astro dev` and on Vercel preview deployments, so a draft can be
 * proofread at its real URL before it is published. The RSS feed does not use
 * this on purpose: a reader would cache a draft a preview build leaked, so
 * `rss.xml.ts` tests `!data.draft` alone.
 *
 * Kept apart from `articles.ts`, which imports `astro:content`, so the
 * predicate can be unit-tested; `env` is a parameter for the same reason and
 * defaults to the build's own.
 */
export interface DraftEnv {
  DEV?: boolean;
  VERCEL_ENV?: string;
}

/** Dev and Vercel previews show everything; the arcade's release gate reuses this rule. */
export function showsDrafts(env: DraftEnv = import.meta.env): boolean {
  return Boolean(env.DEV) || env.VERCEL_ENV === 'preview';
}

export function isPublished(data: { draft: boolean }, env: DraftEnv = import.meta.env): boolean {
  return showsDrafts(env) || !data.draft;
}

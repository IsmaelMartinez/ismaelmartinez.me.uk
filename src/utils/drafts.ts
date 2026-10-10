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

/**
 * The build's own env, read as explicit member accesses. Astro injects a
 * private key such as VERCEL_ENV into a bare `import.meta.env` only in files
 * whose source names that key, so a caller in another module that passes no
 * env must reach the default here rather than hand over its own
 * `import.meta.env` (src/data/release.ts did, and previews lost the arcade).
 */
const buildEnv = (): DraftEnv => ({ DEV: import.meta.env.DEV, VERCEL_ENV: import.meta.env.VERCEL_ENV });

/** Dev and Vercel previews show everything; the arcade's release gate reuses this rule. */
export function showsDrafts(env: DraftEnv = buildEnv()): boolean {
  return Boolean(env.DEV) || env.VERCEL_ENV === 'preview';
}

export function isPublished(data: { draft: boolean }, env: DraftEnv = buildEnv()): boolean {
  return showsDrafts(env) || !data.draft;
}

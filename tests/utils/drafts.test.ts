import { describe, it, expect } from 'vitest';
import { isPublished } from '../../src/utils/drafts';

// The one visibility gate for the home, writing, tags and article routes.
// The RSS feed deliberately does not use it (see the note in the module).
describe('isPublished', () => {
  const draft = { draft: true };
  const live = { draft: false };
  const production = { DEV: false, VERCEL_ENV: 'production' };

  it('hides a draft from a production build', () => {
    expect(isPublished(draft, production)).toBe(false);
    expect(isPublished(draft, { DEV: false })).toBe(false);
  });

  it('shows a draft in astro dev', () => {
    expect(isPublished(draft, { DEV: true })).toBe(true);
  });

  it('shows a draft on a Vercel preview deployment', () => {
    expect(isPublished(draft, { DEV: false, VERCEL_ENV: 'preview' })).toBe(true);
  });

  it('shows a published article everywhere', () => {
    expect(isPublished(live, production)).toBe(true);
    expect(isPublished(live, { DEV: true })).toBe(true);
    expect(isPublished(live, { DEV: false, VERCEL_ENV: 'preview' })).toBe(true);
  });
});

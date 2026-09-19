import { getCollection, type CollectionEntry } from 'astro:content';
import type { Locale } from '../i18n/translations';

export type Article = CollectionEntry<'articles'>;

/**
 * Whether an article is shown. Drafts stay out of production builds but
 * render in `astro dev` and on Vercel preview deployments, so a draft can be
 * proofread at its real URL before it is published. The RSS feed does not
 * use this on purpose: a reader would cache a draft a preview build leaked,
 * so `rss.xml.ts` tests `!data.draft` alone.
 */
export function isPublished(data: Article['data']): boolean {
  return import.meta.env.DEV || import.meta.env.VERCEL_ENV === 'preview' || !data.draft;
}

/** Articles live at `<locale>/<slug>` in the collection. */
export function inLocale(article: Article, lang: Locale): boolean {
  return article.id.startsWith(`${lang}/`);
}

export function byNewest(a: Article, b: Article): number {
  return b.data.publishedDate.valueOf() - a.data.publishedDate.valueOf();
}

/** The published articles of one locale, newest first. */
export async function getPublishedArticles(lang: Locale): Promise<Article[]> {
  const articles = await getCollection('articles', a => inLocale(a, lang) && isPublished(a.data));
  return articles.sort(byNewest);
}

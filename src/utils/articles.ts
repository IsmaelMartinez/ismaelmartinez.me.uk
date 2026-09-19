import { getCollection, type CollectionEntry } from 'astro:content';
import type { Locale } from '../i18n/translations';
import { isPublished } from './drafts';

export type Article = CollectionEntry<'articles'>;

// The visibility rule lives in ./drafts so it can be unit-tested without
// astro:content; the pages import it from here with the rest.
export { isPublished };

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

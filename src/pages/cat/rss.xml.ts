import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const articles = await getCollection('articles', ({ slug, data }) => {
    return slug.startsWith('cat/') && !data.draft;
  });

  const sortedArticles = articles.sort(
    (a, b) => b.data.publishedDate.valueOf() - a.data.publishedDate.valueOf()
  );

  return rss({
    title: 'Ismael Martinez',
    description: "Enginyer de Software i Entusiasta de l'Open Source — articles sobre desenvolupament de software, arquitectura i tecnologia.",
    site: context.site!,
    items: sortedArticles.map((article) => ({
      title: article.data.title,
      pubDate: article.data.publishedDate,
      description: article.data.description,
      link: `/cat/articles/${article.slug.replace('cat/', '')}/`,
      categories: article.data.tags,
    })),
    customData: '<language>ca</language>',
  });
}

import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const articles = await getCollection('articles', ({ slug, data }) => {
    return slug.startsWith('en/') && !data.draft;
  });

  const sortedArticles = articles.sort(
    (a, b) => b.data.publishedDate.valueOf() - a.data.publishedDate.valueOf()
  );

  return rss({
    title: 'Ismael Martinez',
    description: 'Software Engineer & Open Source Enthusiast — articles on software development, architecture, and technology.',
    site: context.site!,
    items: sortedArticles.map((article) => ({
      title: article.data.title,
      pubDate: article.data.publishedDate,
      description: article.data.description,
      link: `/en/articles/${article.slug.replace('en/', '')}/`,
      categories: article.data.tags,
    })),
    customData: '<language>en</language>',
  });
}

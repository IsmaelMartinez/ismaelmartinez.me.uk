# Contributing

Thank you for your interest in contributing!

## Running the Project Locally

This site is built with [Astro](https://astro.build/). To run it locally:

1. **Install dependencies**
   ```sh
   npm install
   ```

2. **Start the development server**
   ```sh
   npm run dev
   ```

3. **View the site**
   Open [http://localhost:4321/](http://localhost:4321/) in your browser.

## Available Commands

| Command           | Action                                      |
|-------------------|---------------------------------------------|
| `npm run dev`     | Start development server                    |
| `npm run build`   | Build for production (output in `./dist`)   |
| `npm run preview` | Preview production build locally            |

## Adding Articles

Articles use Astro Content Collections with MDX format. To add a new article:

1. Create an `.mdx` file in the appropriate locale folder:
   ```
   src/content/articles/en/my-new-article.mdx
   src/content/articles/es/my-new-article.mdx
   src/content/articles/cat/my-new-article.mdx
   ```

2. Include the required frontmatter:
   ```yaml
   ---
   title: "My New Article"
   description: "A brief description"
   publishedDate: 2026-01-01
   tags: ["tag1", "tag2"]
   draft: false
   originalUrl: "https://..."
   originalPlatform: "self"
   ---
   ```

3. The slug must match across all three locale folders for translation linking to work.

## Project Structure

```
src/
├── pages/          # File-based routing with locale prefixes (/en/, /es/, /cat/)
├── layouts/        # Layout.astro (base) and ArticleLayout.astro
├── components/     # Shared components (Hero, ProjectCard, etc.)
├── content/        # Content collections (articles in MDX)
├── data/           # Static data (projects, links, fun quiz)
├── i18n/           # Translation system
└── styles/         # Global CSS design tokens
```

## Multi-language Support

The site supports English, Spanish, and Catalan. When adding or editing content, keep all three locales in sync. See `src/i18n/translations.ts` for UI string translations.

---
Thank you for helping improve this site!

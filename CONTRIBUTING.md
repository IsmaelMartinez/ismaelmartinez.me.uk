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

| Command               | Action                                                    |
|-----------------------|-----------------------------------------------------------|
| `npm run dev`         | Start development server                                  |
| `npm run build`       | Build for production (output in `./dist`)                 |
| `npm run preview`     | Preview production build locally                          |
| `npm run lint`        | Run ESLint across the repo                                |
| `npm run typecheck`   | Run Astro + TypeScript checks                             |
| `npm test`            | Run Vitest suite (build tests require `./dist` to exist)  |
| `npm run check-links` | Verify internal links in `./dist` (run after `build`)     |

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
├── pages/
│   ├── [lang]/         # Dynamic locale routes (emit /en/, /es/, /cat/ via getStaticPaths)
│   ├── 404.astro       # Shared 404 page
│   └── index.astro     # Redirects to the default locale
├── layouts/            # Layout.astro (base) and ArticleLayout.astro
├── components/         # Shared components (Hero, ProjectCard, Health*, etc.)
├── content/articles/   # MDX articles per locale (en/, es/, cat/)
├── content.config.ts   # Astro content collection schema
├── data/               # Static data (projects, links, uses, health, fun quiz)
├── i18n/               # Translation system
├── utils/              # Small helpers (reading-time, …)
└── styles/             # Global CSS design tokens

tests/                  # Vitest unit and build-output tests
scripts/                # Build-time scripts (e.g. check-links.js)
docs/                   # ADRs and design/implementation plans
```

## Multi-language Support

The site supports English, Spanish, and Catalan. When adding or editing content, keep all three locales in sync. See `src/i18n/translations.ts` for UI string translations.

---
Thank you for helping improve this site!

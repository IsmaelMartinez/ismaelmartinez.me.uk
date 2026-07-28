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

### The global arcade leaderboard in local dev

The world high-score board is served by a Vercel Function (`api/scores.ts`)
that is not part of the Astro dev server. A local `npm run dev` reads the
real world board from production and never writes to it: only production
hostnames may submit (see `SUBMIT_HOSTS` in `src/games/engine/globalScores.ts`),
so local experiments cannot pollute the shared board. The function's
`BLOB_READ_WRITE_TOKEN` secret is provisioned on Vercel and is never needed
for normal site work; to exercise the function itself, use `vercel dev` after
`vercel env pull`.

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
├── data/               # Static data (projects, links, uses, health, fun)
├── games/              # Arcade cabinets: DOM-free game logic + shared engine/
├── i18n/               # Translation system
├── utils/              # Small helpers (reading-time, …)
└── styles/             # Global CSS design tokens

api/                    # Vercel Function: global arcade scores (deployed by Vercel, not Astro)
tests/                  # Vitest unit and build-output tests
scripts/                # Build-time scripts (e.g. check-links.js)
docs/                   # ADRs and design/implementation plans
```

## Multi-language Support

The site supports English, Spanish, and Catalan. When adding or editing content, keep all three locales in sync. See `src/i18n/translations.ts` for UI string translations.

---
Thank you for helping improve this site!

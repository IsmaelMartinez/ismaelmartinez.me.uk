# Phase 4 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden the site's security posture, eliminate page duplication across locales, add a test foundation, and modernise the CI pipeline.

**Architecture:** Replace 39 per-locale page files with 13 dynamic `[lang]` routes using `getStaticPaths()`. Add CSP and security meta tags to the shared Layout. Introduce vitest 4 for unit and build-output tests. Upgrade CI from Node 20 to Node 24 LTS, improve the link checker, and add Lighthouse CI.

**Tech Stack:** Astro 5, Node 24 LTS, Vitest 4, @lhci/cli, GitHub Actions

---

### Task 1: Node.js Version Pinning

**Files:**
- Create: `.nvmrc`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/gh-pages.yml`

**Step 1: Create `.nvmrc`**

```
24
```

**Step 2: Update CI workflow Node version**

In `.github/workflows/ci.yml`, change `node-version: '20'` to `node-version: '24'`.

In `.github/workflows/gh-pages.yml`, change `node-version: '20'` to `node-version: '24'`.

**Step 3: Verify build still works locally**

Run: `npm run build`
Expected: Clean build with zero errors.

**Step 4: Commit**

```bash
git add .nvmrc .github/workflows/ci.yml .github/workflows/gh-pages.yml
git commit -m "chore: pin Node.js to 24 LTS"
```

---

### Task 2: Security Hardening — Meta Tags and CSP

**Files:**
- Modify: `src/layouts/Layout.astro` (lines 27-72 in `<head>`)

**Step 1: Add security meta tags after the viewport meta tag (line 29)**

Add these lines after `<meta name="viewport" ...>`:

```html
<!-- Security -->
<meta http-equiv="X-Content-Type-Options" content="nosniff" />
<meta name="referrer" content="strict-origin-when-cross-origin" />
<meta http-equiv="Permissions-Policy" content="camera=(), microphone=(), geolocation=()" />
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://cloud.umami.is; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://cloud.umami.is; frame-ancestors 'none'" />
```

**Step 2: Add SRI to the Umami analytics script**

Fetch the SRI hash for the Umami script:

```bash
curl -s https://cloud.umami.is/script.js | openssl dgst -sha384 -binary | openssl base64 -A
```

Then update the Umami script tag in `src/layouts/Layout.astro` to add `integrity="sha384-HASH_HERE" crossorigin="anonymous"` attributes, replacing `HASH_HERE` with the actual hash from the curl command.

Note: SRI pins a specific script version. When Umami updates the script, the hash will break. If this becomes a maintenance burden, it's acceptable to remove SRI and rely on CSP alone. Document the trade-off in a code comment.

**Step 3: Ensure consistent `rel="noopener noreferrer"` on all target="_blank" links**

Search the codebase for `target="_blank"` and ensure every one has `rel="noopener noreferrer"`. The footer Astro link (Layout.astro:122) currently has only `rel="noopener"` — add `noreferrer`.

**Step 4: Verify build and spot-check**

Run: `npm run build`
Expected: Clean build. Open `dist/en/index.html` and verify the CSP meta tag is present in the `<head>`.

**Step 5: Commit**

```bash
git add src/layouts/Layout.astro
git commit -m "feat: add CSP, SRI, and security meta tags"
```

---

### Task 3: Security Hardening — DOM API Cleanup in Quiz

**Files:**
- Modify: `src/pages/en/fun/quiz.astro` (and es/cat copies — these get deduplicated in Task 8 anyway but fix whichever exists at time of implementation)

**Step 1: Replace unsafe DOM string injection with safe DOM APIs**

In the `showQuestion()` function's script block (lines 64-75 in the `<script define:vars>` block), the current code uses string interpolation to build HTML. Replace it with safe DOM API calls using `createElement`, `textContent`, and `appendChild`.

Clear the container first:
```javascript
while (questionContainer.firstChild) {
  questionContainer.removeChild(questionContainer.firstChild);
}
```

Then build the question UI with createElement:
```javascript
const questionDiv = document.createElement('div');
questionDiv.className = 'question';

const h2 = document.createElement('h2');
h2.className = 'question-text';
h2.textContent = q.question;
questionDiv.appendChild(h2);

const answersDiv = document.createElement('div');
answersDiv.className = 'answers';

q.answers.forEach((a, i) => {
  const btn = document.createElement('button');
  btn.className = 'answer-btn';
  btn.dataset.type = a.type;
  btn.dataset.index = String(i);
  btn.textContent = a.text;
  answersDiv.appendChild(btn);
});

questionDiv.appendChild(answersDiv);
questionContainer.appendChild(questionDiv);
```

Also replace the traits rendering (line 109) with the same safe pattern:
```javascript
while (traitsEl.firstChild) {
  traitsEl.removeChild(traitsEl.firstChild);
}
result.traits.forEach(trait => {
  const li = document.createElement('li');
  li.textContent = trait;
  traitsEl.appendChild(li);
});
```

**Step 2: Apply same changes to `es/fun/quiz.astro` and `cat/fun/quiz.astro`**

Copy the same script changes to the other two locale files.

**Step 3: Verify build**

Run: `npm run build`
Expected: Clean build.

**Step 4: Commit**

```bash
git add src/pages/en/fun/quiz.astro src/pages/es/fun/quiz.astro src/pages/cat/fun/quiz.astro
git commit -m "fix: replace unsafe DOM string injection with safe DOM APIs in quiz"
```

---

### Task 4: Test Foundation — Setup Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Step 1: Install vitest**

```bash
npm install --save-dev vitest
```

**Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

**Step 3: Add test script to `package.json`**

Add to the `"scripts"` object:

```json
"test": "vitest run"
```

**Step 4: Verify vitest runs (no tests yet)**

Run: `npm test`
Expected: "No test files found" or similar — confirms vitest is wired up.

**Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest 4 test framework"
```

---

### Task 5: Test Foundation — Unit Tests

**Files:**
- Create: `tests/utils/reading-time.test.ts`
- Create: `tests/i18n/translations.test.ts`

**Step 1: Write reading-time tests**

Create `tests/utils/reading-time.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getReadingTime } from '../../src/utils/reading-time';

describe('getReadingTime', () => {
  it('returns 1 for empty string', () => {
    expect(getReadingTime('')).toBe(1);
  });

  it('returns 1 for short text under 200 words', () => {
    expect(getReadingTime('Hello world')).toBe(1);
  });

  it('returns 1 for exactly 200 words', () => {
    const text = Array(200).fill('word').join(' ');
    expect(getReadingTime(text)).toBe(1);
  });

  it('returns 2 for 201-400 words', () => {
    const text = Array(250).fill('word').join(' ');
    expect(getReadingTime(text)).toBe(2);
  });

  it('strips HTML tags before counting', () => {
    const text = '<p>' + Array(250).fill('word').join(' ') + '</p>';
    expect(getReadingTime(text)).toBe(2);
  });

  it('collapses whitespace before counting', () => {
    const text = Array(250).fill('word').join('   \n  ');
    expect(getReadingTime(text)).toBe(2);
  });
});
```

**Step 2: Run reading-time tests**

Run: `npm test`
Expected: All 6 tests pass.

**Step 3: Write translations tests**

Create `tests/i18n/translations.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { useTranslations, getLangFromUrl, getLocalizedPath, translations } from '../../src/i18n/translations';

describe('useTranslations', () => {
  it('returns English translation for known key', () => {
    const t = useTranslations('en');
    expect(t('nav.home')).toBe('Home');
  });

  it('returns Spanish translation for known key', () => {
    const t = useTranslations('es');
    expect(t('nav.home')).toBe('Inicio');
  });

  it('returns Catalan translation for known key', () => {
    const t = useTranslations('cat');
    expect(t('nav.home')).toBe('Inici');
  });

  it('all locales have the same keys', () => {
    const enKeys = Object.keys(translations.en).sort();
    const esKeys = Object.keys(translations.es).sort();
    const catKeys = Object.keys(translations.cat).sort();
    expect(esKeys).toEqual(enKeys);
    expect(catKeys).toEqual(enKeys);
  });
});

describe('getLangFromUrl', () => {
  it('extracts "en" from /en/about', () => {
    expect(getLangFromUrl(new URL('https://example.com/en/about'))).toBe('en');
  });

  it('extracts "es" from /es/', () => {
    expect(getLangFromUrl(new URL('https://example.com/es/'))).toBe('es');
  });

  it('extracts "cat" from /cat/projects', () => {
    expect(getLangFromUrl(new URL('https://example.com/cat/projects'))).toBe('cat');
  });

  it('falls back to "en" for unknown locale', () => {
    expect(getLangFromUrl(new URL('https://example.com/fr/about'))).toBe('en');
  });
});

describe('getLocalizedPath', () => {
  it('prefixes path with locale', () => {
    expect(getLocalizedPath('/about', 'en')).toBe('/en/about');
    expect(getLocalizedPath('/about', 'es')).toBe('/es/about');
    expect(getLocalizedPath('/', 'cat')).toBe('/cat/');
  });
});
```

**Step 4: Run all tests**

Run: `npm test`
Expected: All tests pass (6 reading-time + 8 translations = 14 total).

**Step 5: Commit**

```bash
git add tests/
git commit -m "test: add unit tests for reading-time and translations"
```

---

### Task 6: Page Deduplication — Simple Pages

Consolidate the simpler pages (no async data): `connect`, `projects`, `about`, `uses`.

**Files:**
- Create: `src/pages/[lang]/connect.astro`
- Create: `src/pages/[lang]/projects.astro`
- Create: `src/pages/[lang]/about.astro`
- Create: `src/pages/[lang]/uses.astro`
- Delete: `src/pages/en/connect.astro`, `src/pages/es/connect.astro`, `src/pages/cat/connect.astro`
- Delete: `src/pages/en/projects.astro`, `src/pages/es/projects.astro`, `src/pages/cat/projects.astro`
- Delete: `src/pages/en/about.astro`, `src/pages/es/about.astro`, `src/pages/cat/about.astro`
- Delete: `src/pages/en/uses.astro`, `src/pages/es/uses.astro`, `src/pages/cat/uses.astro`

**Step 1: Create a locale validation helper**

The `[lang]` param will match anything, so every dynamic route needs to validate it. Add a shared helper to `src/i18n/translations.ts`:

```typescript
export const locales = ['en', 'es', 'cat'] as const;
export type Locale = typeof locales[number];

export function isValidLocale(lang: string): lang is Locale {
  return locales.includes(lang as Locale);
}
```

**Step 2: Create `src/pages/[lang]/connect.astro`**

The pattern for each deduped page is: export `getStaticPaths` returning one entry per locale, extract `lang` from `Astro.params`, and adjust import paths. Here's the full connect page:

```astro
---
import Layout from '../../layouts/Layout.astro';
import LinkCard from '../../components/LinkCard.astro';
import { useTranslations, locales } from '../../i18n/translations';
import type { Locale } from '../../i18n/translations';
import { socialLinks } from '../../data/links';

export function getStaticPaths() {
  return locales.map(lang => ({ params: { lang } }));
}

const lang = Astro.params.lang as Locale;
const t = useTranslations(lang);
---
```

The template and `<style>` block are identical to the existing `en/connect.astro`.

**Step 3: Repeat for `projects.astro`, `about.astro`, `uses.astro`**

Same pattern: add `getStaticPaths` + `locales` import, change `const lang = 'en'` to `const lang = Astro.params.lang as Locale`. Import paths stay the same (they were already `../../`). Copy the template and styles verbatim from the `en/` version.

For `about.astro`, note that it also has a JSON-LD script — that uses `t()` calls which already work with the dynamic `lang`.

**Step 4: Delete the 12 old per-locale files**

```bash
rm src/pages/en/connect.astro src/pages/es/connect.astro src/pages/cat/connect.astro
rm src/pages/en/projects.astro src/pages/es/projects.astro src/pages/cat/projects.astro
rm src/pages/en/about.astro src/pages/es/about.astro src/pages/cat/about.astro
rm src/pages/en/uses.astro src/pages/es/uses.astro src/pages/cat/uses.astro
```

**Step 5: Verify build**

Run: `npm run build`
Expected: Clean build. The output `dist/` should still contain `en/connect/index.html`, `es/connect/index.html`, `cat/connect/index.html`, etc. — same output URLs as before.

**Step 6: Commit**

```bash
git add src/pages/ src/i18n/translations.ts
git commit -m "refactor: deduplicate connect, projects, about, uses pages via [lang] routes"
```

---

### Task 7: Page Deduplication — Index and Writing Pages

These pages have async data (content collections) so need `getStaticPaths` with async data fetching.

**Files:**
- Create: `src/pages/[lang]/index.astro`
- Create: `src/pages/[lang]/writing.astro`
- Delete: `src/pages/{en,es,cat}/index.astro`, `src/pages/{en,es,cat}/writing.astro`

**Step 1: Create `src/pages/[lang]/index.astro`**

```astro
---
import Layout from '../../layouts/Layout.astro';
import Hero from '../../components/Hero.astro';
import ProjectCard from '../../components/ProjectCard.astro';
import { useTranslations, locales } from '../../i18n/translations';
import type { Locale } from '../../i18n/translations';
import { getFeaturedProjects } from '../../data/projects';

export function getStaticPaths() {
  return locales.map(lang => ({ params: { lang } }));
}

const lang = Astro.params.lang as Locale;
const t = useTranslations(lang);
const featuredProjects = getFeaturedProjects().slice(0, 3);
---
```

Template and styles from `en/index.astro`. The JSON-LD `<script>` block is already static (no locale-specific content beyond the URL).

**Step 2: Create `src/pages/[lang]/writing.astro`**

This page fetches articles filtered by locale. Change the hardcoded `'en/'` slug filter to use the dynamic `lang`:

```astro
---
import Layout from '../../layouts/Layout.astro';
import ArticleCard from '../../components/ArticleCard.astro';
import { useTranslations, locales } from '../../i18n/translations';
import type { Locale } from '../../i18n/translations';
import { getCollection } from 'astro:content';

export function getStaticPaths() {
  return locales.map(lang => ({ params: { lang } }));
}

const lang = Astro.params.lang as Locale;
const t = useTranslations(lang);

const articles = await getCollection('articles', ({ slug, data }) => {
  return slug.startsWith(`${lang}/`) && (import.meta.env.DEV || !data.draft);
});

const sortedArticles = articles.sort((a, b) =>
  b.data.publishedDate.valueOf() - a.data.publishedDate.valueOf()
);
---
```

In the template, replace `article.slug.replace('en/', '')` with `` article.slug.replace(`${lang}/`, '') ``.

**Step 3: Delete old files and verify**

```bash
rm src/pages/en/index.astro src/pages/es/index.astro src/pages/cat/index.astro
rm src/pages/en/writing.astro src/pages/es/writing.astro src/pages/cat/writing.astro
```

Run: `npm run build`
Expected: Clean build with same output structure.

**Step 4: Commit**

```bash
git add src/pages/
git commit -m "refactor: deduplicate index and writing pages via [lang] routes"
```

---

### Task 8: Page Deduplication — Fun Pages

**Files:**
- Create: `src/pages/[lang]/fun/index.astro`
- Create: `src/pages/[lang]/fun/quiz.astro`
- Create: `src/pages/[lang]/fun/snake.astro`
- Delete: `src/pages/{en,es,cat}/fun/index.astro`, `src/pages/{en,es,cat}/fun/quiz.astro`, `src/pages/{en,es,cat}/fun/snake.astro`

**Step 1: Create dynamic fun pages**

Same pattern as Task 6. For `fun/index.astro`, import paths go up one more level (`../../../layouts/Layout.astro` stays correct since the new file is at `[lang]/fun/index.astro`). Add `getStaticPaths`, change `lang` to use `Astro.params.lang`.

For `fun/quiz.astro`, the `define:vars` block and the DOM-API-based script (from Task 3) transfer directly — `questions` and `results` already depend on `lang`.

For `fun/snake.astro`, the script is pure client-side and doesn't reference `lang` except in the Astro template for translations — straightforward.

**Step 2: Delete old files and verify**

```bash
rm src/pages/en/fun/index.astro src/pages/es/fun/index.astro src/pages/cat/fun/index.astro
rm src/pages/en/fun/quiz.astro src/pages/es/fun/quiz.astro src/pages/cat/fun/quiz.astro
rm src/pages/en/fun/snake.astro src/pages/es/fun/snake.astro src/pages/cat/fun/snake.astro
```

Run: `npm run build`
Expected: Clean build.

**Step 3: Commit**

```bash
git add src/pages/
git commit -m "refactor: deduplicate fun pages via [lang] routes"
```

---

### Task 9: Page Deduplication — Tags, Articles, RSS

**Files:**
- Create: `src/pages/[lang]/tags/index.astro`
- Create: `src/pages/[lang]/tags/[tag].astro`
- Create: `src/pages/[lang]/articles/[...slug].astro`
- Create: `src/pages/[lang]/rss.xml.ts`
- Delete: all `{en,es,cat}` versions of the above

**Step 1: Create `src/pages/[lang]/tags/index.astro`**

This page needs async data but doesn't use `getStaticPaths` for the tag — it just lists all tags. Add `getStaticPaths` for `[lang]` and change the `'en/'` slug prefix to use the dynamic `lang`.

**Step 2: Create `src/pages/[lang]/tags/[tag].astro`**

This already has `getStaticPaths` for `[tag]`. Now it needs to generate paths for each `[lang]` x `[tag]` combination:

```astro
---
import Layout from '../../../layouts/Layout.astro';
import ArticleCard from '../../../components/ArticleCard.astro';
import { useTranslations, locales } from '../../../i18n/translations';
import type { Locale } from '../../../i18n/translations';
import { getCollection } from 'astro:content';

export async function getStaticPaths() {
  const allArticles = await getCollection('articles', ({ data }) => {
    return import.meta.env.DEV || !data.draft;
  });

  return locales.flatMap(lang => {
    const localeArticles = allArticles.filter(a => a.slug.startsWith(`${lang}/`));
    const tags = new Set<string>();
    for (const article of localeArticles) {
      for (const tag of article.data.tags) {
        tags.add(tag);
      }
    }

    return [...tags].map(tag => ({
      params: { lang, tag },
      props: {
        tag,
        articles: localeArticles
          .filter(a => a.data.tags.includes(tag))
          .sort((a, b) => b.data.publishedDate.valueOf() - a.data.publishedDate.valueOf()),
      },
    }));
  });
}

const lang = Astro.params.lang as Locale;
const t = useTranslations(lang);
const { tag, articles } = Astro.props;
---
```

Template is the same, with `article.slug.replace('en/', '')` changed to use the dynamic `lang`.

**Step 3: Create `src/pages/[lang]/articles/[...slug].astro`**

Same approach — `getStaticPaths` iterates over `locales`:

```astro
---
import { getCollection } from 'astro:content';
import ArticleLayout from '../../../layouts/ArticleLayout.astro';
import { getReadingTime } from '../../../utils/reading-time';
import { locales } from '../../../i18n/translations';
import type { Locale } from '../../../i18n/translations';

export async function getStaticPaths() {
  const articles = await getCollection('articles');

  return locales.flatMap(lang =>
    articles
      .filter(article => article.slug.startsWith(`${lang}/`))
      .map(article => ({
        params: { lang, slug: article.slug.replace(`${lang}/`, '') },
        props: { article },
      }))
  );
}

const lang = Astro.params.lang as Locale;
const { article } = Astro.props;
const { Content } = await article.render();
const readingTime = getReadingTime(article.body || '');
---
```

**Step 4: Create `src/pages/[lang]/rss.xml.ts`**

```typescript
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import { locales } from '../../i18n/translations';

export function getStaticPaths() {
  return locales.map(lang => ({ params: { lang } }));
}

export async function GET(context: APIContext) {
  const lang = context.params.lang!;
  const articles = await getCollection('articles', ({ slug, data }) => {
    return slug.startsWith(`${lang}/`) && !data.draft;
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
      link: `/${lang}/articles/${article.slug.replace(`${lang}/`, '')}/`,
      categories: article.data.tags,
    })),
    customData: `<language>${lang}</language>`,
  });
}
```

**Step 5: Delete old files**

```bash
rm src/pages/en/tags/index.astro src/pages/es/tags/index.astro src/pages/cat/tags/index.astro
rm src/pages/en/tags/\[tag\].astro src/pages/es/tags/\[tag\].astro src/pages/cat/tags/\[tag\].astro
rm src/pages/en/articles/\[...slug\].astro src/pages/es/articles/\[...slug\].astro src/pages/cat/articles/\[...slug\].astro
rm src/pages/en/rss.xml.ts src/pages/es/rss.xml.ts src/pages/cat/rss.xml.ts
```

**Step 6: Remove now-empty locale directories**

```bash
rmdir src/pages/en/tags src/pages/en/articles src/pages/en/fun src/pages/en 2>/dev/null
rmdir src/pages/es/tags src/pages/es/articles src/pages/es/fun src/pages/es 2>/dev/null
rmdir src/pages/cat/tags src/pages/cat/articles src/pages/cat/fun src/pages/cat 2>/dev/null
```

**Step 7: Verify build**

Run: `npm run build`
Expected: Clean build. Same output structure in `dist/`.

Run: `npm run lint && npm run typecheck`
Expected: No errors.

**Step 8: Commit**

```bash
git add src/pages/ src/i18n/translations.ts
git commit -m "refactor: deduplicate tags, articles, and RSS pages via [lang] routes"
```

---

### Task 10: Build Integration Test

**Files:**
- Create: `tests/build/output.test.ts`

**Step 1: Write build output tests**

These tests run against a pre-built `dist/` directory. They verify the build output has the expected structure and content.

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';

describe('build output', () => {
  beforeAll(() => {
    if (!existsSync('dist/en/index.html')) {
      throw new Error('dist/ not found. Run "npm run build" before running build tests.');
    }
  });

  const locales = ['en', 'es', 'cat'];

  describe('locale pages exist', () => {
    const pages = ['index.html', 'about/index.html', 'connect/index.html', 'projects/index.html', 'writing/index.html', 'uses/index.html', 'tags/index.html'];

    for (const locale of locales) {
      for (const page of pages) {
        it(`${locale}/${page} exists`, () => {
          expect(existsSync(`dist/${locale}/${page}`)).toBe(true);
        });
      }
    }
  });

  describe('RSS feeds exist', () => {
    for (const locale of locales) {
      it(`${locale}/rss.xml exists`, () => {
        expect(existsSync(`dist/${locale}/rss.xml`)).toBe(true);
      });
    }
  });

  describe('security meta tags present', () => {
    it('en/index.html contains CSP meta tag', () => {
      const html = readFileSync('dist/en/index.html', 'utf-8');
      expect(html).toContain('Content-Security-Policy');
      expect(html).toContain("default-src 'self'");
    });

    it('en/index.html contains referrer policy', () => {
      const html = readFileSync('dist/en/index.html', 'utf-8');
      expect(html).toContain('strict-origin-when-cross-origin');
    });

    it('en/index.html contains X-Content-Type-Options', () => {
      const html = readFileSync('dist/en/index.html', 'utf-8');
      expect(html).toContain('nosniff');
    });
  });

  describe('SEO tags present', () => {
    for (const locale of locales) {
      it(`${locale}/index.html has canonical URL`, () => {
        const html = readFileSync(`dist/${locale}/index.html`, 'utf-8');
        expect(html).toContain('rel="canonical"');
      });

      it(`${locale}/index.html has hreflang tags`, () => {
        const html = readFileSync(`dist/${locale}/index.html`, 'utf-8');
        expect(html).toContain('hreflang="en"');
        expect(html).toContain('hreflang="es"');
        expect(html).toContain('hreflang="ca"');
        expect(html).toContain('hreflang="x-default"');
      });
    }
  });
});
```

**Step 2: Run build then tests**

Run: `npm run build && npm test`
Expected: All tests pass (unit tests + build tests).

**Step 3: Commit**

```bash
git add tests/build/
git commit -m "test: add build output integration tests"
```

---

### Task 11: Improved Link Checker

**Files:**
- Modify: `scripts/check-links.js`

**Step 1: Rewrite the link checker to verify internal links resolve**

Replace the current `scripts/check-links.js` with a version that resolves internal hrefs to actual files in `dist/`. The new version should:

1. Collect all HTML files from `dist/`
2. Extract all `href` values from each file
3. Skip external links (http), anchors (#), mailto, tel, data URIs, and XML files
4. For each internal link, check that it resolves to an actual file by trying the path directly, with `/index.html` appended, and with `.html` appended
5. Report all broken links and exit with code 1 if any are found

Use ES module imports (`import` from `fs` and `path`). The key function is `resolveInternalLink(link, sourceFile)` which tries multiple candidate paths.

**Step 2: Verify the improved checker passes**

Run: `npm run build && node scripts/check-links.js`
Expected: "All internal links verified!"

**Step 3: Commit**

```bash
git add scripts/check-links.js
git commit -m "feat: improve link checker to verify internal links resolve to files"
```

---

### Task 12: CI — Add Tests and Lighthouse

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`

**Step 1: Install @lhci/cli**

```bash
npm install --save-dev @lhci/cli
```

**Step 2: Add test and Lighthouse steps to CI**

Add after the "Run TypeScript check" step:

```yaml
      - name: Run unit tests
        run: npm test
```

Add after the "Check links" step:

```yaml
      - name: Lighthouse CI
        run: npx lhci autorun --collect.staticDistDir=./dist --collect.url=/en/ --assert.assertions.categories:performance=off --assert.assertions.categories:accessibility=warn --assert.assertions.categories:best-practices=warn --assert.assertions.categories:seo=warn
```

Note: Using `warn` rather than `error` initially so marginal score fluctuations don't block PRs. Tighten thresholds once baseline scores are established.

**Step 3: Commit**

```bash
git add .github/workflows/ci.yml package.json package-lock.json
git commit -m "ci: add vitest and Lighthouse CI to pipeline"
```

---

### Task 13: Update Site Improvements Plan

**Files:**
- Modify: `docs/plans/site-improvements.md`

**Step 1: Add Phase 4 section**

Append to `docs/plans/site-improvements.md`:

```markdown
## Phase 4

- [x] Node.js 24 LTS — `.nvmrc` and CI workflows updated from Node 20 to Node 24
- [x] Security Hardening — CSP meta tag, SRI on analytics script, Referrer-Policy, X-Content-Type-Options, Permissions-Policy, consistent `rel="noopener noreferrer"`, DOM API cleanup in quiz
- [x] Page Deduplication — replaced 39 per-locale page files with 13 dynamic `[lang]` routes using `getStaticPaths()`
- [x] Test Foundation — vitest 4, unit tests for reading-time and translations, build output integration tests
- [x] Improved Link Checker — verifies internal links resolve to actual files in dist/
- [x] Lighthouse CI — automated performance, accessibility, and best-practices audits in CI pipeline
```

**Step 2: Commit**

```bash
git add docs/plans/site-improvements.md
git commit -m "docs: update site-improvements plan with Phase 4"
```

---

### Task 14: Final Verification

**Step 1: Full build and test**

```bash
npm run lint && npm run typecheck && npm run build && npm test && npm run check-links
```

Expected: All pass with zero errors.

**Step 2: Spot-check output**

Open `dist/en/index.html`, `dist/es/about/index.html`, `dist/cat/writing/index.html` and verify they contain correct locale content, CSP meta tag, hreflang tags, and canonical URLs.

**Step 3: Verify no stale locale directories remain**

```bash
ls src/pages/
```

Expected: Only `[lang]/`, `index.astro`, `404.astro`.

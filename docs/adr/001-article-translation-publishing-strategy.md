# ADR 001: Article Translation and Publishing Strategy

**Date:** 2026-01-25

**Status:** Accepted

## Context

We need a strategy for:
1. **Storing and managing** multilingual articles (English, Spanish, Catalan) on the portfolio site
2. **Publishing and hosting** articles to maximize reach, SEO benefits, and content control
3. **Handling translations** with proper linking between language versions

### Requirements
- Good reach and visibility for articles
- SEO benefits (content should rank on search engines)
- Full control over content and translations
- Ability to link to original publishing platforms (Medium, Dev.to)
- Git-versioned content for backup and history

## Decision

### 1. Article Storage: Astro Content Collections

**We will store articles locally using Astro Content Collections with MDX format.**

Structure:
```
src/content/articles/
  en/
    my-article.mdx
  es/
    my-article.mdx
  cat/
    my-article.mdx
```

Each article includes frontmatter:
```yaml
---
title: "Article Title"
description: "Brief description"
publishedDate: 2026-01-25
updatedDate: 2026-01-26  # optional
originalUrl: "https://medium.com/@ismaelmartinez/..."
originalPlatform: "medium"  # medium | devto | self
tags: ["tag1", "tag2"]
draft: false
---
```

### 2. Publishing Strategy: POSSE (Publish Own Site, Syndicate Elsewhere)

**We will publish on our own site first, then syndicate to external platforms.**

Workflow:
1. Write and publish English article on `ismaelmartinez.me.uk` first
2. Wait 3-7 days for Google to index the original
3. Syndicate to Dev.to with canonical URL pointing to our site
4. Optionally syndicate to Medium (keeping articles free, not paywalled)
5. Add Spanish and Catalan translations to our site

### 3. Hosting: GitHub Pages (Static)

**We will continue hosting on GitHub Pages via the existing Astro static site.**

- No additional hosting infrastructure needed
- Articles are pre-rendered at build time
- Free, fast, and reliable
- Automatic deployments via GitHub Actions

## Options Considered

### Article Storage Options

| Option | Pros | Cons |
|--------|------|------|
| **Astro Content Collections (Chosen)** | Type-safe, MDX support, Git-versioned, follows Astro patterns | Requires rebuild for new articles |
| TypeScript data files | Consistent with projects.ts pattern | Awkward for long-form content |
| External CMS (Contentful, Sanity) | Real-time updates, non-dev friendly | Added complexity, external dependency |
| Headless WordPress | Familiar editing experience | Overkill, hosting costs |

### Publishing Platform Options

| Option | Pros | Cons |
|--------|------|------|
| **Self-hosted + Syndicate (Chosen)** | Full control, SEO on our domain, translations easy | Must manage canonical URLs |
| Medium only | 100M+ users, broad reach | Paywall issues, no translation control, ephemeral SEO |
| Dev.to only | Technical audience, no paywall | Limited non-English audience |
| Hashnode with custom domain | Free hosting, auto-backups, good SEO | Another platform to manage |

### Hosting Options

| Option | Pros | Cons |
|--------|------|------|
| **GitHub Pages (Chosen)** | Free, already configured, fast CDN | Static only (sufficient for our needs) |
| Vercel | Easy Astro deployment, edge functions | Unnecessary complexity |
| Netlify | Similar to Vercel, good DX | Unnecessary complexity |
| Self-hosted VPS | Full control | Maintenance burden, cost |

## Consequences

### Positive

- **SEO benefits**: Content on our domain builds domain authority; canonical URLs prevent duplicate content penalties
- **Full translation control**: Can add/modify translations without platform restrictions
- **Content ownership**: All content is Git-versioned and portable
- **Increased reach**: Syndication to Dev.to/Medium expands audience while keeping our site as the canonical source
- **Cost**: Zero additional hosting costs
- **AI/LLM visibility**: Proper canonical URLs help AI systems (ChatGPT, Perplexity) identify authoritative sources

### Negative

- **Manual syndication**: Must manually cross-post to external platforms (could automate with RSS in future)
- **Rebuild required**: New articles require site rebuild and deployment
- **Wait time**: Should wait 3-7 days before syndicating to ensure Google indexes original first

### Neutral

- **Medium limitations**: Using free tier means no earnings from Medium Partner Program, but articles remain freely accessible to all readers
- **Maintenance**: Translations must be manually created and kept in sync

## Implementation

The following components were created:

- `src/content/config.ts` - Content collection schema
- `src/layouts/ArticleLayout.astro` - Article page layout with language switcher
- `src/components/ArticleCard.astro` - Article list card component
- `src/pages/[locale]/articles/[...slug].astro` - Dynamic article routes
- Updated `src/pages/[locale]/writing.astro` - Shows local articles + external platform links

## References

- [POSSE - IndieWeb](https://indieweb.org/POSSE)
- [Astro Content Collections](https://docs.astro.build/en/guides/content-collections/)
- [Canonical URLs and SEO](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Dev.to Canonical URL Documentation](https://dev.to/p/editor_guide)
- [Medium Import Tool](https://help.medium.com/hc/en-us/articles/214550207-Importing-a-post-to-Medium)

# ismaelmartinez.me.uk

[![CI](https://github.com/IsmaelMartinez/ismaelmartinez.me.uk/actions/workflows/ci.yml/badge.svg)](https://github.com/IsmaelMartinez/ismaelmartinez.me.uk/actions/workflows/ci.yml)

Personal portfolio website showcasing my open source projects, writing, and professional links.

Built with [Astro](https://astro.build/) for fast, modern static site generation.

## Features

- Multi-language support (English, Spanish, Catalan)
- Showcase of open source projects
- Articles as MDX content collections, syndicated to Medium and Dev.to, with per-locale RSS feeds
- A retro arcade of eight canvas games sharing a global high-score board
- Open-source portfolio health dashboard, rebuilt on a six-hourly schedule
- Professional and social links
- Dark/light mode support (via system preference)
- Responsive design

## Development

```bash
npm install
npm run dev
```

The full command list (build, lint, typecheck, tests, link check) is in
[CONTRIBUTING.md](CONTRIBUTING.md).

## Deployment

The site ships twice from `main`:

- **GitHub Pages** serves [https://ismaelmartinez.me.uk/](https://ismaelmartinez.me.uk/)
  via `.github/workflows/gh-pages.yml`, which deploys only after a green CI run.
- **Vercel** mirrors the site and is the production host for the arcade's
  global high-score API (`api/scores.ts`, backed by Vercel Blob). The
  reasoning is recorded in [ADR 002](docs/adr/002-global-arcade-high-scores.md).

## License

[MIT](LICENSE)

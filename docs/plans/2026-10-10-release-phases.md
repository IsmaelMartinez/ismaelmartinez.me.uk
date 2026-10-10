# Release phases: relaunch, then the arcade in waves

Written 2026-10-10, after the Console redesign (#455) and the interactive hero
terminal (#456) merged. The site relaunches on those two plus the article
series, with the arcade under construction, and the arcade then opens in waves
so there is something new to announce every couple of weeks rather than
everything on day one. The owner handles the announcements; this plan records
what the repo does at each step and the one edit each wave needs.

## The gate

`src/data/release.ts` holds `RELEASED`, the number of cabinets of
`UNLOCK_CHAIN` the public site carries. Waves are prefixes of the chain because
`visibleCabinets` measures progress along it and the chain is deliberately
chronological. An unreleased cabinet is unpublished the way a draft article is:
no route (so no sitemap entry and nothing links it; Astro still writes its
script chunk as an orphan under `_astro/`, accepted), not on the floor, not in
the home terminal's `ls games`, and while `RELEASED` is 0 the floor itself, the
home teaser, the footer link and the Konami overlay are not built either; the
terminal answers `play` and `open arcade` with `terminal.closed`. Dev and Vercel
previews show the whole chain, as they show draft articles, so each wave can be
played at its real URL before it ships. `tests/build/output.test.ts` asserts the
built site against the manifest, so a wave is a one-line PR with CI proving
what it published.

The scores API and its Blob boards need nothing per wave; unreleased boards
simply sit unread. Pages hidden between waves answer 404 to an old search
result or bookmark until their wave lands, which is accepted. CI builds the
site twice per shard, once as the public build and once as a Vercel preview
into `dist-preview/`, so the build tests assert both that the public build
carries exactly the released cabinets and that a preview carries every one;
the guards that grep a cabinet's built page read the preview build and so
keep running for cabinets the public build leaves out.

## The waves

| Step | Ships | `RELEASED` |
|---|---|---|
| Relaunch | redesign, terminal, article 1 of the AI-Assisted Open Source series | 0 |
| Wave 1 | Tank Duel, Snake, Cascade | 3 |
| Wave 2 | Microcity, CALCIO '90 | 5 |
| Wave 3 | Critter Rescue, Line Hold | 7 |

The series has four parts, published weekly by flipping `draft: false` in all
three locales and setting `publishedDate` to the publish date (the home page and
the terminal sort by it). A fortnight between waves gives the global board time
to fill. A player who has finished the newest released cabinet sees the new
shroud appear on wave day; `isNew` on a cabinet entry adds the localized "New"
ribbon for that wave and comes off with the next.

Pixel Park and Syndicate stay parked and are not part of this plan; reviving
either for a later wave is the three edits recorded in CLAUDE.md plus a bump of
`RELEASED` once it is slotted into the chain.

## Per-wave checklist

1. Bump `RELEASED` in `src/data/release.ts`; set `isNew` on the wave's cabinets
   in `src/data/arcadeCabinets.ts` and clear it on the previous wave's.
2. Play the wave on the Vercel preview.
3. Merge; the build-output tests confirm exactly the released pages exist and
   are sitemapped.
4. Strike the row above and note the date.

## Progress

- 2026-10-10: gate built, `RELEASED = 0`.

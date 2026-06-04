// Progressive enhancement for the health page: after load, re-fetch the live
// repo-butler snapshot in the browser and patch the server-rendered values in
// place. On any failure it does nothing, leaving the baked build-time snapshot
// untouched (so the page still works with JS disabled or the source offline).
import { fetchLivePortfolioHealth, ciColor, vulnColor, goldPctColor } from '../data/health';

type Tier = 'gold' | 'silver' | 'bronze' | 'none';

interface LiveConfig {
  tierLabels: Record<Tier, string>;
  reposWord: string;
  naWord: string;
  updatedWord: string;
  lang: string;
}

const TIER_ORDER: Tier[] = ['gold', 'silver', 'bronze', 'none'];

async function run(): Promise<void> {
  const cfgEl = document.getElementById('health-live-config');
  if (!cfgEl?.textContent) return;

  let cfg: LiveConfig;
  try {
    cfg = JSON.parse(cfgEl.textContent) as LiveConfig;
  } catch {
    return;
  }

  const health = await fetchLivePortfolioHealth();
  if (!health.available || health.totalRepos === 0) return;

  // TierPulse summary.
  const headline = document.querySelector<HTMLElement>('[data-pulse="headline"]');
  if (headline) {
    headline.textContent = `${health.goldPct}% ${cfg.tierLabels.gold}`;
    headline.style.color = goldPctColor(health.goldPct);
  }

  const badges = document.querySelector<HTMLElement>('[data-pulse="badges"]');
  if (badges) {
    badges.replaceChildren();
    for (const tier of TIER_ORDER) {
      const count = health.tierCounts[tier];
      if (count <= 0) continue;
      const span = document.createElement('span');
      span.className = `tier-badge tier-${tier}`;
      span.textContent = `${count} ${cfg.tierLabels[tier]}`;
      badges.appendChild(span);
    }
  }

  const summary = document.querySelector<HTMLElement>('[data-pulse="summary"]');
  if (summary) summary.textContent = `${health.totalRepos} ${cfg.reposWord}`;

  // Per-repo rows (desktop table) and cards (mobile).
  const byName = new Map(health.repos.map((r) => [r.name, r] as const));
  document.querySelectorAll<HTMLElement>('[data-repo]').forEach((container) => {
    const repo = byName.get(container.getAttribute('data-repo') ?? '');
    if (!repo) return;
    container.querySelectorAll<HTMLElement>('[data-field]').forEach((cell) => {
      switch (cell.getAttribute('data-field')) {
        case 'tier':
          cell.className = `tier-badge tier-${repo.tier}`;
          cell.textContent = cfg.tierLabels[repo.tier];
          break;
        case 'issues':
          cell.textContent = String(repo.openIssues);
          break;
        case 'ci':
          cell.textContent = repo.ciPassRate != null ? `${Math.round(repo.ciPassRate * 100)}%` : '—';
          cell.style.color = ciColor(repo.ciPassRate);
          break;
        case 'vulns':
          cell.textContent = repo.vulns ? String(repo.vulns.count) : cfg.naWord;
          cell.style.color = vulnColor(repo.vulns);
          break;
      }
    });
  });

  // Reveal the "live" indicator with the local refresh time.
  const status = document.querySelector<HTMLElement>('[data-live-status]');
  if (status) {
    const time = new Date().toLocaleTimeString(cfg.lang, { hour: '2-digit', minute: '2-digit' });
    status.textContent = `● ${cfg.updatedWord} ${time}`;
    status.hidden = false;
  }
}

run().catch(() => {
  /* silent: keep the baked snapshot */
});

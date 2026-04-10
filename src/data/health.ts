import { z } from 'zod';

const ComputedSchema = z.object({
  tier: z.enum(['gold', 'silver', 'bronze', 'none']),
  checks: z.array(z.object({
    name: z.string(),
    passed: z.boolean(),
    required_for: z.string(),
  })).optional().default([]),
  next_step: z.string().nullable(),
}).optional();

const RepoHealthSchema = z.object({
  open_issues: z.number().default(0),
  open_bugs: z.number().nullable().default(null),
  commits_6mo: z.number().default(0),
  stars: z.number().default(0),
  license: z.string().nullable().default(null),
  communityHealth: z.number().nullable().default(null),
  ciPassRate: z.number().nullable().default(null),
  vulns: z.object({ count: z.number(), max_severity: z.string().nullable() }).nullable().default(null),
  ci: z.number().default(0),
  pushed_at: z.string().nullable().default(null),
  computed: ComputedSchema,
}).passthrough();

const EnrichedSnapshotSchema = z.object({
  schema_version: z.literal('v1'),
  repos: z.record(RepoHealthSchema),
}).passthrough();

const LegacySnapshotSchema = z.record(RepoHealthSchema);

export interface RepoHealth {
  name: string;
  tier: 'gold' | 'silver' | 'bronze' | 'none';
  nextStep: string | null;
  openIssues: number;
  stars: number;
  ciPassRate: number | null;
  vulns: { count: number; max_severity: string | null } | null;
  license: string | null;
  communityHealth: number | null;
  commits: number;
}

export interface PortfolioHealth {
  available: boolean;
  lastUpdated: string | null;
  repos: RepoHealth[];
  tierCounts: { gold: number; silver: number; bronze: number; none: number };
  goldPct: number;
  totalRepos: number;
}

const FALLBACK: PortfolioHealth = {
  available: false,
  lastUpdated: null,
  repos: [],
  tierCounts: { gold: 0, silver: 0, bronze: 0, none: 0 },
  goldPct: 0,
  totalRepos: 0,
};

export function parsePortfolioSnapshot(data: unknown): PortfolioHealth {
  if (!data || typeof data !== 'object') return FALLBACK;

  // Try enriched format first (schema_version + repos wrapper)
  const enriched = EnrichedSnapshotSchema.safeParse(data);
  let repos: Record<string, z.infer<typeof RepoHealthSchema>>;

  if (enriched.success) {
    repos = enriched.data.repos;
  } else {
    // Fall back to legacy flat format (repos at top level)
    const legacy = LegacySnapshotSchema.safeParse(data);
    if (!legacy.success) return FALLBACK;
    repos = legacy.data;
  }
  const tierCounts = { gold: 0, silver: 0, bronze: 0, none: 0 };

  const repoList: RepoHealth[] = Object.entries(repos)
    .map(([name, r]) => {
      const tier = r.computed?.tier ?? 'none';
      tierCounts[tier]++;
      return {
        name,
        tier,
        nextStep: r.computed?.next_step ?? null,
        openIssues: r.open_issues,
        stars: r.stars,
        ciPassRate: r.ciPassRate,
        vulns: r.vulns,
        license: r.license,
        communityHealth: r.communityHealth,
        commits: r.commits_6mo,
      };
    })
    .sort((a, b) => b.commits - a.commits);

  const totalRepos = repoList.length;
  const goldPct = totalRepos > 0 ? Math.round((tierCounts.gold / totalRepos) * 100) : 0;

  return {
    available: true,
    lastUpdated: new Date().toISOString(),
    repos: repoList,
    tierCounts,
    goldPct,
    totalRepos,
  };
}

function currentWeekKey(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function previousWeekKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

const BASE_URL = 'https://raw.githubusercontent.com/IsmaelMartinez/repo-butler/repo-butler-data/snapshots/portfolio-weekly';

let cached: PortfolioHealth | null = null;

export async function fetchPortfolioHealth(): Promise<PortfolioHealth> {
  if (cached) return cached;

  for (const weekKey of [currentWeekKey(), previousWeekKey()]) {
    try {
      const res = await fetch(`${BASE_URL}/${weekKey}.json`);
      if (!res.ok) continue;
      const data = await res.json();
      cached = parsePortfolioSnapshot(data);
      return cached;
    } catch {
      continue;
    }
  }
  cached = FALLBACK;
  return cached;
}

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

const ScanningSchema = z.object({ count: z.number(), max_severity: z.string().nullable().optional() }).nullable().default(null);

const RepoHealthSchema = z.object({
  open_issues: z.number().default(0),
  open_bugs: z.number().nullable().default(null),
  commits_6mo: z.number().default(0),
  commits: z.number().default(0),
  stars: z.number().default(0),
  license: z.string().nullable().default(null),
  communityHealth: z.number().nullable().default(null),
  ciPassRate: z.number().nullable().default(null),
  vulns: z.object({ count: z.number(), max_severity: z.string().nullable() }).nullable().default(null),
  codeScanning: ScanningSchema,
  secretScanning: z.object({ count: z.number() }).nullable().default(null),
  ci: z.number().default(0),
  released_at: z.string().nullable().default(null),
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

// Ported from repo-butler src/report-shared.js — computeHealthTier()
function computeHealthTier(r: z.infer<typeof RepoHealthSchema>, options: { releaseExempt?: boolean } = {}): { tier: 'gold' | 'silver' | 'bronze' | 'none'; nextStep: string | null } {
  const now = Date.now();
  const pushedAt = r.pushed_at ? new Date(r.pushed_at).getTime() : 0;
  const daysSincePush = pushedAt ? Math.floor((now - pushedAt) / 86400000) : Infinity;
  const releasedAt = r.released_at ? new Date(r.released_at).getTime() : 0;
  const daysSinceRelease = releasedAt ? Math.floor((now - releasedAt) / 86400000) : Infinity;

  const anyScannerConfigured = r.vulns != null || r.codeScanning != null || r.secretScanning != null;

  let noSecurityFindings = false;
  if (anyScannerConfigured) {
    const dependabotOk = r.vulns == null || (r.vulns.max_severity !== 'critical' && r.vulns.max_severity !== 'high');
    const codeScanningOk = r.codeScanning == null || (r.codeScanning.max_severity !== 'critical' && r.codeScanning.max_severity !== 'high');
    const secretScanningOk = r.secretScanning == null || r.secretScanning.count === 0;
    noSecurityFindings = dependabotOk && codeScanningOk && secretScanningOk;
  }

  const checks = [
    { name: 'Has CI workflows (2+)', passed: (r.ci || 0) >= 2, required_for: 'gold' as const },
    { name: 'Has a license', passed: !!(r.license && r.license !== 'None'), required_for: 'silver' as const },
    { name: r.open_bugs != null ? 'Fewer than 10 open bugs' : 'Fewer than 20 open issues', passed: r.open_bugs != null ? r.open_bugs < 10 : (r.open_issues ?? 0) < 20, required_for: 'gold' as const },
    { name: 'Release in the last 90 days', passed: options.releaseExempt || daysSinceRelease <= 90, required_for: 'gold' as const },
    { name: 'Community health above 80%', passed: (r.communityHealth ?? -1) >= 80, required_for: 'gold' as const },
    { name: 'Security scanning configured', passed: anyScannerConfigured, required_for: 'gold' as const },
    { name: 'Zero critical/high security findings', passed: noSecurityFindings, required_for: 'gold' as const },
    { name: 'Has CI workflows', passed: (r.ci || 0) >= 1, required_for: 'silver' as const },
    { name: 'Community health above 50%', passed: (r.communityHealth ?? -1) >= 50, required_for: 'silver' as const },
    { name: 'Activity in the last 6 months', passed: daysSincePush <= 180, required_for: 'silver' as const },
    { name: 'Some activity (within 1 year)', passed: (r.commits || 0) > 0 || daysSincePush <= 365, required_for: 'bronze' as const },
  ];

  const goldChecks = checks.filter(c => c.required_for === 'gold');
  const silverChecks = checks.filter(c => c.required_for === 'silver');
  const bronzeChecks = checks.filter(c => c.required_for === 'bronze');

  let tier: 'gold' | 'silver' | 'bronze' | 'none';
  let failingChecks: typeof checks;
  if (goldChecks.every(c => c.passed) && silverChecks.every(c => c.passed)) {
    tier = 'gold';
    failingChecks = [];
  } else if (silverChecks.every(c => c.passed)) {
    tier = 'silver';
    failingChecks = goldChecks.filter(c => !c.passed);
  } else if (bronzeChecks.some(c => c.passed)) {
    tier = 'bronze';
    failingChecks = silverChecks.filter(c => !c.passed);
  } else {
    tier = 'none';
    failingChecks = bronzeChecks.filter(c => !c.passed);
  }

  const nextStep = failingChecks.length > 0 ? failingChecks[0].name : null;
  return { tier, nextStep };
}

export function parsePortfolioSnapshot(data: unknown, releaseExempt: string[] = []): PortfolioHealth {
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
      const computed = r.computed ?? computeHealthTier(r, { releaseExempt: releaseExempt.includes(name) });
      const tier = computed.tier;
      tierCounts[tier]++;
      return {
        name,
        tier,
        nextStep: 'next_step' in computed ? (computed.next_step as string | null) : computed.nextStep,
        openIssues: r.open_issues,
        stars: r.stars,
        ciPassRate: r.ciPassRate,
        vulns: r.vulns,
        license: r.license,
        communityHealth: r.communityHealth,
        commits: r.commits_6mo || r.commits,
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
const CONFIG_URL = 'https://raw.githubusercontent.com/IsmaelMartinez/repo-butler/main/.github/roadmap.yml';

async function fetchReleaseExempt(): Promise<string[]> {
  try {
    const res = await fetch(CONFIG_URL);
    if (!res.ok) return [];
    const text = await res.text();
    const match = text.match(/^release_exempt:\s*(.+)$/m);
    if (!match) return [];
    return match[1].split(',').map(s => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

let cached: PortfolioHealth | null = null;

export async function fetchPortfolioHealth(): Promise<PortfolioHealth> {
  if (cached) return cached;

  const releaseExempt = await fetchReleaseExempt();

  for (const weekKey of [currentWeekKey(), previousWeekKey()]) {
    try {
      const res = await fetch(`${BASE_URL}/${weekKey}.json`);
      if (!res.ok) continue;
      const data = await res.json();
      cached = parsePortfolioSnapshot(data, releaseExempt);
      return cached;
    } catch {
      continue;
    }
  }
  cached = FALLBACK;
  return cached;
}

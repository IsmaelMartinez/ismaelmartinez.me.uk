import { describe, it, expect } from 'vitest';
import { parsePortfolioSnapshot } from '../../src/data/health';

const validSnapshot = {
  schema_version: 'v1' as const,
  repos: {
    'test-repo': {
      open_issues: 3,
      open_bugs: 1,
      commits_6mo: 50,
      stars: 10,
      license: 'MIT',
      communityHealth: 85,
      ciPassRate: 0.95,
      vulns: { count: 0, max_severity: null },
      codeScanning: null,
      secretScanning: { count: 0 },
      ci: 4,
      released_at: '2026-03-01T00:00:00Z',
      pushed_at: '2026-04-01T00:00:00Z',
      computed: {
        tier: 'gold' as const,
        checks: [{ name: 'Has CI workflows (2+)', passed: true, required_for: 'gold' }],
        next_step: null,
      },
    },
  },
};

describe('parsePortfolioSnapshot', () => {
  it('parses valid snapshot data', () => {
    const result = parsePortfolioSnapshot(validSnapshot);
    expect(result.available).toBe(true);
    expect(result.repos).toHaveLength(1);
    expect(result.repos[0].name).toBe('test-repo');
    expect(result.repos[0].tier).toBe('gold');
    expect(result.goldPct).toBe(100);
  });

  it('returns fallback for null input', () => {
    const result = parsePortfolioSnapshot(null);
    expect(result.available).toBe(false);
    expect(result.repos).toHaveLength(0);
  });

  it('returns fallback for completely invalid data', () => {
    const result = parsePortfolioSnapshot('not an object');
    expect(result.available).toBe(false);
  });

  it('parses legacy flat format (no schema_version wrapper)', () => {
    const legacySnapshot = {
      'my-repo': {
        open_issues: 2,
        open_bugs: 0,
        commits_6mo: 30,
        stars: 5,
        license: 'MIT',
        communityHealth: 70,
        ciPassRate: 0.8,
        vulns: { count: 1, max_severity: 'low' },
        codeScanning: null,
        secretScanning: { count: 0 },
        ci: 3,
        released_at: '2026-03-01T00:00:00Z',
        pushed_at: '2026-04-01T00:00:00Z',
      },
    };
    const result = parsePortfolioSnapshot(legacySnapshot);
    expect(result.available).toBe(true);
    expect(result.repos).toHaveLength(1);
    expect(result.repos[0].name).toBe('my-repo');
    // Tier computed locally: all silver checks pass, community health 70 < 80 blocks gold
    expect(result.repos[0].tier).toBe('silver');
    expect(result.repos[0].openIssues).toBe(2);
  });

  it('computes tier locally when computed field is missing', () => {
    const snapshot = {
      schema_version: 'v1' as const,
      repos: { 'a': { ...validSnapshot.repos['test-repo'], computed: undefined } },
    };
    const result = parsePortfolioSnapshot(snapshot);
    expect(result.available).toBe(true);
    // All gold+silver checks pass for this test data → gold
    expect(result.repos[0].tier).toBe('gold');
  });

  it('computes tier distribution correctly', () => {
    const snapshot = {
      schema_version: 'v1' as const,
      repos: {
        a: { ...validSnapshot.repos['test-repo'], computed: { tier: 'gold' as const, checks: [], next_step: null } },
        b: { ...validSnapshot.repos['test-repo'], computed: { tier: 'silver' as const, checks: [], next_step: 'Has a license' } },
        c: { ...validSnapshot.repos['test-repo'], computed: { tier: 'gold' as const, checks: [], next_step: null } },
      },
    };
    const result = parsePortfolioSnapshot(snapshot);
    expect(result.tierCounts.gold).toBe(2);
    expect(result.tierCounts.silver).toBe(1);
    expect(result.goldPct).toBe(67);
    expect(result.repos).toHaveLength(3);
  });
});

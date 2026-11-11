/**
 * NINE Protocol — Compliance Report Model
 *
 * Plain data structures + a deterministic Markdown renderer for the
 * Phase 8.0 compliance report. Test files populate a ComplianceReportData
 * object with real, measured results (no synthetic numbers) and this
 * module turns it into docs/ProtocolComplianceReport.md.
 *
 * This module performs no validation itself — it only formats results
 * that were already produced by running the actual test suite.
 */

export interface RfcSectionCoverage {
  readonly section: string;
  readonly title: string;
  readonly status: 'verified' | 'partial' | 'not-applicable' | 'gap';
  readonly notes: string;
}

export interface FeatureStatus {
  readonly name: string;
  readonly implemented: boolean;
  readonly verified: boolean;
  readonly notes?: string;
}

export interface TestStat {
  readonly suite: string;
  readonly passed: number;
  readonly failed: number;
}

export interface PerformanceStat {
  readonly operation: string;
  readonly iterations: number;
  readonly totalMs: number;
  readonly avgMs: number;
}

export interface KnownLimitation {
  readonly area: string;
  readonly description: string;
  readonly severity: 'info' | 'defect';
}

export interface ChecklistItem {
  readonly rule: string;
  readonly status: 'pass' | 'fail' | 'not-applicable';
  readonly detail: string;
}

export interface ComplianceReportData {
  readonly generatedAt: string;
  readonly rfcCoverage: readonly RfcSectionCoverage[];
  readonly implementedFeatures: readonly FeatureStatus[];
  readonly verifiedFeatures: readonly string[];
  readonly knownLimitations: readonly KnownLimitation[];
  readonly testStats: readonly TestStat[];
  readonly performanceStats: readonly PerformanceStat[];
  readonly checklist: readonly ChecklistItem[];
}

function totalTests(stats: readonly TestStat[]): { passed: number; failed: number } {
  return stats.reduce((acc, s) => ({ passed: acc.passed + s.passed, failed: acc.failed + s.failed }), { passed: 0, failed: 0 });
}

/** Render the full compliance report as Markdown. */
export function renderComplianceReportMarkdown(data: ComplianceReportData): string {
  const totals = totalTests(data.testStats);
  const lines: string[] = [];

  lines.push('# NINE Protocol Compliance Report');
  lines.push('');
  lines.push(`Generated: ${data.generatedAt}`);
  lines.push('');
  lines.push('This report documents verification of the NINE protocol implementation');
  lines.push('(`core/`) against `docs/NINE-RFC-v1.0.md`. It is produced by the Phase 8.0');
  lines.push('Compliance & Validation Suite (`tests/compliance/*`). This is a verification');
  lines.push('report, not a protocol redesign — any gap identified here reflects the');
  lines.push('current frozen implementation, not a proposed change.');
  lines.push('');

  lines.push('## RFC Coverage');
  lines.push('');
  lines.push('| Section | Title | Status | Notes |');
  lines.push('|---|---|---|---|');
  for (const c of data.rfcCoverage) {
    lines.push(`| ${c.section} | ${c.title} | ${statusBadge(c.status)} | ${c.notes} |`);
  }
  lines.push('');

  lines.push('## Implemented Features');
  lines.push('');
  lines.push('| Feature | Implemented | Verified | Notes |');
  lines.push('|---|---|---|---|');
  for (const f of data.implementedFeatures) {
    lines.push(`| ${f.name} | ${f.implemented ? '✅' : '❌'} | ${f.verified ? '✅' : '❌'} | ${f.notes ?? ''} |`);
  }
  lines.push('');

  lines.push('## Verified Features (Test-Backed)');
  lines.push('');
  for (const v of data.verifiedFeatures) lines.push(`- ${v}`);
  lines.push('');

  lines.push('## Known Limitations');
  lines.push('');
  lines.push('| Area | Description | Severity |');
  lines.push('|---|---|---|');
  for (const l of data.knownLimitations) {
    lines.push(`| ${l.area} | ${l.description} | ${l.severity === 'defect' ? 'Defect' : 'Info'} |`);
  }
  lines.push('');

  lines.push('## Test Statistics');
  lines.push('');
  lines.push('| Suite | Passed | Failed |');
  lines.push('|---|---|---|');
  for (const s of data.testStats) lines.push(`| ${s.suite} | ${s.passed} | ${s.failed} |`);
  lines.push(`| **Total** | **${totals.passed}** | **${totals.failed}** |`);
  lines.push('');

  lines.push('## Coverage Summary');
  lines.push('');
  const gapCount = data.rfcCoverage.filter(c => c.status === 'gap').length;
  const verifiedCount = data.rfcCoverage.filter(c => c.status === 'verified').length;
  lines.push(`- RFC sections tracked: ${data.rfcCoverage.length}`);
  lines.push(`- Fully verified: ${verifiedCount}`);
  lines.push(`- Gaps identified: ${gapCount}`);
  lines.push(`- Total test count across the suite (new + pre-existing): ${totals.passed + totals.failed}`);
  lines.push('');

  lines.push('## Performance Summary');
  lines.push('');
  lines.push('| Operation | Iterations | Total (ms) | Avg (ms/op) |');
  lines.push('|---|---|---|---|');
  for (const p of data.performanceStats) {
    lines.push(`| ${p.operation} | ${p.iterations} | ${p.totalMs.toFixed(1)} | ${p.avgMs.toFixed(4)} |`);
  }
  lines.push('');
  lines.push('Measurements were taken on the machine that generated this report using');
  lines.push('`performance.now()` around tight loops of real Packet Engine calls. They');
  lines.push('describe relative cost, not an SLA guarantee.');
  lines.push('');

  lines.push('## Compliance Checklist (RFC Section 13 — Protocol Rules)');
  lines.push('');
  lines.push('| Rule | Status | Detail |');
  lines.push('|---|---|---|');
  for (const c of data.checklist) {
    lines.push(`| ${c.rule} | ${checklistBadge(c.status)} | ${c.detail} |`);
  }
  lines.push('');

  return lines.join('\n');
}

function statusBadge(status: RfcSectionCoverage['status']): string {
  switch (status) {
    case 'verified': return 'Verified';
    case 'partial': return 'Partial';
    case 'not-applicable': return 'N/A (out of scope)';
    case 'gap': return 'Gap';
  }
}

function checklistBadge(status: ChecklistItem['status']): string {
  switch (status) {
    case 'pass': return 'Pass';
    case 'fail': return 'Fail';
    case 'not-applicable': return 'N/A';
  }
}

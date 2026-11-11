/**
 * Phase 8.0 — Shared performance log for the compliance report generator.
 *
 * Not a test file itself (no .test.ts suffix, vitest will not collect it).
 * StressValidation.test.ts records real measured timings here; the report
 * generator (ProtocolComplianceReport.test.ts equivalent — see
 * generateComplianceReport.ts) reads them back after the stress suite runs.
 */

export interface PerfRecord {
  operation: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
}

export const PERF_LOG: PerfRecord[] = [];

export function recordPerf(operation: string, iterations: number, totalMs: number): void {
  PERF_LOG.push({ operation, iterations, totalMs, avgMs: totalMs / iterations });
}

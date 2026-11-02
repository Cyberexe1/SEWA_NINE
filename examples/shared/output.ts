/**
 * NINE Examples — Output Utilities
 *
 * Writes console output, JSON execution traces, metrics, and summaries
 * to examples/results/. Also writes CSV for benchmarks.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_ROOT = join(__dirname, '..', 'results');

function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

export interface TraceEntry {
  t: number;
  event: string;
  detail: Record<string, unknown>;
}

export class ExampleRecorder {
  private readonly name: string;
  private readonly logs: string[] = [];
  private readonly trace: TraceEntry[] = [];
  private step = 0;

  constructor(name: string) {
    this.name = name;
  }

  /** Log to console and buffer. */
  log(message: string): void {
    console.log(message);
    this.logs.push(message);
  }

  /** Record a structured trace event. */
  record(event: string, detail: Record<string, unknown> = {}): void {
    this.trace.push({ t: this.step++, event, detail });
  }

  /** Persist logs, trace, and metrics to results/. */
  save(metrics: unknown, summary: Record<string, unknown>): void {
    ensureDir(join(RESULTS_ROOT, 'logs'));
    ensureDir(join(RESULTS_ROOT, 'metrics'));
    ensureDir(join(RESULTS_ROOT, 'traces'));

    writeFileSync(join(RESULTS_ROOT, 'logs', `${this.name}.log`), this.logs.join('\n'), 'utf-8');
    writeFileSync(join(RESULTS_ROOT, 'traces', `${this.name}.trace.json`), JSON.stringify(this.trace, null, 2), 'utf-8');
    writeFileSync(join(RESULTS_ROOT, 'metrics', `${this.name}.metrics.json`), JSON.stringify(metrics, null, 2), 'utf-8');
    writeFileSync(
      join(RESULTS_ROOT, 'metrics', `${this.name}.summary.json`),
      JSON.stringify({ example: this.name, ...summary }, null, 2),
      'utf-8',
    );
  }

  getTrace(): TraceEntry[] { return this.trace; }
}

/** Write a CSV file to results/metrics. */
export function writeCSV(filename: string, header: string[], rows: (string | number)[][]): void {
  ensureDir(join(RESULTS_ROOT, 'metrics'));
  const lines = [header.join(','), ...rows.map(r => r.join(','))];
  writeFileSync(join(RESULTS_ROOT, 'metrics', filename), lines.join('\n'), 'utf-8');
}

export function resultsRoot(): string { return RESULTS_ROOT; }

/** Robust check for whether a module is being executed directly (Windows-safe). */
export function isMain(importMetaUrl: string): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    const invoked = pathToFileURL(argv1).href;
    // Normalize: strip .ts/.js extension differences and compare
    return importMetaUrl === invoked;
  } catch {
    return false;
  }
}

/**
 * NINE Example 06 — Benchmark & Performance
 *
 * Measures broadcast latency, secure-message latency, throughput, and
 * packet-loss behavior across increasing mesh sizes. Exports CSV files
 * directly usable for charts in Excel / research papers.
 */

import { createMesh, linkStar } from '../shared/harness.js';
import { ExampleRecorder, isMain, writeCSV } from '../shared/output.js';
import { NodeRole } from '../../core/shared/Types.js';

interface SizeResult {
  nodes: number;
  broadcastLatencyMs: number;
  secureLatencyMs: number;
  throughputMsgsPerSec: number;
  deliveryRate: number;
}

async function benchmarkSize(nodeCount: number): Promise<SizeResult> {
  const spec = [{ name: 'Hub', role: NodeRole.ADMIN }];
  for (let i = 1; i < nodeCount; i++) spec.push({ name: `N${i}`, role: NodeRole.USER });
  const h = await createMesh(spec);
  await linkStar(h);
  h.distributeAdminKey();

  // --- Broadcast latency (single message, measure round to all peers) ---
  let delivered = 0;
  for (const n of h.nodes) {
    if (n.name === 'Hub') continue;
    n.core.onBroadcast(() => { delivered++; });
  }
  const bStart = performance.now();
  h.get('Hub').core.sendBroadcast('benchmark broadcast');
  await h.flush();
  const broadcastLatencyMs = performance.now() - bStart;
  const deliveryRate = delivered / (nodeCount - 1);

  // --- Secure message latency (peer -> Hub) ---
  const sStart = performance.now();
  h.get('N1').core.sendSecureMessage('benchmark secure', h.get('Hub').id);
  await h.flush();
  const secureLatencyMs = performance.now() - sStart;

  // --- Throughput: N broadcasts in a tight loop ---
  const N = 200;
  const tStart = performance.now();
  for (let i = 0; i < N; i++) {
    h.get('Hub').core.sendBroadcast(`msg-${i}`);
  }
  await h.flush();
  const tElapsed = (performance.now() - tStart) / 1000;
  const throughputMsgsPerSec = N / tElapsed;

  await h.shutdown();
  return { nodes: nodeCount, broadcastLatencyMs, secureLatencyMs, throughputMsgsPerSec, deliveryRate };
}

export async function run(): Promise<Record<string, unknown>> {
  const rec = new ExampleRecorder('06-benchmark');
  rec.log('=== NINE Example 06: Benchmark & Performance ===\n');

  const sizes = [5, 10, 20, 50];
  const results: SizeResult[] = [];

  for (const size of sizes) {
    rec.log(`Benchmarking ${size}-node star...`);
    const r = await benchmarkSize(size);
    results.push(r);
    rec.record('benchmark_size', { ...r });
    rec.log(`  broadcast: ${r.broadcastLatencyMs.toFixed(2)}ms | secure: ${r.secureLatencyMs.toFixed(2)}ms | throughput: ${r.throughputMsgsPerSec.toFixed(0)} msg/s | delivery: ${(r.deliveryRate*100).toFixed(0)}%`);
  }

  // --- Export CSVs ---
  writeCSV('benchmark.csv',
    ['nodes', 'broadcast_latency_ms', 'secure_latency_ms', 'throughput_msgs_per_sec', 'delivery_rate'],
    results.map(r => [r.nodes, r.broadcastLatencyMs.toFixed(3), r.secureLatencyMs.toFixed(3), r.throughputMsgsPerSec.toFixed(1), r.deliveryRate.toFixed(3)]),
  );
  writeCSV('latency.csv',
    ['nodes', 'broadcast_ms', 'secure_ms'],
    results.map(r => [r.nodes, r.broadcastLatencyMs.toFixed(3), r.secureLatencyMs.toFixed(3)]),
  );
  writeCSV('throughput.csv',
    ['nodes', 'msgs_per_sec'],
    results.map(r => [r.nodes, r.throughputMsgsPerSec.toFixed(1)]),
  );
  writeCSV('packet-loss.csv',
    ['nodes', 'delivery_rate', 'loss_rate'],
    results.map(r => [r.nodes, r.deliveryRate.toFixed(3), (1 - r.deliveryRate).toFixed(3)]),
  );

  rec.log('\nCSV files written to results/metrics/: benchmark.csv, latency.csv, throughput.csv, packet-loss.csv');

  const summary = {
    sizesTested: sizes,
    results,
    csvExported: ['benchmark.csv', 'latency.csv', 'throughput.csv', 'packet-loss.csv'],
    success: results.every(r => r.deliveryRate === 1),
  };
  rec.save({ results }, summary);

  await Promise.resolve();
  return summary;
}

if (isMain(import.meta.url)) {
  run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

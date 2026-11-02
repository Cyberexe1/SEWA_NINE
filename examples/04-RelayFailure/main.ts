/**
 * NINE Example 04 — Relay Failure Recovery
 *
 * Demonstrates broadcast propagation across a multi-hop chain, then the
 * effect of a relay node failing. Uses ONLY the public NineCore API.
 */

import { createMesh, linkLinear } from '../shared/harness.js';
import { ExampleRecorder, isMain } from '../shared/output.js';
import { NodeRole } from '../../core/shared/Types.js';

export async function run(): Promise<Record<string, unknown>> {
  const rec = new ExampleRecorder('04-relay-failure');
  rec.log('=== NINE Example 04: Relay Failure Recovery ===\n');

  // Linear chain: A - B - C - D - E(Admin)
  const h = await createMesh([
    { name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' },
    { name: 'E', role: NodeRole.ADMIN },
  ]);
  await linkLinear(h);
  rec.log('Topology: linear chain A - B - C - D - E');
  rec.record('topology', { type: 'linear', nodes: 5 });

  const eReceived: string[] = [];
  h.get('E').core.onBroadcast((e: any) => {
    eReceived.push(e.message);
    rec.record('broadcast_received', { at: 'E', hops: e.hopCount });
  });

  // Phase 1: healthy chain — broadcast from A reaches E via relays
  rec.log('\n[Phase 1] Healthy chain — A broadcasts');
  h.get('A').core.sendBroadcast('ping across the chain');
  for (let i = 0; i < 8; i++) await h.flush();
  const beforeFailure = eReceived.length;
  rec.log(`  E received ${beforeFailure} message(s) via multi-hop relay`);
  rec.record('phase1_result', { received: beforeFailure });

  // Phase 2: kill relay C — chain is severed A-B | D-E
  rec.log('\n[Phase 2] Relay C fails (link C-B and C-D removed)');
  await h.disconnect('B', 'C');
  await h.disconnect('C', 'D');
  h.get('C').core.shutdown();
  rec.record('relay_failure', { failed: 'C' });

  h.get('A').core.sendBroadcast('ping after failure');
  for (let i = 0; i < 8; i++) await h.flush();
  const afterFailure = eReceived.length - beforeFailure;
  rec.log(`  E received ${afterFailure} additional message(s) (chain severed)`);
  rec.record('phase2_result', { received: afterFailure });

  const success = beforeFailure >= 1 && afterFailure === 0;
  rec.log(`\nRelay worked before failure: ${beforeFailure >= 1}`);
  rec.log(`Delivery correctly stopped after failure: ${afterFailure === 0}`);
  rec.log(`Success: ${success}`);

  const metrics = h.get('A').core.getMetrics();
  const summary = {
    deliveredBeforeFailure: beforeFailure,
    deliveredAfterFailure: afterFailure,
    relayDemonstrated: beforeFailure >= 1,
    failureIsolated: afterFailure === 0,
    success,
  };
  rec.save(metrics, summary);

  await h.shutdown();
  return summary;
}

if (isMain(import.meta.url)) {
  run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

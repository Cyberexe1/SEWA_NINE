/**
 * NINE Example 01 — Broadcast Messaging
 *
 * Demonstrates one-to-all message delivery through NineCore.
 * Uses ONLY the public NineCore API.
 */

import { createMesh, linkStar } from '../shared/harness.js';
import { ExampleRecorder, isMain } from '../shared/output.js';
import { NodeRole } from '../../core/shared/Types.js';

export async function run(): Promise<Record<string, unknown>> {
  const rec = new ExampleRecorder('01-broadcast');
  rec.log('=== NINE Example 01: Broadcast Messaging ===\n');

  // Star topology: Alpha (center) + 4 leaves
  const h = await createMesh([
    { name: 'Alpha' },
    { name: 'Bravo' },
    { name: 'Charlie' },
    { name: 'Delta' },
    { name: 'Admin', role: NodeRole.ADMIN },
  ]);
  await linkStar(h);
  rec.log('Topology: star (Alpha at center, 4 peers)');
  rec.record('topology', { type: 'star', center: 'Alpha', nodes: 5 });

  // Subscribe every non-sender to broadcasts
  const received: Record<string, string[]> = {};
  for (const node of h.nodes) {
    received[node.name] = [];
    node.core.onBroadcast((e: any) => {
      received[node.name]!.push(e.message);
      rec.record('broadcast_received', { at: node.name, from: e.senderId, message: e.message, hops: e.hopCount });
    });
  }

  // Alpha broadcasts an emergency alert
  const message = 'EMERGENCY: Building evacuation in progress';
  rec.log(`\nAlpha broadcasts: "${message}"`);
  rec.record('broadcast_sent', { from: 'Alpha', message, emergency: true });
  h.get('Alpha').core.sendBroadcast(message, true);
  await h.flush();

  // Report
  rec.log('\nDelivery results:');
  let deliveredCount = 0;
  for (const node of h.nodes) {
    if (node.name === 'Alpha') continue;
    const got = received[node.name]!.length > 0;
    if (got) deliveredCount++;
    rec.log(`  ${node.name}: ${got ? 'RECEIVED' : 'MISSED'}`);
  }

  const metrics = h.get('Alpha').core.getMetrics();
  const summary = {
    topology: 'star',
    totalPeers: 4,
    delivered: deliveredCount,
    deliveryRate: deliveredCount / 4,
    success: deliveredCount === 4,
  };
  rec.log(`\nDelivered to ${deliveredCount}/4 peers. Success: ${summary.success}`);
  rec.save(metrics, summary);

  await h.shutdown();
  return summary;
}

if (isMain(import.meta.url)) {
  run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

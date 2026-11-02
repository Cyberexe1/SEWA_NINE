/**
 * NINE Example 07 — Multi-Node Mesh Communication
 *
 * Demonstrates a larger mesh (multi-floor building analogue) with broadcast
 * propagation across many hops and simultaneous secure messaging to Admin.
 * Uses ONLY the public NineCore API.
 */

import { createMesh } from '../shared/harness.js';
import { ExampleRecorder, isMain } from '../shared/output.js';
import { NodeRole } from '../../core/shared/Types.js';

export async function run(): Promise<Record<string, unknown>> {
  const rec = new ExampleRecorder('07-multi-node-mesh');
  rec.log('=== NINE Example 07: Multi-Node Mesh Communication ===\n');

  // 8-node multi-floor analogue.
  // Floor 1: F1a - F1b - Admin
  // Floor 2: F2a - F2b   (F2a links to F1a)
  // Floor 3: F3a - F3b   (F3a links to F2a)
  const h = await createMesh([
    { name: 'F1a' }, { name: 'F1b' }, { name: 'Admin', role: NodeRole.ADMIN },
    { name: 'F2a' }, { name: 'F2b' },
    { name: 'F3a' }, { name: 'F3b' },
    { name: 'F3c' },
  ]);
  await h.connect('F1a', 'F1b');
  await h.connect('F1b', 'Admin');
  await h.connect('F1a', 'F2a');
  await h.connect('F2a', 'F2b');
  await h.connect('F2a', 'F3a');
  await h.connect('F3a', 'F3b');
  await h.connect('F3b', 'F3c');
  h.distributeAdminKey();

  rec.log('Topology: 8-node multi-floor mesh');
  rec.record('topology', { type: 'multi_floor', nodes: 8 });

  // Every node listens for broadcasts
  const broadcastCounts: Record<string, number> = {};
  for (const n of h.nodes) {
    broadcastCounts[n.name] = 0;
    n.core.onBroadcast(() => { broadcastCounts[n.name]!++; });
  }
  const secureReceived: string[] = [];
  h.get('Admin').core.onSecureMessage((e: any) => secureReceived.push(e.plaintext));

  // Scenario A: F3c (top floor, farthest) broadcasts an alert
  rec.log('\n[A] F3c broadcasts an emergency alert across all floors');
  h.get('F3c').core.sendBroadcast('EMERGENCY: fire on floor 3', true);
  for (let i = 0; i < 12; i++) await h.flush();

  const reachedCount = Object.entries(broadcastCounts).filter(([n, c]) => n !== 'F3c' && c > 0).length;
  rec.log(`  Broadcast reached ${reachedCount}/7 other nodes`);
  rec.record('broadcast_reach', { reached: reachedCount, total: 7 });

  // Scenario B: F3a sends a secure message to Admin (multi-hop, encrypted)
  rec.log('\n[B] F3a sends a secure message to Admin (multi-hop)');
  h.get('F3a').core.sendSecureMessage('Floor 3 status: all clear after evacuation', h.get('Admin').id);
  for (let i = 0; i < 12; i++) await h.flush();
  rec.log(`  Admin received secure messages: ${secureReceived.length}`);
  rec.record('secure_delivery', { count: secureReceived.length });

  const broadcastSuccess = reachedCount === 7;
  const secureSuccess = secureReceived.length === 1;
  const success = broadcastSuccess && secureSuccess;

  rec.log(`\nBroadcast reached all nodes: ${broadcastSuccess}`);
  rec.log(`Secure message delivered to Admin: ${secureSuccess}`);
  rec.log(`Success: ${success}`);

  const metrics = h.get('F3c').core.getMetrics();
  const summary = {
    nodes: 8,
    broadcastReached: reachedCount,
    broadcastReachedAll: broadcastSuccess,
    secureDelivered: secureReceived.length,
    secureSuccess,
    success,
  };
  rec.save(metrics, summary);

  await h.shutdown();
  return summary;
}

if (isMain(import.meta.url)) {
  run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

/**
 * NINE Example 03 — Dual-Path Secure Messaging
 *
 * Demonstrates the defining NINE feature: a secure message is split into
 * two independent packets (SECURE_DATA + SECURE_KEY) that are routed to the
 * Admin and reassembled only there. Uses ONLY the public NineCore API.
 *
 * Topology is a diamond so message and key can traverse distinct relays.
 */

import { createMesh } from '../shared/harness.js';
import { ExampleRecorder, isMain } from '../shared/output.js';
import { NodeRole } from '../../core/shared/Types.js';

export async function run(): Promise<Record<string, unknown>> {
  const rec = new ExampleRecorder('03-dual-path');
  rec.log('=== NINE Example 03: Dual-Path Secure Messaging ===\n');

  // Diamond: Source -> {RelayA, RelayB} -> Admin
  const h = await createMesh([
    { name: 'Source', role: NodeRole.USER },
    { name: 'RelayA', role: NodeRole.USER },
    { name: 'RelayB', role: NodeRole.USER },
    { name: 'Admin', role: NodeRole.ADMIN },
  ]);
  await h.connect('Source', 'RelayA');
  await h.connect('Source', 'RelayB');
  await h.connect('RelayA', 'Admin');
  await h.connect('RelayB', 'Admin');
  h.distributeAdminKey();

  rec.log('Topology: diamond (Source -> RelayA/RelayB -> Admin)');
  rec.record('topology', { type: 'diamond', paths: 2 });

  const delivered: string[] = [];
  h.get('Admin').core.onSecureMessage((e: any) => {
    delivered.push(e.plaintext);
    rec.record('secure_received', { at: 'Admin' });
  });

  // Warm up routes via discovery (secure send auto-triggers discovery + queueing)
  const secret = 'Dual-path payload: only Admin can reconstruct this message';
  rec.log(`\nSource sends secure message: "${secret}"`);
  const result = h.get('Source').core.sendSecureMessage(secret, h.get('Admin').id);
  rec.record('secure_sent', { sessionId: result.sessionId, dualPathAchieved: result.dualPathAchieved });

  // Route discovery + delivery are asynchronous over relays — flush repeatedly
  for (let i = 0; i < 10; i++) await h.flush();

  const metrics = h.get('Source').core.getMetrics();
  const dualPathAchieved = metrics.dualPath.dualPathUsed >= 1;
  const success = delivered.length === 1 && delivered[0] === secret && dualPathAchieved;

  rec.log(`\nAdmin reconstructed: "${delivered[0] ?? '(pending/none)'}"`);
  rec.log(`Dual-path achieved (node-disjoint): ${dualPathAchieved}`);
  rec.log(`  (dualPathUsed=${metrics.dualPath.dualPathUsed}, singlePathFallback=${metrics.dualPath.singlePathFallback})`);
  rec.log(`Message + key delivered independently and reassembled: ${delivered.length === 1}`);

  const summary = {
    sessionId: result.sessionId,
    dualPathAchieved,
    reconstructed: delivered.length === 1,
    dualPathMetrics: metrics.dualPath,
    success,
  };
  rec.save(metrics, summary);

  await h.shutdown();
  return summary;
}

if (isMain(import.meta.url)) {
  run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

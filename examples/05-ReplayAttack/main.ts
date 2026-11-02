/**
 * NINE Example 05 — Replay Attack Detection
 *
 * Demonstrates that re-injecting a previously-seen packet is suppressed by
 * the duplicate-detection layer. Uses ONLY the public NineCore API:
 * captured wire bytes are re-fed through core.receive().
 */

import { createMesh } from '../shared/harness.js';
import { ExampleRecorder, isMain } from '../shared/output.js';
import { NodeRole } from '../../core/shared/Types.js';

export async function run(): Promise<Record<string, unknown>> {
  const rec = new ExampleRecorder('05-replay-attack');
  rec.log('=== NINE Example 05: Replay Attack Detection ===\n');

  const h = await createMesh([
    { name: 'Sender' },
    { name: 'Victim', role: NodeRole.ADMIN },
  ]);
  await h.connect('Sender', 'Victim');
  rec.log('Topology: Sender <-> Victim');

  // Capture bytes the Victim receives by intercepting its transport.
  // We hook the mock transport's receive path indirectly: capture via a
  // one-time onBroadcast, then replay by re-feeding the same wire bytes.
  const deliveries: string[] = [];
  h.get('Victim').core.onBroadcast((e: any) => {
    deliveries.push(e.message);
    rec.record('broadcast_delivered', { message: e.message, count: deliveries.length });
  });

  // To replay at the wire level we capture the serialized packet.
  // The harness transport delivers Buffers; we tap it via a proxy handler.
  const captured: Buffer[] = [];
  const victim = h.get('Victim');
  victim.transport.on('data_received' as any, (ev: any) => {
    captured.push(Buffer.from(ev.data));
  });

  rec.log('\nSender broadcasts a message (legitimate).');
  h.get('Sender').core.sendBroadcast('authenticate transaction 4471');
  await h.flush();
  rec.log(`  Victim delivered count after legitimate send: ${deliveries.length}`);

  // Replay: re-inject the exact captured bytes into the Victim
  rec.log('\nAttacker replays the captured packet 5 times...');
  const beforeReplay = deliveries.length;
  for (let i = 0; i < 5; i++) {
    if (captured[0]) {
      victim.core.receive(h.get('Sender').id, captured[0]);
    }
  }
  await h.flush();
  const afterReplay = deliveries.length;
  const suppressed = afterReplay === beforeReplay;

  rec.log(`  Victim delivered count after 5 replays: ${afterReplay}`);
  rec.log(`  Duplicate deliveries prevented: ${suppressed}`);

  const metrics = victim.core.getMetrics();
  rec.log(`  Routing duplicatesDetected: ${metrics.routing.duplicatesDetected}`);

  const success = beforeReplay === 1 && suppressed && metrics.routing.duplicatesDetected >= 5;
  rec.log(`\nSuccess: ${success}`);

  const summary = {
    legitimateDeliveries: beforeReplay,
    replaysAttempted: 5,
    deliveriesAfterReplay: afterReplay,
    duplicatesDetected: metrics.routing.duplicatesDetected,
    replaySuppressed: suppressed,
    success,
  };
  rec.save(metrics, summary);

  await h.shutdown();
  return summary;
}

if (isMain(import.meta.url)) {
  run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

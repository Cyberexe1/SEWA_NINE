/**
 * NINE Example 02 — Secure Messaging
 *
 * Demonstrates encrypted user-to-Admin messaging through NineCore.
 * The message is AES-encrypted; the key is RSA-wrapped for the Admin.
 */

import { createMesh } from '../shared/harness.js';
import { ExampleRecorder, isMain } from '../shared/output.js';
import { NodeRole } from '../../core/shared/Types.js';

export async function run(): Promise<Record<string, unknown>> {
  const rec = new ExampleRecorder('02-secure-message');
  rec.log('=== NINE Example 02: Secure Messaging ===\n');

  const h = await createMesh([
    { name: 'Field', role: NodeRole.USER },
    { name: 'Admin', role: NodeRole.ADMIN },
  ]);
  await h.connect('Field', 'Admin');
  h.distributeAdminKey();
  rec.log('Topology: Field <-> Admin (direct)');
  rec.log('Admin RSA public key distributed to Field.\n');
  rec.record('setup', { topology: 'direct', adminKeyDistributed: true });

  const delivered: string[] = [];
  h.get('Admin').core.onSecureMessage((e: any) => {
    delivered.push(e.plaintext);
    rec.record('secure_received', { at: 'Admin', from: e.senderId });
  });

  const secret = 'Field report: sector 7 secured, 3 civilians evacuated';
  rec.log(`Field sends encrypted: "${secret}"`);
  const result = h.get('Field').core.sendSecureMessage(secret, h.get('Admin').id);
  rec.record('secure_sent', { sessionId: result.sessionId, dualPath: result.dualPathAchieved });
  await h.flush();

  const success = delivered.length === 1 && delivered[0] === secret;
  rec.log(`\nAdmin decrypted: "${delivered[0] ?? '(nothing)'}"`);
  rec.log(`Success: ${success}`);

  const metrics = h.get('Field').core.getMetrics();
  const summary = {
    sessionId: result.sessionId,
    decrypted: delivered[0] ?? null,
    matchesOriginal: success,
    success,
  };
  rec.save(metrics, summary);

  await h.shutdown();
  return summary;
}

if (isMain(import.meta.url)) {
  run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

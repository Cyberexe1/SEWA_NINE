/**
 * NINE Examples — Demo Runner
 *
 * Usage:
 *   npm run demo <n>     Run a single example (1-7)
 *   npm run demo 8       Run the complete suite
 *   npm run demo         Show the menu
 */

import { run as broadcast } from './01-Broadcast/main.js';
import { run as secure } from './02-SecureMessage/main.js';
import { run as dualPath } from './03-DualPath/main.js';
import { run as relayFailure } from './04-RelayFailure/main.js';
import { run as replayAttack } from './05-ReplayAttack/main.js';
import { run as benchmark } from './06-Benchmark/main.js';
import { run as multiNode } from './07-MultiNodeMesh/main.js';

type Demo = { id: number; name: string; run: () => Promise<Record<string, unknown>> };

const DEMOS: Demo[] = [
  { id: 1, name: 'Broadcast Messaging', run: broadcast },
  { id: 2, name: 'Secure Messaging', run: secure },
  { id: 3, name: 'Dual-Path Messaging', run: dualPath },
  { id: 4, name: 'Relay Failure Recovery', run: relayFailure },
  { id: 5, name: 'Replay Attack Detection', run: replayAttack },
  { id: 6, name: 'Benchmark & Performance', run: benchmark },
  { id: 7, name: 'Multi-node Mesh Communication', run: multiNode },
];

function menu(): void {
  console.log('\nNINE Examples Suite — Demo Runner\n');
  for (const d of DEMOS) console.log(`  ${d.id}. ${d.name}`);
  console.log('  8. Run Complete Suite\n');
  console.log('Usage: npm run demo <1-8>\n');
}

async function runAll(): Promise<void> {
  console.log('\n========== NINE COMPLETE EXAMPLES SUITE ==========\n');
  const results: { name: string; success: boolean }[] = [];
  for (const d of DEMOS) {
    console.log(`\n----- [${d.id}] ${d.name} -----\n`);
    const summary = await d.run();
    results.push({ name: d.name, success: summary.success === true });
  }
  console.log('\n========== SUITE SUMMARY ==========\n');
  let allPass = true;
  for (const r of results) {
    console.log(`  ${r.success ? 'PASS' : 'FAIL'}  ${r.name}`);
    if (!r.success) allPass = false;
  }
  console.log(`\nOverall: ${allPass ? 'ALL EXAMPLES PASSED' : 'SOME EXAMPLES FAILED'}\n`);
  process.exit(allPass ? 0 : 1);
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) { menu(); process.exit(0); }

  const choice = parseInt(arg, 10);
  if (choice === 8) { await runAll(); return; }

  const demo = DEMOS.find(d => d.id === choice);
  if (!demo) { console.error(`Unknown demo: ${arg}`); menu(); process.exit(1); }

  console.log(`\n----- [${demo.id}] ${demo.name} -----\n`);
  const summary = await demo.run();
  process.exit(summary.success === true ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });

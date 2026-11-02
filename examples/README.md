# NINE Examples Suite

The official reference implementation showing how applications consume
`NineCore`. Every example uses **only the public NineCore API** — no example
touches the Packet Engine, Routing Engine, Security Engine, Transport Layer,
or Messaging Layer directly.

## Purpose

- Developer documentation
- Regression testing
- Demonstration scenarios
- Benchmark generation
- Research paper data collection
- Reference implementation for Android and Desktop clients

## Examples

| # | Example | Demonstrates |
|---|---------|--------------|
| 1 | Broadcast Messaging | One-to-all delivery (star) |
| 2 | Secure Messaging | AES+RSA encrypted user→Admin |
| 3 | Dual-Path Messaging | Split/reassemble over a diamond |
| 4 | Relay Failure Recovery | Multi-hop relay + failure isolation |
| 5 | Replay Attack Detection | Duplicate suppression |
| 6 | Benchmark & Performance | Latency/throughput CSVs |
| 7 | Multi-node Mesh | 8-node multi-floor building |

## Running

```bash
npm run demo        # show the menu
npm run demo 1      # run example 1
npm run demo 8      # run the complete suite
```

## Structure

```
examples/
├── 01-Broadcast/       main.ts, README.md, expected-output.md
├── 02-SecureMessage/
├── 03-DualPath/
├── 04-RelayFailure/
├── 05-ReplayAttack/
├── 06-Benchmark/
├── 07-MultiNodeMesh/
├── shared/             harness.ts, output.ts
├── runner.ts           demo runner
├── assets/
└── results/
    ├── logs/           per-example console logs
    ├── metrics/        metrics JSON + benchmark CSVs
    ├── traces/         JSON execution traces
    └── screenshots/
```

## Generated Outputs

Each example writes to `results/`:
- `logs/<name>.log` — console output
- `traces/<name>.trace.json` — structured execution trace
- `metrics/<name>.metrics.json` — subsystem metrics snapshot
- `metrics/<name>.summary.json` — pass/fail summary

The Benchmark example additionally exports:
- `metrics/benchmark.csv`, `latency.csv`, `throughput.csv`, `packet-loss.csv`

## Constraints

These examples do NOT implement Wi-Fi Direct, Bluetooth, Android APIs,
Electron, or UI. They use the `MockTransport` injection point to run entirely
in-memory. Phase 8 will add platform transports behind the same `ITransport`
interface without changing any example.

# Example 06 — Expected Output

Exact latency/throughput numbers vary by machine. The shape is consistent:
100% delivery at all sizes; throughput decreases as node count grows.

```
=== NINE Example 06: Benchmark & Performance ===

Benchmarking 5-node star...
  broadcast: ~8ms | secure: ~18ms | throughput: ~3000 msg/s | delivery: 100%
Benchmarking 10-node star...
  broadcast: ~20ms | secure: ~20ms | throughput: ~2700 msg/s | delivery: 100%
Benchmarking 20-node star...
  broadcast: ~24ms | secure: ~24ms | throughput: ~2000 msg/s | delivery: 100%
Benchmarking 50-node star...
  broadcast: ~16ms | secure: ~23ms | throughput: ~1200 msg/s | delivery: 100%

CSV files written to results/metrics/: benchmark.csv, latency.csv, throughput.csv, packet-loss.csv
```

## Example benchmark.csv

```csv
nodes,broadcast_latency_ms,secure_latency_ms,throughput_msgs_per_sec,delivery_rate
5,7.850,18.450,3094.0,1.000
10,19.550,19.950,2755.0,1.000
20,24.450,23.880,2066.0,1.000
50,16.340,23.050,1247.0,1.000
```

## Success Criteria

- `delivery_rate == 1.000` for all sizes.
- Four CSV files present under `results/metrics/`.

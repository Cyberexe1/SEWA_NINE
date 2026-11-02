# Stress Tests

Performance and limits testing:
- 20+ virtual nodes in a mesh (memory and CPU)
- High packet throughput (flooding with many nodes)
- Dedup buffer at max capacity
- Pending queue overflow behavior
- Concurrent route discoveries
- Rapid node join/leave cycling
- Large message handling (near 4KB limit)

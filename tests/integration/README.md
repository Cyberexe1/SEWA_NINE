# Integration Tests

End-to-end tests using the Mesh Simulator:
- Two nodes discover each other and exchange a broadcast
- Multi-hop broadcast propagation (linear topology)
- Secure message delivery with dual-path verification
- Route discovery across 3+ hops
- Relay failure and route recovery
- Deduplication across flood cycles
- Full lifecycle: init → discover → communicate → shutdown

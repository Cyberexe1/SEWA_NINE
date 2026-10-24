# ADR-002: Routing — Pluggable Reactive Routing with Dual-Path Support

## Status

Accepted

## Date

2026-07-15

## Context

The mesh needs to route packets from source to destination across multiple hops. Several routing algorithms exist for ad hoc networks (AODV, DSR, OLSR, HWMP, BATMAN). Each has trade-offs in overhead, convergence time, and scalability.

For a 5-8 node academic prototype operating indoors, the routing algorithm is not the bottleneck. But the architecture must support experimentation with different algorithms.

## Decision

1. **Reactive (on-demand) routing** is the primary mode. Routes are discovered only when needed (not proactively maintained). This minimizes control traffic in a small, low-bandwidth mesh.

2. **Source routing** for unicast. The full path is embedded in the packet. Intermediate nodes forward without table lookups. This simplifies relay logic.

3. **Flooding** for broadcast. Broadcast packets are propagated to all neighbors with TTL-based termination and deduplication.

4. **Pluggable algorithm interface.** The `RoutingAlgorithm` interface allows swapping between AODV-like, DSR-like, or custom algorithms without changing any other module.

5. **Dual-path computation.** For secure messages, the routing engine computes two node-disjoint paths when topology permits. Falls back to single path with a security warning.

## Consequences

**Positive:**
- Low overhead for small networks (no periodic route advertisements).
- Source routing eliminates per-flow state at relays.
- Pluggable design enables comparative research in the paper.
- Dual-path directly supports the security architecture.

**Negative:**
- Route discovery adds latency to the first message (cold path).
- Source routing carries path in every packet (bandwidth overhead for long routes).
- Dual-path may be impossible in sparse/linear topologies.

## Alternatives Considered

1. **Proactive routing (OLSR)** — Rejected. Periodic advertisements waste bandwidth in a 5-8 node network where topology changes are infrequent.
2. **DTN store-carry-forward** — Partially incorporated. Pending queue buffers packets during route discovery. Full DTN is out of scope.
3. **Geographic routing** — Rejected. Requires location information not available in an indoor Bluetooth/Wi-Fi mesh.

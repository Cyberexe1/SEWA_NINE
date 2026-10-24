# Routing Tests

Unit tests for:
- Neighbor table operations (upsert, evict, query)
- Routing table operations (upsert, expire, invalidate)
- Route discovery flow (RREQ → RREP)
- Forwarding decisions (flood vs source-route vs buffer)
- Dual-path computation
- TTL management
- Route error handling and recovery
- Pluggable algorithm interface compliance

# NINE — Bluetooth Transport Benchmarks

## Document Metadata

| Field | Value |
|-------|-------|
| Phase | 10.3 (hardware validation) |
| Date | pending execution |
| Baseline | v0.9.0-alpha |
| Status | TEMPLATE — awaiting real device measurements |

---

## Test Environment

| Parameter | Value |
|-----------|-------|
| Device A (model) | ___________________ |
| Device A (Android version) | ___________________ |
| Device B (model) | ___________________ |
| Device B (Android version) | ___________________ |
| Distance | ___________________ |
| Environment | Indoor / Outdoor |
| Wi-Fi state | ON / OFF |
| Other BT devices nearby | Yes / No |

---

## 1. Connection Establishment Time

| Trial | Discovery (ms) | RFCOMM Connect (ms) | Total (ms) | Notes |
|-------|---------------:|--------------------:|-----------:|-------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| **Average** | | | | |

---

## 2. Discovery Time

| Trial | Start → First PEER_DISCOVERED (ms) | Total Devices Found | Notes |
|-------|-----------------------------------:|--------------------:|-------|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| **Average** | | | |

---

## 3. Packet Latency (Round-Trip)

| Trial | Packet Size (bytes) | RTT (ms) | One-Way Est. (ms) | Notes |
|-------|--------------------:|----------:|------------------:|-------|
| 1 | 71 (header only) | | | |
| 2 | 71 | | | |
| 3 | 200 | | | |
| 4 | 1024 | | | |
| 5 | 4096 (max) | | | |
| ... | | | | |
| **Average (71B)** | | | | |
| **Average (4096B)** | | | | |

---

## 4. Packet Loss

| Trial | Packets Sent | Packets Received | Loss % | Duration (s) | Notes |
|-------|-------------:|----------------:|-------:|-----------:|-------|
| 1 (close, 3m) | 100 | | | | |
| 2 (close, 3m) | 100 | | | | |
| 3 (medium, 8m) | 100 | | | | |
| 4 (far, 12m) | 100 | | | | |
| **Close avg** | | | | | |
| **Far avg** | | | | | |

---

## 5. Throughput

| Trial | Packet Size | Count | Duration (ms) | Throughput (KB/s) | Notes |
|-------|------------:|------:|--------------:|------------------:|-------|
| 1 | 4096 | 50 | | | |
| 2 | 1024 | 200 | | | |
| 3 | 256 | 500 | | | |
| **Max sustained** | | | | | |

---

## 6. Battery Impact

| Device | Role | Duration (min) | Start % | End % | Drain %/hr | Notes |
|--------|------|---------------:|--------:|------:|-----------:|-------|
| A | Sender | 30 | | | | |
| B | Receiver | 30 | | | | |
| Relay | Relay | 30 | | | | |

---

## 7. Summary

| Metric | Measured Value | Target | Status |
|--------|---------------|--------|--------|
| Connection time | ___ms | <5s | |
| Discovery time | ___ms | <12s | |
| One-hop latency | ___ms | <200ms | |
| Packet loss (close) | ___% | <2% | |
| Throughput | ___KB/s | >20KB/s | |
| Battery (relay/hr) | ___% | <10% | |

---

## Issues Discovered

| # | Issue | Root Cause | Affected Component | Severity | Fix |
|---|-------|-----------|-------------------|----------|-----|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

---

*Fill in measured values during Phase 10.3 hardware validation.*

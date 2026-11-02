# NINE Database Specification

## Document Metadata

| Field | Value |
|-------|-------|
| Version | 0.1.0 |
| Status | Draft |
| Date | 2026-07-15 |
| Authors | NINE Team |

---

## 1. Overview

NINE uses **SQLite** for all local persistence. There is no cloud database, no external server, no network-based storage.

Each node maintains its own independent database file. The database stores:
- Messages (broadcast and encrypted)
- Routing state (for session recovery)
- Cryptographic keys
- Node identity and configuration

---

## 2. Technology Choice

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Engine | SQLite 3 | Embedded, zero-config, single-file, battle-tested |
| Node.js Binding | better-sqlite3 | Synchronous API, fast, no native compilation issues |
| Mode | WAL (Write-Ahead Logging) | Better concurrent read performance |

---

## 3. Schema

### 3.1 `node_state` — Node Identity

```sql
CREATE TABLE node_state (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    node_id     TEXT NOT NULL,
    role        INTEGER NOT NULL DEFAULT 0,
    display_name TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    last_active INTEGER NOT NULL
);
```

Only one row exists. The `CHECK (id = 1)` constraint enforces singleton.

### 3.2 `messages` — Message Storage

```sql
CREATE TABLE messages (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    packet_id     TEXT NOT NULL UNIQUE,
    sender_id     TEXT NOT NULL,
    sender_name   TEXT NOT NULL,
    content       TEXT,
    content_type  INTEGER NOT NULL DEFAULT 0,
    encrypted     INTEGER NOT NULL DEFAULT 0,
    decrypted     INTEGER NOT NULL DEFAULT 0,
    received_at   INTEGER NOT NULL,
    decrypted_at  INTEGER
);

CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_received ON messages(received_at);
CREATE INDEX idx_messages_packet ON messages(packet_id);
```

### 3.3 `routing_entries` — Persisted Routes

```sql
CREATE TABLE routing_entries (
    destination_id  TEXT PRIMARY KEY,
    next_hop_id     TEXT NOT NULL,
    hop_count       INTEGER NOT NULL,
    route_metric    REAL NOT NULL,
    route_path      TEXT NOT NULL,
    discovered_at   INTEGER NOT NULL,
    expires_at      INTEGER NOT NULL,
    sequence_number INTEGER NOT NULL
);
```

`route_path` is stored as JSON array of Node IDs.

### 3.4 `neighbors` — Neighbor State (for Recovery)

```sql
CREATE TABLE neighbors (
    node_id         TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL,
    role            INTEGER NOT NULL,
    display_name    TEXT NOT NULL,
    last_heartbeat  INTEGER NOT NULL,
    link_quality    REAL NOT NULL,
    transport_type  TEXT NOT NULL,
    capabilities    INTEGER NOT NULL
);
```

### 3.5 `known_nodes` — Mesh Awareness

```sql
CREATE TABLE known_nodes (
    node_id       TEXT PRIMARY KEY,
    role          INTEGER NOT NULL,
    display_name  TEXT NOT NULL,
    last_seen     INTEGER NOT NULL,
    reachable     INTEGER NOT NULL DEFAULT 1,
    hop_distance  INTEGER NOT NULL
);
```

### 3.6 `keys` — Cryptographic Key Storage

```sql
CREATE TABLE keys (
    id          TEXT PRIMARY KEY,
    node_id     TEXT NOT NULL,
    key_type    TEXT NOT NULL,
    key_data    BLOB NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER
);

CREATE INDEX idx_keys_node ON keys(node_id, key_type);
```

Key types: `rsa_public`, `rsa_private`, `admin_public`.

### 3.7 `pending_packets` — Packets Awaiting Route Discovery

```sql
CREATE TABLE pending_packets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    packet_data     BLOB NOT NULL,
    destination_id  TEXT NOT NULL,
    enqueued_at     INTEGER NOT NULL,
    retry_count     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_pending_dest ON pending_packets(destination_id);
```

---

## 4. Migrations

Migration files are stored in `/database/migrations/` with the naming convention:

```
001_initial_schema.sql
002_add_pending_packets.sql
003_...
```

A `schema_version` pragma tracks the current migration state:

```sql
PRAGMA user_version = 1;
```

---

## 5. Constraints

| Constraint | Value |
|------------|-------|
| Max database size | 50 MB (soft limit, configurable) |
| Max messages stored | 10,000 (oldest evicted) |
| Max routing entries | 256 |
| Max pending packets | 64 |
| Key storage limit | 32 keys |

---

## 6. Data Lifecycle

| Data | Retention |
|------|-----------|
| Broadcast messages | 24 hours (configurable) |
| Encrypted messages | Until manually deleted (Admin) |
| Routing entries | Until expired (30s default) |
| Neighbor state | Current session only |
| Keys | Until rotated or node reset |
| Pending packets | Until delivered or timeout (30s) |

---

## 7. Security Considerations

- Private keys are stored as encrypted BLOBs (encrypted at rest with a device-derived key).
- Database file permissions should be restricted to the application only.
- No sensitive data in filenames or table names visible from file system browsing.
- WAL mode files (`.db-wal`, `.db-shm`) contain the same data and must be equally protected.

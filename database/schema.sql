-- NINE Protocol - Database Schema
-- SQLite 3
-- Version: 1

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- NODE STATE (singleton — one row)
-- ============================================================

CREATE TABLE IF NOT EXISTS node_state (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    node_id       TEXT NOT NULL,
    role          INTEGER NOT NULL DEFAULT 0,
    display_name  TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    last_active   INTEGER NOT NULL
);

-- ============================================================
-- MESSAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS messages (
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

CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_received ON messages(received_at);
CREATE INDEX IF NOT EXISTS idx_messages_packet ON messages(packet_id);

-- ============================================================
-- ROUTING ENTRIES
-- ============================================================

CREATE TABLE IF NOT EXISTS routing_entries (
    destination_id  TEXT PRIMARY KEY,
    next_hop_id     TEXT NOT NULL,
    hop_count       INTEGER NOT NULL,
    route_metric    REAL NOT NULL,
    route_path      TEXT NOT NULL,  -- JSON array of NodeIDs
    discovered_at   INTEGER NOT NULL,
    expires_at      INTEGER NOT NULL,
    sequence_number INTEGER NOT NULL
);

-- ============================================================
-- NEIGHBORS (for session recovery)
-- ============================================================

CREATE TABLE IF NOT EXISTS neighbors (
    node_id         TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL,
    role            INTEGER NOT NULL,
    display_name    TEXT NOT NULL,
    last_heartbeat  INTEGER NOT NULL,
    link_quality    REAL NOT NULL,
    transport_type  TEXT NOT NULL,
    capabilities    INTEGER NOT NULL
);

-- ============================================================
-- KNOWN NODES (mesh awareness)
-- ============================================================

CREATE TABLE IF NOT EXISTS known_nodes (
    node_id       TEXT PRIMARY KEY,
    role          INTEGER NOT NULL,
    display_name  TEXT NOT NULL,
    last_seen     INTEGER NOT NULL,
    reachable     INTEGER NOT NULL DEFAULT 1,
    hop_distance  INTEGER NOT NULL
);

-- ============================================================
-- CRYPTOGRAPHIC KEYS
-- ============================================================

CREATE TABLE IF NOT EXISTS keys (
    id          TEXT PRIMARY KEY,
    node_id     TEXT NOT NULL,
    key_type    TEXT NOT NULL,
    key_data    BLOB NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_keys_node ON keys(node_id, key_type);

-- ============================================================
-- PENDING PACKETS (awaiting route discovery)
-- ============================================================

CREATE TABLE IF NOT EXISTS pending_packets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    packet_data     BLOB NOT NULL,
    destination_id  TEXT NOT NULL,
    enqueued_at     INTEGER NOT NULL,
    retry_count     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pending_dest ON pending_packets(destination_id);

-- ============================================================
-- SCHEMA VERSION
-- ============================================================

PRAGMA user_version = 1;

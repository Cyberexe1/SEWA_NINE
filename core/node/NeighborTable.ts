/**
 * NINE Protocol — Neighbor Table
 *
 * Conforms to NINE-RFC-v0.9.1 Section 3.4 (Neighbor Table).
 * Maintains direct (1-hop) peers. Updated by heartbeats and discovery.
 */

import { type NodeID, type SessionID, type Timestamp, NodeRole, TransportType } from '../shared/Types.js';

// ─── Neighbor Entry (Immutable) ────────────────────────────────────────

export interface NeighborEntry {
  readonly nodeId: NodeID;
  readonly sessionId: SessionID;
  readonly role: NodeRole;
  readonly displayName: string;
  readonly lastHeartbeat: Timestamp;
  readonly linkQuality: number;        // 0.0 to 1.0
  readonly transportType: TransportType;
  readonly capabilities: number;
}

// ─── Neighbor Table ────────────────────────────────────────────────────

export class NeighborTable {
  private readonly entries: Map<string, NeighborEntry> = new Map();

  /**
   * Add or update a neighbor entry.
   * If the node already exists, it is replaced entirely (immutable entries).
   */
  upsert(entry: NeighborEntry): void {
    this.entries.set(entry.nodeId.toLowerCase(), entry);
  }

  /**
   * Remove a neighbor by Node ID.
   * Returns true if the neighbor existed and was removed.
   */
  remove(nodeId: NodeID): boolean {
    return this.entries.delete(nodeId.toLowerCase());
  }

  /**
   * Get a specific neighbor. Returns undefined if not found.
   */
  get(nodeId: NodeID): NeighborEntry | undefined {
    return this.entries.get(nodeId.toLowerCase());
  }

  /**
   * Get all current neighbors as an array.
   */
  getAll(): NeighborEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Check if a node is a direct neighbor.
   */
  has(nodeId: NodeID): boolean {
    return this.entries.has(nodeId.toLowerCase());
  }

  /**
   * Remove neighbors whose heartbeat is older than the timeout.
   * Returns the Node IDs of evicted neighbors.
   */
  evictStale(now: Timestamp, timeoutMs: number): NodeID[] {
    const evicted: NodeID[] = [];
    for (const [key, entry] of this.entries) {
      if ((now as number) - (entry.lastHeartbeat as number) > timeoutMs) {
        this.entries.delete(key);
        evicted.push(entry.nodeId);
      }
    }
    return evicted;
  }

  /**
   * Get the number of neighbors.
   */
  size(): number {
    return this.entries.size;
  }

  /**
   * Remove all entries.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Get neighbors filtered by role.
   */
  getByRole(role: NodeRole): NeighborEntry[] {
    return this.getAll().filter(e => e.role === role);
  }

  /**
   * Get neighbors filtered by transport type.
   */
  getByTransport(transport: TransportType): NeighborEntry[] {
    return this.getAll().filter(e => e.transportType === transport);
  }

  /**
   * Get all Node IDs as an array.
   */
  getNodeIds(): NodeID[] {
    return this.getAll().map(e => e.nodeId);
  }
}

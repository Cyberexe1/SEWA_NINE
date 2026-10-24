/**
 * NINE Protocol — Node Registry
 *
 * Tracks all known nodes in the mesh (direct neighbors and multi-hop).
 * Conforms to the "Known Nodes Table" concept from NINE-RFC-v0.9.1 Section 3.
 */

import { type NodeID, type Timestamp, NodeRole } from '../shared/Types.js';

// ─── Known Node Entry (Immutable) ─────────────────────────────────────

export interface KnownNodeEntry {
  readonly nodeId: NodeID;
  readonly role: NodeRole;
  readonly displayName: string;
  readonly lastSeen: Timestamp;
  readonly reachable: boolean;
  readonly hopDistance: number;
}

// ─── Node Registry ─────────────────────────────────────────────────────

export class NodeRegistry {
  private readonly entries: Map<string, KnownNodeEntry> = new Map();

  /**
   * Register or update a known node.
   */
  upsert(entry: KnownNodeEntry): void {
    this.entries.set(entry.nodeId.toLowerCase(), entry);
  }

  /**
   * Get a known node by ID.
   */
  get(nodeId: NodeID): KnownNodeEntry | undefined {
    return this.entries.get(nodeId.toLowerCase());
  }

  /**
   * Check if a node is known.
   */
  has(nodeId: NodeID): boolean {
    return this.entries.has(nodeId.toLowerCase());
  }

  /**
   * Get all known nodes.
   */
  getAll(): KnownNodeEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Get only reachable nodes.
   */
  getReachable(): KnownNodeEntry[] {
    return this.getAll().filter(e => e.reachable);
  }

  /**
   * Get nodes by role.
   */
  getByRole(role: NodeRole): KnownNodeEntry[] {
    return this.getAll().filter(e => e.role === role);
  }

  /**
   * Mark a node as unreachable (e.g., after ROUTE_ERROR).
   */
  markUnreachable(nodeId: NodeID): boolean {
    const key = nodeId.toLowerCase();
    const existing = this.entries.get(key);
    if (!existing) return false;
    this.entries.set(key, { ...existing, reachable: false });
    return true;
  }

  /**
   * Mark a node as reachable (e.g., after successful route discovery).
   */
  markReachable(nodeId: NodeID, hopDistance: number): boolean {
    const key = nodeId.toLowerCase();
    const existing = this.entries.get(key);
    if (!existing) return false;
    this.entries.set(key, { ...existing, reachable: true, hopDistance });
    return true;
  }

  /**
   * Remove a node from the registry.
   */
  remove(nodeId: NodeID): boolean {
    return this.entries.delete(nodeId.toLowerCase());
  }

  /**
   * Get the number of known nodes.
   */
  size(): number {
    return this.entries.size;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Find the Admin node (if known). Returns undefined if no Admin registered.
   */
  findAdmin(): KnownNodeEntry | undefined {
    return this.getAll().find(e => e.role === NodeRole.ADMIN);
  }
}

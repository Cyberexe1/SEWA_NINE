/**
 * NINE Transport — PeerID ↔ NodeID Mapper
 *
 * Bidirectional mapping between transport-level identifiers (PeerID,
 * e.g. Bluetooth MAC address) and protocol-level identifiers (NodeID,
 * 128-bit UUID). The mapping is established during the post-connect
 * handshake and cleared on disconnect or shutdown.
 *
 * Pure data structure — no I/O, no platform dependencies, fully testable.
 */

import { type PeerID, type NodeID } from '../shared/Types.js';

export class PeerIdMapper {
  private readonly peerToNode: Map<string, NodeID> = new Map();
  private readonly nodeToPeer: Map<string, PeerID> = new Map();

  /** Register a mapping between a PeerID and a NodeID. */
  register(peerId: PeerID, nodeId: NodeID): void {
    const peerKey = peerId.toLowerCase();
    const nodeKey = nodeId.toLowerCase();
    this.peerToNode.set(peerKey, nodeId);
    this.nodeToPeer.set(nodeKey, peerId);
  }

  /** Get the NodeID for a given PeerID. */
  getNodeId(peerId: PeerID): NodeID | undefined {
    return this.peerToNode.get(peerId.toLowerCase());
  }

  /** Get the PeerID for a given NodeID. */
  getPeerId(nodeId: NodeID): PeerID | undefined {
    return this.nodeToPeer.get(nodeId.toLowerCase());
  }

  /** Remove mapping by PeerID. */
  removeByPeerId(peerId: PeerID): void {
    const peerKey = peerId.toLowerCase();
    const nodeId = this.peerToNode.get(peerKey);
    this.peerToNode.delete(peerKey);
    if (nodeId) this.nodeToPeer.delete(nodeId.toLowerCase());
  }

  /** Remove mapping by NodeID. */
  removeByNodeId(nodeId: NodeID): void {
    const nodeKey = nodeId.toLowerCase();
    const peerId = this.nodeToPeer.get(nodeKey);
    this.nodeToPeer.delete(nodeKey);
    if (peerId) this.peerToNode.delete(peerId.toLowerCase());
  }

  /** Check if a PeerID has a registered mapping. */
  hasPeerId(peerId: PeerID): boolean {
    return this.peerToNode.has(peerId.toLowerCase());
  }

  /** Check if a NodeID has a registered mapping. */
  hasNodeId(nodeId: NodeID): boolean {
    return this.nodeToPeer.has(nodeId.toLowerCase());
  }

  /** Number of registered mappings. */
  size(): number {
    return this.peerToNode.size;
  }

  /** Clear all mappings. */
  clear(): void {
    this.peerToNode.clear();
    this.nodeToPeer.clear();
  }
}

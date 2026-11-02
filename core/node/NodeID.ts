/**
 * NINE Protocol — Node Identity
 *
 * Conforms to NINE-RFC-v0.9.1 Section 3.2 (Node Identity).
 * Provides generation, validation, and comparison for Node IDs and Session IDs.
 */

import { randomUUID, randomBytes } from 'node:crypto';
import { type NodeID, type SessionID } from '../shared/Types.js';

/**
 * Generate a new Node ID (128-bit UUID v4).
 * Used at first initialization. Persists across restarts.
 */
export function generateNodeId(): NodeID {
  return randomUUID() as NodeID;
}

/**
 * Generate a new Session ID (64-bit random hex string).
 * Generated fresh at every startup. Changes on restart.
 */
export function generateSessionId(): SessionID {
  return randomBytes(8).toString('hex') as SessionID;
}

/**
 * Validate that a string is a well-formed UUID v4.
 */
export function isValidNodeId(value: string): value is NodeID {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Validate that a string is a well-formed Session ID (16 hex chars).
 */
export function isValidSessionId(value: string): value is SessionID {
  return /^[0-9a-f]{16}$/i.test(value);
}

/**
 * Compare two Node IDs for equality.
 */
export function nodeIdEquals(a: NodeID, b: NodeID): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

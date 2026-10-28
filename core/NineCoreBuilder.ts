/**
 * NINE Core — Builder (Dependency Wiring)
 *
 * Responsible ONLY for constructing and wiring subsystems.
 * No protocol logic. No business logic. No routing/encryption logic.
 */

import { type NodeID, type Timestamp, NodeRole } from './shared/Types.js';
import { MeshNode } from './node/MeshNode.js';
import { KeyManager } from './security/KeyManager.js';
import { TransportManager } from './transport/TransportManager.js';
import { type ITransport } from './transport/ITransport.js';
import { NineCore } from './NineCore.js';
import { type NineConfiguration, createConfiguration } from './NineConfiguration.js';

export class NineCoreBuilder {
  private config: NineConfiguration | null = null;
  private transport: ITransport | null = null;
  private clockFn: (() => Timestamp) | null = null;
  private role: NodeRole = NodeRole.USER;
  private displayName = 'NINE-Node';
  private nodeId?: NodeID;

  /** Set node role. */
  withRole(role: NodeRole): this { this.role = role; return this; }

  /** Set display name. */
  withDisplayName(name: string): this { this.displayName = name; return this; }

  /** Set an explicit node ID (resume identity). */
  withNodeId(id: NodeID): this { this.nodeId = id; return this; }

  /** Provide a full configuration (overrides role/displayName defaults). */
  withConfiguration(config: NineConfiguration): this { this.config = config; return this; }

  /** Provide configuration overrides only. */
  withConfigOverrides(overrides: Partial<NineConfiguration>): this {
    this.config = createConfiguration(this.role, this.displayName, overrides);
    return this;
  }

  /** Inject the transport implementation. */
  withTransport(transport: ITransport): this { this.transport = transport; return this; }

  /** Inject a custom clock (for simulation). Defaults to Date.now. */
  withClock(clock: () => Timestamp): this { this.clockFn = clock; return this; }

  /** Build the NineCore instance with all subsystems wired. */
  build(): NineCore {
    if (!this.transport) throw new Error('NineCoreBuilder: transport is required');

    const config = this.config ?? createConfiguration(this.role, this.displayName, {
      nodeId: this.nodeId,
    });

    const clock = this.clockFn ?? (() => Date.now() as Timestamp);

    // Node identity
    const node = MeshNode.create({
      role: config.role,
      displayName: config.displayName,
      nodeId: config.nodeId,
    });

    // Security
    const keyManager = new KeyManager(config.sessionKeyMaxAgeMs);

    // Transport manager wraps the injected transport
    const transportManager = new TransportManager();
    transportManager.register(this.transport);

    return new NineCore({
      config,
      node,
      transportManager,
      transport: this.transport,
      keyManager,
      clock,
    });
  }
}

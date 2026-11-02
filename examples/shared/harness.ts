/**
 * NINE Examples — Shared Harness
 *
 * Builds meshes of NineCore nodes for the examples suite.
 * Uses ONLY the public NineCore API + transport injection (MockTransport).
 * No example touches internal protocol modules.
 */

import { NineCore } from '../../core/NineCore.js';
import { NineCoreBuilder } from '../../core/NineCoreBuilder.js';
import { createConfiguration } from '../../core/NineConfiguration.js';
import { MockTransport, MockMedium } from '../../core/transport/MockTransport.js';
import { VirtualClock } from '../../core/simulator/VirtualClock.js';
import { type NodeID, NodeRole } from '../../core/shared/Types.js';

export interface MeshNodeHandle {
  id: NodeID;
  name: string;
  role: NodeRole;
  core: NineCore;
  transport: MockTransport;
}

export interface MeshHarness {
  clock: VirtualClock;
  medium: MockMedium;
  nodes: MeshNodeHandle[];
  get(name: string): MeshNodeHandle;
  connect(a: string, b: string): Promise<void>;
  disconnect(a: string, b: string): Promise<void>;
  flush(): Promise<void>;
  distributeAdminKey(): void;
  shutdown(): Promise<void>;
}

function makeId(index: number): NodeID {
  const h = (index + 1).toString(16).padStart(8, '0');
  return `${h}-aaaa-4bbb-8ccc-dddddddddddd` as NodeID;
}

/** Create a mesh of NineCore nodes. Names map to A, B, C, ... unless provided. */
export async function createMesh(spec: { name: string; role?: NodeRole }[]): Promise<MeshHarness> {
  const clock = new VirtualClock(0);
  const medium = new MockMedium();
  const nodes: MeshNodeHandle[] = [];

  for (let i = 0; i < spec.length; i++) {
    const s = spec[i]!;
    const id = makeId(i);
    const role = s.role ?? NodeRole.USER;
    const transport = new MockTransport(id as unknown as any, medium, () => clock.now());
    const core = new NineCoreBuilder()
      .withConfiguration(createConfiguration(role, s.name, { nodeId: id, simulationMode: true }))
      .withTransport(transport)
      .withClock(() => clock.now())
      .build();
    await core.initialize();
    nodes.push({ id, name: s.name, role, core, transport });
  }

  const byName = new Map(nodes.map(n => [n.name, n]));

  const harness: MeshHarness = {
    clock,
    medium,
    nodes,
    get(name: string) {
      const n = byName.get(name);
      if (!n) throw new Error(`No node named ${name}`);
      return n;
    },
    async connect(a: string, b: string) {
      const na = harness.get(a); const nb = harness.get(b);
      await na.transport.connect(nb.id as unknown as any);
      await nb.transport.connect(na.id as unknown as any);
    },
    async disconnect(a: string, b: string) {
      const na = harness.get(a); const nb = harness.get(b);
      await na.core.disconnect(nb.id);
      await nb.core.disconnect(na.id);
    },
    async flush() {
      // Flush microtask + timer queue so async transport deliveries complete.
      // Disjoint dual-path routes (if any) are installed and split-sent during
      // this drain, BEFORE tick() runs — so tick only fires single-path
      // fallback for genuinely single-path topologies.
      await new Promise(resolve => setTimeout(resolve, 0));
      await new Promise(resolve => setTimeout(resolve, 0));
      for (const n of nodes) n.core.tick();
      await new Promise(resolve => setTimeout(resolve, 0));
    },
    distributeAdminKey() {
      const admin = nodes.find(n => n.role === NodeRole.ADMIN);
      if (!admin) return;
      const key = admin.core.getAdminPublicKey();
      if (!key) return;
      for (const n of nodes) {
        if (n !== admin) n.core.setAdminPublicKey(key);
      }
    },
    async shutdown() {
      for (const n of nodes) await n.core.shutdown();
    },
  };

  return harness;
}

/** Connect nodes in a linear chain: A-B-C-D... */
export async function linkLinear(h: MeshHarness): Promise<void> {
  for (let i = 0; i < h.nodes.length - 1; i++) {
    await h.connect(h.nodes[i]!.name, h.nodes[i + 1]!.name);
  }
}

/** Connect all nodes to a central node (star). First node is the center. */
export async function linkStar(h: MeshHarness): Promise<void> {
  for (let i = 1; i < h.nodes.length; i++) {
    await h.connect(h.nodes[0]!.name, h.nodes[i]!.name);
  }
}

/** Connect every node to every other node (full mesh). */
export async function linkFullMesh(h: MeshHarness): Promise<void> {
  for (let i = 0; i < h.nodes.length; i++) {
    for (let j = i + 1; j < h.nodes.length; j++) {
      await h.connect(h.nodes[i]!.name, h.nodes[j]!.name);
    }
  }
}

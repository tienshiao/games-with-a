import * as THREE from "three";
import { INK, toon } from "./toon";

// Flying popcorn: puffs that arc from one spot to another, or ride along a
// pipe. All drawn with one instanced mesh. Each calls back when it arrives.

const MAX = 300;

interface Puff {
  /** Arc: from → to with a hop. Pipe: along the curve. */
  curve: THREE.Curve<THREE.Vector3> | null;
  from: THREE.Vector3;
  to: THREE.Vector3;
  hop: number;
  t: number;
  duration: number;
  spin: THREE.Quaternion;
  spinAxis: THREE.Vector3;
  arrive: () => void;
}

export class Puffs {
  private mesh: THREE.InstancedMesh;
  private hull: THREE.InstancedMesh;
  private live: Puff[] = [];
  private m = new THREE.Matrix4();
  private p = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3(1, 1, 1);

  constructor(scene: THREE.Scene) {
    const geo = new THREE.IcosahedronGeometry(0.16, 1);
    // Lumpy: nudge each vertex in or out a little.
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const k = 0.8 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.45;
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
    }
    geo.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(geo, toon(0xfffbe8), MAX);
    const hullGeo = geo.clone();
    hullGeo.scale(1.25, 1.25, 1.25);
    this.hull = new THREE.InstancedMesh(hullGeo, INK, MAX);
    this.hull.instanceMatrix = this.mesh.instanceMatrix;
    for (const m of [this.mesh, this.hull]) {
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
  }

  /** Throw a puff from `from` to `to`, peaking `hop` metres above the line. */
  arc(from: THREE.Vector3, to: THREE.Vector3, hop: number, duration: number, arrive: () => void): void {
    this.add({ curve: null, from: from.clone(), to: to.clone(), hop, t: 0, duration, arrive });
  }

  /** Send a puff along a curve over `duration` seconds. */
  along(curve: THREE.Curve<THREE.Vector3>, duration: number, arrive: () => void): void {
    this.add({ curve, from: new THREE.Vector3(), to: new THREE.Vector3(), hop: 0, t: 0, duration, arrive });
  }

  update(dt: number): void {
    let k = 0;
    for (let i = 0; i < this.live.length; i++) {
      const puff = this.live[i];
      puff.t += dt / puff.duration;
      if (puff.t >= 1) {
        puff.arrive();
        continue;
      }
      if (puff.curve) {
        puff.curve.getPointAt(puff.t, this.p);
      } else {
        this.p.lerpVectors(puff.from, puff.to, puff.t);
        this.p.y += Math.sin(puff.t * Math.PI) * puff.hop;
      }
      this.q.setFromAxisAngle(puff.spinAxis, puff.t * 8).multiply(puff.spin);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(k, this.m);
      this.live[k++] = puff;
    }
    this.live.length = k;
    this.mesh.count = k;
    this.hull.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private add(p: Omit<Puff, "spin" | "spinAxis">): void {
    if (this.live.length >= MAX) {
      p.arrive();
      return;
    }
    this.live.push({
      ...p,
      spin: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, 0)),
      spinAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
    });
  }
}

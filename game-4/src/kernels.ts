import * as THREE from "three";
import { KERNELS, ROOM } from "./config";
import { type Box, Colliders, inBox } from "./collision";
import { INK, toon } from "./toon";

// Corn kernels: up to KERNELS.max little balls, all drawn in one go with an
// instanced mesh. Each one falls, bounces, rolls to a stop and piles up
// against the others (a spatial hash finds neighbours cheaply). The worker
// wades through them, the shovel carries them, hoppers swallow them.

const LOOSE = 1;
const CARRIED = 2;

/** A volume that swallows any kernel that falls into it. */
export interface Sink {
  box: Box;
  onKernel: () => void;
}

const HASH_SIZE = 4096;
const SUBSTEPS = 2;

export class Kernels {
  readonly mesh: THREE.InstancedMesh;
  private hull: THREE.InstancedMesh;

  private n = KERNELS.max;
  private px = new Float32Array(this.n);
  private py = new Float32Array(this.n);
  private pz = new Float32Array(this.n);
  private vx = new Float32Array(this.n);
  private vy = new Float32Array(this.n);
  private vz = new Float32Array(this.n);
  private state = new Uint8Array(this.n);
  /** Each kernel's own fixed tumble, so they don't all point the same way. */
  private spin: THREE.Quaternion[] = [];
  private free: number[] = [];

  private cellOf = new Int32Array(this.n);
  private cellStart = new Int32Array(HASH_SIZE + 1);
  private cellItems = new Int32Array(this.n);
  private cellFill = new Int32Array(HASH_SIZE);
  /** Each kernel's colour (rgb), copied into whichever draw slot it lands in. */
  private tint = new Float32Array(this.n * 3);

  /** Carried kernels, in shovel order. */
  private carried: number[] = [];
  readonly sinks: Sink[] = [];

  private tmpM = new THREE.Matrix4();
  private tmpV = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);

  constructor(
    scene: THREE.Scene,
    private colliders: Colliders
  ) {
    const r = KERNELS.radius;
    // A plump teardrop-ish kernel.
    const geo = new THREE.IcosahedronGeometry(r, 1);
    geo.scale(1, 0.8, 1.2);
    const hullGeo = geo.clone();
    hullGeo.scale(1.35, 1.35, 1.3);

    this.mesh = new THREE.InstancedMesh(geo, toon(0xffc21a), this.n);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    // The ink hull shares the kernels' matrices outright.
    this.hull = new THREE.InstancedMesh(hullGeo, INK, this.n);
    this.hull.instanceMatrix = this.mesh.instanceMatrix;
    this.hull.frustumCulled = false;
    this.hull.count = 0;
    scene.add(this.mesh, this.hull);

    // Some kernels a touch more orange than others.
    const c = new THREE.Color();
    for (let i = 0; i < this.n; i++) {
      this.spin.push(
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3)
        )
      );
      c.setHSL(0.1 + Math.random() * 0.04, 0.95, 0.5 + Math.random() * 0.08);
      c.toArray(this.tint, i * 3);
      this.mesh.setColorAt(i, c);
    }
    for (let i = this.n - 1; i >= 0; i--) this.free.push(i);
  }

  get loose(): number {
    return this.n - this.free.length - this.carried.length;
  }

  get carriedCount(): number {
    return this.carried.length;
  }

  get full(): boolean {
    return this.free.length === 0;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number): boolean {
    const i = this.free.pop();
    if (i === undefined) return false;
    this.state[i] = LOOSE;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    return true;
  }

  /**
   * Pick up loose kernels in front of the worker onto the shovel. `at` is the
   * shovel blade's spot on the floor, `facing` the worker's forward direction.
   * Returns how many came up.
   */
  scoop(at: THREE.Vector3, facing: THREE.Vector3, reach: number, capacity: number): number {
    const picks: Array<{ i: number; d: number }> = [];
    for (let i = 0; i < this.n; i++) {
      if (this.state[i] !== LOOSE || this.py[i] > 0.9) continue;
      const dx = this.px[i] - at.x;
      const dz = this.pz[i] - at.z;
      const d = Math.hypot(dx, dz);
      if (d > reach) continue;
      // Not behind the blade.
      if (dx * facing.x + dz * facing.z < -0.5) continue;
      picks.push({ i, d });
    }
    picks.sort((a, b) => a.d - b.d);
    const room = capacity - this.carried.length;
    for (const { i } of picks.slice(0, room)) {
      this.state[i] = CARRIED;
      this.carried.push(i);
    }
    return Math.min(picks.length, room);
  }

  /** Fling everything on the shovel with this velocity (each gets a little scatter). */
  toss(vx: number, vy: number, vz: number): void {
    for (const i of this.carried) {
      this.state[i] = LOOSE;
      this.vx[i] = vx + (Math.random() - 0.5) * 1.2;
      this.vy[i] = vy + (Math.random() - 0.5) * 1.2;
      this.vz[i] = vz + (Math.random() - 0.5) * 1.2;
    }
    this.carried.length = 0;
  }

  /** Lay the carried kernels in a heap on the shovel blade. */
  placeCarried(blade: THREE.Matrix4): void {
    const r = KERNELS.radius;
    this.carried.forEach((i, k) => {
      // A little mound: rings of kernels, stacked.
      const layer = Math.floor(k / 15);
      const ring = k % 15;
      const a = ring * 2.4 + layer;
      const rad = (0.08 + (ring % 5) * 0.045) * (1 - layer * 0.25);
      this.tmpV.set(Math.cos(a) * rad, r + layer * r * 1.5, Math.sin(a) * rad * 0.8).applyMatrix4(blade);
      this.px[i] = this.tmpV.x;
      this.py[i] = this.tmpV.y;
      this.pz[i] = this.tmpV.z;
      this.vx[i] = 0;
      this.vy[i] = 0;
      this.vz[i] = 0;
    });
  }

  /**
   * Step the simulation. `pusher` is the worker: kernels in their way are
   * shoved aside and kicked along at the worker's velocity.
   */
  update(dt: number, pusher: { pos: THREE.Vector3; vel: THREE.Vector3; radius: number }): void {
    const h = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) this.step(h, pusher);
    this.render();
  }

  private step(dt: number, pusher: { pos: THREE.Vector3; vel: THREE.Vector3; radius: number }): void {
    const r = KERNELS.radius;
    const g = KERNELS.gravity;
    const { px, py, pz, vx, vy, vz, state } = this;
    const pr = pusher.radius + r;

    for (let i = 0; i < this.n; i++) {
      if (state[i] !== LOOSE) continue;
      vy[i] -= g * dt;
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      pz[i] += vz[i] * dt;

      // Floor: a dull bounce, and friction that brings rolling kernels to rest.
      if (py[i] < r) {
        py[i] = r;
        if (vy[i] < 0) vy[i] = -vy[i] * 0.25;
        const f = Math.max(0, 1 - 10 * dt);
        vx[i] *= f;
        vz[i] *= f;
      }
      // Walls.
      if (px[i] < -ROOM.halfX + r) (px[i] = -ROOM.halfX + r), (vx[i] = Math.abs(vx[i]) * 0.3);
      if (px[i] > ROOM.halfX - r) (px[i] = ROOM.halfX - r), (vx[i] = -Math.abs(vx[i]) * 0.3);
      if (pz[i] < -ROOM.halfZ + r) (pz[i] = -ROOM.halfZ + r), (vz[i] = Math.abs(vz[i]) * 0.3);
      if (pz[i] > ROOM.halfZ - r) (pz[i] = ROOM.halfZ - r), (vz[i] = -Math.abs(vz[i]) * 0.3);

      // Machines: out through the shallowest side.
      for (const b of this.colliders.boxes) {
        const x0 = b.min.x - r, x1 = b.max.x + r;
        const y0 = b.min.y - r, y1 = b.max.y + r;
        const z0 = b.min.z - r, z1 = b.max.z + r;
        if (px[i] <= x0 || px[i] >= x1 || py[i] <= y0 || py[i] >= y1 || pz[i] <= z0 || pz[i] >= z1) continue;
        const dl = px[i] - x0, dr = x1 - px[i];
        const dd = py[i] - y0, du = y1 - py[i];
        const db = pz[i] - z0, df = z1 - pz[i];
        const m = Math.min(dl, dr, dd, du, db, df);
        if (m === du) {
          py[i] = y1;
          if (vy[i] < 0) vy[i] = -vy[i] * 0.2;
          const f = Math.max(0, 1 - 6 * dt);
          vx[i] *= f;
          vz[i] *= f;
        } else if (m === dl) (px[i] = x0), (vx[i] = -Math.abs(vx[i]) * 0.3);
        else if (m === dr) (px[i] = x1), (vx[i] = Math.abs(vx[i]) * 0.3);
        else if (m === db) (pz[i] = z0), (vz[i] = -Math.abs(vz[i]) * 0.3);
        else if (m === df) (pz[i] = z1), (vz[i] = Math.abs(vz[i]) * 0.3);
        else (py[i] = y0), (vy[i] = -Math.abs(vy[i]) * 0.3);
      }

      // The worker's legs plough through.
      if (py[i] < 1.4) {
        const dx = px[i] - pusher.pos.x;
        const dz = pz[i] - pusher.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < pr * pr && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const nz = dz / d;
          px[i] = pusher.pos.x + nx * pr;
          pz[i] = pusher.pos.z + nz * pr;
          const push = Math.max(0, pusher.vel.x * nx + pusher.vel.z * nz);
          vx[i] += nx * push * 0.9 + pusher.vel.x * 0.1;
          vz[i] += nz * push * 0.9 + pusher.vel.z * 0.1;
          if (push > 0.5) vy[i] += push * 0.4;
        }
      }

      // Fell into a hopper?
      for (const sink of this.sinks) {
        if (inBox(sink.box, px[i], py[i], pz[i])) {
          this.kill(i);
          sink.onKernel();
          break;
        }
      }
    }

    this.separate();
  }

  /** Push overlapping kernels apart — this is what makes them heap up. */
  private separate(): void {
    const r = KERNELS.radius;
    const d0 = r * 2;
    const inv = 1 / d0;
    const { px, py, pz, vx, vy, vz, state, cellOf, cellStart, cellItems } = this;

    cellStart.fill(0);
    for (let i = 0; i < this.n; i++) {
      if (state[i] !== LOOSE) {
        cellOf[i] = -1;
        continue;
      }
      const c = hash(Math.floor(px[i] * inv), Math.floor(py[i] * inv), Math.floor(pz[i] * inv));
      cellOf[i] = c;
      cellStart[c + 1]++;
    }
    for (let c = 0; c < HASH_SIZE; c++) cellStart[c + 1] += cellStart[c];
    const fill = this.cellFill;
    fill.set(cellStart.subarray(0, HASH_SIZE));
    for (let i = 0; i < this.n; i++) {
      const c = cellOf[i];
      if (c >= 0) cellItems[fill[c]++] = i;
    }

    for (let i = 0; i < this.n; i++) {
      if (cellOf[i] < 0) continue;
      const ix = Math.floor(px[i] * inv);
      const iy = Math.floor(py[i] * inv);
      const iz = Math.floor(pz[i] * inv);
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++)
          for (let oz = -1; oz <= 1; oz++) {
            const c = hash(ix + ox, iy + oy, iz + oz);
            for (let k = cellStart[c]; k < cellStart[c + 1]; k++) {
              const j = cellItems[k];
              if (j <= i) continue;
              const dx = px[j] - px[i];
              const dy = py[j] - py[i];
              const dz = pz[j] - pz[i];
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 >= d0 * d0 || d2 < 1e-10) continue;
              const d = Math.sqrt(d2);
              const nx = dx / d, ny = dy / d, nz = dz / d;
              const push = (d0 - d) * 0.5;
              px[i] -= nx * push;
              py[i] -= ny * push;
              pz[i] -= nz * push;
              px[j] += nx * push;
              py[j] += ny * push;
              pz[j] += nz * push;
              // Soak up the speed they hit each other with (no bouncy kernels),
              // plus a little friction so heaps hold their shape.
              const rv = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny + (vz[j] - vz[i]) * nz;
              if (rv < 0) {
                const imp = rv * 0.5;
                vx[i] += nx * imp;
                vy[i] += ny * imp;
                vz[i] += nz * imp;
                vx[j] -= nx * imp;
                vy[j] -= ny * imp;
                vz[j] -= nz * imp;
              }
              vx[i] *= 0.98;
              vz[i] *= 0.98;
              vx[j] *= 0.98;
              vz[j] *= 0.98;
            }
          }
    }
    // Don't let a heap shove kernels down through the floor.
    for (let i = 0; i < this.n; i++) if (state[i] === LOOSE && py[i] < r) py[i] = r;
  }

  private kill(i: number): void {
    this.state[i] = 0;
    this.free.push(i);
  }

  private render(): void {
    let k = 0;
    const m = this.tmpM;
    const colors = this.mesh.instanceColor!.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      if (this.state[i] === 0) continue;
      this.tmpV.set(this.px[i], this.py[i], this.pz[i]);
      m.compose(this.tmpV, this.spin[i], this.one);
      this.mesh.setMatrixAt(k, m);
      // Colours are per draw slot; copy this kernel's into slot k.
      colors[k * 3] = this.tint[i * 3];
      colors[k * 3 + 1] = this.tint[i * 3 + 1];
      colors[k * 3 + 2] = this.tint[i * 3 + 2];
      k++;
    }
    this.mesh.count = k;
    this.hull.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

function hash(x: number, y: number, z: number): number {
  return (Math.imul(x, 92837111) ^ Math.imul(y, 689287499) ^ Math.imul(z, 283923481)) & (HASH_SIZE - 1);
}

import * as THREE from "three";
import { ROOM } from "./config";

// Solid things in the factory are axis-aligned boxes. The worker is a circle on
// the floor; kernels are small balls. Both get pushed back out of any box they
// end up inside. Simple, and plenty for a room full of machines.

export interface Box {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export class Colliders {
  readonly boxes: Box[] = [];

  /** Add a solid box from its centre (on the floor unless `cy` is given) and size. */
  add(cx: number, cz: number, sx: number, sy: number, sz: number, cy = sy / 2): Box {
    const box = {
      min: new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
      max: new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2),
    };
    this.boxes.push(box);
    return box;
  }

  /** Push a walker (a circle on the floor) out of every box and keep it in the room. */
  resolveWalker(pos: THREE.Vector3, radius: number): void {
    for (const b of this.boxes) {
      // Boxes up in the air (pipes, signs) don't block walking.
      if (b.min.y > 1.2) continue;
      const nx = clamp(pos.x, b.min.x, b.max.x);
      const nz = clamp(pos.z, b.min.z, b.max.z);
      const dx = pos.x - nx;
      const dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 > radius * radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // Centre is inside the box: leave by the nearest side.
        const left = pos.x - b.min.x;
        const right = b.max.x - pos.x;
        const back = pos.z - b.min.z;
        const front = b.max.z - pos.z;
        const m = Math.min(left, right, back, front);
        if (m === left) pos.x = b.min.x - radius;
        else if (m === right) pos.x = b.max.x + radius;
        else if (m === back) pos.z = b.min.z - radius;
        else pos.z = b.max.z + radius;
      }
    }
    pos.x = clamp(pos.x, -ROOM.halfX + radius, ROOM.halfX - radius);
    pos.z = clamp(pos.z, -ROOM.halfZ + radius, ROOM.halfZ - radius);
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function inBox(b: Box, x: number, y: number, z: number): boolean {
  return x > b.min.x && x < b.max.x && y > b.min.y && y < b.max.y && z > b.min.z && z < b.max.z;
}

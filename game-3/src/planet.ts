import * as THREE from "three";
import { generateMaze, type Maze } from "./maze";

// Planet NUCLEAR, the fifth level: a little ocean planet with green islands
// and ice caps, a hedge maze on the biggest island, and the rocket waiting
// on a hill past the maze's exit.
//
// Sizes are in "blocks" of BLOCK world units, picked so the hero (about one
// and a half blocks long at its usual scale) reads like a person in a world
// made of blocks: hedges three blocks high, corridors three blocks wide, and
// a planet small enough to see curve away but big enough to get lost on.
//
// Everything lives in Three's world space with the planet's centre at the
// origin; a point on the planet is a unit direction from the centre, lifted
// to the ground by height(). The maze sits around the +y pole, on its own flat
// grid (s across, t down) mapped onto the sphere like one face of a cube map —
// angle from the pole each way, times the radius — so near the pole a grid
// unit is a world unit and the corridors stay square.

export const BLOCK = 32;
// Bigger is flatter: the radius alone sets how sharply the ground curves away.
export const PLANET_RADIUS = 4000;
export const CORRIDOR = BLOCK * 3;
export const WALL = BLOCK;
export const HEDGE_HEIGHT = BLOCK * 3;
/** One corridor and the wall beside it. */
const PITCH = CORRIDOR + WALL;

const CELL_COLS = 11;
const CELL_ROWS = 11;

/**
 * North and south, along z — so the maze, on +y with its exit toward +x,
 * sits by the equator, well clear of the ice.
 */
export const POLE = new THREE.Vector3(0, 0, 1);

// Sea level is the base radius: ground below 0 is under water. A little
// under a third of the planet is land, plus the island the maze is on.
const LAND_SHARE = 0.28;
const SEA_FLOOR = -90;
/** How high the land climbs from the beach before the hills start. */
const SHORE = 30;
/** Any lower than this and it's too wet to walk on. */
const WADE = 3;
// The island the maze and the pad are on: always land out to ISLAND, fading
// back to whatever the rest of the planet does by ISLAND_EDGE.
const ISLAND = 1500;
const ISLAND_EDGE = 2300;
const ISLAND_WOBBLE = 220;
// The ice caps: frozen over past this far toward either pole (as |z|).
const ICE_FROM = 0.8;
const ICE_FULL = 0.87;

// The maze is nearly flat, and the hills rise from just outside it.
const MAZE_HILLINESS = 0.12;
const HILL_START = 40;
const HILL_FULL = 520;
// The rocket's pad: this far past the exit, levelled off out to PAD_FLAT and
// blended back into the hills over PAD_BLEND.
const PAD_OUT = 430;
const PAD_FLAT = 110;
const PAD_BLEND = 160;

// About one tree to every 15 x 15 blocks of land, however big the planet is.
const TREE_COUNT = Math.round(
  (4 * Math.PI * PLANET_RADIUS * PLANET_RADIUS * LAND_SHARE) / (15 * 15 * BLOCK * BLOCK)
);
const TREE_TRIES = TREE_COUNT * 20;
const TREE_SPACING = 110;
/** Trunk radius at size 1, for bumping into. */
export const TREE_RADIUS = 14;

const R = PLANET_RADIUS;
const smoothstep = (lo: number, hi: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

/** One hump of land or hill: two plane waves across the sphere, multiplied. */
interface Wave {
  amp: number;
  n1: THREE.Vector3;
  k1: number;
  p1: number;
  n2: THREE.Vector3;
  k2: number;
  p2: number;
}

export interface Tree {
  dir: THREE.Vector3;
  size: number;
  /** Spin about its own trunk, so no two look the same from one side. */
  twist: number;
}

/** Product of a wave's two sines, -1 to 1. */
function wave(w: Wave, dir: THREE.Vector3): number {
  return Math.sin(w.k1 * dir.dot(w.n1) + w.p1) * Math.sin(w.k2 * dir.dot(w.n2) + w.p2);
}

function randomWaves(count: number, shortest: number, longest: number, amp: () => number): Wave[] {
  return Array.from({ length: count }, () => {
    const k = (Math.PI * 2 * R) / (shortest + Math.random() * (longest - shortest));
    return {
      amp: amp(),
      n1: randomDir(),
      k1: k * (0.8 + Math.random() * 0.4),
      p1: Math.random() * Math.PI * 2,
      n2: randomDir(),
      k2: k * (0.8 + Math.random() * 0.4),
      p2: Math.random() * Math.PI * 2,
    };
  });
}

function randomDir(out = new THREE.Vector3()): THREE.Vector3 {
  // Normalised gaussian: uniform over the sphere.
  const g = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(Math.PI * 2 * Math.random());
  return out.set(g(), g(), g()).normalize();
}

export class Planet {
  readonly maze: Maze;
  /** Size of the maze on its grid, in world units. */
  readonly width: number;
  readonly depth: number;
  /** Where the rocket drops the hero: the first cell, and the way out of it. */
  readonly start = new THREE.Vector3();
  readonly startHeading = new THREE.Vector3();
  /** The maze's way out, in grid units — a gap in the east hedge. */
  readonly exit: { s: number; t: number };
  /** Where the rocket lands to wait. */
  readonly pad = new THREE.Vector3();
  readonly trees: Tree[] = [];

  /** Where land is: big, slow swells, cut off at sea level. */
  private continents: Wave[];
  /** Raises the swells so the right share of them is above water. */
  private seaLevel = 0;
  /** Gentle hills on the land. */
  private hills: Wave[];
  /** The middle of the maze, which the home island is built round. */
  private home = new THREE.Vector3(0, 1, 0);
  private padHeight = 0;

  constructor() {
    this.maze = generateMaze(CELL_COLS, CELL_ROWS);
    const { maze } = this;
    this.width = CELL_COLS * PITCH + WALL;
    this.depth = CELL_ROWS * PITCH + WALL;

    // Knock out the east hedge beside the far corner cell.
    const exitRow = maze.rows - 2;
    maze.walls[exitRow]![maze.cols - 1] = false;
    this.exit = { s: this.width / 2, t: this.tileMid(exitRow) - this.depth / 2 };

    // A new coastline and new hills every visit. Sea level is set by sampling
    // the swells, so the planet always comes out mostly ocean.
    this.continents = randomWaves(5, R * 1.2, R * 2.6, () => 0.6 + Math.random() * 0.4);
    this.hills = randomWaves(5, 1000, 2400, () => 14 + Math.random() * 22);
    const samples = Array.from({ length: 4000 }, () => this.swell(randomDir())).sort((a, b) => a - b);
    this.seaLevel = samples[Math.floor(samples.length * (1 - LAND_SHARE))]!;

    this.fromGrid(this.exit.s + PAD_OUT, this.exit.t, this.pad);
    this.padHeight = this.baseHeight(this.pad);

    this.placeStart();
    this.placeTrees();
  }

  // ---- the grid ----------------------------------------------------------

  /** Grid units of the near edge of tile `i` (even tiles are walls). */
  private tileStart(i: number): number {
    return Math.floor(i / 2) * PITCH + (i % 2 === 1 ? WALL : 0);
  }

  private tileMid(i: number): number {
    return this.tileStart(i) + (i % 2 === 1 ? CORRIDOR : WALL) / 2;
  }

  /** Which tile a grid coordinate (measured from the maze's corner) is in. */
  private tileAt(u: number): number {
    const k = Math.floor(u / PITCH);
    return k * 2 + (u - k * PITCH >= WALL ? 1 : 0);
  }

  /** A tile's rectangle on the grid, centred on the maze. */
  tileRect(tx: number, ty: number): { s0: number; s1: number; t0: number; t1: number } {
    const s0 = this.tileStart(tx) - this.width / 2;
    const t0 = this.tileStart(ty) - this.depth / 2;
    return {
      s0,
      s1: s0 + (tx % 2 === 1 ? CORRIDOR : WALL),
      t0,
      t1: t0 + (ty % 2 === 1 ? CORRIDOR : WALL),
    };
  }

  /** Where on the sphere a grid point is, as a unit direction. */
  fromGrid(s: number, t: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.tan(s / R), 1, Math.tan(t / R)).normalize();
  }

  /** The grid point under a direction — only meaningful on the maze's side of the planet. */
  toGrid(dir: THREE.Vector3): { s: number; t: number } {
    return { s: R * Math.atan2(dir.x, dir.y), t: R * Math.atan2(dir.z, dir.y) };
  }

  /** The middle of a maze cell. */
  cellDir(cx: number, cy: number, out = new THREE.Vector3()): THREE.Vector3 {
    return this.fromGrid(
      this.tileMid(cx * 2 + 1) - this.width / 2,
      this.tileMid(cy * 2 + 1) - this.depth / 2,
      out
    );
  }

  // ---- the ground --------------------------------------------------------

  /** Ground height above the base radius under a unit direction. */
  height(dir: THREE.Vector3): number {
    const base = this.baseHeight(dir);
    const dist = Math.acos(Math.min(1, dir.dot(this.pad))) * R;
    const flat = 1 - smoothstep(PAD_FLAT, PAD_FLAT + PAD_BLEND, dist);
    return base + (this.padHeight - base) * flat;
  }

  /** The point on the ground under a direction. */
  ground(dir: THREE.Vector3, lift = 0, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(dir).multiplyScalar(R + this.height(dir) + lift);
  }

  /** Too wet to walk: the sea, and the very edge of the beach. */
  isWater(dir: THREE.Vector3): boolean {
    return this.height(dir) < WADE;
  }

  /** 0 on open land or sea, 1 on the ice caps. */
  iciness(dir: THREE.Vector3): number {
    // A wobble, so the edge of the ice isn't a straight line of latitude.
    const wobble = 0.03 * Math.sin(dir.x * 11 + dir.y * 7) + 0.02 * Math.sin(dir.y * 17 - dir.x * 5);
    return smoothstep(ICE_FROM, ICE_FULL, Math.abs(dir.dot(POLE)) + wobble);
  }

  private swell(dir: THREE.Vector3): number {
    let e = 0;
    for (const w of this.continents) e += w.amp * wave(w, dir);
    return e;
  }

  /** Above 0 on land, below it at sea. */
  private landness(dir: THREE.Vector3): number {
    const swell = this.swell(dir);
    // The home island: land however deep the sea would be, with its coast
    // pushed in and out by the same swells so it isn't a circle.
    const home = Planet.distance(dir, this.home) - swell * ISLAND_WOBBLE;
    const island = 1 - smoothstep(ISLAND, ISLAND_EDGE, home);
    // The ice caps are frozen solid, sea or not.
    return Math.max(swell - this.seaLevel, island * 0.4 - 0.1, this.iciness(dir) * 0.35 - 0.1);
  }

  private baseHeight(dir: THREE.Vector3): number {
    const e = this.landness(dir);
    if (e <= 0) return Math.max(SEA_FLOOR, e * 800);
    // Up from the beach, then hills on top — only ever up, so there are no
    // puddles inland, and flatter on the ice.
    let hills = 0;
    for (const w of this.hills) hills += w.amp * (1 + wave(w, dir)) * 0.5;
    const inland = smoothstep(0.03, 0.25, e) * (1 - 0.7 * this.iciness(dir));
    return SHORE * smoothstep(0, 0.08, e) + hills * inland * this.hilliness(dir);
  }

  /** 1 out in the hills, falling to a gentle roll under the maze. */
  hilliness(dir: THREE.Vector3): number {
    if (dir.y <= 0.3) return 1;
    const { s, t } = this.toGrid(dir);
    const edge = Math.max(Math.abs(s) - this.width / 2, Math.abs(t) - this.depth / 2);
    return MAZE_HILLINESS + (1 - MAZE_HILLINESS) * smoothstep(HILL_START, HILL_FULL, edge);
  }

  // ---- walking -----------------------------------------------------------

  /**
   * Push a circle of `radius` at `dir` out of the hedges and tree trunks it
   * overlaps, in place. Hedges are resolved on the maze grid, where they are
   * plain rectangles.
   */
  collide(dir: THREE.Vector3, radius: number): void {
    if (dir.y > 0.5) this.collideHedges(dir, radius);
    this.collideTrees(dir, radius);
  }

  private collideHedges(dir: THREE.Vector3, radius: number): void {
    let { s, t } = this.toGrid(dir);
    const hw = this.width / 2;
    const hd = this.depth / 2;
    if (Math.abs(s) > hw + radius || Math.abs(t) > hd + radius) return;

    const { maze } = this;
    for (let pass = 0; pass < 2; pass++) {
      const tx0 = Math.max(0, this.tileAt(s - radius + hw));
      const tx1 = Math.min(maze.cols - 1, this.tileAt(s + radius + hw));
      const ty0 = Math.max(0, this.tileAt(t - radius + hd));
      const ty1 = Math.min(maze.rows - 1, this.tileAt(t + radius + hd));
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (!maze.walls[ty]![tx]) continue;
          const r = this.tileRect(tx, ty);
          const cs = Math.min(r.s1, Math.max(r.s0, s));
          const ct = Math.min(r.t1, Math.max(r.t0, t));
          const ds = s - cs;
          const dt = t - ct;
          const d2 = ds * ds + dt * dt;
          if (d2 >= radius * radius) continue;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            s = cs + (ds / d) * radius;
            t = ct + (dt / d) * radius;
          } else {
            // Centre inside the hedge: out the nearest side.
            const out = [
              [r.s0 - radius - s, 0],
              [r.s1 + radius - s, 0],
              [0, r.t0 - radius - t],
              [0, r.t1 + radius - t],
            ].sort((a, b) => Math.hypot(a[0]!, a[1]!) - Math.hypot(b[0]!, b[1]!))[0]!;
            s += out[0]!;
            t += out[1]!;
          }
        }
      }
    }
    this.fromGrid(s, t, dir);
  }

  private collideTrees(dir: THREE.Vector3, radius: number): void {
    const near = Math.cos((radius + TREE_RADIUS * 2) / R);
    const push = new THREE.Vector3();
    for (const tree of this.trees) {
      if (dir.dot(tree.dir) < near) continue;
      const reach = (radius + TREE_RADIUS * tree.size) / R;
      push.subVectors(dir, tree.dir);
      const d = push.length();
      if (d >= reach) continue;
      if (d < 1e-6) push.set(1, 0, 0).projectOnPlane(tree.dir);
      dir.copy(tree.dir).addScaledVector(push.normalize(), reach).normalize();
    }
  }

  /** Arc distance between two directions, in world units along the ground. */
  static distance(a: THREE.Vector3, b: THREE.Vector3): number {
    return Math.acos(Math.min(1, Math.max(-1, a.dot(b)))) * R;
  }

  // ---- setting out -------------------------------------------------------

  private placeStart(): void {
    this.cellDir(0, 0, this.start);
    // Face down whichever corridor leads out of the first cell.
    const east = !this.maze.walls[1]![2];
    const ahead = east ? this.cellDir(1, 0) : this.cellDir(0, 1);
    this.startHeading.subVectors(ahead, this.start).projectOnPlane(this.start).normalize();
  }

  /**
   * Scattered over the green land, but never in the maze, on the beach, on
   * the ice, or on the way to the rocket.
   */
  private placeTrees(): void {
    const exitDir = this.fromGrid(this.exit.s, this.exit.t);
    const toPad = Planet.distance(exitDir, this.pad);
    for (let i = 0; i < TREE_TRIES && this.trees.length < TREE_COUNT; i++) {
      const dir = randomDir();
      if (this.hilliness(dir) < 0.85) continue;
      if (this.height(dir) < SHORE * 0.6 || this.iciness(dir) > 0.05) continue;
      if (Planet.distance(dir, this.pad) < PAD_FLAT + PAD_BLEND + 60) continue;
      // Keep a clear lane from the exit to the pad.
      if (Planet.distance(dir, exitDir) + Planet.distance(dir, this.pad) < toPad + 120) continue;
      if (this.trees.some((t) => Planet.distance(t.dir, dir) < TREE_SPACING)) continue;
      this.trees.push({ dir, size: 0.8 + Math.random() * 0.7, twist: Math.random() * Math.PI * 2 });
    }
  }
}

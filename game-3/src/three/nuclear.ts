import * as THREE from "three";
import { BLOCK, HEDGE_HEIGHT, PLANET_RADIUS, type Planet } from "../planet";

// Planet NUCLEAR's scenery: the ground, the hedge maze, the trees, the sky,
// and the glow round the planet seen from space. Unlike models.ts these are
// built straight in world space — the planet's centre is the origin and up is
// away from it — since there's no sprite underneath any of them.

const R = PLANET_RADIUS;

/** The haze far hills fade into, and the sky's colour at the horizon. */
export const NUCLEAR_HAZE = 0xd4eef6;
const SKY_RADIUS = 9000;
const STAR_RADIUS = 8500;

// Grass from the valleys up to the hilltops, the beach, the ice, the sea,
// and the maze's mown lawn.
const VALLEY = new THREE.Color(0x3f9e3a);
const HILLTOP = new THREE.Color(0x8fd957);
const SAND = new THREE.Color(0xe8d79c);
const SEABED = new THREE.Color(0xb9a77a);
const ICE = new THREE.Color(0xeef7ff);
const SEA = 0x2c84d8;
const LAWN = [new THREE.Color(0x63c64c), new THREE.Color(0x56b744)];
const HEDGE = new THREE.Color(0x2c7a33);
const HEDGE_TOP = new THREE.Color(0x3d9a3e);

function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

/**
 * Collects flat-shaded triangles, each its own colour. Every triangle is
 * wound to face `outward`, so callers don't have to think about winding.
 */
class TriangleSoup {
  private positions: number[] = [];
  private colors: number[] = [];
  private ab = new THREE.Vector3();
  private ac = new THREE.Vector3();

  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, outward: THREE.Vector3, color: THREE.Color): void {
    this.ab.subVectors(b, a);
    this.ac.subVectors(c, a);
    const flip = this.ab.cross(this.ac).dot(outward) < 0;
    for (const p of flip ? [a, c, b] : [a, b, c]) {
      this.positions.push(p.x, p.y, p.z);
      this.colors.push(color.r, color.g, color.b);
    }
  }

  quad(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    outward: THREE.Vector3,
    color: THREE.Color
  ): void {
    this.tri(a, b, c, outward, color);
    this.tri(a, c, d, outward, color);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

function soupMaterial(opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.95,
    metalness: 0,
    ...opts,
  });
}

export function planetModel(planet: Planet): THREE.Group {
  const group = new THREE.Group();
  group.add(
    terrainMesh(planet),
    seaMesh(),
    lawnMesh(planet),
    hedgeMesh(planet),
    treeMeshes(planet)
  );
  return group;
}

/** The ocean: one smooth sphere at sea level, with the land poking up through it. */
function seaMesh(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(R, 160, 80),
    new THREE.MeshStandardMaterial({ color: SEA, roughness: 0.45, metalness: 0.05 })
  );
}

// ---- ground -------------------------------------------------------------
// A cube pushed out into a sphere, each face a grid of quads, every vertex
// lifted to the hills. Equal angles across each face, so the quads come out
// near enough the same size all over.

// Quads about 65 units across, fine enough for the smallest hills.
const FACE_STEPS = Math.round((PLANET_RADIUS * Math.PI) / 2 / 65);
const FACES: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]> = [
  [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
  [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
  [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)],
  [new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)],
  [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
  [new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
];

function terrainMesh(planet: Planet): THREE.Mesh {
  const soup = new TriangleSoup();
  const rnd = seeded(5521);
  const n = FACE_STEPS;
  const color = new THREE.Color();
  const mid = new THREE.Vector3();

  for (const [normal, u, v] of FACES) {
    // The grid of points first, so neighbouring quads share them exactly.
    const grid: Array<{ p: THREE.Vector3; h: number }> = [];
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const a = Math.tan(((i / n) * 2 - 1) * (Math.PI / 4));
        const b = Math.tan(((j / n) * 2 - 1) * (Math.PI / 4));
        const dir = normal.clone().addScaledVector(u, a).addScaledVector(v, b).normalize();
        const h = planet.height(dir);
        grid.push({ p: dir.multiplyScalar(R + h), h });
      }
    }
    const at = (i: number, j: number) => grid[j * (n + 1) + i]!;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = at(i, j);
        const b = at(i + 1, j);
        const c = at(i + 1, j + 1);
        const d = at(i, j + 1);
        mid.copy(a.p).add(b.p).add(c.p).add(d.p).normalize();
        // Ice at the poles; sand along the shore; grass lighter the higher
        // it is; all with a little patchiness.
        const h = Math.min(a.h, b.h, c.h, d.h);
        const top = Math.max(a.h, b.h, c.h, d.h);
        if (planet.iciness(mid) > 0.5) color.copy(ICE);
        else if (top < 0) color.copy(SEABED);
        else if (h < 10) color.copy(SAND);
        else color.copy(VALLEY).lerp(HILLTOP, THREE.MathUtils.clamp((h - 30) / 90, 0, 1));
        color.multiplyScalar(0.94 + rnd() * 0.1);
        soup.tri(a.p, b.p, c.p, mid, color);
        color.multiplyScalar(0.97 + rnd() * 0.06);
        soup.tri(a.p, c.p, d.p, mid, color);
      }
    }
  }
  return new THREE.Mesh(soup.build(), soupMaterial());
}

/**
 * The maze's floor: one block-sized square of lawn per block, in two greens
 * like freshly mown stripes, laid just over the ground.
 */
function lawnMesh(planet: Planet): THREE.Mesh {
  const soup = new TriangleSoup();
  const cols = Math.round(planet.width / BLOCK);
  const rows = Math.round(planet.depth / BLOCK);
  const s0 = -planet.width / 2;
  const t0 = -planet.depth / 2;
  const corner = (i: number, j: number) => {
    const dir = planet.fromGrid(s0 + i * BLOCK, t0 + j * BLOCK);
    return planet.ground(dir, 1.5);
  };
  const up = new THREE.Vector3();
  const color = new THREE.Color();
  const rnd = seeded(733);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = corner(i, j);
      const c = corner(i + 1, j + 1);
      up.copy(a).add(c).normalize();
      color.copy(LAWN[(i + j) % 2]!).multiplyScalar(0.96 + rnd() * 0.08);
      soup.quad(a, corner(i + 1, j), c, corner(i, j + 1), up, color);
    }
  }
  return new THREE.Mesh(
    soup.build(),
    soupMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 })
  );
}

/**
 * Hedges built from leafy blocks: every wall tile is one to three blocks
 * long and two high, each block face its own shade of green. Faces between
 * two hedge tiles are left out, so a run of hedge reads as one solid wall.
 */
function hedgeMesh(planet: Planet): THREE.Mesh {
  const soup = new TriangleSoup();
  const { maze } = planet;
  const rnd = seeded(9029);
  const color = new THREE.Color();
  const out = new THREE.Vector3();
  const levels = Math.round(HEDGE_HEIGHT / BLOCK);
  const SINK = 14; // below the ground, so slopes never show a gap under it

  const point = (s: number, t: number, level: number) => {
    const dir = planet.fromGrid(s, t);
    const lift = level === 0 ? -SINK : level * BLOCK;
    return planet.ground(dir, lift);
  };
  const isWall = (tx: number, ty: number) => maze.walls[ty]?.[tx] ?? false;
  const shade = (base: THREE.Color) => color.copy(base).multiplyScalar(0.82 + rnd() * 0.3);

  for (let ty = 0; ty < maze.rows; ty++) {
    for (let tx = 0; tx < maze.cols; tx++) {
      if (!isWall(tx, ty)) continue;
      const r = planet.tileRect(tx, ty);
      const across = Math.round((r.s1 - r.s0) / BLOCK);
      const down = Math.round((r.t1 - r.t0) / BLOCK);
      const centre = planet.ground(planet.fromGrid((r.s0 + r.s1) / 2, (r.t0 + r.t1) / 2), HEDGE_HEIGHT / 2);

      // Top.
      for (let j = 0; j < down; j++) {
        for (let i = 0; i < across; i++) {
          const sa = r.s0 + i * BLOCK;
          const ta = r.t0 + j * BLOCK;
          const a = point(sa, ta, levels);
          out.copy(a).normalize();
          soup.quad(a, point(sa + BLOCK, ta, levels), point(sa + BLOCK, ta + BLOCK, levels), point(sa, ta + BLOCK, levels), out, shade(HEDGE_TOP));
        }
      }

      // Sides, where there's no hedge next door: [neighbour, edge start, edge end].
      const sides: Array<[boolean, [number, number], [number, number], number]> = [
        [isWall(tx, ty - 1), [r.s0, r.t0], [r.s1, r.t0], across],
        [isWall(tx, ty + 1), [r.s0, r.t1], [r.s1, r.t1], across],
        [isWall(tx - 1, ty), [r.s0, r.t0], [r.s0, r.t1], down],
        [isWall(tx + 1, ty), [r.s1, r.t0], [r.s1, r.t1], down],
      ];
      for (const [covered, [sa, ta], [sb, tb], count] of sides) {
        if (covered) continue;
        for (let i = 0; i < count; i++) {
          const f0 = i / count;
          const f1 = (i + 1) / count;
          const s0 = sa + (sb - sa) * f0;
          const t0 = ta + (tb - ta) * f0;
          const s1 = sa + (sb - sa) * f1;
          const t1 = ta + (tb - ta) * f1;
          for (let level = 0; level < levels; level++) {
            const a = point(s0, t0, level);
            const b = point(s1, t1, level);
            const c = point(s1, t1, level + 1);
            const d = point(s0, t0, level + 1);
            out.copy(a).add(c).multiplyScalar(0.5).sub(centre);
            soup.quad(a, b, c, d, out, shade(HEDGE));
          }
        }
      }
    }
  }
  return new THREE.Mesh(soup.build(), soupMaterial());
}

// ---- trees --------------------------------------------------------------
// Round low-poly trees: a trunk and two blobs of leaves, instanced so the
// whole forest is three draw calls.

function treeMeshes(planet: Planet): THREE.Group {
  const group = new THREE.Group();
  const count = planet.trees.length;
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(5, 8, 56, 6).translate(0, 28, 0),
    new THREE.MeshStandardMaterial({ color: 0x7a5032, flatShading: true, roughness: 1 }),
    count
  );
  const leaves = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(36, 0).translate(0, 74, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9 }),
    count
  );
  const crown = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(24, 0).translate(8, 108, -4),
    new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9 }),
    count
  );

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const twist = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  const rnd = seeded(1187);
  planet.trees.forEach((tree, i) => {
    q.setFromUnitVectors(yAxis, tree.dir).multiply(twist.setFromAxisAngle(yAxis, tree.twist));
    planet.ground(tree.dir, -4, pos);
    m.compose(pos, q, scale.setScalar(tree.size));
    trunk.setMatrixAt(i, m);
    leaves.setMatrixAt(i, m);
    crown.setMatrixAt(i, m);
    c.setHSL(0.27 + rnd() * 0.08, 0.6, 0.32 + rnd() * 0.12);
    leaves.setColorAt(i, c);
    crown.setColorAt(i, c.multiplyScalar(1.12));
  });
  group.add(trunk, leaves, crown);
  return group;
}

// ---- sky ----------------------------------------------------------------

/**
 * The sky as seen from the ground: a dome that fades from the haze at the
 * horizon to blue overhead, kept centred on the camera and turned so its
 * zenith is straight up wherever the hero stands — and behind it, the stars,
 * which stay put. Out in space the dome fades away and only the stars are left.
 */
export class Sky {
  readonly dome: THREE.Mesh;
  readonly stars: THREE.Points;
  private yAxis = new THREE.Vector3(0, 1, 0);

  constructor() {
    const g = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const stops: Array<[number, THREE.Color, number]> = [
      [-1, new THREE.Color(NUCLEAR_HAZE), 1],
      [0, new THREE.Color(NUCLEAR_HAZE), 1],
      [0.06, new THREE.Color(0x9fdcf2), 1],
      [0.25, new THREE.Color(0x5ea6ee), 0.97],
      [1, new THREE.Color(0x2c62c8), 0.86],
    ];
    const colors: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / SKY_RADIUS;
      let k = 1;
      while (k < stops.length - 1 && stops[k]![0] < y) k++;
      const [y0, c0, a0] = stops[k - 1]!;
      const [y1, c1, a1] = stops[k]!;
      const f = THREE.MathUtils.clamp((y - y0) / (y1 - y0), 0, 1);
      c.copy(c0).lerp(c1, f);
      colors.push(c.r, c.g, c.b, a0 + (a1 - a0) * f);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
    this.dome = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      })
    );
    this.dome.renderOrder = -2;
    this.dome.frustumCulled = false;

    const count = 1400;
    const rnd = seeded(2027);
    const starPos = new Float32Array(count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
      if (v.lengthSq() > 1 || v.lengthSq() < 0.01) {
        i--;
        continue;
      }
      v.setLength(STAR_RADIUS).toArray(starPos, i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(
      sg,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2,
        sizeAttenuation: false,
        transparent: true,
        depthWrite: false,
        fog: false,
      })
    );
    this.stars.renderOrder = -3;
    this.stars.frustumCulled = false;
  }

  /** `air` is 1 down on the ground and 0 out in space. */
  update(camera: THREE.Vector3, up: THREE.Vector3, air: number): void {
    this.dome.position.copy(camera);
    this.dome.quaternion.setFromUnitVectors(this.yAxis, up);
    (this.dome.material as THREE.MeshBasicMaterial).opacity = air;
    this.dome.visible = air > 0.01;
    this.stars.position.copy(camera);
  }
}

/**
 * The glow round the planet's rim, seen from outside: a shell a little
 * bigger than the hills, brightest where it's seen edge-on.
 */
export function atmosphereModel(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(0x8fd0ff) },
      opacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float opacity;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = 1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0);
        gl_FragColor = vec4(color, pow(rim, 2.2) * opacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(R * 1.14, 48, 32), material);
}

/** A soft dark spot on the ground under something, so it's clear where it stands. */
export function shadowModel(radius: number): THREE.Mesh {
  const n = 64;
  const cv = document.createElement("canvas");
  cv.width = cv.height = n;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  g.addColorStop(0, "rgba(0,0,0,0.42)");
  g.addColorStop(0.6, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, n, n);
  const tex = new THREE.CanvasTexture(cv);
  const disc = new THREE.Mesh(
    // Lying flat, facing +z: the scene stands it on the ground.
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -8,
    })
  );
  return disc;
}

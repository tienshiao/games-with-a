import Phaser from "phaser";
import * as THREE from "three";
import {
  ASTEROID_RADII,
  CELL,
  HERO_BODY,
  HERO_SIZE,
  PORTAL_SIZE,
  QBLOCK_SIZE,
} from "../textures";
import type { Maze } from "../maze";
import { canvasTexture, type ModelHooks } from "./world3d";

// Low-poly stand-ins for the old sprites. Each model is built in the sprite's
// own pixel units — x right, y up, z toward the camera, centred on the sprite
// centre — so a bound Phaser object's scale carries straight over.
//
// Geometry is cached and shared between every copy; materials are made fresh
// per model because each object's alpha (and the portal's tint) is its own.

const geometries = new Map<string, THREE.BufferGeometry>();
function geo(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geometries.get(key);
  if (!g) {
    g = build();
    geometries.set(key, g);
  }
  return g;
}

function mat(
  color: THREE.ColorRepresentation,
  opts: THREE.MeshStandardMaterialParameters = {}
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: 0.8,
    metalness: 0.05,
    ...opts,
  });
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(g, m);
}

function hooks(model: THREE.Object3D): ModelHooks {
  return model.userData as ModelHooks;
}

function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

/** A cylinder or cone lying along +x (Three builds them along +y). */
function alongX<T extends THREE.BufferGeometry>(g: T): T {
  g.rotateZ(-Math.PI / 2);
  return g;
}

// --- Rocket --------------------------------------------------------------
// 52 x 34, nose pointing right: metal capsule, red cone and fins, a porthole
// on the side facing the camera. It rolls about its long axis — a slow
// full spin on the menu, a gentle sway in flight — so the 3D shows.

export function rocketModel(opts: { spin?: boolean } = {}): THREE.Group {
  const group = new THREE.Group();
  const hull = new THREE.Group();
  group.add(hull);

  const metal = mat(0xdde2ea, { roughness: 0.45, metalness: 0.35 });
  const red = mat(0xd8442a, { roughness: 0.6 });
  const dark = mat(0x4a5060, { roughness: 0.5, metalness: 0.5 });

  hull.add(
    mesh(geo("rocket-body", () => alongX(new THREE.CylinderGeometry(9, 9, 32, 8)).translate(-2, 0, 0)), metal),
    mesh(geo("rocket-nose", () => alongX(new THREE.ConeGeometry(9, 12, 8)).translate(20, 0, 0)), red),
    mesh(geo("rocket-band", () => alongX(new THREE.CylinderGeometry(9.4, 9.4, 3, 8)).translate(9, 0, 0)), red),
    mesh(geo("rocket-nozzle", () => alongX(new THREE.CylinderGeometry(6.5, 5, 5, 8)).translate(-20.5, 0, 0)), dark)
  );

  // Four swept fins around the tail: top and bottom make the old silhouette,
  // the other two point at and away from the camera.
  const finGeo = geo("rocket-fin", () => {
    const s = new THREE.Shape();
    s.moveTo(-6, 7);
    s.lineTo(-19, 7);
    s.lineTo(-25, 17);
    s.lineTo(-18, 17);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 2, bevelEnabled: false }).translate(0, 0, -1);
  });
  for (let i = 0; i < 4; i++) {
    const fin = mesh(finGeo, red);
    fin.rotation.x = (i * Math.PI) / 2;
    hull.add(fin);
  }

  // Porthole: glass disc in a dark rim, just proud of the hull.
  const glass = mesh(
    geo("rocket-glass", () => new THREE.CylinderGeometry(5, 5, 2, 10).rotateX(Math.PI / 2)),
    mat(0x2aa6e0, { roughness: 0.2, metalness: 0.2, emissive: 0x0b3550 })
  );
  glass.position.set(3, 0, 8.4);
  const rim = mesh(
    geo("rocket-rim", () => new THREE.TorusGeometry(5, 1.2, 4, 10)),
    mat(0x0d4a66, { metalness: 0.4 })
  );
  rim.position.set(3, 0, 9.2);
  hull.add(glass, rim);

  let t = 0;
  hooks(group).sync = (dt) => {
    t += dt;
    hull.rotation.x = opts.spin ? t * 0.9 : Math.sin(t * 1.3) * 0.3;
  };
  return group;
}

// --- Asteroids -------------------------------------------------------------
// A jittered icosphere per variant, each face shaded a slightly different
// grey. Returned inside a wrapper so the rock can sit at a fixed random 3D
// tilt while the wrapper takes the Phaser object's in-plane angle.

export function asteroidModel(variant: number, rnd: () => number = Math.random): THREE.Group {
  const rock = mesh(
    geo(`asteroid-${variant}`, () => buildAsteroid(variant)),
    mat(0xffffff, { vertexColors: true, roughness: 1 })
  );
  rock.rotation.set(rnd() * Math.PI * 2, rnd() * Math.PI * 2, 0);
  const group = new THREE.Group();
  group.add(rock);
  return group;
}

function buildAsteroid(variant: number): THREE.BufferGeometry {
  const radius = ASTEROID_RADII[variant]!;
  const g = new THREE.IcosahedronGeometry(radius, 1);
  const rnd = seeded(2027 + variant * 7919);

  // The icosphere is unindexed: every corner is repeated once per face that
  // shares it. Key the jitter on position so all copies move together and the
  // surface stays closed.
  const pos = g.attributes.position as THREE.BufferAttribute;
  const bumps = new Map<string, number>();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let bump = bumps.get(key);
    if (bump === undefined) {
      bump = 0.8 + rnd() * 0.28;
      bumps.set(key, bump);
    }
    // Squashed a little front-to-back so it doesn't read as a perfect ball.
    pos.setXYZ(i, v.x * bump, v.y * bump, v.z * bump * 0.85);
  }

  const colors: number[] = [];
  const base = new THREE.Color(0x5b616e);
  const c = new THREE.Color();
  for (let f = 0; f < pos.count / 3; f++) {
    c.copy(base).multiplyScalar(0.8 + rnd() * 0.4);
    for (let k = 0; k < 3; k++) colors.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

// --- "?" block -------------------------------------------------------------
// A gold cube with the old painted face as a decal on the front. It rocks
// gently side to side so the cube reads as solid.

export function qblockModel(scene: Phaser.Scene): THREE.Group {
  const s = QBLOCK_SIZE - 4;
  const group = new THREE.Group();
  const cube = new THREE.Group();
  group.add(cube);

  cube.add(
    mesh(
      geo("qblock-cube", () => new THREE.BoxGeometry(s, s, s)),
      mat(0xf0a824, { roughness: 0.5, metalness: 0.3 })
    )
  );
  const face = mesh(
    geo("qblock-face", () => new THREE.PlaneGeometry(s, s)),
    new THREE.MeshStandardMaterial({
      map: canvasTexture(scene, "qblock"),
      transparent: true,
      roughness: 0.5,
      metalness: 0.2,
    })
  );
  face.position.z = s / 2 + 0.2;
  cube.add(face);

  let t = Math.random() * 10;
  hooks(group).sync = (dt) => {
    t += dt;
    cube.rotation.y = Math.sin(t * 1.6) * 0.45;
    cube.rotation.x = Math.sin(t * 1.1) * 0.15;
  };
  return group;
}

// --- Hero --------------------------------------------------------------
// The striped triangle as a prism: yellow and orange slices, bristles along
// the top, two rows of stick legs, and a big eye on the camera side.

/** Hero body depth (z), in sprite pixels. */
const HERO_DEPTH = 12;

export function heroModel(): THREE.Group {
  const group = new THREE.Group();

  // Sprite coordinates (y down, origin top-left of the 40px cell) to model.
  const half = HERO_SIZE / 2;
  const L = HERO_BODY.x - half;
  const R = HERO_BODY.x + HERO_BODY.w - half;
  const top = half - HERO_BODY.y;
  const bot = half - (HERO_BODY.y + HERO_BODY.h);
  const mid = (top + bot) / 2;
  const topAt = (x: number) => top + ((x - L) / (R - L)) * (mid - top);
  const botAt = (x: number) => bot + ((x - L) / (R - L)) * (mid - bot);

  // Body: slices across the triangle, alternating yellow and orange where the
  // old sprite had its bars.
  const yellow = mat(0xf0e020, { roughness: 0.7 });
  const orange = mat(0xe06000, { roughness: 0.7 });
  const cuts = [L];
  const stripes = 5;
  for (let i = 0; i < stripes; i++) {
    const x = L + ((i + 0.5) / stripes) * (R - L - 4);
    // Thinner than the sprite's 3px bars: these run the full height of the
    // body, so at full width they'd outweigh the yellow.
    cuts.push(x - 0.8, x + 0.8);
  }
  cuts.push(R);
  for (let i = 0; i < cuts.length - 1; i++) {
    const x0 = cuts[i]!;
    const x1 = cuts[i + 1]!;
    const slice = geo(`hero-slice-${i}`, () => {
      const s = new THREE.Shape();
      s.moveTo(x0, topAt(x0));
      s.lineTo(x1, topAt(x1));
      s.lineTo(x1, botAt(x1));
      s.lineTo(x0, botAt(x0));
      s.closePath();
      return new THREE.ExtrudeGeometry(s, { depth: HERO_DEPTH, bevelEnabled: false }).translate(
        0,
        0,
        -HERO_DEPTH / 2
      );
    });
    group.add(mesh(slice, i % 2 === 0 ? yellow : orange));
  }

  const black = mat(0x222222, { roughness: 0.9 });

  // Bristles along the top edge, leaning forward, in a row on each side.
  const rnd = seeded(7717);
  const spineGeo = geo("hero-spine", () => new THREE.ConeGeometry(0.9, 8, 4).translate(0, 4, 0));
  const spines = 6;
  for (let i = 0; i < spines; i++) {
    const t = (i + 0.4) / (spines + 0.5);
    const x = L + t * (R - L);
    const lean = Math.atan2(2 + i * 0.5, 7 + rnd() * 3);
    for (const z of [-3, 3]) {
      const spine = mesh(spineGeo, black);
      spine.position.set(x, topAt(x) - 0.5, z);
      spine.rotation.z = -lean;
      group.add(spine);
    }
  }

  // Legs hang from the bottom edge, pivoting at the hip.
  const legGeo = geo("hero-leg", () => new THREE.CylinderGeometry(0.75, 0.75, 6, 4).translate(0, -3, 0));
  const legs: Array<{ hip: THREE.Object3D; sign: number }> = [];
  const legCount = 7;
  for (let i = 0; i < legCount; i++) {
    const t = (i + 0.3) / (legCount + 0.3);
    const x = L + t * (R - L);
    for (const [row, z] of [[0, -3.5], [1, 3.5]] as const) {
      const hip = new THREE.Group();
      hip.position.set(x, botAt(x) + 0.5, z);
      hip.add(mesh(legGeo, black));
      group.add(hip);
      // Neighbouring legs, and the two rows, swing in opposite directions.
      legs.push({ hip, sign: (i + row) % 2 === 0 ? 1 : -1 });
    }
  }
  // Follows the sprite's walk frame 0–3: the old strip's two-beat gait.
  const SWING = [0, 0.45, 0, -0.45];
  const setFrame = (frame: number) => {
    const a = SWING[frame % SWING.length]!;
    for (const { hip, sign } of legs) hip.rotation.z = sign * a;
  };

  // Eye and smile on the camera side, where the sprite drew them.
  const eyeX = 27 - half;
  const eyeY = half - (HERO_BODY.y + HERO_BODY.h / 2 - 1);
  const front = HERO_DEPTH / 2;
  const eye = mesh(
    geo("hero-eye", () => new THREE.IcosahedronGeometry(3.5, 1)),
    mat(0xffffff, { roughness: 0.3 })
  );
  eye.position.set(eyeX, eyeY, front);
  const pupil = mesh(
    geo("hero-pupil", () => new THREE.IcosahedronGeometry(1.8, 0)),
    mat(0x000000, { roughness: 0.2 })
  );
  pupil.position.set(eyeX + 1, eyeY, front + 2.6);
  const smile = mesh(
    geo("hero-smile", () => new THREE.TorusGeometry(3, 0.6, 3, 8, Math.PI - 0.4)),
    black
  );
  smile.position.set(eyeX + 1, eyeY - 4, front + 0.2);
  smile.rotation.z = Math.PI + 0.2;
  group.add(eye, pupil, smile);

  setFrame(0);
  hooks(group).frame = setFrame;
  return group;
}

// --- Crystals ---------------------------------------------------------------
// The old gem outline (point on top, shoulders, flat base) spun into a
// six-sided lathe. `size` is the square the old sprite drew the gem in; the
// outline points are the same fractions of it drawCrystal() uses.

export function crystalModel(size: number): THREE.Group {
  const u = size / 30;
  const gem = mesh(
    geo(`crystal-${size}`, () =>
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0, -12 * u),
          new THREE.Vector2(8 * u, -12 * u),
          new THREE.Vector2(12 * u, 4 * u),
          new THREE.Vector2(0, 14 * u),
        ],
        6
      )
    ),
    mat(0x38d6ff, { roughness: 0.2, metalness: 0.1, emissive: 0x0d5a8a })
  );
  const group = new THREE.Group();
  group.add(gem);
  gem.rotation.x = 0.25; // tipped toward the camera so the top facets show
  hooks(group).sync = (dt) => {
    gem.rotation.y += dt * 1.2;
  };
  return group;
}

/**
 * A soft additive disc for behind a gem — the old goal sprite's halo without
 * the painted gem in the middle, which would ghost behind the 3D one.
 */
export function glowModel(size: number): THREE.Mesh {
  const tex = glowTexture();
  return mesh(
    geo(`glow-${size}`, () => new THREE.PlaneGeometry(size, size)),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
}

let glowTex: THREE.Texture | undefined;
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const n = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = n;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(n / 2, n / 2, n * 0.12, n / 2, n / 2, n / 2);
  g.addColorStop(0, "rgba(150,255,245,0.5)");
  g.addColorStop(0.55, "rgba(56,214,255,0.16)");
  g.addColorStop(1, "rgba(26,111,208,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, n, n);
  glowTex = new THREE.CanvasTexture(cv);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

// --- Portal --------------------------------------------------------------
// A faceted ring around the old painted swirl. Locked, Phaser tints the
// portal red; the ring and swirl follow that tint.

export function portalModel(scene: Phaser.Scene): THREE.Group {
  const ringMat = mat(0x7dffc8, { emissive: 0x2a8a66, roughness: 0.3, metalness: 0.3 });
  const ring = mesh(
    geo("portal-ring", () => new THREE.TorusGeometry(PORTAL_SIZE * 0.32, 3.2, 5, 14)),
    ringMat
  );
  const swirlMat = new THREE.MeshBasicMaterial({
    map: canvasTexture(scene, "portal"),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const swirl = mesh(
    geo("portal-swirl", () => new THREE.PlaneGeometry(PORTAL_SIZE, PORTAL_SIZE)),
    swirlMat
  );
  swirl.position.z = -2;

  const group = new THREE.Group();
  group.add(swirl, ring);

  const ringColor = ringMat.color.clone();
  const ringEmissive = ringMat.emissive.clone();
  const tint = new THREE.Color();
  hooks(group).tint = (tinted, color) => {
    if (tinted) {
      tint.setHex(color);
      ringMat.color.copy(ringColor).multiply(tint);
      ringMat.emissive.copy(ringEmissive).multiply(tint);
      swirlMat.color.copy(tint);
    } else {
      ringMat.color.copy(ringColor);
      ringMat.emissive.copy(ringEmissive);
      swirlMat.color.set(0xffffff);
    }
  };
  return group;
}

// --- Maze ------------------------------------------------------------------
// Walls are raised blocks and corridors are floor tiles, both instanced so the
// whole maze is two draw calls. The walls rise above the gameplay plane so the
// hero walks between them rather than over them.

export const WALL_TOP = 18;
const FLOOR_Z = -18;

export function mazeModel(maze: Maze): THREE.Group {
  const group = new THREE.Group();
  const walls: Array<[number, number]> = [];
  const floors: Array<[number, number]> = [];
  for (let ty = 0; ty < maze.rows; ty++) {
    for (let tx = 0; tx < maze.cols; tx++) {
      (maze.walls[ty]![tx] ? walls : floors).push([tx, ty]);
    }
  }

  const rnd = seeded(4242);
  const place = (
    mesh: THREE.InstancedMesh,
    tiles: Array<[number, number]>,
    z: number,
    shade: (tx: number, ty: number) => number
  ) => {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const base = (mesh.material as THREE.MeshStandardMaterial).color.clone();
    (mesh.material as THREE.MeshStandardMaterial).color.set(0xffffff);
    tiles.forEach(([tx, ty], i) => {
      m.makeTranslation(tx * CELL + CELL / 2, -(ty * CELL + CELL / 2), z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.copy(base).multiplyScalar(shade(tx, ty)));
    });
    group.add(mesh);
  };

  const wallH = WALL_TOP - FLOOR_Z;
  const wallMesh = new THREE.InstancedMesh(
    geo("maze-wall", () => new THREE.BoxGeometry(CELL, CELL, wallH)),
    mat(0x3c4564, { roughness: 0.9 }),
    walls.length
  );
  place(wallMesh, walls, FLOOR_Z + wallH / 2, () => 0.85 + rnd() * 0.3);

  const floorMesh = new THREE.InstancedMesh(
    geo("maze-floor", () => new THREE.PlaneGeometry(CELL - 2, CELL - 2)),
    mat(0x1a2140, { roughness: 1 }),
    floors.length
  );
  place(floorMesh, floors, FLOOR_Z, (tx, ty) => ((tx + ty) % 2 === 0 ? 1 : 0.8));

  return group;
}

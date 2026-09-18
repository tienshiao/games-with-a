import Phaser from "phaser";

export const ROCKET_W = 52;
export const ROCKET_H = 34;
// Every rock is drawn centred in a square canvas of this size — big enough for
// the largest variant, so one offset works for all of them.
export const ASTEROID_SIZE = 76;
// Rock shapes are pre-drawn at assorted sizes so a field doesn't look like one
// tiled rock. Index into this for both the texture key and the hitbox radius.
export const ASTEROID_RADII = [0.46, 0.40, 0.34, 0.44, 0.37, 0.30].map(
  (f) => ASTEROID_SIZE * f
);
export const ASTEROID_VARIANTS = ASTEROID_RADII.length;
export const QBLOCK_SIZE = 46;
// Maze level: one wall tile is exactly one grid square, so corridors are
// CELL wide and the whole maze can be drawn by stamping this texture.
export const CELL = 64;
export const CRYSTAL_SIZE = 30;
// The level 3 goal crystal, drawn at its own size rather than scaled up from
// CRYSTAL_SIZE so the facets and highlight stay crisp.
export const GOAL_CRYSTAL_SIZE = 132;
export const PORTAL_SIZE = 72;
// The player in levels 2 and 3, ported from game 2: a striped triangle on stick legs.
export const HERO_SIZE = 40;
export const HERO_WALK_FRAMES = 4;
// Distant scenery for level 1. Drawn big and scaled down per spawn, so the
// same texture reads well on a phone and on a desktop window.
export const BACKDROP_SIZE = 640;
export const BACKDROP_KEYS = [
  "bg-planet",
  "bg-blackhole",
  "bg-nebula",
  "bg-galaxy",
] as const;
export const SWORD_SIZE = 40;
export const SLOT_SIZE = 62;

export function createTextures(scene: Phaser.Scene) {
  if (scene.textures.exists("rocket")) return; // already created

  createRocket(scene);
  createAsteroids(scene);
  createQuestionBlock(scene);
  createSword(scene);
  createItemSlot(scene);
  createBackdrops(scene);
  createMazeWall(scene);
  createCrystal(scene);
  createGoalCrystal(scene);
  createHero(scene);
  createPortal(scene);
  createFlame(scene);
  createSpark(scene);
  createStar(scene);
}

function createRocket(scene: Phaser.Scene): void {
  const cv = scene.textures.createCanvas("rocket", ROCKET_W, ROCKET_H)!;
  const c = cv.getContext();

  // Fins (red), top and bottom near the tail
  c.fillStyle = "#d8442a";
  c.beginPath();
  c.moveTo(10, 6);
  c.lineTo(2, 0);
  c.lineTo(16, 9);
  c.closePath();
  c.fill();
  c.beginPath();
  c.moveTo(10, ROCKET_H - 6);
  c.lineTo(2, ROCKET_H);
  c.lineTo(16, ROCKET_H - 9);
  c.closePath();
  c.fill();

  // Body (rounded capsule, light metal)
  const grad = c.createLinearGradient(0, 8, 0, 26);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.5, "#d7dde6");
  grad.addColorStop(1, "#9aa3b2");
  c.fillStyle = grad;
  c.beginPath();
  c.moveTo(8, 17);
  c.quadraticCurveTo(8, 8, 22, 8);
  c.lineTo(40, 8);
  c.quadraticCurveTo(50, 17, 40, 26);
  c.lineTo(22, 26);
  c.quadraticCurveTo(8, 26, 8, 17);
  c.closePath();
  c.fill();

  // Nose cone (red)
  c.fillStyle = "#d8442a";
  c.beginPath();
  c.moveTo(40, 8);
  c.lineTo(ROCKET_W - 1, 17);
  c.lineTo(40, 26);
  c.closePath();
  c.fill();

  // Window
  c.fillStyle = "#2aa6e0";
  c.beginPath();
  c.arc(30, 17, 5, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#0d4a66";
  c.lineWidth = 1.5;
  c.stroke();
  // Window highlight
  c.fillStyle = "rgba(255,255,255,0.7)";
  c.beginPath();
  c.arc(28, 15, 1.6, 0, Math.PI * 2);
  c.fill();

  cv.refresh();
}

function createAsteroids(scene: Phaser.Scene): void {
  for (let v = 0; v < ASTEROID_VARIANTS; v++) {
    createAsteroid(scene, `asteroid-${v}`, 2027 + v * 7919, ASTEROID_RADII[v]!);
  }
}

// One lumpy rock: an irregular polygon shaded from the upper-left, with craters.
// Seeded so every run draws the same set of shapes.
function createAsteroid(
  scene: Phaser.Scene,
  key: string,
  seed: number,
  baseR: number
): void {
  const cv = scene.textures.createCanvas(key, ASTEROID_SIZE, ASTEROID_SIZE)!;
  const c = cv.getContext();
  const cx = ASTEROID_SIZE / 2;
  const cy = ASTEROID_SIZE / 2;

  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  // Outline: radius wobbles around the circle so no two rocks match.
  const points: Array<[number, number]> = [];
  const steps = 13;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = baseR * (0.86 + rnd() * 0.14);
    points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }

  c.beginPath();
  c.moveTo(points[0]![0], points[0]![1]);
  for (let i = 1; i < points.length; i++) {
    // Midpoint-quadratic smoothing keeps the silhouette rocky, not spiky.
    const [px, py] = points[i]!;
    const [nx, ny] = points[(i + 1) % points.length]!;
    c.quadraticCurveTo(px, py, (px + nx) / 2, (py + ny) / 2);
  }
  c.closePath();

  const grad = c.createRadialGradient(cx - baseR * 0.4, cy - baseR * 0.4, 2, cx, cy, baseR);
  grad.addColorStop(0, "#6b7180");
  grad.addColorStop(0.55, "#4a4f5a");
  grad.addColorStop(1, "#2b2f38");
  c.fillStyle = grad;
  c.fill();

  // Rim light along the top-left edge
  c.strokeStyle = "rgba(150,158,172,0.3)";
  c.lineWidth = 1.5;
  c.stroke();

  // Craters, clipped to the rock outline
  c.save();
  c.clip();
  const craters = Math.round(baseR * 0.28);
  for (let i = 0; i < craters; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * baseR * 0.7;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    const r = 2.5 + rnd() * 6;
    c.fillStyle = `rgba(22,25,32,${0.25 + rnd() * 0.25})`;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    // Lit lower-right lip of the crater
    c.fillStyle = "rgba(150,158,172,0.28)";
    c.beginPath();
    c.arc(x + r * 0.3, y + r * 0.3, r * 0.75, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();

  cv.refresh();
}

// The "?" block the player hits at the item wall. Bevelled gold panel with
// rivets in the corners, so it reads as a container rather than a rock.
function createQuestionBlock(scene: Phaser.Scene): void {
  const n = QBLOCK_SIZE;
  const cv = scene.textures.createCanvas("qblock", n, n)!;
  const c = cv.getContext();

  const round = (x: number, y: number, w: number, h: number, r: number) => {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  };

  // Panel body, lit from the top
  const grad = c.createLinearGradient(0, 0, 0, n);
  grad.addColorStop(0, "#ffd45e");
  grad.addColorStop(0.55, "#f0a824");
  grad.addColorStop(1, "#b56f0c");
  c.fillStyle = grad;
  round(1, 1, n - 2, n - 2, 8);
  c.fill();

  // Outer edge + inset bevel line
  c.strokeStyle = "#7a4708";
  c.lineWidth = 2;
  c.stroke();
  c.strokeStyle = "rgba(255,240,190,0.55)";
  c.lineWidth = 1.5;
  round(5, 5, n - 10, n - 10, 5);
  c.stroke();

  // Corner rivets
  c.fillStyle = "#7a4708";
  for (const [rx, ry] of [
    [8, 8],
    [n - 8, 8],
    [8, n - 8],
    [n - 8, n - 8],
  ] as const) {
    c.beginPath();
    c.arc(rx, ry, 2, 0, Math.PI * 2);
    c.fill();
  }

  // The question mark itself
  c.font = `bold ${Math.round(n * 0.62)}px monospace`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = "rgba(90,52,6,0.75)";
  c.fillText("?", n / 2, n / 2 + 3);
  c.fillStyle = "#fffdf2";
  c.fillText("?", n / 2, n / 2 + 1);

  cv.refresh();
}

// The reward: a stubby sword pointing up, sized to sit inside the item slot.
function createSword(scene: Phaser.Scene): void {
  const n = SWORD_SIZE;
  const cv = scene.textures.createCanvas("sword", n, n)!;
  const c = cv.getContext();
  const cx = n / 2;

  // Blade, brightest along its left edge
  const blade = c.createLinearGradient(cx - 5, 0, cx + 5, 0);
  blade.addColorStop(0, "#ffffff");
  blade.addColorStop(0.45, "#cdd6e4");
  blade.addColorStop(1, "#7d8899");
  c.fillStyle = blade;
  c.beginPath();
  c.moveTo(cx, 3); // tip
  c.lineTo(cx + 5, 11);
  c.lineTo(cx + 5, n * 0.6);
  c.lineTo(cx - 5, n * 0.6);
  c.lineTo(cx - 5, 11);
  c.closePath();
  c.fill();
  c.strokeStyle = "rgba(50,58,72,0.8)";
  c.lineWidth = 1;
  c.stroke();

  // Crossguard
  c.fillStyle = "#e0a32c";
  c.fillRect(cx - 13, n * 0.6, 26, 5);
  c.fillStyle = "rgba(120,78,10,0.55)";
  c.fillRect(cx - 13, n * 0.6 + 3.5, 26, 1.5);

  // Grip + pommel
  c.fillStyle = "#7a4a2a";
  c.fillRect(cx - 3, n * 0.6 + 5, 6, n * 0.22);
  c.fillStyle = "#e0a32c";
  c.beginPath();
  c.arc(cx, n * 0.6 + 5 + n * 0.22 + 2, 3.5, 0, Math.PI * 2);
  c.fill();

  cv.refresh();
}

// Empty HUD frame the collected item drops into.
function createItemSlot(scene: Phaser.Scene): void {
  const n = SLOT_SIZE;
  const cv = scene.textures.createCanvas("item-slot", n, n)!;
  const c = cv.getContext();
  const r = 10;

  c.beginPath();
  c.moveTo(2 + r, 2);
  c.arcTo(n - 2, 2, n - 2, n - 2, r);
  c.arcTo(n - 2, n - 2, 2, n - 2, r);
  c.arcTo(2, n - 2, 2, 2, r);
  c.arcTo(2, 2, n - 2, 2, r);
  c.closePath();

  c.fillStyle = "rgba(18,24,44,0.55)";
  c.fill();
  c.strokeStyle = "rgba(143,166,216,0.8)";
  c.lineWidth = 2.5;
  c.stroke();

  cv.refresh();
}

// One tile of maze wall: a bevelled steel block, lit from the top-left, with
// enough surface noise that a long run of them doesn't look like flat colour.
// ---------------------------------------------------------------------------
// Deep-space backdrops. One is picked at random per run and drifts across the
// far background. All four are drawn into the same square canvas size so the
// scene can swap between them without special-casing anything.
// ---------------------------------------------------------------------------

function createBackdrops(scene: Phaser.Scene): void {
  createRingedPlanet(scene);
  createBlackHole(scene);
  createNebula(scene);
  createGalaxy(scene);
}

// A tiny seeded RNG so every backdrop draws the same way each run.
function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

function backdropCanvas(scene: Phaser.Scene, key: string) {
  const cv = scene.textures.createCanvas(key, BACKDROP_SIZE, BACKDROP_SIZE)!;
  return { cv, c: cv.getContext(), n: BACKDROP_SIZE };
}

// Teal-and-violet gas giant with a tilted icy ring system: the ring is stroked
// once behind the planet and again in front, clipped to the lower half, so it
// reads as a band passing around the sphere.
function createRingedPlanet(scene: Phaser.Scene): void {
  const { cv, c, n } = backdropCanvas(scene, "bg-planet");
  const cx = n / 2;
  const cy = n / 2;
  const R = n * 0.27;
  const rnd = seeded(31337);

  const ring = (): void => {
    c.save();
    c.translate(cx, cy);
    c.rotate(-0.28);
    for (let i = 0; i < 7; i++) {
      const rr = R * (1.35 + i * 0.09);
      c.beginPath();
      c.ellipse(0, 0, rr, rr * 0.3, 0, 0, Math.PI * 2);
      c.strokeStyle = `rgba(${150 - i * 6},${200 - i * 4},${235 - i * 3},${
        0.5 - i * 0.045
      })`;
      c.lineWidth = i === 3 ? 2 : 5;
      c.stroke();
    }
    c.restore();
  };

  ring();

  // Planet body: lit from the upper left, banded, with a dark limb.
  const grad = c.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.1, cx, cy, R);
  grad.addColorStop(0, "#9ff0e0");
  grad.addColorStop(0.5, "#3fa3a8");
  grad.addColorStop(0.85, "#3a4f9a");
  grad.addColorStop(1, "#161a44");
  c.fillStyle = grad;
  c.beginPath();
  c.arc(cx, cy, R, 0, Math.PI * 2);
  c.fill();

  // Cloud bands, clipped to the disc
  c.save();
  c.beginPath();
  c.arc(cx, cy, R, 0, Math.PI * 2);
  c.clip();
  for (let i = 0; i < 9; i++) {
    const y = cy - R + (i + rnd() * 0.6) * (R / 4.5);
    c.fillStyle = `rgba(${20 + rnd() * 30},${45 + rnd() * 35},${85 + rnd() * 40},${
      0.08 + rnd() * 0.12
    })`;
    c.beginPath();
    c.ellipse(cx, y, R * 1.1, R * (0.05 + rnd() * 0.06), 0, 0, Math.PI * 2);
    c.fill();
  }
  // Terminator shadow down the right side
  const shade = c.createLinearGradient(cx - R, 0, cx + R, 0);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(0.6, "rgba(0,0,0,0.12)");
  shade.addColorStop(1, "rgba(0,0,0,0.6)");
  c.fillStyle = shade;
  c.fillRect(cx - R, cy - R, R * 2, R * 2);
  c.restore();

  // Front half of the ring passes over the planet.
  c.save();
  c.beginPath();
  c.rect(0, cy, n, n - cy);
  c.clip();
  ring();
  c.restore();

  // Bake the distance in: source-atop darkens only the pixels already drawn,
  // so the planet stays fully opaque (stars don't shine through it) while
  // sitting well behind the asteroids in brightness.
  c.globalCompositeOperation = "source-atop";
  c.fillStyle = "rgba(10,14,32,0.45)";
  c.fillRect(0, 0, n, n);
  c.globalCompositeOperation = "source-over";

  cv.refresh();
}

// Black hole: a lensed accretion disc around a dark core, with the classic
// bright ring at the edge of the shadow.
function createBlackHole(scene: Phaser.Scene): void {
  const { cv, c, n } = backdropCanvas(scene, "bg-blackhole");
  const cx = n / 2;
  const cy = n / 2;
  const R = n * 0.15;

  // Outer halo
  const halo = c.createRadialGradient(cx, cy, R, cx, cy, n * 0.46);
  halo.addColorStop(0, "rgba(255,170,90,0.30)");
  halo.addColorStop(0.4, "rgba(180,90,255,0.14)");
  halo.addColorStop(1, "rgba(60,30,120,0)");
  c.fillStyle = halo;
  c.fillRect(0, 0, n, n);

  // Accretion disc, squashed to a shallow ellipse
  c.save();
  c.translate(cx, cy);
  c.rotate(-0.15);
  for (let i = 0; i < 14; i++) {
    const rr = R * (1.25 + i * 0.13);
    const heat = 1 - i / 14;
    c.beginPath();
    c.ellipse(0, 0, rr, rr * 0.22, 0, 0, Math.PI * 2);
    c.strokeStyle = `rgba(255,${140 + heat * 90},${40 + heat * 60},${0.42 * heat})`;
    c.lineWidth = 4;
    c.stroke();
  }
  c.restore();

  // Photon ring, then the shadow itself
  c.strokeStyle = "rgba(255,225,180,0.9)";
  c.lineWidth = 3;
  c.beginPath();
  c.arc(cx, cy, R * 1.06, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = "#000000";
  c.beginPath();
  c.arc(cx, cy, R, 0, Math.PI * 2);
  c.fill();

  // The near side of the disc crosses in front of the shadow.
  c.save();
  c.beginPath();
  c.rect(0, cy, n, n - cy);
  c.clip();
  c.translate(cx, cy);
  c.rotate(-0.15);
  for (let i = 0; i < 14; i++) {
    const rr = R * (1.25 + i * 0.13);
    const heat = 1 - i / 14;
    c.beginPath();
    c.ellipse(0, 0, rr, rr * 0.22, 0, 0, Math.PI * 2);
    c.strokeStyle = `rgba(255,${150 + heat * 90},${60 + heat * 60},${0.5 * heat})`;
    c.lineWidth = 4;
    c.stroke();
  }
  c.restore();

  cv.refresh();
}

// Nebula: overlapping additive gas clouds with a scatter of stars inside.
function createNebula(scene: Phaser.Scene): void {
  const { cv, c, n } = backdropCanvas(scene, "bg-nebula");
  const rnd = seeded(90210);

  c.globalCompositeOperation = "lighter";
  const clouds: Array<[string, string]> = [
    ["rgba(255,80,160,0.26)", "rgba(255,80,160,0)"],
    ["rgba(90,120,255,0.24)", "rgba(90,120,255,0)"],
    ["rgba(60,220,220,0.18)", "rgba(60,220,220,0)"],
    ["rgba(190,90,255,0.22)", "rgba(190,90,255,0)"],
  ];
  // Each blob is a stretched, rotated ellipse. Circles stacked on circles read
  // as bokeh; elongated wisps at assorted angles read as gas.
  for (let i = 0; i < 30; i++) {
    const [from, to] = clouds[i % clouds.length]!;
    const x = n * (0.2 + rnd() * 0.6);
    const y = n * (0.24 + rnd() * 0.52);
    const r = n * (0.14 + rnd() * 0.2);
    const aspect = 0.3 + rnd() * 0.5;
    c.save();
    c.translate(x, y);
    c.rotate(rnd() * Math.PI);
    c.scale(1, aspect);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, from);
    g.addColorStop(0.55, from.replace(/[\d.]+\)$/, "0.06)"));
    g.addColorStop(1, to);
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  // Bright knots where the gas is densest
  for (let i = 0; i < 5; i++) {
    const x = n * (0.3 + rnd() * 0.4);
    const y = n * (0.3 + rnd() * 0.4);
    const r = n * (0.03 + rnd() * 0.05);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,235,245,0.5)");
    g.addColorStop(1, "rgba(255,120,200,0)");
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }

  // Embedded stars
  for (let i = 0; i < 60; i++) {
    const x = n * (0.15 + rnd() * 0.7);
    const y = n * (0.2 + rnd() * 0.6);
    const r = 0.6 + rnd() * 1.6;
    c.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }

  c.globalCompositeOperation = "source-over";
  cv.refresh();
}

// Spiral galaxy seen at an angle: a bright core with two arms of scattered
// stars, the whole thing squashed and tilted for perspective.
function createGalaxy(scene: Phaser.Scene): void {
  const { cv, c, n } = backdropCanvas(scene, "bg-galaxy");
  const cx = n / 2;
  const cy = n / 2;
  const R = n * 0.42;
  const rnd = seeded(777001);

  c.save();
  c.translate(cx, cy);
  c.rotate(-0.4);
  c.scale(1, 0.42); // viewed near edge-on
  c.globalCompositeOperation = "lighter";

  // Faint disc haze
  const haze = c.createRadialGradient(0, 0, 0, 0, 0, R);
  haze.addColorStop(0, "rgba(255,240,200,0.35)");
  haze.addColorStop(0.35, "rgba(150,170,255,0.16)");
  haze.addColorStop(1, "rgba(60,80,180,0)");
  c.fillStyle = haze;
  c.beginPath();
  c.arc(0, 0, R, 0, Math.PI * 2);
  c.fill();

  // Two logarithmic arms of stars. The winding is what makes it read as a
  // spiral rather than a ring, so the arms wrap nearly two full turns.
  for (let arm = 0; arm < 2; arm++) {
    const offset = arm * Math.PI;
    for (let i = 0; i < 620; i++) {
      const t = i / 620;
      const a = offset + t * Math.PI * 3.6;
      const r = R * (0.1 + t * 0.9);
      const jitter = (rnd() - 0.5) * R * 0.1 * (0.4 + t);
      const x = Math.cos(a) * r + jitter;
      const y = Math.sin(a) * r + (rnd() - 0.5) * R * 0.1 * (0.4 + t);
      const alpha = (1 - t) * 0.55 + 0.1;
      c.fillStyle =
        rnd() < 0.22
          ? `rgba(255,190,150,${alpha})`
          : `rgba(200,225,255,${alpha})`;
      c.beginPath();
      c.arc(x, y, 0.7 + rnd() * 1.5, 0, Math.PI * 2);
      c.fill();
    }
  }

  // Core bulge, drawn last so it stays the brightest thing
  const core = c.createRadialGradient(0, 0, 0, 0, 0, R * 0.3);
  core.addColorStop(0, "rgba(255,250,225,0.95)");
  core.addColorStop(0.4, "rgba(255,215,150,0.5)");
  core.addColorStop(1, "rgba(255,180,90,0)");
  c.fillStyle = core;
  c.beginPath();
  c.arc(0, 0, R * 0.3, 0, Math.PI * 2);
  c.fill();

  c.restore();
  cv.refresh();
}

function createMazeWall(scene: Phaser.Scene): void {
  const n = CELL;
  const cv = scene.textures.createCanvas("maze-wall", n, n)!;
  const c = cv.getContext();

  c.fillStyle = "#39415c";
  c.fillRect(0, 0, n, n);

  const face = c.createLinearGradient(0, 0, 0, n);
  face.addColorStop(0, "#4a5474");
  face.addColorStop(0.6, "#333c56");
  face.addColorStop(1, "#242b40");
  c.fillStyle = face;
  c.fillRect(2, 2, n - 4, n - 4);

  // Bevel: light along the top/left, shadow along the bottom/right.
  c.strokeStyle = "rgba(150,175,230,0.35)";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(2, n - 2);
  c.lineTo(2, 2);
  c.lineTo(n - 2, 2);
  c.stroke();
  c.strokeStyle = "rgba(8,12,24,0.55)";
  c.beginPath();
  c.moveTo(n - 2, 2);
  c.lineTo(n - 2, n - 2);
  c.lineTo(2, n - 2);
  c.stroke();

  // Panel seams + rivets, seeded so every tile is identical and tiles cleanly.
  let seed = 4242;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  c.strokeStyle = "rgba(12,18,34,0.5)";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(2, n / 2);
  c.lineTo(n - 2, n / 2);
  c.stroke();
  c.fillStyle = "rgba(150,175,230,0.18)";
  for (let i = 0; i < 10; i++) {
    c.beginPath();
    c.arc(4 + rnd() * (n - 8), 4 + rnd() * (n - 8), 1 + rnd() * 1.6, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = "rgba(120,150,210,0.5)";
  for (const [rx, ry] of [
    [8, 8],
    [n - 8, 8],
    [8, n - 8],
    [n - 8, n - 8],
  ] as const) {
    c.beginPath();
    c.arc(rx, ry, 2, 0, Math.PI * 2);
    c.fill();
  }

  cv.refresh();
}

// The pickup scattered through the maze: a cut gem with a bright core.
function createCrystal(scene: Phaser.Scene): void {
  const cv = scene.textures.createCanvas("crystal", CRYSTAL_SIZE, CRYSTAL_SIZE)!;
  drawCrystal(cv.getContext(), CRYSTAL_SIZE);
  cv.refresh();
}

// Same gem, drawn big and sitting in its own glow — the level 3 goal.
function createGoalCrystal(scene: Phaser.Scene): void {
  const n = GOAL_CRYSTAL_SIZE;
  const cv = scene.textures.createCanvas("crystal-goal", n, n)!;
  const c = cv.getContext();
  const cx = n / 2;

  const glow = c.createRadialGradient(cx, cx, n * 0.12, cx, cx, cx);
  glow.addColorStop(0, "rgba(150,255,245,0.5)");
  glow.addColorStop(0.55, "rgba(56,214,255,0.16)");
  glow.addColorStop(1, "rgba(26,111,208,0)");
  c.fillStyle = glow;
  c.fillRect(0, 0, n, n);

  // The gem itself fills the middle ~62%, leaving the rest to the halo.
  const gem = n * 0.62;
  c.save();
  c.translate((n - gem) / 2, (n - gem) / 2);
  drawCrystal(c, gem);
  c.restore();

  cv.refresh();
}

// Six-sided gem, centred in a box of `n` pixels. All the offsets are scaled off
// a 30px reference so the shape reads the same tiny in the maze and huge as the
// level 3 goal.
function drawCrystal(c: CanvasRenderingContext2D, n: number): void {
  const cx = n / 2;
  const u = n / 30;

  const body = c.createLinearGradient(0, 0, n, n);
  body.addColorStop(0, "#b6fff2");
  body.addColorStop(0.5, "#38d6ff");
  body.addColorStop(1, "#1a6fd0");
  c.fillStyle = body;
  c.beginPath();
  c.moveTo(cx, u);
  c.lineTo(n - 3 * u, n * 0.36);
  c.lineTo(n - 7 * u, n - 3 * u);
  c.lineTo(7 * u, n - 3 * u);
  c.lineTo(3 * u, n * 0.36);
  c.closePath();
  c.fill();
  c.strokeStyle = "rgba(8,40,80,0.8)";
  c.lineWidth = 1.5 * u;
  c.stroke();

  // Facets
  c.strokeStyle = "rgba(255,255,255,0.55)";
  c.lineWidth = 1 * u;
  c.beginPath();
  c.moveTo(cx, u);
  c.lineTo(cx, n - 3 * u);
  c.moveTo(3 * u, n * 0.36);
  c.lineTo(n - 3 * u, n * 0.36);
  c.stroke();

  // Highlight
  c.fillStyle = "rgba(255,255,255,0.75)";
  c.beginPath();
  c.moveTo(cx - u, 4 * u);
  c.lineTo(cx - 6 * u, n * 0.36);
  c.lineTo(cx - u, n * 0.36);
  c.closePath();
  c.fill();
}

// The maze exit: a glowing ring gate. Drawn bright; the scene tints it dark
// while it's still locked.
function createPortal(scene: Phaser.Scene): void {
  const n = PORTAL_SIZE;
  const cv = scene.textures.createCanvas("portal", n, n)!;
  const c = cv.getContext();
  const cx = n / 2;

  // Outer glow
  const glow = c.createRadialGradient(cx, cx, n * 0.18, cx, cx, cx);
  glow.addColorStop(0, "rgba(120,255,200,0.55)");
  glow.addColorStop(0.7, "rgba(60,200,255,0.18)");
  glow.addColorStop(1, "rgba(40,120,255,0)");
  c.fillStyle = glow;
  c.fillRect(0, 0, n, n);

  // Ring
  c.strokeStyle = "#7dffc8";
  c.lineWidth = 5;
  c.beginPath();
  c.arc(cx, cx, n * 0.32, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = "rgba(255,255,255,0.85)";
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(cx, cx, n * 0.32, 0, Math.PI * 2);
  c.stroke();

  // Swirling interior
  const inner = c.createRadialGradient(cx, cx, 2, cx, cx, n * 0.3);
  inner.addColorStop(0, "rgba(255,255,255,0.95)");
  inner.addColorStop(0.45, "rgba(90,220,255,0.6)");
  inner.addColorStop(1, "rgba(30,60,160,0.25)");
  c.fillStyle = inner;
  c.beginPath();
  c.arc(cx, cx, n * 0.3, 0, Math.PI * 2);
  c.fill();

  cv.refresh();
}

// --- Hero --------------------------------------------------------------
// The striped triangle from game 2. Same construction — yellow body, orange
// bars, stick legs, one big eye — redrawn on a 40px cell (game 2 used 32) so
// the top spines and the legs fit inside the frame instead of clipping.
//
// Registered as a HERO_WALK_FRAMES-frame strip; frame 0 doubles as the idle
// pose. The hero always faces right, so the scene flips it to walk left.
// The "hero-walk" animation is registered here too — animations are global,
// so the maze and the crystal level share it.
function createHero(scene: Phaser.Scene): void {
  const n = HERO_SIZE;
  const cv = scene.textures.createCanvas("hero", n * HERO_WALK_FRAMES, n)!;
  const c = cv.getContext();
  for (let f = 0; f < HERO_WALK_FRAMES; f++) drawHero(c, f * n, f);
  cv.refresh();

  const tex = scene.textures.get("hero");
  for (let f = 0; f < HERO_WALK_FRAMES; f++) tex.add(f, 0, f * n, 0, n, n);

  if (scene.anims.exists("hero-walk")) return;
  scene.anims.create({
    key: "hero-walk",
    frames: scene.anims.generateFrameNumbers("hero", {
      start: 0,
      end: HERO_WALK_FRAMES - 1,
    }),
    frameRate: 10,
    repeat: -1,
  });
}

// The triangle itself, inside the HERO_SIZE cell — the spines and legs stick
// out past it. Exported so the scene's hitbox follows the drawing.
export const HERO_BODY = { x: 7, y: 12, w: 28, h: 18 } as const;

const HERO_LEFT_X = HERO_BODY.x;
const HERO_RIGHT_X = HERO_BODY.x + HERO_BODY.w;
const HERO_TOP_Y = HERO_BODY.y;
const HERO_BOT_Y = HERO_BODY.y + HERO_BODY.h;

function drawHero(c: CanvasRenderingContext2D, ox: number, frame: number): void {
  drawHeroSpines(c, ox);
  drawHeroBody(c, ox);
  drawHeroFace(c, ox);
  drawHeroLegs(c, ox, frame);
}

// Triangle pointing right: tall left edge, single point on the right.
function drawHeroBody(c: CanvasRenderingContext2D, ox: number): void {
  const leftX = ox + HERO_LEFT_X;
  const rightX = ox + HERO_RIGHT_X;
  const midY = (HERO_TOP_Y + HERO_BOT_Y) / 2;

  c.fillStyle = "#f0e020";
  c.beginPath();
  c.moveTo(leftX, HERO_TOP_Y);
  c.lineTo(rightX, midY);
  c.lineTo(leftX, HERO_BOT_Y);
  c.closePath();
  c.fill();

  // Vertical bars, each cut to the height of the triangle at that x.
  c.fillStyle = "#e06000";
  const stripes = 5;
  for (let i = 0; i < stripes; i++) {
    const t = (i + 0.5) / stripes;
    const x = leftX + t * (rightX - leftX - 4);
    const halfH = ((1 - t) * (HERO_BOT_Y - HERO_TOP_Y)) / 2;
    const h = halfH * 1.2;
    if (h > 2) c.fillRect(x - 1, midY - halfH * 0.6 + 1, 3, h - 2);
  }

  c.strokeStyle = "#000000";
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(leftX, HERO_TOP_Y);
  c.lineTo(rightX, midY);
  c.lineTo(leftX, HERO_BOT_Y);
  c.closePath();
  c.stroke();
}

// Bristles along the top edge, angling up and to the right. Seeded so every
// run draws the same hero (game 2 used Math.random here).
function drawHeroSpines(c: CanvasRenderingContext2D, ox: number): void {
  const leftX = ox + HERO_LEFT_X;
  const rightX = ox + HERO_RIGHT_X;
  const midY = (HERO_TOP_Y + HERO_BOT_Y) / 2;
  const rnd = seeded(7717);

  c.strokeStyle = "#222222";
  c.lineWidth = 1.5;
  const count = 6;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.4) / (count + 0.5);
    const baseX = leftX + t * (rightX - leftX);
    const baseY = HERO_TOP_Y + t * (midY - HERO_TOP_Y);
    c.beginPath();
    c.moveTo(baseX, baseY);
    c.lineTo(baseX + 2 + i * 0.5, baseY - 7 - rnd() * 3);
    c.stroke();
  }
}

// Stick legs under the bottom edge; alternating ones swing per frame.
function drawHeroLegs(c: CanvasRenderingContext2D, ox: number, frame: number): void {
  const leftX = ox + HERO_LEFT_X;
  const rightX = ox + HERO_RIGHT_X;
  const midY = (HERO_TOP_Y + HERO_BOT_Y) / 2;

  c.strokeStyle = "#222222";
  c.lineWidth = 1.5;
  const count = 7;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.3) / (count + 0.3);
    const baseX = leftX + t * (rightX - leftX);
    const baseY = HERO_BOT_Y + t * (midY - HERO_BOT_Y);
    // Four frames of a two-beat gait: legs swing out, back, out the other way.
    const swing = (i % 2 === 0 ? 1 : -1) * [0, 2.5, 0, -2.5][frame]!;
    c.beginPath();
    c.moveTo(baseX, baseY);
    c.lineTo(baseX + swing, baseY + 5 + Math.abs(swing) * 0.5);
    c.stroke();
  }
}

// One big eye up front, with a smile under it.
function drawHeroFace(c: CanvasRenderingContext2D, ox: number): void {
  const midY = (HERO_TOP_Y + HERO_BOT_Y) / 2;
  const eyeX = ox + 27;
  const eyeY = midY - 1;
  const eyeR = 3.5;

  c.fillStyle = "#ffffff";
  c.beginPath();
  c.arc(eyeX, eyeY, eyeR, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#000000";
  c.lineWidth = 1;
  c.stroke();

  c.fillStyle = "#000000";
  c.beginPath();
  c.arc(eyeX + 1, eyeY, 1.8, 0, Math.PI * 2);
  c.fill();

  c.fillStyle = "#ffffff";
  c.beginPath();
  c.arc(eyeX + 2, eyeY - 1.5, 1, 0, Math.PI * 2);
  c.fill();

  c.strokeStyle = "#000000";
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(eyeX + 1, eyeY + 4, 3, 0.2, Math.PI - 0.2);
  c.stroke();
}

function createFlame(scene: Phaser.Scene): void {
  const size = 18;
  const cv = scene.textures.createCanvas("flame", size, size)!;
  const c = cv.getContext();
  const grad = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,210,1)");
  grad.addColorStop(0.4, "rgba(255,170,40,0.9)");
  grad.addColorStop(1, "rgba(255,90,20,0)");
  c.fillStyle = grad;
  c.fillRect(0, 0, size, size);
  cv.refresh();
}

function createSpark(scene: Phaser.Scene): void {
  const size = 12;
  const cv = scene.textures.createCanvas("spark", size, size)!;
  const c = cv.getContext();
  const grad = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,240,200,1)");
  grad.addColorStop(0.5, "rgba(255,140,60,0.95)");
  grad.addColorStop(1, "rgba(200,40,20,0)");
  c.fillStyle = grad;
  c.fillRect(0, 0, size, size);
  cv.refresh();
}

function createStar(scene: Phaser.Scene): void {
  const size = 4;
  const cv = scene.textures.createCanvas("star", size, size)!;
  const c = cv.getContext();
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  c.fill();
  cv.refresh();
}

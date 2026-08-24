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

export function createTextures(scene: Phaser.Scene) {
  if (scene.textures.exists("rocket")) return; // already created

  createRocket(scene);
  createAsteroids(scene);
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

import Phaser from "phaser";
import { BACKDROP_KEYS, BACKDROP_SIZE } from "./textures";

interface Layer {
  stars: Phaser.GameObjects.Image[];
  speed: number;
}

// A scrolling multi-layer starfield for depth. Each layer moves left at a
// different speed (farther = slower). Reads the scene's live size so it works
// under RESIZE scaling; stars wrap across whatever the current width is.
export class Starfield {
  private scene: Phaser.Scene;
  private layers: Layer[] = [];

  constructor(scene: Phaser.Scene, baseSpeed = 30) {
    this.scene = scene;
    const w = scene.scale.width;
    const h = scene.scale.height;

    const specs = [
      { count: 40, speed: baseSpeed * 0.3, scale: 0.6, alpha: 0.5 },
      { count: 30, speed: baseSpeed * 0.7, scale: 1.0, alpha: 0.75 },
      { count: 16, speed: baseSpeed * 1.2, scale: 1.6, alpha: 1.0 },
    ];

    let seed = 9001;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (const spec of specs) {
      const stars: Phaser.GameObjects.Image[] = [];
      for (let i = 0; i < spec.count; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const star = scene.add
          .image(x, y, "star")
          .setScale(spec.scale)
          .setAlpha(spec.alpha * (0.5 + rnd() * 0.5))
          .setScrollFactor(0)
          .setDepth(-10);
        stars.push(star);
      }
      this.layers.push({ stars, speed: spec.speed });
    }
  }

  update(delta: number): void {
    const dt = delta / 1000;
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    for (const layer of this.layers) {
      for (const star of layer.stars) {
        star.x -= layer.speed * dt;
        if (star.x < -4) {
          // Re-enter from the right at a fresh height so a resized/larger
          // window fills in over time.
          star.x = w + 4;
          star.y = Math.random() * h;
        }
      }
    }
  }
}


// Per-type framing. Distant objects are big and dim; a nebula spreads wider and
// sits further back than a planet, which is a solid, closer thing.
const BACKDROP_STYLE: Record<
  (typeof BACKDROP_KEYS)[number],
  { height: [number, number]; alpha: [number, number] }
> = {
  // Planet and black hole are solid objects — near-opaque, or stars show
  // through the disc and the event horizon and they read as ghosts. The gas
  // clouds stay translucent, which is what they should look like.
  "bg-planet": { height: [0.45, 0.8], alpha: [0.82, 0.95] },
  "bg-blackhole": { height: [0.4, 0.7], alpha: [0.85, 0.95] },
  "bg-nebula": { height: [0.7, 1.15], alpha: [0.35, 0.5] },
  "bg-galaxy": { height: [0.6, 1.0], alpha: [0.45, 0.62] },
};

/**
 * One piece of far-away scenery — a ringed planet, a black hole, a nebula or a
 * spiral galaxy — chosen at random and drifting slowly across the background.
 * It sits behind the starfield and moves far slower than the slowest star
 * layer, which is what sells the distance. When one leaves the screen a
 * different one drifts in behind it.
 */
export class Backdrop {
  private scene: Phaser.Scene;
  private obj?: Phaser.GameObjects.Image;
  private speed = 0;
  private lastKey?: string;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.spawn(true);
  }

  private spawn(initial: boolean): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;

    // Don't repeat the object that just drifted off.
    const choices = BACKDROP_KEYS.filter((k) => k !== this.lastKey);
    const key = Phaser.Utils.Array.GetRandom([...choices]);
    this.lastKey = key;
    const style = BACKDROP_STYLE[key];

    const target = h * Phaser.Math.FloatBetween(style.height[0], style.height[1]);
    const scale = target / BACKDROP_SIZE;
    // On a first spawn it may already be partly on screen, so a run doesn't
    // always open on empty space; later ones always enter from the right.
    const x = initial
      ? Phaser.Math.Between(Math.round(w * 0.25), Math.round(w * 1.1))
      : w + (BACKDROP_SIZE * scale) / 2;

    this.obj = this.scene.add
      .image(x, Phaser.Math.Between(Math.round(h * 0.2), Math.round(h * 0.75)), key)
      .setScale(scale)
      .setAlpha(Phaser.Math.FloatBetween(style.alpha[0], style.alpha[1]))
      .setAngle(Phaser.Math.Between(-12, 12))
      .setScrollFactor(0)
      .setDepth(-20); // behind every star layer

    // Slower than the slowest stars — parallax reads as "very far away".
    this.speed = Phaser.Math.FloatBetween(5, 11);
  }

  update(delta: number): void {
    if (!this.obj) return;
    this.obj.x -= this.speed * (delta / 1000);
    if (this.obj.x < -this.obj.displayWidth / 2) {
      this.obj.destroy();
      this.obj = undefined;
      this.spawn(false);
    }
  }
}

import Phaser from "phaser";

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

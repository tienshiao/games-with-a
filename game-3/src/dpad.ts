import Phaser from "phaser";

// An on-screen D-pad for touch screens, laid out like Minecraft's: four arrow
// buttons in a cross at the bottom left of the screen. And like Minecraft's,
// while forward (or back) is held a diagonal appears either side of it, so one
// thumb can slide across and walk and turn at the same time.
//
// The pad is a 3x3 grid of cells numbered along the rows:
//
//   0 1 2      ↖ ↑ ↗
//   3 4 5      ←   →
//   6 7 8      ↙ ↓ ↘
//
// It polls the pointers rather than listening for events, so a thumb that
// slides from one button to the next is picked up without lifting.

const MARGIN = 18;
const GAP = 4;
/** Unit direction each cell's arrow points, in screen coordinates. */
const ARROWS: Record<number, [number, number]> = {
  0: [-1, -1],
  1: [0, -1],
  2: [1, -1],
  3: [-1, 0],
  5: [1, 0],
  6: [-1, 1],
  7: [0, 1],
  8: [1, 1],
};

export class DPad {
  up = false;
  down = false;
  left = false;
  right = false;

  private scene: Phaser.Scene;
  private gfx: Phaser.GameObjects.Graphics;
  private button = 0;
  private x0 = 0;
  private y0 = 0;
  private held = new Set<number>();
  private drawn = "";

  /** Whether this device has a touch screen to put the pad on. */
  static wanted(scene: Phaser.Scene): boolean {
    return scene.sys.game.device.input.touch;
  }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(30);

    // Phaser starts with the mouse and one touch. A second touch lets the
    // other hand press a turn button while this one holds forward.
    const pointers = scene.input.manager.pointersTotal;
    if (pointers < 3) scene.input.addPointer(3 - pointers);

    this.layout();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    });
  }

  private get step(): number {
    return this.button + GAP;
  }

  private layout(): void {
    const { width, height } = this.scene.scale;
    this.button = Phaser.Math.Clamp(Math.round(Math.min(width, height) * 0.12), 46, 76);
    this.x0 = MARGIN;
    this.y0 = height - MARGIN - this.step * 3 + GAP;
    this.drawn = "";
    this.draw();
  }

  private update(): void {
    const hit = new Set<number>();
    for (const pointer of this.scene.input.manager.pointers) {
      if (!pointer.isDown) continue;
      const col = Math.floor((pointer.x - this.x0) / this.step);
      const row = Math.floor((pointer.y - this.y0) / this.step);
      if (col >= 0 && col < 3 && row >= 0 && row < 3) hit.add(row * 3 + col);
    }

    // A diagonal only counts once its row is open: forward or back is held,
    // or was and the thumb has since slid across onto the diagonal.
    const top = hit.has(1) || (this.up && (hit.has(0) || hit.has(2)));
    const bottom = hit.has(7) || (this.down && (hit.has(6) || hit.has(8)));
    this.up = top;
    this.down = bottom && !top;
    this.left = hit.has(3) || (this.up && hit.has(0)) || (this.down && hit.has(6));
    this.right = hit.has(5) || (this.up && hit.has(2)) || (this.down && hit.has(8));

    this.held = hit;
    this.draw();
  }

  private draw(): void {
    const shown = [1, 3, 5, 7];
    if (this.up) shown.push(0, 2);
    if (this.down) shown.push(6, 8);
    const lit = shown.filter((cell) => this.held.has(cell));

    // Only repaint when a button appears, disappears or changes state.
    const key = `${shown.join()}|${lit.join()}`;
    if (key === this.drawn) return;
    this.drawn = key;

    const g = this.gfx;
    const b = this.button;
    g.clear();
    for (const cell of shown) {
      const x = this.x0 + (cell % 3) * this.step;
      const y = this.y0 + Math.floor(cell / 3) * this.step;
      const pressed = lit.includes(cell);

      g.fillStyle(pressed ? 0xffffff : 0x14141a, pressed ? 0.4 : 0.5);
      g.fillRoundedRect(x, y, b, b, 6);
      g.lineStyle(2, 0xffffff, pressed ? 0.9 : 0.4);
      g.strokeRoundedRect(x, y, b, b, 6);

      // The arrow: a triangle with its tip along the cell's direction. Longer
      // than it is wide — an even-sided one reads fine upright, but turned 45
      // degrees for a diagonal it could be pointing any of three ways.
      const [ax, ay] = ARROWS[cell]!;
      const len = Math.hypot(ax, ay);
      const dx = ax / len;
      const dy = ay / len;
      const cx = x + b / 2;
      const cy = y + b / 2;
      const tip = b * 0.3;
      const back = b * 0.2;
      const half = b * 0.19;
      g.fillStyle(0xffffff, pressed ? 1 : 0.8);
      g.fillTriangle(
        cx + dx * tip,
        cy + dy * tip,
        cx - dx * back - dy * half,
        cy - dy * back + dx * half,
        cx - dx * back + dy * half,
        cy - dy * back - dx * half
      );
    }
  }
}

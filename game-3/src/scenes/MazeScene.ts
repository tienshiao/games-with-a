import Phaser from "phaser";
import {
  createTextures,
  ROCKET_W,
  ROCKET_H,
  CELL,
  CRYSTAL_SIZE,
  PORTAL_SIZE,
} from "../textures";
import { generateMaze, cellToTile, type Maze } from "../maze";
import { playScore, playCrash, playPowerUp, playLevelClear } from "../sounds";

const CELL_COLS = 7;
const CELL_ROWS = 5;
const CRYSTAL_COUNT = 3;
const CRYSTAL_POINTS = 5;
const SHIP_SPEED = 250;
const SHIP_SCALE = 0.62;
// Seconds of air. A perfect run of this maze — every crystal, no wrong turns —
// takes roughly 40s, so this leaves room to get lost twice over.
const TIME_LIMIT = 120;

interface MazeData {
  score?: number;
}

/**
 * Level 2. Top-down: gravity is off, the rocket flies in any direction, and
 * the walls are solid rather than lethal — bumping one just stops you. The
 * pressure comes from the air timer, so a wrong turn costs seconds, not a run.
 */
export class MazeScene extends Phaser.Scene {
  private maze!: Maze;
  private ship!: Phaser.Physics.Arcade.Image;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private crystals!: Phaser.Physics.Arcade.StaticGroup;
  private portal!: Phaser.Physics.Arcade.Image;
  private thruster!: Phaser.GameObjects.Particles.ParticleEmitter;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;

  private scoreText!: Phaser.GameObjects.Text;
  private crystalText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private hintText?: Phaser.GameObjects.Text;

  private score = 0;
  private collected = 0;
  private timeLeft = TIME_LIMIT;
  private finished = false;

  constructor() {
    super({ key: "MazeScene" });
  }

  create(data: MazeData): void {
    this.score = data?.score ?? 0;
    this.collected = 0;
    this.timeLeft = TIME_LIMIT;
    this.finished = false;

    createTextures(this);
    this.cameras.main.setBackgroundColor("#070a16");

    this.maze = generateMaze(CELL_COLS, CELL_ROWS);
    const worldW = this.maze.cols * CELL;
    const worldH = this.maze.rows * CELL;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    this.buildWalls();
    this.placeCrystals();
    this.placePortal();
    this.spawnShip();

    this.physics.add.collider(this.ship, this.walls);
    this.physics.add.overlap(this.ship, this.crystals, (_ship, crystal) =>
      this.collectCrystal(crystal as Phaser.Physics.Arcade.Image)
    );
    this.physics.add.overlap(this.ship, this.portal, () => this.reachPortal());

    this.buildHud();
    this.bindInput();

    this.cameras.main.startFollow(this.ship, true, 0.12, 0.12);
    this.cameras.main.fadeIn(350, 0, 0, 0);
  }

  // ---- world -------------------------------------------------------------

  private buildWalls(): void {
    this.walls = this.physics.add.staticGroup();
    for (let ty = 0; ty < this.maze.rows; ty++) {
      for (let tx = 0; tx < this.maze.cols; tx++) {
        if (!this.maze.walls[ty]![tx]) continue;
        this.walls
          .create(tx * CELL + CELL / 2, ty * CELL + CELL / 2, "maze-wall")
          .setDepth(1);
      }
    }
  }

  private placeCrystals(): void {
    this.crystals = this.physics.add.staticGroup();

    // Dead ends first — they're the cells worth exploring. Anything left over
    // falls back to random corridor cells so the count is always met.
    const start = "0,0";
    const exit = `${this.maze.cellCols - 1},${this.maze.cellRows - 1}`;
    const taken = new Set<string>([start, exit]);
    const picks: Array<{ cx: number; cy: number }> = [];

    const candidates = Phaser.Utils.Array.Shuffle([...this.maze.deadEnds]);
    for (const cell of candidates) {
      if (picks.length >= CRYSTAL_COUNT) break;
      const key = `${cell.cx},${cell.cy}`;
      if (taken.has(key)) continue;
      taken.add(key);
      picks.push(cell);
    }
    while (picks.length < CRYSTAL_COUNT) {
      const cx = Phaser.Math.Between(0, this.maze.cellCols - 1);
      const cy = Phaser.Math.Between(0, this.maze.cellRows - 1);
      const key = `${cx},${cy}`;
      if (taken.has(key)) continue;
      taken.add(key);
      picks.push({ cx, cy });
    }

    for (const { cx, cy } of picks) {
      const { tx, ty } = cellToTile(cx, cy);
      const gem = this.crystals.create(
        tx * CELL + CELL / 2,
        ty * CELL + CELL / 2,
        "crystal"
      ) as Phaser.Physics.Arcade.Image;
      gem.setDepth(3);
      (gem.body as Phaser.Physics.Arcade.StaticBody).setCircle(CRYSTAL_SIZE / 2);
      // The bob is cosmetic — a static body ignores it, which is what we want:
      // the pickup area stays centred on the cell.
      this.tweens.add({
        targets: gem,
        y: gem.y - 6,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  private placePortal(): void {
    const { tx, ty } = cellToTile(this.maze.cellCols - 1, this.maze.cellRows - 1);
    this.portal = this.physics.add
      .staticImage(tx * CELL + CELL / 2, ty * CELL + CELL / 2, "portal")
      .setDepth(2);
    const body = this.portal.body as Phaser.Physics.Arcade.StaticBody;
    body.setCircle(PORTAL_SIZE * 0.3, PORTAL_SIZE * 0.2, PORTAL_SIZE * 0.2);
    body.updateFromGameObject();
    // Locked look: red-shifted and slightly dimmed. Still bright enough to
    // spot from down a corridor — it's the landmark you're navigating toward.
    this.portal.setTint(0xff5a7a).setAlpha(0.8);
    this.tweens.add({
      targets: this.portal,
      angle: 360,
      duration: 6000,
      repeat: -1,
      ease: "Linear",
    });
  }

  private spawnShip(): void {
    const { tx, ty } = cellToTile(0, 0);
    this.ship = this.physics.add
      .image(tx * CELL + CELL / 2, ty * CELL + CELL / 2, "rocket")
      .setScale(SHIP_SCALE)
      .setDepth(5);
    const body = this.ship.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setCollideWorldBounds(true);
    // Circular hitbox so the ship slides along corners instead of snagging.
    // setCircle takes source pixels and offsets — Phaser scales both by 0.62,
    // giving a ~10px radius inside a 64px corridor.
    body.setCircle(ROCKET_H / 2, (ROCKET_W - ROCKET_H) / 2, 0);
    body.updateFromGameObject();

    this.thruster = this.add
      .particles(0, 0, "flame", {
        speed: { min: 10, max: 40 },
        scale: { start: 0.5, end: 0 },
        alpha: { start: 0.7, end: 0 },
        lifespan: 220,
        frequency: 45,
        blendMode: "ADD",
        follow: this.ship,
      })
      .setDepth(4);
  }

  // ---- hud + input -------------------------------------------------------

  private buildHud(): void {
    const label = (color: string) => ({
      fontSize: "22px",
      fontFamily: "monospace",
      fontStyle: "bold",
      color,
      stroke: "#000000",
      strokeThickness: 5,
    });

    this.scoreText = this.add.text(0, 0, String(this.score), label("#ffffff"));
    this.crystalText = this.add.text(0, 0, "", label("#38d6ff"));
    this.timeText = this.add.text(0, 0, "", label("#ffd44a")).setOrigin(1, 0);
    for (const t of [this.scoreText, this.crystalText, this.timeText]) {
      t.setScrollFactor(0).setDepth(20);
    }
    this.updateCrystalText();
    this.updateTimeText();

    this.hintText = this.add
      .text(0, 0, "ARROWS / WASD  •  or hold to steer", {
        fontSize: "16px",
        fontFamily: "monospace",
        color: "#8fa6d8",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20);
    this.tweens.add({
      targets: this.hintText,
      alpha: 0,
      delay: 3200,
      duration: 900,
      onComplete: () => {
        this.hintText?.destroy();
        this.hintText = undefined;
      },
    });

    this.layoutUi();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutUi, this);
  }

  private layoutUi(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.scoreText.setPosition(16, 14);
    this.crystalText.setPosition(16, 44);
    this.timeText.setPosition(w - 16, 14);
    this.hintText?.setPosition(w / 2, h - 40);
  }

  private bindInput(): void {
    this.cursors = this.input.keyboard!.createCursorKeys();
    // addKeys hands back keys named W/A/S/D — remap to directional names so
    // readSteering can treat them the same as the arrows.
    const keys = this.input.keyboard!.addKeys("W,A,S,D") as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    this.wasd = {
      up: keys.W!,
      left: keys.A!,
      down: keys.S!,
      right: keys.D!,
    };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutUi, this);
    });
  }

  /** -1/0/1 per axis from the keyboard, or the vector to a held pointer. */
  private readSteering(): Phaser.Math.Vector2 {
    const v = new Phaser.Math.Vector2(0, 0);
    if (this.cursors.left.isDown || this.wasd.left.isDown) v.x -= 1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) v.x += 1;
    if (this.cursors.up.isDown || this.wasd.up.isDown) v.y -= 1;
    if (this.cursors.down.isDown || this.wasd.down.isDown) v.y += 1;
    if (v.x !== 0 || v.y !== 0) return v.normalize();

    // Touch/mouse: hold anywhere and the ship flies toward that point. The
    // small dead zone stops it jittering when the pointer is right on top.
    const pointer = this.input.activePointer;
    if (pointer.isDown) {
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const dx = world.x - this.ship.x;
      const dy = world.y - this.ship.y;
      if (Math.hypot(dx, dy) > 12) return v.set(dx, dy).normalize();
    }
    return v.set(0, 0);
  }

  // ---- events ------------------------------------------------------------

  private collectCrystal(crystal: Phaser.Physics.Arcade.Image): void {
    if (this.finished) return;
    this.collected++;
    this.score += CRYSTAL_POINTS;
    this.scoreText.setText(String(this.score));
    this.updateCrystalText();

    const x = crystal.x;
    const y = crystal.y;
    this.tweens.killTweensOf(crystal);
    crystal.destroy();
    playScore();

    this.add
      .particles(x, y, "spark", {
        speed: { min: 50, max: 180 },
        scale: { start: 0.8, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: 380,
        blendMode: "ADD",
        emitting: false,
      })
      .setDepth(9)
      .explode(16);

    if (this.collected >= CRYSTAL_COUNT) this.unlockPortal();
  }

  private unlockPortal(): void {
    playPowerUp();
    this.portal.clearTint();
    this.tweens.add({ targets: this.portal, alpha: 1, scale: 1.15, duration: 400 });
    this.tweens.add({
      targets: this.portal,
      scale: 1,
      duration: 700,
      delay: 400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.flashMessage("EXIT OPEN!", "#5dff8f");
  }

  private reachPortal(): void {
    if (this.finished || this.collected < CRYSTAL_COUNT) return;
    this.finished = true;
    playLevelClear();

    (this.ship.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.physics.pause();
    this.thruster.stop();

    // Ship spirals into the gate.
    this.tweens.add({
      targets: this.ship,
      x: this.portal.x,
      y: this.portal.y,
      scale: 0,
      angle: 720,
      duration: 700,
      ease: "Cubic.easeIn",
    });

    this.time.delayedCall(1100, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.time.delayedCall(320, () => {
        this.scene.start("GameOverScene", { score: this.score, cleared: true });
      });
    });
  }

  private outOfAir(): void {
    if (this.finished) return;
    this.finished = true;
    playCrash();

    this.thruster.stop();
    this.add
      .particles(this.ship.x, this.ship.y, "spark", {
        speed: { min: 80, max: 260 },
        scale: { start: 1.2, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: 600,
        blendMode: "ADD",
        emitting: false,
      })
      .setDepth(9)
      .explode(40);
    this.ship.setVisible(false);
    this.physics.pause();
    this.cameras.main.shake(260, 0.012);

    this.time.delayedCall(950, () => {
      this.scene.start("GameOverScene", { score: this.score });
    });
  }

  private flashMessage(text: string, color: string): void {
    const msg = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 60, text, {
        fontSize: "34px",
        fontFamily: "monospace",
        fontStyle: "bold",
        color,
        stroke: "#000000",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(25);
    this.tweens.add({
      targets: msg,
      alpha: 0,
      y: msg.y - 40,
      delay: 700,
      duration: 700,
      onComplete: () => msg.destroy(),
    });
  }

  private updateCrystalText(): void {
    this.crystalText.setText(`CRYSTALS ${this.collected}/${CRYSTAL_COUNT}`);
  }

  private updateTimeText(): void {
    const secs = Math.max(0, Math.ceil(this.timeLeft));
    this.timeText.setText(`AIR ${secs}`);
    this.timeText.setColor(secs <= 15 ? "#ff5a3c" : "#ffd44a");
  }

  override update(_time: number, delta: number): void {
    if (this.finished) return;

    const steer = this.readSteering();
    const body = this.ship.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(steer.x * SHIP_SPEED, steer.y * SHIP_SPEED);

    if (steer.x !== 0 || steer.y !== 0) {
      // Point the nose along the heading, easing so turns don't snap.
      const target = Phaser.Math.RadToDeg(Math.atan2(steer.y, steer.x));
      this.ship.angle = Phaser.Math.Angle.WrapDegrees(
        this.ship.angle +
          Phaser.Math.Angle.ShortestBetween(this.ship.angle, target) * 0.25
      );
      // Exhaust trails out the back, whichever way the ship is pointing.
      this.thruster.followOffset.set(-steer.x * 14, -steer.y * 14);
      this.thruster.start();
    } else {
      this.thruster.stop();
    }

    this.timeLeft -= delta / 1000;
    this.updateTimeText();
    if (this.timeLeft <= 0) this.outOfAir();
  }
}

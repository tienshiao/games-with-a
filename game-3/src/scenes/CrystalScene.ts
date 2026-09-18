import Phaser from "phaser";
import {
  createTextures,
  GOAL_CRYSTAL_SIZE,
  HERO_BODY,
} from "../textures";
import { Starfield } from "../background";
import { playScore, playLevelClear } from "../sounds";

const HERO_SPEED = 210;
const HERO_SCALE = 2;
// Fraction of the remaining angle the hero turns through each frame — the same
// easing the maze uses, so both levels steer alike.
const TURN_RATE = 0.25;
// Awarded for touching the crystal, on top of whatever the run carried in.
const REACH_POINTS = 25;
// The crystal sits at the middle of the chamber; the hero starts this far down
// from the centre, as a fraction of the view height.
const START_DROP = 0.36;
// Half the triangle's short side — the hero's hitbox radius, in source pixels.
const HERO_RADIUS = HERO_BODY.h / 2;

interface CrystalData {
  score?: number;
}

/**
 * Level 3. A single open chamber with the crystal at its centre — no walls, no
 * timer. Walk the hero from game 2 into the crystal and the run is finished.
 */
export class CrystalScene extends Phaser.Scene {
  private starfield!: Starfield;
  private hero!: Phaser.Physics.Arcade.Sprite;
  private crystal!: Phaser.Physics.Arcade.Image;
  private halo!: Phaser.GameObjects.Image;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;

  private scoreText!: Phaser.GameObjects.Text;
  private hintText?: Phaser.GameObjects.Text;

  private score = 0;
  private finished = false;

  constructor() {
    super({ key: "CrystalScene" });
  }

  create(data: CrystalData): void {
    this.score = data?.score ?? 0;
    this.finished = false;

    createTextures(this);
    this.cameras.main.setBackgroundColor("#0a0d20");
    this.starfield = new Starfield(this, 14);

    this.placeCrystal();
    this.spawnHero();
    this.physics.add.overlap(this.hero, this.crystal, () => this.reachCrystal());

    this.buildHud();
    this.bindInput();

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });

    this.cameras.main.fadeIn(350, 0, 0, 0);
  }

  // ---- world -------------------------------------------------------------

  private placeCrystal(): void {
    // A soft disc behind the gem so it still reads as the destination from the
    // far corner of a wide window.
    this.halo = this.add
      .image(0, 0, "crystal-goal")
      .setScale(1.9)
      .setAlpha(0.28)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(1);
    this.tweens.add({
      targets: this.halo,
      scale: 2.2,
      alpha: 0.16,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.crystal = this.physics.add.staticImage(0, 0, "crystal-goal").setDepth(2);
    const body = this.crystal.body as Phaser.Physics.Arcade.StaticBody;
    // The drawn gem fills the middle ~62% of the texture; the rest is halo, so
    // the hitbox hugs the gem rather than the whole square.
    const r = (GOAL_CRYSTAL_SIZE * 0.62) / 2;
    body.setCircle(r, GOAL_CRYSTAL_SIZE / 2 - r, GOAL_CRYSTAL_SIZE / 2 - r);

    this.tweens.add({
      targets: this.crystal,
      scale: 1.08,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.add
      .particles(0, 0, "spark", {
        speed: { min: 8, max: 30 },
        scale: { start: 0.5, end: 0 },
        alpha: { start: 0.8, end: 0 },
        lifespan: 1400,
        frequency: 160,
        blendMode: "ADD",
        follow: this.crystal,
        emitZone: {
          type: "random",
          source: new Phaser.Geom.Circle(0, 0, GOAL_CRYSTAL_SIZE * 0.4),
          quantity: 1,
        },
      })
      .setDepth(3);
  }

  private spawnHero(): void {
    this.hero = this.physics.add.sprite(0, 0, "hero", 0).setScale(HERO_SCALE).setDepth(5);
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setCollideWorldBounds(true);
    // Arcade bodies stay axis-aligned however the sprite is rotated, so use a
    // circle centred on the triangle — it stays honest through a turn. Same
    // reason the maze uses one.
    body.setCircle(
      HERO_RADIUS,
      HERO_BODY.x + HERO_BODY.w / 2 - HERO_RADIUS,
      HERO_BODY.y + HERO_BODY.h / 2 - HERO_RADIUS
    );
  }

  // ---- hud + input -------------------------------------------------------

  private buildHud(): void {
    this.scoreText = this.add
      .text(0, 0, String(this.score), {
        fontSize: "22px",
        fontFamily: "monospace",
        fontStyle: "bold",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 5,
      })
      .setScrollFactor(0)
      .setDepth(20);

    this.hintText = this.add
      .text(0, 0, "REACH THE CRYSTAL", {
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
  }

  /**
   * The chamber is exactly the visible window, so everything is repositioned
   * from the live size — on first build and on every resize.
   */
  private layout(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const cy = h / 2;

    this.physics.world.setBounds(0, 0, w, h);

    this.crystal.setPosition(cx, cy);
    (this.crystal.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    this.halo.setPosition(cx, cy);

    this.scoreText.setPosition(16, 14);
    this.hintText?.setPosition(cx, h - 40);

    // Only place the hero on the first layout; a mid-run resize shouldn't
    // teleport it back to the start. It can end up outside a shrunk window
    // though, so pull it back inside either way.
    if (this.hero.x === 0 && this.hero.y === 0) {
      this.hero.setPosition(cx, cy + h * START_DROP);
    } else {
      const m = HERO_RADIUS * HERO_SCALE;
      this.hero.setPosition(
        Phaser.Math.Clamp(this.hero.x, m, w - m),
        Phaser.Math.Clamp(this.hero.y, m, h - m)
      );
    }
  }

  private bindInput(): void {
    this.cursors = this.input.keyboard!.createCursorKeys();
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
  }

  /** -1/0/1 per axis from the keyboard, or the vector to a held pointer. */
  private readSteering(): Phaser.Math.Vector2 {
    const v = new Phaser.Math.Vector2(0, 0);
    if (this.cursors.left.isDown || this.wasd.left.isDown) v.x -= 1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) v.x += 1;
    if (this.cursors.up.isDown || this.wasd.up.isDown) v.y -= 1;
    if (this.cursors.down.isDown || this.wasd.down.isDown) v.y += 1;
    if (v.x !== 0 || v.y !== 0) return v.normalize();

    const pointer = this.input.activePointer;
    if (pointer.isDown) {
      const dx = pointer.worldX - this.hero.x;
      const dy = pointer.worldY - this.hero.y;
      if (Math.hypot(dx, dy) > 12) return v.set(dx, dy).normalize();
    }
    return v.set(0, 0);
  }

  // ---- events ------------------------------------------------------------

  private reachCrystal(): void {
    if (this.finished) return;
    this.finished = true;

    this.score += REACH_POINTS;
    this.scoreText.setText(String(this.score));
    playScore();
    playLevelClear();

    (this.hero.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.physics.pause();
    this.hero.anims.stop();

    // Hero is drawn into the gem, which flares as it takes them.
    this.tweens.add({
      targets: this.hero,
      x: this.crystal.x,
      y: this.crystal.y,
      scale: 0,
      duration: 600,
      ease: "Cubic.easeIn",
    });
    this.tweens.killTweensOf(this.crystal);
    this.tweens.add({
      targets: this.crystal,
      scale: 1.6,
      alpha: 0,
      delay: 500,
      duration: 500,
      ease: "Cubic.easeOut",
    });

    this.time.delayedCall(600, () => {
      this.add
        .particles(this.crystal.x, this.crystal.y, "spark", {
          speed: { min: 90, max: 320 },
          scale: { start: 1.1, end: 0 },
          alpha: { start: 1, end: 0 },
          lifespan: 700,
          blendMode: "ADD",
          emitting: false,
        })
        .setDepth(9)
        .explode(40);
      this.cameras.main.flash(400, 150, 240, 255);
    });

    this.time.delayedCall(1400, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.time.delayedCall(320, () => {
        this.scene.start("GameOverScene", { score: this.score, cleared: true });
      });
    });
  }

  override update(_time: number, delta: number): void {
    this.starfield.update(delta);
    if (this.finished) return;

    const steer = this.readSteering();
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(steer.x * HERO_SPEED, steer.y * HERO_SPEED);

    if (steer.x !== 0 || steer.y !== 0) {
      // The sprite is drawn pointing right, so its angle is the heading. Ease
      // into the turn the same way the maze does, rather than snapping.
      const target = Phaser.Math.RadToDeg(Math.atan2(steer.y, steer.x));
      this.hero.angle = Phaser.Math.Angle.WrapDegrees(
        this.hero.angle +
          Phaser.Math.Angle.ShortestBetween(this.hero.angle, target) * TURN_RATE
      );
      this.hero.anims.play("hero-walk", true);
    } else {
      this.hero.anims.stop();
      this.hero.setFrame(0);
    }
  }
}

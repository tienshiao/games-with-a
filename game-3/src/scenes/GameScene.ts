import Phaser from "phaser";
import {
  createTextures,
  ROCKET_W,
  ROCKET_H,
  ASTEROID_SIZE,
  ASTEROID_RADII,
  ASTEROID_VARIANTS,
  QBLOCK_SIZE,
} from "../textures";
import { Starfield, Backdrop } from "../background";
import { view3d } from "../three/world3d";
import { asteroidModel, qblockModel, rocketModel } from "../three/models";
import { playFlap, playScore, playCrash, playPowerUp, playLevelClear } from "../sounds";

const ROCKET_X = 120;
const FLAP_VELOCITY = -390;

// Difficulty: values scale with score, clamped to a floor/ceiling.
// Tuned gentle — wide gaps, slow scroll, and a shallow ramp so it stays forgiving.
const GAP_BASE = 270;
const GAP_MIN = 200;
const SPEED_BASE = 165;
const SPEED_MAX = 265;
const SPAWN_BASE = 1750;
const SPAWN_MIN = 1200;
const EDGE_MARGIN = 90; // keep gaps away from very top/bottom
// The wall that carries the "?" block. Counted by fields spawned, so the block
// rides in with the 20th wall the player meets.
const ITEM_WALL = 20;
// Clearing this many barriers finishes level 1 and opens the maze.
const LEVEL_CLEAR_SCORE = 21;

// One spawn: a cluster of rocks above the gap and another below it. The rocks
// drift left with the field but are otherwise static — no spin, no bobbing.
interface AsteroidField {
  rocks: Phaser.Physics.Arcade.Image[];
  scored: boolean;
}

export class GameScene extends Phaser.Scene {
  private starfield!: Starfield;
  private backdrop!: Backdrop;
  private rocket!: Phaser.Physics.Arcade.Image;
  private asteroids!: Phaser.Physics.Arcade.Group;
  private blocks!: Phaser.Physics.Arcade.Group;
  private fields: AsteroidField[] = [];
  private itemSlot!: Phaser.GameObjects.Image;
  private slotItem?: Phaser.GameObjects.Image;
  private thruster!: Phaser.GameObjects.Particles.ParticleEmitter;
  private scoreText!: Phaser.GameObjects.Text;
  private readyText?: Phaser.GameObjects.Text;
  private spawnEvent?: Phaser.Time.TimerEvent;

  private score = 0;
  private fieldsSpawned = 0;
  private hasSword = false;
  private started = false;
  private gameOver = false;
  private cleared = false;

  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    // Reset per-run state (scenes are reused across restarts)
    this.fields = [];
    this.score = 0;
    this.fieldsSpawned = 0;
    this.hasSword = false;
    this.slotItem = undefined;
    this.started = false;
    this.gameOver = false;
    this.cleared = false;

    createTextures(this);
    // Scenery first: the backdrop sits behind the stars.
    this.backdrop = new Backdrop(this);
    this.starfield = new Starfield(this, 60);

    this.asteroids = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });
    this.blocks = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });

    // Rocket
    this.rocket = this.physics.add
      .image(ROCKET_X, this.scale.height / 2, "rocket")
      .setDepth(5);
    const body = this.rocket.body as Phaser.Physics.Arcade.Body;
    body.setSize(ROCKET_W * 0.72, ROCKET_H * 0.62); // forgiving hitbox, auto-centered
    body.setAllowGravity(false); // hovers until first flap
    view3d(this).bind(this.rocket, rocketModel());

    // Thruster particles trailing behind the rocket
    this.thruster = this.add
      .particles(0, 0, "flame", {
        speed: { min: 20, max: 70 },
        angle: { min: 160, max: 200 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 0.8, end: 0 },
        lifespan: 280,
        frequency: 35,
        blendMode: "ADD",
        follow: this.rocket,
        followOffset: { x: -ROCKET_W / 2 + 4, y: 1 },
      })
      .setDepth(4);

    this.physics.add.overlap(this.rocket, this.asteroids, () => this.die());
    this.physics.add.overlap(this.rocket, this.blocks, (_rocket, block) =>
      this.collectItem(block as Phaser.Physics.Arcade.Image)
    );

    // Score UI
    this.scoreText = this.add
      .text(0, 0, "0", {
        fontSize: "64px",
        fontFamily: "monospace",
        fontStyle: "bold",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(20);

    // Item slot sits empty at the bottom until something lands in it.
    this.itemSlot = this.add.image(0, 0, "item-slot").setDepth(20).setAlpha(0.45);

    this.readyText = this.add
      .text(0, 0, "TAP TO FLY", {
        fontSize: "28px",
        fontFamily: "monospace",
        fontStyle: "bold",
        color: "#ffd44a",
        stroke: "#000000",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.tweens.add({
      targets: this.readyText,
      alpha: 0.3,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    this.layoutUi();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutUi, this);

    // Input — works for touch, mouse, and keyboard
    this.input.on("pointerdown", this.flap, this);
    this.input.keyboard!.on("keydown-SPACE", this.flap, this);

    // Clean up listeners when the scene shuts down (restart safety)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("pointerdown", this.flap, this);
      this.input.keyboard?.off("keydown-SPACE", this.flap, this);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutUi, this);
    });
  }

  // Keep the HUD centered to the live window size (called on create + resize).
  private layoutUi(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.scoreText.setPosition(w / 2, Math.min(70, h * 0.1));
    this.readyText?.setPosition(w / 2, h / 2 + 90);
    this.itemSlot.setPosition(w / 2, h - 66);
    // Leave the item alone mid-flight — the pickup tween owns its position.
    if (this.slotItem && !this.tweens.isTweening(this.slotItem)) {
      this.slotItem.setPosition(this.itemSlot.x, this.itemSlot.y);
    }
  }

  private flap(): void {
    if (this.gameOver || this.cleared) return;
    if (!this.started) this.startRun();

    (this.rocket.body as Phaser.Physics.Arcade.Body).setVelocityY(FLAP_VELOCITY);
    this.rocket.setAngle(-22);
    this.thruster.emitParticle(6);
    playFlap();
  }

  private startRun(): void {
    this.started = true;
    this.readyText?.destroy();
    this.readyText = undefined;
    (this.rocket.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
    this.scheduleSpawn(600);
  }

  private scheduleSpawn(delay: number): void {
    this.spawnEvent = this.time.delayedCall(delay, () => {
      if (this.gameOver) return;
      this.spawnField();
      // Spawn interval tightens as the score climbs.
      const interval = Math.max(SPAWN_MIN, SPAWN_BASE - this.score * 15);
      this.scheduleSpawn(interval);
    });
  }

  private spawnField(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    // On very short windows, shrink the gap so the clusters still leave room.
    const gap = Math.min(
      Math.max(GAP_MIN, GAP_BASE - this.score * 2.5),
      Math.max(120, h - 2 * EDGE_MARGIN)
    );
    const speed = Math.min(SPEED_MAX, SPEED_BASE + this.score * 4);

    const minCenter = EDGE_MARGIN + gap / 2;
    const maxCenter = h - EDGE_MARGIN - gap / 2;
    const gapCenter =
      maxCenter > minCenter ? Phaser.Math.Between(minCenter, maxCenter) : h / 2;
    const gapTop = gapCenter - gap / 2;
    const gapBottom = gapCenter + gap / 2;

    const x = w + ASTEROID_SIZE;

    const rocks: Phaser.Physics.Arcade.Image[] = [];
    const place = (y: number, variant: number): void => {
      const radius = ASTEROID_RADII[variant]!;
      const rock = this.asteroids.create(
        x + Phaser.Math.Between(-7, 7),
        y,
        `asteroid-${variant}`
      ) as Phaser.Physics.Arcade.Image;
      // A fixed random angle per rock — set once at spawn, never animated.
      rock.setAngle(Phaser.Math.Between(0, 359)).setDepth(1);
      rock.setVelocityX(-speed);
      const body = rock.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      // Circular hitbox tucked inside the rock so near-misses feel fair.
      const hit = radius * 0.82;
      body.setCircle(hit, ASTEROID_SIZE / 2 - hit, ASTEROID_SIZE / 2 - hit);
      // setCircle only rewrites the offset — without this the body keeps the
      // position it had as a full-frame rectangle and sits up and to the left.
      body.updateFromGameObject();
      view3d(this).bind(rock, asteroidModel(variant));
      rocks.push(rock);
    };

    // Walk out from each gap edge to past the screen edge, dropping a random
    // rock each step. Every rock is set to overlap the previous one, so a
    // cluster stays solid however the sizes fall out.
    const stack = (edge: number, dir: -1 | 1): void => {
      let covered = edge;
      while (dir < 0 ? covered > 0 : covered < h) {
        const variant = Phaser.Math.Between(0, ASTEROID_VARIANTS - 1);
        const radius = ASTEROID_RADII[variant]!;
        place(covered + dir * radius, variant);
        covered += dir * radius * 1.5;
      }
    };
    stack(gapTop, -1);
    stack(gapBottom, 1);

    this.fieldsSpawned++;
    if (this.fieldsSpawned === ITEM_WALL) this.spawnQuestionBlock(x, gapCenter, speed);

    if (rocks.length) this.fields.push({ rocks, scored: false });
  }

  // Rides in the middle of the item wall's gap, so reaching it is the reward
  // for threading that wall rather than a separate obstacle.
  private spawnQuestionBlock(x: number, y: number, speed: number): void {
    const block = this.blocks.create(x, y, "qblock") as Phaser.Physics.Arcade.Image;
    block.setDepth(2);
    block.setVelocityX(-speed);
    const body = block.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(QBLOCK_SIZE * 0.9, QBLOCK_SIZE * 0.9);
    body.updateFromGameObject(); // setSize only moves the offset, not the body
    view3d(this).bind(block, qblockModel(this));

    // Gentle shimmer so it reads as something to hit, not scenery. Alpha, not
    // scale — scaling the sprite would drag its hitbox out of alignment.
    this.tweens.add({
      targets: block,
      alpha: 0.72,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private collectItem(block: Phaser.Physics.Arcade.Image): void {
    if (this.gameOver || this.hasSword || this.cleared) return;
    this.hasSword = true;

    const x = block.x;
    const y = block.y;
    this.tweens.killTweensOf(block);
    block.destroy();
    playPowerUp();

    const pop = this.add
      .particles(x, y, "spark", {
        speed: { min: 60, max: 200 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: 420,
        blendMode: "ADD",
        emitting: false,
      })
      .setDepth(9);
    pop.explode(20);

    // The sword flies from the block into the slot
    const sword = this.add.image(x, y, "sword").setDepth(21).setScale(1.4);
    this.slotItem = sword;
    this.itemSlot.setAlpha(1);
    this.tweens.add({
      targets: sword,
      x: this.itemSlot.x,
      y: this.itemSlot.y,
      scale: 1,
      duration: 480,
      ease: "Cubic.easeInOut",
    });
    this.tweens.add({
      targets: this.itemSlot,
      scale: 1.25,
      duration: 160,
      delay: 470,
      yoyo: true,
      ease: "Back.easeOut",
    });
  }

  override update(_time: number, delta: number): void {
    this.starfield.update(delta);
    this.backdrop.update(delta);
    if (!this.started || this.gameOver || this.cleared) return;

    // Tilt: nose up when rising, dive down when falling
    const vy = (this.rocket.body as Phaser.Physics.Arcade.Body).velocity.y;
    const targetAngle = Phaser.Math.Clamp(vy * 0.1, -25, 80);
    this.rocket.angle = Phaser.Math.Linear(this.rocket.angle, targetAngle, 0.12);

    // Scoring + cleanup
    for (const field of this.fields) {
      if (!field.scored && field.rocks[0]!.x < ROCKET_X) {
        field.scored = true;
        this.score++;
        this.scoreText.setText(String(this.score));
        playScore();
        this.bumpScore();
        if (this.score >= LEVEL_CLEAR_SCORE) {
          this.clearLevel();
          return;
        }
      }
    }
    // An uncollected block scrolls away with its wall
    for (const block of this.blocks.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (block.x < -QBLOCK_SIZE) block.destroy();
    }

    this.fields = this.fields.filter((field) => {
      if (field.rocks.every((rock) => rock.x < -ASTEROID_SIZE)) {
        field.rocks.forEach((rock) => rock.destroy());
        return false;
      }
      return true;
    });

    // Hitting the top or bottom edge ends the run
    if (this.rocket.y <= 0 || this.rocket.y >= this.scale.height) {
      this.die();
    }
  }

  private bumpScore(): void {
    this.scoreText.setScale(1.3);
    this.tweens.add({
      targets: this.scoreText,
      scale: 1,
      duration: 180,
      ease: "Back.easeOut",
    });
  }

  // Level 1 is over: stop the field, fly the rocket out to the right, and hand
  // the score on to the maze. Nothing can kill the player during the flyout.
  private clearLevel(): void {
    if (this.cleared) return;
    this.cleared = true;
    playLevelClear();

    this.spawnEvent?.remove();
    const body = this.rocket.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocity(0, 0);
    body.enable = false; // no more collisions while it exits

    const banner = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 40, "LEVEL 1 CLEAR!", {
        fontSize: "44px",
        fontFamily: "monospace",
        fontStyle: "bold",
        color: "#5dff8f",
        stroke: "#000000",
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(25)
      .setScale(0.4);
    this.tweens.add({ targets: banner, scale: 1, duration: 400, ease: "Back.easeOut" });

    this.tweens.add({
      targets: this.rocket,
      angle: 0,
      y: this.scale.height / 2,
      duration: 500,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.tweens.add({
          targets: this.rocket,
          x: this.scale.width + ROCKET_W * 2,
          duration: 900,
          delay: 350,
          ease: "Cubic.easeIn",
        });
      },
    });

    this.time.delayedCall(2100, () => {
      this.cameras.main.fadeOut(350, 0, 0, 0);
      this.time.delayedCall(380, () => {
        this.scene.start("MazeScene", { score: this.score });
      });
    });
  }

  private die(): void {
    if (this.gameOver || this.cleared) return;
    this.gameOver = true;
    playCrash();

    this.spawnEvent?.remove();
    this.thruster.stop();

    // Explosion at the rocket
    const boom = this.add
      .particles(this.rocket.x, this.rocket.y, "spark", {
        speed: { min: 80, max: 280 },
        scale: { start: 1.3, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: 600,
        blendMode: "ADD",
        emitting: false,
      })
      .setDepth(8);
    boom.explode(44);

    this.rocket.setVisible(false);
    this.physics.pause(); // freeze the asteroids & rocket
    this.cameras.main.shake(260, 0.012);

    this.time.delayedCall(950, () => {
      this.scene.start("GameOverScene", { score: this.score });
    });
  }
}

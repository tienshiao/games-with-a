import Phaser from "phaser";
import * as THREE from "three";
import { createTextures, CRYSTAL_SIZE, HERO_BODY, PORTAL_SIZE } from "../textures";
import { generateMagma, isRock, MAGMA_TILE, type MagmaWorld } from "../magma";
import { playScore, playCrash, playLevelClear } from "../sounds";
import { DPad } from "../dpad";
import { view3d } from "../three/world3d";
import {
  crystalModel,
  emberModel,
  heroModel,
  magmaModel,
  portalModel,
  upright,
  HERO_FOOT,
  LAVA_DROP,
  MAGMA_HAZE,
} from "../three/models";

const HERO_SPEED = 240;
const BACK_SPEED = 110;
/** Radians per second with a turn key held. */
const TURN_SPEED = 2.6;
const HERO_SCALE = 1.8;
// Half the triangle's short side — the hitbox radius, in source pixels.
const HERO_RADIUS = HERO_BODY.h / 2;
const LIVES = 3;
const CRYSTAL_POINTS = 5;
// Awarded for reaching the portal, on top of whatever the run carried in.
const CLEAR_POINTS = 30;
const CRYSTAL_SCALE = 1.6;
const CRYSTAL_REACH = 24;
const PORTAL_SCALE = 2.4;
const PORTAL_REACH = 42;
// A spot only counts as safe to come back to if there is rock this far from
// it on every side, so a respawn never lands teetering on an edge.
const SAFE_INSET = 30;

// The chase camera: this far behind the hero and above the ground, aimed at a
// point ahead of it, and swinging round behind a turn rather than snapping.
const CAM_BACK = 240;
const CAM_HEIGHT = 190;
const CAM_AHEAD = 120;
const CAM_EASE = 5;

interface MagmaData {
  score?: number;
}

/**
 * Level 4. The same flat physics as the maze — the hero is an Arcade body on
 * a plane, and lava is just the tiles that aren't rock — but seen from a
 * camera behind the hero instead of from above. So the controls change with
 * it: up walks the way the hero faces, down backs it up and left/right turn
 * it, rather than each key being a compass direction. Touch screens get those
 * four as an on-screen D-pad.
 *
 * Stepping off the rock costs a life and puts the hero back on the last solid
 * ground it stood on. The portal at the far end finishes the run; the
 * crystals along the way are a bonus, not a key.
 */
export class MagmaScene extends Phaser.Scene {
  private world!: MagmaWorld;
  private hero!: Phaser.Physics.Arcade.Sprite;
  private crystals!: Phaser.Physics.Arcade.StaticGroup;
  private portal!: Phaser.Physics.Arcade.Image;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
  /** Only on touch screens. */
  private pad?: DPad;

  private scoreText!: Phaser.GameObjects.Text;
  private crystalText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private hintText?: Phaser.GameObjects.Text;

  private score = 0;
  private collected = 0;
  private lives = LIVES;
  private finished = false;
  private sinking = false;
  // Set by a respawn and cleared once the controls are let go: whoever walked
  // the hero into the lava is usually still holding the key that did it.
  private steady = false;
  /** The hero's height off the ground: zero except while it sinks or exits. */
  private heroZ = 0;
  private camAngle = 0;
  private lastSafe = { x: 0, y: 0, rotation: 0 };
  /** The hero's position in the 3D world, for scenery that keeps near it. */
  private focus = new THREE.Vector3();

  constructor() {
    super({ key: "MagmaScene" });
  }

  create(data: MagmaData): void {
    this.score = data?.score ?? 0;
    this.collected = 0;
    this.lives = LIVES;
    this.finished = false;
    this.sinking = false;
    this.steady = false;
    this.heroZ = 0;

    createTextures(this);

    this.world = generateMagma();
    this.physics.world.setBounds(
      0,
      0,
      this.world.cols * MAGMA_TILE,
      this.world.rows * MAGMA_TILE
    );

    this.buildWorld();
    this.placeCrystals();
    this.placePortal();
    this.spawnHero();

    this.physics.add.overlap(this.hero, this.crystals, (_hero, crystal) =>
      this.collectCrystal(crystal as Phaser.Physics.Arcade.Image)
    );
    this.physics.add.overlap(this.hero, this.portal, () => this.reachPortal());

    this.bindInput();
    this.buildHud();

    this.cameras.main.fadeIn(350, 0, 0, 0);
    this.flashMessage("MAGMA WORLD", "#ffb04a");
  }

  // ---- world -------------------------------------------------------------

  private buildWorld(): void {
    const view = view3d(this);
    view.setBackground(MAGMA_HAZE);
    view.world.fog = new THREE.Fog(MAGMA_HAZE, 700, 4200);

    // Up is +z here, not toward the top of the screen. Dim smoky light from
    // above, and the lava's glow coming up from underneath everything.
    view.fill.position.set(0, 0, 1);
    view.fill.color.set(0x7a4a52);
    view.fill.groundColor.set(0xff6a1a);
    view.fill.intensity = 1.4;
    // The sun sits behind the start, so the side of the hero the camera sees
    // is the lit one for most of the walk.
    view.sun.position.set(-0.5, -0.7, 1);
    view.sun.color.set(0xffe6cc);
    view.sun.intensity = 2.4;

    view.add(magmaModel(this.world));
    view.add(emberModel(this.focus));

    view.setCameraRig((camera, dt) => {
      // Once the run is over the hero is spinning into the portal (or gone
      // under), and the camera shouldn't whirl round after it.
      if (!this.finished) {
        this.camAngle +=
          Phaser.Math.Angle.Wrap(this.hero.rotation - this.camAngle) *
          (1 - Math.exp(-CAM_EASE * dt));
      }
      // Phaser's y runs down the screen and Three's up, hence the flips.
      const fx = Math.cos(this.camAngle);
      const fy = -Math.sin(this.camAngle);
      this.focus.set(this.hero.x, -this.hero.y, 0);

      // A tall window sees less to either side, so open the lens up for it.
      camera.fov = camera.aspect < 1 ? 72 : 55;
      camera.near = 8;
      camera.far = 16000;
      camera.up.set(0, 0, 1);
      camera.position.set(
        this.focus.x - fx * CAM_BACK,
        this.focus.y - fy * CAM_BACK,
        CAM_HEIGHT
      );
      camera.lookAt(this.focus.x + fx * CAM_AHEAD, this.focus.y + fy * CAM_AHEAD, 24);
    });
  }

  private placeCrystals(): void {
    this.crystals = this.physics.add.staticGroup();
    this.world.crystals.forEach(({ x, y }, i) => {
      const gem = this.crystals.create(x, y, "crystal") as Phaser.Physics.Arcade.Image;
      // Wider than the gem: seen from behind it's hard to judge the last few
      // steps, so walking close is enough.
      (gem.body as Phaser.Physics.Arcade.StaticBody).setCircle(
        CRYSTAL_REACH,
        CRYSTAL_SIZE / 2 - CRYSTAL_REACH,
        CRYSTAL_SIZE / 2 - CRYSTAL_REACH
      );
      view3d(this).bind(gem, upright(crystalModel(CRYSTAL_SIZE), 26, CRYSTAL_SCALE), {
        sync: (_gem, model) => {
          model.position.z = Math.sin(this.time.now / 380 + i) * 5;
        },
      });
    });
  }

  private placePortal(): void {
    // Toward the back of the goal slab, so the hero walks across it to leave.
    const { x, y } = this.world.goal;
    this.portal = this.physics.add.staticImage(x, y - MAGMA_TILE * 0.9, "portal");
    (this.portal.body as Phaser.Physics.Arcade.StaticBody).setCircle(
      PORTAL_REACH,
      PORTAL_SIZE / 2 - PORTAL_REACH,
      PORTAL_SIZE / 2 - PORTAL_REACH
    );
    // Standing on its edge and facing back down the causeway. It turns like
    // the maze's portal, but in its own plane — spinning the Phaser object
    // would twirl the whole gate around like a coin.
    const gate = portalModel(this);
    view3d(this).bind(this.portal, upright(gate, PORTAL_SIZE * 0.37, PORTAL_SCALE), {
      sync: (_portal, _model, dt) => {
        gate.rotation.z -= dt;
      },
    });
  }

  private spawnHero(): void {
    const { x, y } = this.world.start;
    this.hero = this.physics.add
      .sprite(x, y, "hero", 0)
      .setScale(HERO_SCALE)
      .setAngle(-90); // facing up the grid, toward the goal
    this.camAngle = this.hero.rotation;
    this.lastSafe = { x, y, rotation: this.hero.rotation };

    view3d(this).bind(this.hero, upright(heroModel({ bothSides: true }), HERO_FOOT), {
      sync: (_hero, model) => {
        model.position.z = this.heroZ;
      },
    });

    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setCollideWorldBounds(true);
    // Arcade bodies stay axis-aligned however the sprite is rotated, so use a
    // circle centred on the triangle. Same reason the maze uses one.
    body.setCircle(
      HERO_RADIUS,
      HERO_BODY.x + HERO_BODY.w / 2 - HERO_RADIUS,
      HERO_BODY.y + HERO_BODY.h / 2 - HERO_RADIUS
    );
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
    this.livesText = this.add.text(0, 0, "", label("#ff5a7a")).setOrigin(1, 0);
    for (const t of [this.scoreText, this.crystalText, this.livesText]) {
      t.setScrollFactor(0).setDepth(20);
    }
    this.updateCrystalText();
    this.updateLivesText();

    // The pad's arrows say all this themselves, and sit where the hint would.
    if (this.pad) return this.finishHud();

    this.hintText = this.add
      .text(0, 0, "UP walks  •  DOWN backs up  •  LEFT / RIGHT turn", {
        fontSize: "16px",
        fontFamily: "monospace",
        color: "#ffd9b0",
        align: "center",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20);
    this.tweens.add({
      targets: this.hintText,
      alpha: 0,
      delay: 4200,
      duration: 900,
      onComplete: () => {
        this.hintText?.destroy();
        this.hintText = undefined;
      },
    });

    this.finishHud();
  }

  private finishHud(): void {
    this.layoutUi();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutUi, this);
  }

  private layoutUi(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.scoreText.setPosition(16, 14);
    this.crystalText.setPosition(16, 44);
    this.livesText.setPosition(w - 16, 14);
    this.hintText?.setPosition(w / 2, h - 40).setWordWrapWidth(w - 32);
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
    this.pad = DPad.wanted(this) ? new DPad(this) : undefined;

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutUi, this);
    });
  }

  /**
   * `turn` is -1 (left) to 1 (right); `drive` is 1 forward, negative to back
   * up. From the keyboard or the D-pad — or, with neither, a held mouse.
   */
  private readSteering(): { turn: number; drive: number } {
    const held = (dir: "up" | "down" | "left" | "right") =>
      this.cursors[dir].isDown || this.wasd[dir].isDown || (this.pad?.[dir] ?? false);
    let turn = 0;
    let drive = 0;
    if (held("left")) turn -= 1;
    if (held("right")) turn += 1;
    if (held("up")) drive += 1;
    if (held("down")) drive -= 1;
    if (turn !== 0 || drive !== 0 || this.pad) return { turn, drive };

    // Mouse: hold to walk, and hold off to one side to turn that way. The
    // harder the turn the slower the walk, down to nearly on the spot at the
    // edge of the window. Not offered alongside the pad — a thumb on a button
    // is a held pointer too.
    const pointer = this.input.activePointer;
    if (pointer.isDown) {
      const half = this.scale.width / 2;
      const offset = (pointer.x - half) / (half * 0.7);
      turn = Math.abs(offset) < 0.12 ? 0 : Phaser.Math.Clamp(offset, -1, 1);
      drive = 1 - 0.8 * Math.abs(turn);
    }
    return { turn, drive };
  }

  // ---- events ------------------------------------------------------------

  private collectCrystal(crystal: Phaser.Physics.Arcade.Image): void {
    if (this.finished || this.sinking) return;
    this.collected++;
    this.score += CRYSTAL_POINTS;
    this.scoreText.setText(String(this.score));
    this.updateCrystalText();
    crystal.destroy();
    playScore();

    this.crystalText.setScale(1.3);
    this.tweens.add({ targets: this.crystalText, scale: 1, duration: 220 });
  }

  private fallIn(): void {
    if (this.finished || this.sinking) return;
    this.sinking = true;
    this.lives--;
    this.updateLivesText();
    playCrash();

    (this.hero.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.hero.anims.stop();
    this.cameras.main.flash(260, 255, 130, 30);
    // Deep enough that the bristles go under too.
    this.tweens.add({
      targets: this,
      heroZ: -(LAVA_DROP + 62),
      duration: 480,
      ease: "Quad.easeIn",
    });

    if (this.lives <= 0) {
      this.finished = true;
      this.time.delayedCall(950, () => {
        this.scene.start("GameOverScene", { score: this.score });
      });
      return;
    }
    this.time.delayedCall(700, () => this.respawn());
  }

  private respawn(): void {
    const { x, y, rotation } = this.lastSafe;
    (this.hero.body as Phaser.Physics.Arcade.Body).reset(x, y);
    this.hero.rotation = rotation;
    this.camAngle = rotation;
    this.heroZ = 0;
    this.sinking = false;
    this.steady = true;
    this.tweens.add({
      targets: this.hero,
      alpha: 0.25,
      duration: 110,
      yoyo: true,
      repeat: 3,
    });
  }

  private reachPortal(): void {
    if (this.finished || this.sinking) return;
    this.finished = true;

    this.score += CLEAR_POINTS;
    this.scoreText.setText(String(this.score));
    playLevelClear();

    (this.hero.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.physics.pause();
    this.hero.anims.stop();

    // Hero is lifted into the middle of the gate, spinning as it goes.
    this.tweens.add({
      targets: this.hero,
      x: this.portal.x,
      y: this.portal.y,
      scale: 0,
      angle: this.hero.angle + 720,
      duration: 700,
      ease: "Cubic.easeIn",
    });
    this.tweens.add({
      targets: this,
      heroZ: PORTAL_SIZE * 0.37 * PORTAL_SCALE,
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
      delay: 1100,
      duration: 700,
      onComplete: () => msg.destroy(),
    });
  }

  private updateCrystalText(): void {
    this.crystalText.setText(`CRYSTALS ${this.collected}/${this.world.crystals.length}`);
  }

  private updateLivesText(): void {
    this.livesText.setText("♥".repeat(this.lives));
  }

  override update(_time: number, delta: number): void {
    if (this.finished || this.sinking) return;

    let { turn, drive } = this.readSteering();
    if (this.steady) {
      if (turn === 0 && drive === 0) this.steady = false;
      turn = drive = 0;
    }
    this.hero.rotation = Phaser.Math.Angle.Wrap(
      this.hero.rotation + turn * TURN_SPEED * (delta / 1000)
    );
    const speed = drive * (drive > 0 ? HERO_SPEED : BACK_SPEED);
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(
      Math.cos(this.hero.rotation) * speed,
      Math.sin(this.hero.rotation) * speed
    );

    if (turn !== 0 || drive !== 0) {
      this.hero.anims.play("hero-walk", true);
    } else {
      this.hero.anims.stop();
      this.hero.setFrame(0);
    }

    const { x, y } = this.hero;
    if (!isRock(this.world, x, y)) {
      this.fallIn();
    } else if (
      isRock(this.world, x - SAFE_INSET, y - SAFE_INSET) &&
      isRock(this.world, x + SAFE_INSET, y - SAFE_INSET) &&
      isRock(this.world, x - SAFE_INSET, y + SAFE_INSET) &&
      isRock(this.world, x + SAFE_INSET, y + SAFE_INSET)
    ) {
      this.lastSafe = { x, y, rotation: this.hero.rotation };
    }
  }
}

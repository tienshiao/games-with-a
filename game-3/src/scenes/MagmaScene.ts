import Phaser from "phaser";
import * as THREE from "three";
import { createTextures, CRYSTAL_SIZE, HERO_BODY, QBLOCK_SIZE, SLOT_SIZE } from "../textures";
import { generateMagma, isRock, MAGMA_TILE, type MagmaWorld } from "../magma";
import { playScore, playCrash, playPowerUp, playLevelClear, playLaunch, playLand } from "../sounds";
import { DPad } from "../dpad";
import { MagmaMonster, MONSTER_FORMS } from "../monster";
import { view3d, type ModelHooks } from "../three/world3d";
import {
  crystalModel,
  emberModel,
  heroModel,
  magmaModel,
  qblockModel,
  rocketModel,
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
// What the power boost grows the hero to.
const BOOSTED_SCALE = 3.4;
// Half the triangle's short side — the hitbox radius, in source pixels.
const HERO_RADIUS = HERO_BODY.h / 2;
const LIVES = 3;
const CRYSTAL_POINTS = 5;
// Awarded for each form of the boss beaten, and then for the whole of it, on
// top of whatever the run carried in.
const FORM_POINTS = 10;
const CLEAR_POINTS = 30;
const CRYSTAL_SCALE = 1.6;
const CRYSTAL_REACH = 24;
const BLOCK_SCALE = 2;
const BLOCK_REACH = 42;
// How high the block's centre floats, in its own pixels: clear of the ground
// by a little under half its height.
const BLOCK_LIFT = QBLOCK_SIZE / 2 + 7;
const HUD_MARGIN = 18;
// The boss's hits left, as a row of pips at the top of the screen.
const PIP_WIDTH = 16;
const PIP_GAP = 3;
const PIP_FORM_GAP = 10;
// Where the hero starts again after losing to the boss: this far back down
// the causeway from the block, on the slab the bridge leaves from.
const RETRY_BACK = MAGMA_TILE * 2.5;
// How long the hero can't be burned again after a burn, or after climbing
// back out of the lava.
const SHIELD_MS = 1500;
// And after ramming the boss: it heats straight back up, with the hero still
// right on top of it.
const RAM_GRACE_MS = 1200;
// A spot only counts as safe to come back to if there is rock this far from
// it on every side, so a respawn never lands teetering on an edge.
const SAFE_INSET = 30;

// The chase camera: this far behind the hero and above the ground, aimed at a
// point ahead of it, and swinging round behind a turn rather than snapping.
// It backs off when the hero grows, and again for the boss so that more of
// the arena is in view.
const CAMERAS = {
  walk: { back: 240, height: 190, ahead: 120, look: 24 },
  boosted: { back: 330, height: 260, ahead: 150, look: 44 },
  fight: { back: 440, height: 390, ahead: 170, look: 44 },
};
const CAM_EASE = 5;
const CAM_ZOOM_EASE = 1.6;

// The rocket that comes for the hero once the boss is beaten: big enough to
// hold it even boosted, landing this far ahead of it but well inside the
// arena, coming down from this high.
const ROCKET_SCALE = 7;
/** From the rocket's middle down to its fin tips, so it stands on them. */
const ROCKET_TAIL = 25 * ROCKET_SCALE;
/** Its hull's radius: where the hero climbs in. */
const ROCKET_HATCH = 9 * ROCKET_SCALE;
const ROCKET_AHEAD = 320;
const ROCKET_CLEARANCE = 170;
const ROCKET_FROM = 2600;

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
 * ground it stood on. The crystals along the way are a bonus, not a key.
 *
 * The causeway ends at a bridge with a "?" block floating over it: the block
 * bursts, the power boost inside drops into the inventory slot, and the hero
 * grows. Past it is the arena and the boss (see monster.ts). Ram it while it
 * has cooled and it takes a hit; touch it while it is molten and it costs a
 * life. Beating its last form brings a rocket down into the arena, which
 * takes the hero on to planet NUCLEAR (see NuclearScene).
 *
 * Running out of lives ends the game — unless the block has been opened.
 * From then on it is a checkpoint, and the hero starts again in front of it.
 */
export class MagmaScene extends Phaser.Scene {
  private world!: MagmaWorld;
  private hero!: Phaser.Physics.Arcade.Sprite;
  private crystals!: Phaser.Physics.Arcade.StaticGroup;
  private block!: Phaser.Physics.Arcade.Image;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
  /** Only on touch screens. */
  private pad?: DPad;

  private scoreText!: Phaser.GameObjects.Text;
  private crystalText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private hintText?: Phaser.GameObjects.Text;
  private itemSlot!: Phaser.GameObjects.Image;
  private slotItem?: Phaser.GameObjects.Image;
  private bossPips!: Phaser.GameObjects.Graphics;
  private bossText!: Phaser.GameObjects.Text;
  /** Only once the hero has walked into the arena. */
  private monster?: MagmaMonster;

  private score = 0;
  private collected = 0;
  private lives = LIVES;
  private finished = false;
  private sinking = false;
  private boosted = false;
  /** Held still while the boost takes hold. */
  private frozen = false;
  /** Until this time the hero can't be burned. */
  private shieldUntil = 0;
  /** The score the hero reached the block with, to start again from. */
  private blockScore = 0;
  private blinking?: Phaser.Tweens.Tween;
  // Set by a respawn and cleared once the controls are let go: whoever walked
  // the hero into the lava is usually still holding the key that did it.
  private steady = false;
  /** The hero's height off the ground: zero except while it sinks or exits. */
  private heroZ = 0;
  private camAngle = 0;
  private cam = { ...CAMERAS.walk };
  private lastSafe = { x: 0, y: 0, rotation: 0 };
  /** The hero's position in the 3D world, for scenery that keeps near it. */
  private focus = new THREE.Vector3();
  /** Only once the boss is beaten and the rocket is on its way. */
  private rocket?: THREE.Group;

  constructor() {
    super({ key: "MagmaScene" });
  }

  create(data: MagmaData): void {
    this.score = data?.score ?? 0;
    this.collected = 0;
    this.lives = LIVES;
    this.finished = false;
    this.sinking = false;
    this.boosted = false;
    this.frozen = false;
    this.shieldUntil = 0;
    this.blockScore = 0;
    this.blinking = undefined;
    this.monster = undefined;
    this.steady = false;
    this.heroZ = 0;
    this.cam = { ...CAMERAS.walk };
    this.slotItem = undefined;
    this.rocket = undefined;

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
    this.spawnHero();
    this.placeBlock();

    this.physics.add.overlap(this.hero, this.crystals, (_hero, crystal) =>
      this.collectCrystal(crystal as Phaser.Physics.Arcade.Image)
    );

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
      this.camAngle +=
        Phaser.Math.Angle.Wrap(this.hero.rotation - this.camAngle) *
        (1 - Math.exp(-CAM_EASE * dt));
      const want = this.monster
        ? CAMERAS.fight
        : this.boosted
          ? CAMERAS.boosted
          : CAMERAS.walk;
      const zoom = 1 - Math.exp(-CAM_ZOOM_EASE * dt);
      for (const key of ["back", "height", "ahead", "look"] as const) {
        this.cam[key] += (want[key] - this.cam[key]) * zoom;
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
      const { back, height, ahead, look } = this.cam;
      camera.position.set(this.focus.x - fx * back, this.focus.y - fy * back, height);
      // Looking up after the rocket as it takes off.
      const climb = this.rocket ? Math.max(0, this.rocket.position.z - ROCKET_TAIL) * 0.8 : 0;
      camera.lookAt(this.focus.x + fx * ahead, this.focus.y + fy * ahead, look + climb);
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

  private placeBlock(): void {
    // Over the middle of the bridge, so there is no reaching the arena
    // without it.
    const { x, y } = this.world.block;
    this.block = this.physics.add.staticImage(x, y, "qblock");
    (this.block.body as Phaser.Physics.Arcade.StaticBody).setCircle(
      BLOCK_REACH,
      QBLOCK_SIZE / 2 - BLOCK_REACH,
      QBLOCK_SIZE / 2 - BLOCK_REACH
    );
    // Floating a little off the rock and bobbing, like the crystals.
    const cube = qblockModel(this, { spin: true });
    view3d(this).bind(this.block, upright(cube, BLOCK_LIFT, BLOCK_SCALE), {
      sync: (_block, model) => {
        model.position.z = Math.sin(this.time.now / 420) * 5;
      },
    });
    this.physics.add.overlap(this.hero, this.block, () => this.openBlock());
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
    this.bossPips = this.add.graphics().setScrollFactor(0).setDepth(20);
    this.bossText = this.add
      .text(0, 0, "", { ...label("#ffffff"), fontSize: "20px" })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(20);
    // The inventory slot sits empty until the "?" block's boost lands in it.
    this.itemSlot = this.add
      .image(0, 0, "item-slot")
      .setScrollFactor(0)
      .setDepth(20)
      .setAlpha(0.45);
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
    // Below the crystal count, which on a phone reaches the middle.
    this.bossText.setPosition(w / 2, 76);
    this.drawBoss();
    // Bottom right, not centred as in level 1: the middle of this screen's
    // bottom edge has the hint on it, and on a phone the D-pad reaches it.
    this.itemSlot.setPosition(
      w - HUD_MARGIN - SLOT_SIZE / 2,
      h - HUD_MARGIN - SLOT_SIZE / 2
    );
    // Leave the item alone mid-flight — the pickup tween owns its position.
    if (this.slotItem && !this.tweens.isTweening(this.slotItem)) {
      this.slotItem.setPosition(this.itemSlot.x, this.itemSlot.y);
    }
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
      this.outOfLives();
      return;
    }
    this.time.delayedCall(700, () => this.respawn());
  }

  /** Game over — or, past the block, back to the block. */
  private outOfLives(): void {
    this.finished = true;
    if (!this.boosted) {
      this.time.delayedCall(950, () => {
        this.scene.start("GameOverScene", { score: this.score });
      });
      return;
    }
    this.time.delayedCall(700, () => this.cameras.main.fadeOut(240, 0, 0, 0));
    this.time.delayedCall(960, () => this.retryFromBlock());
  }

  /**
   * Put everything from the block on back as it was: the boss gone, the block
   * closed, the slot empty and the hero small again in front of it.
   */
  private retryFromBlock(): void {
    this.monster?.destroy();
    this.monster = undefined;
    this.bossPips.clear();
    this.bossText.setText("");
    this.slotItem?.destroy();
    this.slotItem = undefined;
    this.itemSlot.setAlpha(0.45);
    if (!this.block.active) this.placeBlock();

    this.score = this.blockScore;
    this.scoreText.setText(String(this.score));
    this.lives = LIVES;
    this.updateLivesText();

    const { x, y } = this.world.block;
    const rotation = -Math.PI / 2;
    this.tweens.killTweensOf(this.hero);
    this.tweens.killTweensOf(this);
    this.blinking = undefined;
    (this.hero.body as Phaser.Physics.Arcade.Body).reset(x, y + RETRY_BACK);
    this.hero.setScale(HERO_SCALE).setAlpha(1).setRotation(rotation).setFrame(0);
    this.camAngle = rotation;
    this.heroZ = 0;
    this.lastSafe = { x, y: y + RETRY_BACK, rotation };

    this.boosted = false;
    this.frozen = false;
    this.sinking = false;
    this.finished = false;
    this.steady = true;
    this.shieldUntil = 0;

    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.flashMessage("TRY AGAIN!", "#ffb04a");
  }

  private respawn(): void {
    const { x, y, rotation } = this.lastSafe;
    (this.hero.body as Phaser.Physics.Arcade.Body).reset(x, y);
    this.hero.rotation = rotation;
    this.camAngle = rotation;
    this.heroZ = 0;
    this.sinking = false;
    this.steady = true;
    this.shield();
  }

  /** Blink, and be safe from burns while it lasts. */
  private shield(): void {
    this.shieldUntil = this.time.now + SHIELD_MS;
    this.blinking?.stop();
    this.hero.setAlpha(1);
    this.blinking = this.tweens.add({
      targets: this.hero,
      alpha: 0.25,
      duration: 110,
      yoyo: true,
      repeat: Math.round(SHIELD_MS / 220) - 1,
    });
  }

  /** A burst of sparks on the HUD, over a point in the world. */
  private sparks(x: number, y: number, z: number, count: number): void {
    const at = view3d(this).toScreen(x, y, z);
    this.add
      .particles(at.x, at.y, "spark", {
        speed: { min: 90, max: 320 },
        scale: { start: 1.4, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: 520,
        blendMode: "ADD",
        emitting: false,
      })
      .setScrollFactor(0)
      .setDepth(19)
      .explode(count);
  }

  private openBlock(): void {
    if (this.boosted || this.finished || this.sinking) return;
    this.boosted = true;
    this.frozen = true;
    this.blockScore = this.score;
    playPowerUp();

    (this.hero.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.hero.anims.stop();
    this.hero.setFrame(0);

    // The block bursts. The HUD is flat and the block isn't, so everything
    // from here on starts from where the block was on screen.
    const height = BLOCK_LIFT * BLOCK_SCALE;
    const from = view3d(this).toScreen(this.block.x, this.block.y, height);
    this.sparks(this.block.x, this.block.y, height, 28);
    this.tweens.add({
      targets: this.block,
      scale: 1.5,
      alpha: 0,
      duration: 220,
      onComplete: () => this.block.destroy(),
    });

    // The power boost hangs where the block was for a beat, then flies into
    // the slot.
    const boost = this.add
      .image(from.x, from.y, "boost")
      .setScrollFactor(0)
      .setDepth(21)
      .setScale(0);
    this.slotItem = boost;
    this.itemSlot.setAlpha(1);
    this.tweens.add({ targets: boost, scale: 2.6, duration: 260, ease: "Back.easeOut" });
    this.tweens.add({
      targets: boost,
      x: this.itemSlot.x,
      y: this.itemSlot.y,
      scale: 1,
      delay: 520,
      duration: 520,
      ease: "Cubic.easeInOut",
    });
    this.tweens.add({
      targets: this.itemSlot,
      scale: 1.25,
      duration: 160,
      delay: 1030,
      yoyo: true,
      ease: "Back.easeOut",
    });

    // Then it takes hold, and the hero is let go again at its new size and
    // with all its lives back for the fight ahead.
    this.time.delayedCall(1050, () => {
      playPowerUp();
      this.flashMessage("POWER BOOST!", "#ffe23a");
      this.growHero();
      this.lives = LIVES;
      this.updateLivesText();
    });
    this.time.delayedCall(1750, () => {
      this.frozen = false;
    });
  }

  // ---- the boss ----------------------------------------------------------

  private startFight(): void {
    this.monster = new MagmaMonster(this, this.world.arena, {
      changed: () => this.drawBoss(),
      burst: (x, y, form) => {
        this.score += FORM_POINTS;
        this.scoreText.setText(String(this.score));
        this.sparks(x, y, MONSTER_FORMS[form]!.radius, 36);
      },
      defeated: () => this.win(),
    });
    this.drawBoss();
    this.flashMessage("MAGMA MONSTER!", "#ff7a2a");
  }

  /** Move the boss, then see what touching it means this frame. */
  private fight(dt: number): void {
    const monster = this.monster!;
    monster.update(dt, this.hero.x, this.hero.y);
    const { x, y } = this.hero;
    if (!monster.touches(x, y, HERO_RADIUS * this.hero.scale)) return;
    if (monster.open) {
      monster.ram(x, y);
      this.shieldUntil = Math.max(this.shieldUntil, this.time.now + RAM_GRACE_MS);
    } else if (this.time.now >= this.shieldUntil) {
      monster.shove(x, y);
      this.burn();
    }
  }

  private burn(): void {
    this.lives--;
    this.updateLivesText();
    playCrash();
    this.cameras.main.flash(260, 255, 130, 30);
    if (this.lives > 0) {
      this.shield();
      return;
    }

    (this.hero.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.hero.anims.stop();
    this.blinking?.stop();
    this.tweens.add({ targets: this.hero, alpha: 0, duration: 500 });
    this.outOfLives();
  }

  private win(): void {
    this.finished = true;
    this.score += CLEAR_POINTS;
    this.scoreText.setText(String(this.score));
    this.drawBoss();
    playLevelClear();
    this.flashMessage("MONSTER DEFEATED!", "#7dffc8");

    (this.hero.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.hero.anims.stop();
    this.hero.setFrame(0);
    // A few hops on the spot.
    this.tweens.add({
      targets: this,
      heroZ: 40,
      duration: 190,
      ease: "Quad.easeOut",
      yoyo: true,
      repeat: 3,
    });

    this.time.delayedCall(2200, () => this.callRocket());
  }

  /**
   * The way off this planet: a rocket comes down in the arena, the hero
   * walks over and climbs in, and it takes off for planet NUCLEAR.
   */
  private callRocket(): void {
    const arena = this.world.arena;
    const x = Phaser.Math.Clamp(
      this.hero.x + Math.cos(this.hero.rotation) * ROCKET_AHEAD,
      arena.x + ROCKET_CLEARANCE,
      arena.x + arena.width - ROCKET_CLEARANCE
    );
    const y = Phaser.Math.Clamp(
      this.hero.y + Math.sin(this.hero.rotation) * ROCKET_AHEAD,
      arena.y + ROCKET_CLEARANCE,
      arena.y + arena.height - ROCKET_CLEARANCE
    );

    const model = rocketModel({ flame: true });
    model.userData.thrust = 1;
    // Stood on its tail: the nose (+x) turned to point up (+z).
    model.rotation.y = -Math.PI / 2;
    model.scale.setScalar(ROCKET_SCALE);
    const rocket = new THREE.Group();
    rocket.add(model);
    rocket.position.set(x, -y, ROCKET_FROM);
    rocket.userData.sync = (dt: number) => (model.userData as ModelHooks).sync?.(dt);
    view3d(this).add(rocket);
    this.rocket = rocket;
    playLaunch();

    this.tweens.add({
      targets: rocket.position,
      z: ROCKET_TAIL,
      duration: 1700,
      ease: "Cubic.easeOut",
      onComplete: () => {
        playLand();
        this.tweens.add({ targets: model.userData, thrust: 0, duration: 400 });
        this.boardRocket(x, y, model);
      },
    });
  }

  private boardRocket(x: number, y: number, model: THREE.Group): void {
    // Turn to face it and walk over to the hatch in its side, then shrink
    // in through it.
    const angle = Math.atan2(y - this.hero.y, x - this.hero.x);
    const dist = Math.max(0, Phaser.Math.Distance.Between(this.hero.x, this.hero.y, x, y) - ROCKET_HATCH);
    this.hero.rotation = angle;
    this.hero.anims.play("hero-walk", true);
    const walk = (dist / HERO_SPEED) * 1000;
    this.tweens.add({
      targets: this.hero,
      x: this.hero.x + Math.cos(angle) * dist,
      y: this.hero.y + Math.sin(angle) * dist,
      duration: walk,
      delay: 250,
      onComplete: () => {
        this.hero.anims.stop();
        this.hero.setFrame(0);
      },
    });
    this.tweens.add({
      targets: this.hero,
      scale: 0,
      delay: 250 + walk - 220,
      duration: 260,
      ease: "Quad.easeIn",
    });

    this.time.delayedCall(250 + walk + 500, () => {
      playLaunch();
      this.cameras.main.shake(1000, 0.006);
      this.flashMessage("TO PLANET NUCLEAR!", "#9dff7a");
      this.tweens.add({ targets: model.userData, thrust: 1, duration: 300 });
      this.tweens.add({
        targets: this.rocket!.position,
        z: ROCKET_FROM * 2,
        duration: 2400,
        ease: "Quad.easeIn",
      });
      this.time.delayedCall(1700, () => {
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.time.delayedCall(520, () => this.scene.start("NuclearScene", { score: this.score }));
      });
    });
  }

  /**
   * The boss's pips: one per hit left, grouped by form, each form's a little
   * shorter than the last — and under them, what to do about it right now.
   */
  private drawBoss(): void {
    const monster = this.monster;
    if (!monster) return;
    const g = this.bossPips;
    g.clear();
    if (this.finished) {
      this.bossText.setText("");
      return;
    }

    const pips = MONSTER_FORMS.reduce((n, form) => n + form.hits, 0);
    const span =
      pips * PIP_WIDTH +
      (pips - MONSTER_FORMS.length) * PIP_GAP +
      (MONSTER_FORMS.length - 1) * PIP_FORM_GAP;
    let x = this.scale.width / 2 - span / 2;
    MONSTER_FORMS.forEach((form, i) => {
      const h = 17 - i * 3;
      for (let hit = 0; hit < form.hits; hit++) {
        const left = i > monster.form || (i === monster.form && hit < monster.hitsLeft);
        g.fillStyle(left ? 0xff6a1a : 0x1c1214, left ? 1 : 0.55);
        g.fillRoundedRect(x, 26 - h / 2, PIP_WIDTH, h, 3);
        g.lineStyle(2, 0x000000, 0.85);
        g.strokeRoundedRect(x, 26 - h / 2, PIP_WIDTH, h, 3);
        x += PIP_WIDTH + PIP_GAP;
      }
      x += PIP_FORM_GAP - PIP_GAP;
    });

    const last = monster.form === MONSTER_FORMS.length - 1;
    if (monster.open) {
      this.bossText.setText(last ? "CATCH IT!" : "RAM IT!").setColor("#7dffc8");
    } else if (monster.burns) {
      this.bossText.setText("TOO HOT!").setColor("#ff7a2a");
    } else {
      this.bossText.setText("");
    }
  }

  /** The boost taking hold: the hero swells in fits and starts, each bigger than the last. */
  private growHero(): void {
    const sizes = [0.5, 0.2, 0.8, 0.55, 1].map(
      (f) => HERO_SCALE + (BOOSTED_SCALE - HERO_SCALE) * f
    );
    this.tweens.chain({
      targets: this.hero,
      tweens: sizes.map((scale) => ({ scale, duration: 130, ease: "Quad.easeOut" })),
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
    if (this.finished || this.sinking || this.frozen) return;

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
      return;
    }
    if (
      isRock(this.world, x - SAFE_INSET, y - SAFE_INSET) &&
      isRock(this.world, x + SAFE_INSET, y - SAFE_INSET) &&
      isRock(this.world, x - SAFE_INSET, y + SAFE_INSET) &&
      isRock(this.world, x + SAFE_INSET, y + SAFE_INSET)
    ) {
      this.lastSafe = { x, y, rotation: this.hero.rotation };
    }

    // Squeezing past the block on the bridge still counts as hitting it.
    if (!this.boosted && y < this.world.block.y) this.openBlock();

    const arena = this.world.arena;
    if (this.monster) {
      this.fight(delta / 1000);
    } else if (this.boosted && !this.frozen && y < arena.y + arena.height - MAGMA_TILE / 3) {
      this.startFight();
    }
  }
}

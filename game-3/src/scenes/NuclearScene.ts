import Phaser from "phaser";
import * as THREE from "three";
import { createTextures, HERO_BODY } from "../textures";
import { Planet, PLANET_RADIUS, POLE } from "../planet";
import { playLand, playLaunch, playLevelClear } from "../sounds";
import { DPad } from "../dpad";
import { view3d, type ModelHooks } from "../three/world3d";
import { heroModel, rocketModel, upright, HERO_FOOT } from "../three/models";
import { atmosphereModel, NUCLEAR_HAZE, planetModel, shadowModel, Sky } from "../three/nuclear";

const R = PLANET_RADIUS;
const HERO_SPEED = 230;
const BACK_SPEED = 110;
/** Radians per second with a turn key held. */
const TURN_SPEED = 2.6;
const HERO_SCALE = 1.8;
// Half the triangle's short side, at the hero's scale: its footprint.
const HERO_RADIUS = (HERO_BODY.h / 2) * HERO_SCALE;
const CLEAR_POINTS = 30;
const ROCKET_SCALE = 6;
/** From the rocket's middle down to its fin tips, so it stands on them. */
const ROCKET_TAIL = 25 * ROCKET_SCALE;
/** How close to the rocket the hero has to get to climb aboard. */
const BOARD_REACH = 120;
/** Where it climbs in: the hatch, at the rocket's side. */
const HATCH = 9 * ROCKET_SCALE;
/** The rocket's height, middle to ground, while it drops the hero off. */
const HOVER = 430;
const GRAVITY = 1500;

// The intro, in seconds from the start of the scene: the rocket flies in
// from space with the camera watching the planet, then the camera swoops
// down after it, the hero drops out over the maze, and the rocket goes off
// to wait on the hill past the exit.
const ARRIVE = 4.2;
const SWOOP = [1.6, 4.4] as const;
const DROP = 4.5;
const SETTLE = 4.9;
const BLEND = [4.9, 6.6] as const;
const DEPART = 5.6;
const PARK = 9.2;
// After boarding: lift-off, and how long until the screen goes.
const LIFTOFF = 0.9;
const LEAVE = 3.4;

// The chase camera: behind the hero and above the hedges, aimed a little
// ahead, swinging round behind a turn rather than snapping.
const CAMERA = { back: 200, height: 300, ahead: 210, look: 0 };
const CAM_EASE = 5;

interface NuclearData {
  score?: number;
}

type Phase = "intro" | "play" | "board";

const smooth = (lo: number, hi: number, x: number) => {
  const t = Phaser.Math.Clamp((x - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Level 5, planet NUCLEAR. The rocket that picked the hero up after the
 * magma boss drops it into a hedge maze on an island of a little ocean
 * planet, and lands on a hill past the far side of the maze to wait. Find the
 * way out, walk across the hills to the rocket, and climb in. The sea is too
 * deep to wade into, so the island is as far as the hero can go.
 *
 * There's no Phaser physics here: the hero walks on a sphere, so it's a unit
 * direction from the planet's centre and a heading along the ground, moved by
 * hand each frame and pushed back out of hedges and tree trunks (see
 * planet.ts). The controls are the magma level's — up walks the way the hero
 * faces, down backs up, left/right turn — with the camera behind it, and
 * "up" is always away from the middle of the planet.
 */
export class NuclearScene extends Phaser.Scene {
  private planet!: Planet;
  private phase: Phase = "intro";
  /** Seconds since the scene started. */
  private clock = 0;
  private score = 0;

  private hero!: THREE.Group;
  private heroShadow!: THREE.Mesh;
  private heroDir = new THREE.Vector3();
  private heroFwd = new THREE.Vector3();
  /** Height off the ground — while dropping in, or hopping into the rocket. */
  private heroLift = 0;
  private heroFall = 0;
  private heroSize = 1;
  private landed = false;
  private walkTime = 0;

  private rocket!: THREE.Group;
  private rocketModel!: THREE.Group;
  private rocketShadow!: THREE.Mesh;
  private rocketPos = new THREE.Vector3();
  private rocketNose = new THREE.Vector3();
  private parked = false;
  private boardedAt = 0;
  private launched = false;
  private leaving = false;
  private boardFrom = new THREE.Vector3();
  private rocketGround = new THREE.Vector3();


  private sky!: Sky;
  private atmosphere!: THREE.Mesh;
  private fog = new THREE.Fog(NUCLEAR_HAZE, 900, 4200);
  private camFwd = new THREE.Vector3();
  /** The camera's pose last frame, kept for HUD effects and the lights. */
  private camPos = new THREE.Vector3();
  private camUp = new THREE.Vector3();

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
  private pad?: DPad;
  private scoreText!: Phaser.GameObjects.Text;
  private hintText?: Phaser.GameObjects.Text;

  // Scratch, so the per-frame maths doesn't allocate.
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private basis = new THREE.Matrix4();

  constructor() {
    super({ key: "NuclearScene" });
  }

  create(data: NuclearData): void {
    this.score = data?.score ?? 0;
    this.phase = "intro";
    this.clock = 0;
    this.heroLift = 0;
    this.heroFall = 0;
    this.heroSize = 1;
    this.landed = false;
    this.walkTime = 0;
    this.parked = false;
    this.launched = false;
    this.leaving = false;
    this.hintText = undefined;

    createTextures(this);
    this.planet = new Planet();
    this.heroDir.copy(this.planet.start);
    this.heroFwd.copy(this.planet.startHeading);
    this.camFwd.copy(this.heroFwd);

    this.buildWorld();
    this.bindInput();
    this.buildHud();

    this.cameras.main.fadeIn(500, 0, 0, 0);
    this.time.delayedCall(500, () => this.flashMessage("PLANET NUCLEAR", "#9dff7a", 2200));
  }

  // ---- world -------------------------------------------------------------

  private buildWorld(): void {
    const view = view3d(this);
    view.setBackground(0x02030a);
    view.world.fog = this.fog;
    view.fill.color.set(0xd4ecff);
    view.fill.groundColor.set(0x3c5a2a);
    view.fill.intensity = 1.35;
    view.sun.color.set(0xfff4dc);
    view.sun.intensity = 2.3;

    this.sky = new Sky();
    view.add(this.sky.stars);
    view.add(this.sky.dome);
    view.add(planetModel(this.planet));
    this.atmosphere = atmosphereModel();
    view.add(this.atmosphere);

    this.hero = upright(heroModel({ bothSides: true }), HERO_FOOT, HERO_SCALE);
    this.hero.visible = false;
    view.add(this.hero);
    this.heroShadow = shadowModel(24);
    view.add(this.heroShadow);

    this.rocketModel = rocketModel({ flame: true });
    this.rocketModel.scale.setScalar(ROCKET_SCALE);
    this.rocketModel.userData.thrust = 1;
    this.rocket = new THREE.Group();
    this.rocket.add(this.rocketModel);
    this.rocket.userData.sync = (dt: number) => (this.rocketModel.userData as ModelHooks).sync?.(dt);
    view.add(this.rocket);
    this.rocketShadow = shadowModel(70);
    view.add(this.rocketShadow);

    view.setCameraRig((camera, dt) => this.placeCamera(camera, dt));
  }

  /**
   * Stand a model built with +z up and +x forward on the ground at `dir`,
   * facing as near `heading` as the slope allows. `tilt` leans it from
   * straight up (0) toward the slope of the ground (1).
   */
  private standOn(
    model: THREE.Object3D,
    dir: THREE.Vector3,
    heading: THREE.Vector3,
    lift: number,
    tilt = 0
  ): void {
    const up = this.v1.copy(dir);
    if (tilt > 0) up.lerp(this.groundNormal(dir, heading), tilt).normalize();
    const fwd = this.v2.copy(heading).projectOnPlane(up).normalize();
    const side = this.v3.crossVectors(up, fwd);
    this.basis.makeBasis(fwd, side, up);
    model.quaternion.setFromRotationMatrix(this.basis);
    this.planet.ground(dir, lift, model.position);
  }

  private groundNormal(dir: THREE.Vector3, heading: THREE.Vector3): THREE.Vector3 {
    const step = 20 / R;
    const side = new THREE.Vector3().crossVectors(dir, heading);
    const p0 = this.planet.ground(dir);
    const p1 = this.planet.ground(new THREE.Vector3().copy(dir).addScaledVector(heading, step).normalize());
    const p2 = this.planet.ground(new THREE.Vector3().copy(dir).addScaledVector(side, step).normalize());
    const n = p1.sub(p0).cross(p2.sub(p0)).normalize();
    return n.dot(dir) < 0 ? n.negate() : n;
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
    this.scoreText.setScrollFactor(0).setDepth(20);
    this.layoutUi();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutUi, this);
  }

  /** Shown once the hero is down: what to do here. */
  private showHint(): void {
    const text = this.pad
      ? "Find the way out — the rocket is waiting!"
      : "Find the way out — the rocket is waiting!\nUP walks  •  DOWN backs up  •  LEFT / RIGHT turn";
    this.hintText = this.add
      .text(0, 0, text, {
        fontSize: "16px",
        fontFamily: "monospace",
        color: "#e4ffd0",
        align: "center",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20);
    this.layoutUi();
    this.tweens.add({
      targets: this.hintText,
      alpha: 0,
      delay: 4800,
      duration: 900,
      onComplete: () => {
        this.hintText?.destroy();
        this.hintText = undefined;
      },
    });
  }

  private layoutUi(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.scoreText.setPosition(16, 14);
    // Above the D-pad on a phone, which takes the bottom of the screen.
    this.hintText
      ?.setPosition(w / 2, this.pad ? h * 0.3 : h - 50)
      .setWordWrapWidth(w - 32);
  }

  private bindInput(): void {
    this.cursors = this.input.keyboard!.createCursorKeys();
    const keys = this.input.keyboard!.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key>;
    this.wasd = { up: keys.W!, left: keys.A!, down: keys.S!, right: keys.D! };
    this.pad = DPad.wanted(this) ? new DPad(this) : undefined;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutUi, this);
    });
  }

  /** As in the magma level: keys or the D-pad, or else a held mouse. */
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

    const pointer = this.input.activePointer;
    if (pointer.isDown) {
      const half = this.scale.width / 2;
      const offset = (pointer.x - half) / (half * 0.7);
      turn = Math.abs(offset) < 0.12 ? 0 : Phaser.Math.Clamp(offset, -1, 1);
      drive = 1 - 0.8 * Math.abs(turn);
    }
    return { turn, drive };
  }

  // ---- each frame --------------------------------------------------------

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);
    this.clock += dt;

    this.updateRocket(dt);
    if (this.phase === "intro") this.dropIn(dt);
    else if (this.phase === "play") this.walk(dt);
    else this.board();

    this.placeHero();
  }

  /** The hero falls out of the hovering rocket and lands in the first cell. */
  private dropIn(dt: number): void {
    if (this.clock < DROP) return;
    if (!this.hero.visible) {
      this.hero.visible = true;
      this.heroLift = HOVER - ROCKET_TAIL;
      this.heroFall = 0;
    }
    if (!this.landed) {
      this.heroFall -= GRAVITY * dt;
      this.heroLift += this.heroFall * dt;
      if (this.heroLift <= 0) {
        this.heroLift = 0;
        this.landed = true;
        playLand();
        this.cameras.main.shake(140, 0.004);
        // A squash on landing.
        this.heroSize = 0.7;
        this.tweens.add({ targets: this, heroSize: 1, duration: 320, ease: "Back.easeOut" });
      }
    }
    if (this.landed && this.clock >= SETTLE) {
      this.phase = "play";
      this.showHint();
    }
  }

  private walk(dt: number): void {
    const { turn, drive } = this.readSteering();
    if (turn !== 0) this.heroFwd.applyAxisAngle(this.heroDir, -turn * TURN_SPEED * dt);
    const speed = drive * (drive > 0 ? HERO_SPEED : BACK_SPEED);
    if (speed !== 0) {
      const from = this.v1.copy(this.heroDir);
      this.heroDir.addScaledVector(this.heroFwd, (speed * dt) / R).normalize();
      this.planet.collide(this.heroDir, HERO_RADIUS);
      // The sea stops it at the water's edge.
      if (this.planet.isWater(this.heroDir)) this.heroDir.copy(from);
    }
    this.heroFwd.projectOnPlane(this.heroDir).normalize();

    // Walk cycle: the sprite strip's four frames.
    const hooks = this.hero.userData as ModelHooks;
    if (turn !== 0 || drive !== 0) {
      this.walkTime += dt;
      hooks.frame?.(Math.floor(this.walkTime * 10) % 4);
    } else {
      hooks.frame?.(0);
    }

    if (this.parked && Planet.distance(this.heroDir, this.planet.pad) < BOARD_REACH) {
      this.startBoarding();
    }
  }

  private placeHero(): void {
    this.standOn(this.hero, this.heroDir, this.heroFwd, this.heroLift, 0.5);
    if (this.phase === "board") this.hero.scale.setScalar(this.heroSize);
    else this.hero.scale.set(2 - this.heroSize, 2 - this.heroSize, this.heroSize);

    // The shadow stays on the ground and shrinks as the hero rises off it.
    this.standOn(this.heroShadow, this.heroDir, this.heroFwd, 2, 1);
    const s = Phaser.Math.Clamp(1 - this.heroLift / 500, 0.3, 1);
    this.heroShadow.scale.setScalar(s * (this.phase === "board" ? this.heroSize : 1));
    this.heroShadow.visible = this.hero.visible;
  }

  // ---- the rocket --------------------------------------------------------

  private updateRocket(dt: number): void {
    const { planet } = this;
    const up = planet.start;
    const t = this.clock;
    let thrust = 1;

    if (this.phase === "board") {
      // Standing on the pad, then off into the sky.
      const since = t - this.boardedAt - LIFTOFF;
      const climb = since > 0 ? 0.5 * 900 * since * since : 0;
      planet.ground(planet.pad, ROCKET_TAIL + climb, this.rocketPos);
      this.rocketNose.copy(planet.pad);
      thrust = since > 0 ? 1 : 0.4 * smooth(-0.6, 0, since);
    } else if (t < ARRIVE) {
      // In from space along a curve, turning tail-first to land as it nears.
      const { from, bend, hover } = this.introPath();
      const u = 1 - Math.pow(1 - t / ARRIVE, 3);
      const a = this.v1.copy(from).lerp(bend, u);
      const b = this.v2.copy(bend).lerp(hover, u);
      const prev = this.v3.copy(this.rocketPos);
      this.rocketPos.copy(a).lerp(b, u);
      if (t > dt) {
        const heading = prev.subVectors(this.rocketPos, prev).normalize();
        this.rocketNose.copy(heading).lerp(up, smooth(2.4, 3.9, t)).normalize();
      } else {
        this.rocketNose.copy(bend).sub(from).normalize();
      }
    } else if (t < DEPART) {
      // Hovering over the maze while the hero drops out.
      planet.ground(up, HOVER + Math.sin(t * 3) * 6, this.rocketPos);
      this.rocketNose.copy(up);
      thrust = 0.65;
    } else if (t < PARK) {
      // Hop over to the pad: up, across, and down onto it.
      const f = (t - DEPART) / (PARK - DEPART);
      const e = smooth(0, 1, f);
      const dir = this.v1.copy(up).lerp(planet.pad, e).normalize();
      const alt = HOVER + (ROCKET_TAIL - HOVER) * smooth(0.5, 1, f) + Math.sin(Math.PI * f) * 380;
      planet.ground(dir, alt, this.rocketPos);
      const travel = this.v2.subVectors(planet.pad, up).projectOnPlane(dir).normalize();
      this.rocketNose.copy(dir).addScaledVector(travel, Math.sin(Math.PI * f) * 0.35).normalize();
      thrust = 0.75 + 0.25 * Math.sin(Math.PI * f);
    } else {
      // Landed: engines dying away, then quiet.
      planet.ground(planet.pad, ROCKET_TAIL, this.rocketPos);
      this.rocketNose.copy(planet.pad);
      thrust = 1 - smooth(PARK, PARK + 0.5, t);
      if (!this.parked) {
        this.parked = true;
        playLand();
      }
    }

    this.rocketModel.userData.thrust = thrust;
    // The model's nose is +x; keep its porthole facing back toward the maze.
    const nose = this.rocketNose;
    const side = this.v1.copy(planet.startHeading).projectOnPlane(nose).normalize();
    const third = this.v2.crossVectors(nose, side);
    this.basis.makeBasis(nose, side, third);
    this.rocket.quaternion.setFromRotationMatrix(this.basis);
    this.rocket.position.copy(this.rocketPos);

    // Its shadow, on the ground under it once it's low enough to cast one.
    const below = this.rocketGround.copy(this.rocketPos).normalize();
    const alt = this.rocketPos.length() - (R + planet.height(below));
    this.rocketShadow.visible = alt < 1500;
    this.standOn(this.rocketShadow, below, planet.startHeading, 3, 1);
    this.rocketShadow.scale.setScalar(Phaser.Math.Clamp(1.4 - alt / 1200, 0.2, 1.2));
  }

  /** Where the rocket comes in from, the curve it takes, and where it stops. */
  private introPath(): { from: THREE.Vector3; bend: THREE.Vector3; hover: THREE.Vector3 } {
    const { up, ahead, side } = this.startFrame();
    return {
      from: this.spacePose().pos.clone().multiplyScalar(0.86).addScaledVector(up, -R * 0.25),
      bend: new THREE.Vector3()
        .addScaledVector(up, R * 1.9)
        .addScaledVector(side, R * 1.2)
        .addScaledVector(ahead, -R * 0.5),
      hover: this.planet.ground(up, HOVER),
    };
  }

  private startFrame(): { up: THREE.Vector3; ahead: THREE.Vector3; side: THREE.Vector3 } {
    const up = this.planet.start;
    const ahead = this.planet.startHeading;
    return { up, ahead, side: new THREE.Vector3().crossVectors(ahead, up) };
  }

  /**
   * The opening shot: the whole planet from out in space, upright — ice caps
   * at the top and bottom — with the maze's island turned toward us.
   */
  private spacePose(): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const { up } = this.startFrame();
    const east = new THREE.Vector3().crossVectors(POLE, up);
    return {
      pos: new THREE.Vector3()
        .addScaledVector(up, R * 3.6)
        .addScaledVector(east, -R * 1.6)
        .addScaledVector(POLE, R * 0.7),
      look: up.clone().multiplyScalar(R * 0.15),
    };
  }

  /** Off to one side of the first cell, watching the hero drop out of the rocket. */
  private dropPose(): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const { up, ahead, side } = this.startFrame();
    const ground = this.planet.ground(up);
    return {
      pos: ground.clone().addScaledVector(up, 360).addScaledVector(side, 520).addScaledVector(ahead, -320),
      look: ground.clone().addScaledVector(up, HOVER * 0.45),
    };
  }

  // ---- boarding ----------------------------------------------------------

  private startBoarding(): void {
    this.phase = "board";
    this.boardedAt = this.clock;
    this.boardFrom.copy(this.heroDir);
    this.score += CLEAR_POINTS;
    this.scoreText.setText(String(this.score));
    playLevelClear();
    this.flashMessage("ALL ABOARD!", "#9dff7a");
  }

  /** The hero hops across to the rocket and in; then it takes off. */
  private board(): void {
    const since = this.clock - this.boardedAt;
    const reach = 1 - HATCH / Math.max(HATCH, Planet.distance(this.boardFrom, this.planet.pad));
    const f = smooth(0, 0.7, since);
    this.heroDir.copy(this.boardFrom).lerp(this.planet.pad, f * reach).normalize();
    const facing = this.v1.subVectors(this.planet.pad, this.boardFrom).projectOnPlane(this.heroDir);
    if (facing.lengthSq() > 1e-10) this.heroFwd.copy(facing.normalize());
    this.heroLift = Math.sin(Math.PI * f) * 70;
    this.heroSize = 1 - smooth(0.4, 0.7, since);
    this.hero.visible = this.heroSize > 0.02;

    if (!this.launched && since >= LIFTOFF) {
      this.launched = true;
      playLaunch();
      this.cameras.main.shake(900, 0.006);
    }
    if (since >= LEAVE && !this.leaving) {
      this.leaving = true;
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.time.delayedCall(420, () => {
        this.scene.start("GameOverScene", {
          score: this.score,
          cleared: true,
          title: "NUCLEAR CLEARED!",
        });
      });
    }
  }

  // ---- camera ------------------------------------------------------------

  private placeCamera(camera: THREE.PerspectiveCamera, dt: number): void {
    const t = this.clock;
    const { planet } = this;

    // The chase pose, kept up to date from the start so the hand-over is
    // smooth. Once boarding starts it stays where the hero was, rather than
    // following it in under the rocket.
    const boarding = this.phase === "board";
    const anchor = boarding ? this.boardFrom : this.heroDir;
    if (!boarding) {
      this.camFwd.projectOnPlane(this.heroDir).normalize();
      const turn = Math.atan2(
        this.v1.crossVectors(this.camFwd, this.heroFwd).dot(this.heroDir),
        this.camFwd.dot(this.heroFwd)
      );
      this.camFwd.applyAxisAngle(this.heroDir, turn * (1 - Math.exp(-CAM_EASE * dt)));
    }
    const heroAt = planet.ground(anchor, boarding ? 0 : Math.min(this.heroLift, 60));
    const chasePos = heroAt
      .clone()
      .addScaledVector(anchor, CAMERA.height)
      .addScaledVector(this.camFwd, -CAMERA.back);
    const chaseLook = heroAt
      .clone()
      .addScaledVector(this.camFwd, CAMERA.ahead)
      .addScaledVector(anchor, CAMERA.look);
    if (boarding) {
      // Look up after the rocket as it goes.
      chaseLook.lerp(this.rocketPos, 0.2 + 0.4 * smooth(LIFTOFF, LEAVE, t - this.boardedAt));
    }

    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    const up = new THREE.Vector3();
    const drop = this.dropPose();
    if (t < BLEND[0]) {
      // Intro: from out in space, swooping down after the rocket.
      const space = this.spacePose();
      pos.copy(space.pos).lerp(drop.pos, smooth(SWOOP[0], SWOOP[1], t));
      // Watch the planet, then the rocket on the way in, then the drop.
      look
        .copy(space.look)
        .lerp(this.rocketPos, smooth(SWOOP[0] - 0.6, SWOOP[0] + 1.2, t))
        .lerp(drop.look, smooth(SWOOP[1] - 0.5, BLEND[0], t));
      // Turning from the planet's north to straight up from the maze.
      up.copy(POLE).lerp(planet.start, smooth(SWOOP[0], SWOOP[1], t)).normalize();
    } else {
      const f = smooth(BLEND[0], BLEND[1], t);
      pos.copy(drop.pos).lerp(chasePos, f);
      look.copy(drop.look).lerp(chaseLook, f);
      up.copy(planet.start).lerp(anchor, f).normalize();
    }

    // Never down in a hillside.
    const camDir = this.v2.copy(pos).normalize();
    const floor = R + planet.height(camDir) + 40;
    if (pos.length() < floor) pos.setLength(floor);

    camera.fov = camera.aspect < 1 ? 72 : 55;
    camera.near = 4;
    camera.far = 30000;
    camera.up.copy(up);
    camera.position.copy(pos);
    camera.lookAt(look);
    this.camPos.copy(pos);
    this.camUp.copy(up);

    this.updateSkyAndLight(pos, up);
  }

  /**
   * Down on the ground there's a sky and haze; out in space there's neither,
   * just the glow round the planet's rim. The sun keeps to the same place in
   * the sky wherever the hero walks, so it's always daytime on NUCLEAR.
   */
  private updateSkyAndLight(pos: THREE.Vector3, up: THREE.Vector3): void {
    const altitude = pos.length() - R;
    const air = 1 - smooth(500, 2600, altitude);
    this.sky.update(pos, up, air);
    (this.atmosphere.material as THREE.ShaderMaterial).uniforms.opacity!.value = 1 - air;
    this.fog.near = THREE.MathUtils.lerp(60000, 900, air);
    this.fog.far = THREE.MathUtils.lerp(80000, 4200, air);

    const view = view3d(this);
    view.fill.position.copy(up);
    const east = this.v3.set(1, 0, 0.6).projectOnPlane(up);
    if (east.lengthSq() < 1e-6) east.set(0, 0, 1).projectOnPlane(up);
    view.sun.position.copy(up).addScaledVector(east.normalize(), 0.65);
  }

  // ---- effects -----------------------------------------------------------

  private flashMessage(text: string, color: string, hold = 1100): void {
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
      delay: hold,
      duration: 700,
      onComplete: () => msg.destroy(),
    });
  }
}

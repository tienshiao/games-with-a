import Phaser from "phaser";
import type { MagmaRect } from "./magma";
import { playBossHit, playRoar } from "./sounds";
import { monsterModel } from "./three/models";
import { view3d } from "./three/world3d";

// The boss of the magma level. It has four forms, each smaller than the last,
// and beating one bursts it open to let the next out.
//
// Every form runs on the same clock: molten for a while, when touching it
// burns, then cooled for a while, when ramming it counts as a hit. Burning
// something spends its heat too, so a burn is always followed by an opening.
// What changes is how it comes at you while molten — and the last form
// doesn't come at you at all. It is too small to burn, and runs.

type Gait = "lumber" | "charge" | "hop" | "flee";

interface Form {
  /** How close counts as touching it, in world pixels. */
  radius: number;
  speed: number;
  /** Rams it takes. */
  hits: number;
  /** Seconds molten, then seconds cooled. A charger is molten as long as its charge lasts. */
  hot: number;
  cool: number;
  gait: Gait;
}

export const MONSTER_FORMS: readonly Form[] = [
  { radius: 82, speed: 80, hits: 3, hot: 4.5, cool: 3.2, gait: "lumber" },
  { radius: 60, speed: 260, hits: 3, hot: 0, cool: 2.8, gait: "charge" },
  { radius: 40, speed: 170, hits: 2, hot: 3.6, cool: 2.4, gait: "hop" },
  { radius: 26, speed: 185, hits: 1, hot: 2.6, cool: 1.1, gait: "flee" },
];

const COOLED_TINT = 0x5a4a4e;
// A charge: so long swinging round to face the hero, the last of it held
// still so there is a moment to step aside, then a straight dash.
const AIM_TIME = 1;
const AIM_LOCK = 0.25;
const DASH_TIME = 1.1;
const REEL_TIME = 0.8;
const BURST_TIME = 0.55;
// The first form leaps out of the lava beyond the far edge; the rest pop out
// of the one before.
const LEAP_TIME = 1.1;
const LEAP_RUN = 170;
const LEAP_DEPTH = 160;
const LEAP_HEIGHT = 280;
const POP_TIME = 0.5;
const HOP_AIR = 0.42;
const HOP_REST = 0.2;
const HOP_HEIGHT = 46;
// The last form keeps this far from the arena's edges if it can, or it would
// pin itself in the first corner it ran into.
const FLEE_SHY = 130;

type State =
  | "arriving"
  | "molten"
  | "aiming"
  | "dashing"
  | "cooled"
  | "reeling"
  | "bursting"
  | "gone";

export interface MonsterHooks {
  /** Its heat, form or hits left changed — whatever shows them wants redrawing. */
  changed(): void;
  /** A form was beaten and is bursting at this spot. */
  burst(x: number, y: number, form: number): void;
  /** The last form is gone. */
  defeated(): void;
}

export class MagmaMonster {
  x: number;
  y: number;
  /** Index into MONSTER_FORMS. */
  form = 0;
  hitsLeft = 0;

  private scene: Phaser.Scene;
  private arena: MagmaRect;
  private hooks: MonsterHooks;
  /** Invisible; it is there for the 3D model to follow. */
  private carrier!: Phaser.GameObjects.Image;
  private state: State = "arriving";
  private timer = 0;
  /** Height off the ground: a leap, or a hop. */
  private z = 0;
  private facing = Math.PI / 2; // down the grid, toward the bridge
  private vx = 0;
  private vy = 0;
  private hopClock = 0;
  private leaping = false;
  /** Reeling from having burned something, not from being rammed. */
  private spent = false;
  private landY = 0;

  constructor(scene: Phaser.Scene, arena: MagmaRect, hooks: MonsterHooks) {
    this.scene = scene;
    this.arena = arena;
    this.hooks = hooks;
    this.x = arena.x + arena.width / 2;
    this.landY = arena.y + arena.height * 0.3;
    this.y = this.landY;
    this.arrive(true);
  }

  get radius(): number {
    return MONSTER_FORMS[this.form]!.radius;
  }

  /** Molten: touching it burns. */
  get burns(): boolean {
    return (
      this.gait !== "flee" &&
      (this.state === "molten" || this.state === "aiming" || this.state === "dashing")
    );
  }

  /** Cooled off, or just too small to burn: ramming it counts. */
  get open(): boolean {
    return this.state === "cooled" || (this.gait === "flee" && this.state === "molten");
  }

  /** Whether a circle of radius `r` at this point is touching it. */
  touches(x: number, y: number, r: number): boolean {
    if (!this.burns && !this.open) return false;
    return Math.hypot(x - this.x, y - this.y) < this.radius + r;
  }

  /** Rammed while open, by something at this point. */
  ram(fromX: number, fromY: number): void {
    this.hitsLeft--;
    playBossHit();
    if (this.hitsLeft <= 0) {
      this.burst();
      return;
    }
    this.spent = false;
    this.reel(fromX, fromY, 700);
    this.scene.tweens.add({
      targets: this.carrier,
      scaleX: 0.75,
      scaleY: 1.25,
      duration: 90,
      yoyo: true,
    });
    this.hooks.changed();
  }

  /** Knocked back off whatever it has just burned, its heat spent on it. */
  shove(fromX: number, fromY: number): void {
    this.spent = true;
    this.reel(fromX, fromY, 320);
    this.hooks.changed();
  }

  /** Take it out of the world, whatever it was in the middle of. */
  destroy(): void {
    if (this.state === "gone") return;
    this.state = "gone";
    this.scene.tweens.killTweensOf(this.carrier);
    this.carrier.destroy();
  }

  update(dt: number, heroX: number, heroY: number): void {
    if (this.state === "gone") return;
    const form = MONSTER_FORMS[this.form]!;
    const toHero = Math.atan2(heroY - this.y, heroX - this.x);
    this.timer -= dt;

    switch (this.state) {
      case "arriving":
        this.arriving();
        break;
      case "molten":
        if (form.gait === "lumber") {
          this.turn(toHero, 2.5, dt);
          this.step(form.speed, dt);
        } else if (form.gait === "hop") {
          this.hop(toHero, form.speed, dt);
        } else {
          this.flee(heroX, heroY, form.speed, dt);
        }
        // Not in mid-air.
        if (this.timer <= 0 && this.z === 0) this.coolDown();
        break;
      case "aiming":
        if (this.timer > AIM_LOCK) this.turn(toHero, 6, dt);
        if (this.timer <= 0) {
          this.state = "dashing";
          this.timer = DASH_TIME;
        }
        break;
      case "dashing":
        // Running out of arena ends a charge as surely as running out of puff.
        if (this.step(form.speed, dt) || this.timer <= 0) this.coolDown();
        break;
      case "cooled":
        if (this.timer <= 0) this.heatUp();
        break;
      case "reeling": {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        const drag = Math.exp(-5 * dt);
        this.vx *= drag;
        this.vy *= drag;
        this.confine();
        if (this.timer > 0) break;
        if (this.spent) this.coolDown();
        else this.heatUp();
        break;
      }
      case "bursting":
        if (this.timer <= 0) this.afterBurst();
        return;
    }

    this.carrier.setPosition(this.x, this.y).setRotation(this.facing);
  }

  private get gait(): Gait {
    return MONSTER_FORMS[this.form]!.gait;
  }

  // ---- coming and going --------------------------------------------------

  private arrive(leap: boolean): void {
    this.hitsLeft = MONSTER_FORMS[this.form]!.hits;
    this.state = "arriving";
    this.leaping = leap;
    this.timer = leap ? LEAP_TIME : POP_TIME;
    this.z = 0;
    this.hopClock = 0;

    this.carrier = this.scene.add.image(this.x, this.y, "spark").setRotation(this.facing);
    view3d(this.scene).bind(this.carrier, monsterModel(this.form), {
      sync: (_carrier, model) => {
        model.position.z = this.z;
      },
    });
    if (leap) {
      this.arriving();
    } else {
      this.carrier.setScale(0);
      this.scene.tweens.add({
        targets: this.carrier,
        scale: 1,
        duration: POP_TIME * 1000,
        ease: "Back.easeOut",
      });
    }

    playRoar();
    this.hooks.changed();
  }

  private arriving(): void {
    if (this.leaping) {
      const t = Phaser.Math.Clamp(1 - this.timer / LEAP_TIME, 0, 1);
      this.y = this.landY - (1 - t) * LEAP_RUN;
      this.z = Math.sin(Math.PI * t) * LEAP_HEIGHT - (1 - t) * LEAP_DEPTH;
    }
    if (this.timer > 0) return;
    if (this.leaping) {
      this.leaping = false;
      this.y = this.landY;
      this.z = 0;
      playBossHit();
    }
    this.heatUp();
  }

  private burst(): void {
    this.state = "bursting";
    this.timer = BURST_TIME;
    this.carrier.clearTint();
    this.scene.tweens.add({
      targets: this.carrier,
      scale: 1.4,
      alpha: 0,
      duration: BURST_TIME * 1000,
    });
    this.hooks.burst(this.x, this.y, this.form);
    this.hooks.changed();
  }

  private afterBurst(): void {
    this.carrier.destroy();
    if (this.form + 1 < MONSTER_FORMS.length) {
      this.form++;
      this.arrive(false);
    } else {
      this.state = "gone";
      this.hooks.defeated();
    }
  }

  // ---- heat --------------------------------------------------------------

  private heatUp(): void {
    const form = MONSTER_FORMS[this.form]!;
    this.state = form.gait === "charge" ? "aiming" : "molten";
    this.timer = form.gait === "charge" ? AIM_TIME : form.hot;
    this.carrier.clearTint();
    this.hooks.changed();
  }

  private coolDown(): void {
    this.state = "cooled";
    this.timer = MONSTER_FORMS[this.form]!.cool;
    // The last form only stops for breath; there's no crust on it to cool.
    if (this.gait !== "flee") this.carrier.setTint(COOLED_TINT);
    this.hooks.changed();
  }

  private reel(fromX: number, fromY: number, speed: number): void {
    const away = Math.atan2(this.y - fromY, this.x - fromX);
    this.vx = Math.cos(away) * speed;
    this.vy = Math.sin(away) * speed;
    this.state = "reeling";
    this.timer = REEL_TIME;
    this.z = 0;
  }

  // ---- getting about -----------------------------------------------------

  private turn(toward: number, rate: number, dt: number): void {
    const off = Phaser.Math.Angle.Wrap(toward - this.facing);
    this.facing += Phaser.Math.Clamp(off, -rate * dt, rate * dt);
  }

  /** Move the way it faces. True if the edge of the arena stopped it. */
  private step(speed: number, dt: number): boolean {
    this.x += Math.cos(this.facing) * speed * dt;
    this.y += Math.sin(this.facing) * speed * dt;
    return this.confine();
  }

  private confine(): boolean {
    const { x, y, width, height } = this.arena;
    const r = this.radius;
    const cx = Phaser.Math.Clamp(this.x, x + r, x + width - r);
    const cy = Phaser.Math.Clamp(this.y, y + r, y + height - r);
    const stopped = cx !== this.x || cy !== this.y;
    this.x = cx;
    this.y = cy;
    return stopped;
  }

  /** Bound toward the hero, turning only between bounds. */
  private hop(toHero: number, speed: number, dt: number): void {
    this.hopClock += dt;
    const beat = this.hopClock % (HOP_AIR + HOP_REST);
    if (beat < HOP_AIR) {
      this.step(speed, dt);
      this.z = Math.sin((Math.PI * beat) / HOP_AIR) * HOP_HEIGHT;
    } else {
      this.z = 0;
      this.turn(toHero, 9, dt);
    }
  }

  private flee(heroX: number, heroY: number, speed: number, dt: number): void {
    let dx = this.x - heroX;
    let dy = this.y - heroY;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const { x, y, width, height } = this.arena;
    const shy = (gap: number) => Math.max(0, 1 - gap / FLEE_SHY) * 1.6;
    dx += shy(this.x - x) - shy(x + width - this.x);
    dy += shy(this.y - y) - shy(y + height - this.y);
    this.turn(Math.atan2(dy, dx), 9, dt);
    this.step(speed, dt);
  }
}

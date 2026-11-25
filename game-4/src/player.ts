import * as THREE from "three";
import { PLAYER } from "./config";
import { Colliders } from "./collision";
import { part } from "./toon";

// The factory worker: hard hat, overalls, big shovel. Built from simple shapes
// so the son can ask for a different look without anyone opening a 3D app.
//
// Local +z is the way the worker faces.

export type ShovelPose = "carry" | "scoop" | "toss" | "pump";

export class Player {
  readonly root = new THREE.Group();
  readonly pos = this.root.position;
  readonly vel = new THREE.Vector3();
  /** Facing angle around y; forward is (sin, 0, cos). */
  heading = Math.PI;

  private body = new THREE.Group();
  private legL: THREE.Object3D;
  private legR: THREE.Object3D;
  private armL: THREE.Object3D;
  private armR: THREE.Object3D;
  private shovel = new THREE.Group();
  /** Where carried kernels sit; its matrixWorld is the blade's frame. */
  readonly blade = new THREE.Object3D();
  private walkPhase = 0;

  private pose: ShovelPose = "carry";
  private poseTime = 0;
  private swing = 0;

  constructor() {
    const skin = 0xffcc99;
    const overalls = 0xd8402f;
    const shirt = 0xf4f1e6;
    const jeans = 0x2f4f8a;
    const boot = 0x5a3a22;

    this.root.add(this.body);

    // Legs pivot at the hip so they can swing.
    const leg = (x: number) => {
      const hip = new THREE.Group();
      hip.position.set(x, 0.85, 0);
      const thigh = part(new THREE.CylinderGeometry(0.13, 0.12, 0.7, 10), jeans);
      thigh.position.y = -0.35;
      const shoe = part(new THREE.BoxGeometry(0.26, 0.18, 0.4), boot);
      shoe.position.set(0, -0.76, 0.06);
      hip.add(thigh, shoe);
      this.body.add(hip);
      return hip;
    };
    this.legL = leg(0.17);
    this.legR = leg(-0.17);

    const torso = part(new THREE.CapsuleGeometry(0.36, 0.45, 4, 12), overalls);
    torso.position.y = 1.25;
    torso.scale.set(1, 1, 0.8);
    const bib = part(new THREE.BoxGeometry(0.4, 0.3, 0.06), overalls, 0.02);
    bib.position.set(0, 1.45, 0.28);
    const button1 = part(new THREE.SphereGeometry(0.04, 8, 6), 0xffd54f, 0);
    button1.position.set(0.14, 1.57, 0.32);
    const button2 = button1.clone();
    button2.position.x = -0.14;
    const collar = part(new THREE.CylinderGeometry(0.24, 0.3, 0.14, 12), shirt, 0.02);
    collar.position.y = 1.72;
    this.body.add(torso, bib, button1, button2, collar);

    // Head, face and hard hat.
    const head = new THREE.Group();
    head.position.y = 2.05;
    const skull = part(new THREE.SphereGeometry(0.32, 16, 12), skin);
    const nose = part(new THREE.SphereGeometry(0.08, 10, 8), 0xffb38a, 0.02);
    nose.position.set(0, -0.02, 0.31);
    const eye = (x: number) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: 0x1a1208 }));
      e.position.set(x, 0.07, 0.28);
      return e;
    };
    const moustache = part(new THREE.BoxGeometry(0.26, 0.06, 0.06), 0x6b3b1e, 0.015);
    moustache.position.set(0, -0.1, 0.3);
    const hatDome = part(new THREE.SphereGeometry(0.34, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xffc107);
    hatDome.position.y = 0.1;
    const brim = part(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 20), 0xffc107);
    brim.position.set(0, 0.11, 0.06);
    const lamp = part(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 10), 0xfff6c0, 0.015);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0, 0.3, 0.31);
    head.add(skull, nose, eye(0.11), eye(-0.11), moustache, hatDome, brim, lamp);
    this.body.add(head);

    // Arms pivot at the shoulder; both reach for the shovel handle.
    const arm = (x: number) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(x, 1.55, 0);
      const sleeve = part(new THREE.CylinderGeometry(0.1, 0.09, 0.6, 10), shirt);
      sleeve.position.y = -0.3;
      const hand = part(new THREE.SphereGeometry(0.1, 10, 8), skin);
      hand.position.y = -0.62;
      shoulder.add(sleeve, hand);
      this.body.add(shoulder);
      return shoulder;
    };
    this.armL = arm(0.42);
    this.armR = arm(-0.42);

    // The shovel: handle along its local -y→+y, blade at the bottom.
    const handle = part(new THREE.CylinderGeometry(0.045, 0.045, 1.7, 8), 0x9c6b3e, 0.025);
    handle.position.y = 0.85;
    const grip = part(new THREE.BoxGeometry(0.28, 0.07, 0.07), 0x3b2a1a, 0.02);
    grip.position.y = 1.72;
    const bladeMesh = part(new THREE.BoxGeometry(0.62, 0.05, 0.7), 0xa9b4bd);
    bladeMesh.position.set(0, 0, 0.3);
    const lip = part(new THREE.BoxGeometry(0.62, 0.16, 0.05), 0xa9b4bd, 0.02);
    lip.position.set(0, 0.06, -0.03);
    this.blade.position.set(0, 0.03, 0.32);
    this.shovel.add(handle, grip, bladeMesh, lip, this.blade);
    this.body.add(this.shovel);

    this.root.rotation.y = this.heading;
    this.setShovelPose(0);
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  /** Play a shovel move; it eases back to carrying on its own. */
  play(pose: ShovelPose): void {
    this.pose = pose;
    this.poseTime = 0;
  }

  /** While pumping, the pump drives the arms: 0 = handle up, 1 = handle down. */
  pumping(amount: number | null): void {
    if (amount === null) {
      if (this.pose === "pump") this.pose = "carry";
      return;
    }
    this.pose = "pump";
    this.swing = amount;
  }

  /**
   * Walk with `wish` (a world-space direction, length 0..1), turning to face
   * it, then get pushed out of anything solid.
   */
  update(dt: number, wish: THREE.Vector3, colliders: Colliders, faceToward?: THREE.Vector3): void {
    const before = this.pos.clone();
    this.pos.addScaledVector(wish, PLAYER.speed * dt);
    colliders.resolveWalker(this.pos, PLAYER.radius);
    this.vel.copy(this.pos).sub(before).divideScalar(Math.max(dt, 1e-4));

    const speed = wish.length();
    let target: number | null = null;
    if (faceToward) target = Math.atan2(faceToward.x - this.pos.x, faceToward.z - this.pos.z);
    else if (speed > 0.05) target = Math.atan2(wish.x, wish.z);
    if (target !== null) {
      let delta = target - this.heading;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.heading += delta * Math.min(1, PLAYER.turnRate * dt);
    }
    this.root.rotation.y = this.heading;

    // Walk cycle: legs and a little bounce.
    const moving = Math.min(1, this.vel.length() / PLAYER.speed);
    this.walkPhase += dt * (4 + 8 * moving) * (moving > 0.05 ? 1 : 0);
    const stride = Math.sin(this.walkPhase) * 0.7 * moving;
    this.legL.rotation.x = stride;
    this.legR.rotation.x = -stride;
    this.body.position.y = Math.abs(Math.cos(this.walkPhase)) * 0.08 * moving;
    this.body.rotation.z = Math.sin(this.walkPhase) * 0.04 * moving;

    // Shovel moves.
    this.poseTime += dt;
    let s: number;
    if (this.pose === "scoop") {
      // Dip and lift over 0.35 s.
      const t = Math.min(1, this.poseTime / 0.35);
      s = -Math.sin(t * Math.PI);
      if (t >= 1) this.pose = "carry";
    } else if (this.pose === "toss") {
      // Heave up and forward over 0.4 s.
      const t = Math.min(1, this.poseTime / 0.4);
      s = Math.sin(t * Math.PI) * 1.4;
      if (t >= 1) this.pose = "carry";
    } else if (this.pose === "pump") {
      s = 0;
    } else {
      s = 0;
    }
    this.setShovelPose(s);
    this.updatePumpArms();
    this.root.updateMatrixWorld(true);
  }

  /**
   * Shovel position from one number: 0 = carried in front, negative = blade
   * down on the floor (scooping), positive = swung up (tossing).
   */
  private setShovelPose(s: number): void {
    if (this.pose === "pump") {
      // Shovel slung on the back while both hands work the pump.
      this.shovel.position.set(0, 0.7, -0.42);
      this.shovel.rotation.set(0.25, 0, 0.3);
      return;
    }
    // Handle runs from the hands down and forward to the blade.
    const tilt = 1.05 + s * 0.45;
    this.shovel.position.set(0.05, 0.25 - s * 0.05 + (s > 0 ? s * 0.5 : 0), 0.95 + Math.min(0, s) * 0.15);
    this.shovel.rotation.set(tilt - Math.PI / 2 + 0.3, 0, 0);
    // Keep the blade level-ish so kernels sit on it.
    this.shovel.rotation.x = -(Math.PI / 2 - tilt);
    this.armL.rotation.set(-0.9 - s * 0.5, 0, 0.15);
    this.armR.rotation.set(-0.7 - s * 0.5, 0, -0.15);
  }

  private updatePumpArms(): void {
    if (this.pose !== "pump") {
      this.body.rotation.x = 0;
      return;
    }
    // Arms up on the handle; they push down as the handle goes down.
    const down = this.swing;
    this.armL.rotation.set(-2.2 + down * 1.1, 0, 0.1);
    this.armR.rotation.set(-2.2 + down * 1.1, 0, -0.1);
    this.body.rotation.x = down * 0.25;
  }
}

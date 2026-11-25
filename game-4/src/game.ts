import * as THREE from "three";
import { CAMERA, KERNELS, PLAYER, PUMP, ROOM, SHOVEL } from "./config";
import { clamp } from "./collision";
import { Factory } from "./factory";
import { Hud } from "./hud";
import { Input } from "./input";
import { Kernels } from "./kernels";
import { Player } from "./player";
import { Puffs } from "./puffs";

// Ties it together: reads input, walks the worker, runs the shovel and the
// pump, keeps kernels spilling and popcorn flowing, and places the camera.

export class Game {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 200);
  readonly factory: Factory;
  readonly player = new Player();
  readonly kernels: Kernels;
  readonly puffs: Puffs;

  /** Camera orbit: yaw 0 looks toward +z; pitch is how high above the worker. */
  yaw = Math.PI;
  pitch = CAMERA.startPitch;
  private camDist: number = CAMERA.distance;

  private spillCarry = 0;
  private popQueue = 0;
  private popTimer = 0;
  /** Popcorn waiting in the bin, and finished at butter & salt. */
  bin = 0;
  finished = 0;

  private pumpDown = 0;
  private pumpBottomed = false;
  private actionWas = false;
  private ray = new THREE.Raycaster();

  constructor(
    private input: Input,
    private hud: Hud
  ) {
    this.scene.background = new THREE.Color(0x2a1d14);
    this.scene.fog = new THREE.Fog(0x2a1d14, 30, 60);

    const sky = new THREE.HemisphereLight(0xfff4d6, 0x6b4a2f, 1.4);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-8, 16, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -24;
    sc.right = 24;
    sc.top = 16;
    sc.bottom = -16;
    sc.near = 1;
    sc.far = 50;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sky, sun, sun.target);

    this.factory = new Factory(this.scene);
    this.kernels = new Kernels(this.scene, this.factory.colliders);
    this.puffs = new Puffs(this.scene);
    this.kernels.sinks.push({ box: this.factory.hopper, onKernel: () => this.popQueue++ });

    this.player.pos.set(-2, 0, 5);
    this.scene.add(this.player.root);
  }

  update(dt: number): void {
    const input = this.input;
    input.update();

    // Look.
    const look = input.takeLook();
    this.yaw -= look.x;
    this.pitch = clamp(this.pitch + look.y, CAMERA.minPitch, CAMERA.maxPitch);

    // Walk, relative to where the camera faces.
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const wish = fwd.multiplyScalar(input.move.y).addScaledVector(right, input.move.x);
    if (wish.lengthSq() > 1) wish.normalize();

    // Close enough to the pump? Then the action button works the handle.
    const atPump = this.player.pos.distanceTo(this.factory.pumpStand) < PUMP.reach;
    const pumping = atPump && input.action && this.kernels.carriedCount === 0;
    this.updatePump(dt, pumping);
    if (pumping) {
      // Step up to the handle and stay put while working it.
      wish.multiplyScalar(0);
      const stand = this.factory.pumpStand;
      this.player.pos.x += (stand.x - this.player.pos.x) * Math.min(1, 10 * dt);
      this.player.pos.z += (stand.z - this.player.pos.z) * Math.min(1, 10 * dt);
    }
    this.player.update(dt, wish, this.factory.colliders, pumping ? this.factory.pumpGrip : undefined);

    // Shovel: each press scoops, or tosses if the shovel is loaded.
    const pressed = input.action && !this.actionWas;
    this.actionWas = input.action;
    if (pressed && !(atPump && this.kernels.carriedCount === 0)) this.useShovel();

    this.player.root.updateMatrixWorld(true);
    this.kernels.placeCarried(this.player.blade.matrixWorld);

    // The jam: kernels keep pouring out of the cleaner.
    this.spillCarry += KERNELS.spillRate * dt;
    const f = this.factory;
    while (this.spillCarry >= 1) {
      this.spillCarry -= 1;
      if (this.kernels.full) {
        this.spillCarry = 0;
        break;
      }
      this.kernels.spawn(
        f.spillFrom.x + (Math.random() - 0.5) * 0.3,
        f.spillFrom.y,
        f.spillFrom.z,
        f.spillDir.x * 3 + (Math.random() - 0.5) * 1.5,
        f.spillDir.y * 3 + Math.random(),
        f.spillDir.z * 3 + Math.random() * 1.5
      );
    }
    this.kernels.update(dt, { pos: this.player.pos, vel: this.player.vel, radius: PLAYER.radius * 0.8 });

    // The popper pops what went in its hopper and throws it into the bin.
    if (this.popQueue > 0) {
      f.popperBusy(0.5);
      this.popTimer -= dt;
      while (this.popQueue > 0 && this.popTimer <= 0) {
        this.popQueue--;
        this.popTimer += 0.05;
        const land = f.binCenter.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.8, (Math.random() - 0.5) * 1.4));
        this.puffs.arc(f.popperChute, land, 1.2, 0.7, () => this.bin++);
      }
    } else {
      this.popTimer = 0;
    }
    this.puffs.update(dt);
    f.setFill(Math.min(1, this.bin / 80), Math.min(1, this.finished / 150));
    f.update(dt);

    this.hud.update(atPump && this.kernels.carriedCount === 0 ? "PUMP" : this.kernels.carriedCount > 0 ? "TOSS" : "SCOOP");
    this.placeCamera(dt);
  }

  private useShovel(): void {
    const p = this.player;
    const fwd = p.forward;
    if (this.kernels.carriedCount > 0) {
      p.play("toss");
      this.kernels.toss(
        fwd.x * SHOVEL.tossForward + p.vel.x,
        SHOVEL.tossUp,
        fwd.z * SHOVEL.tossForward + p.vel.z
      );
    } else {
      p.play("scoop");
      const at = p.pos.clone().addScaledVector(fwd, 0.9);
      this.kernels.scoop(at, fwd, SHOVEL.reach, SHOVEL.capacity);
    }
  }

  /** Hold the action to push the handle down, let go to let it spring up. One down-and-up is a stroke. */
  private updatePump(dt: number, held: boolean): void {
    const target = held ? 1 : 0;
    const speed = held ? 4 : 3;
    this.pumpDown += clamp(target - this.pumpDown, -speed * dt, speed * dt);
    this.factory.setPumpHandle(this.pumpDown);
    this.player.pumping(held ? this.pumpDown : null);

    if (this.pumpDown > 0.95) this.pumpBottomed = true;
    if (this.pumpBottomed && this.pumpDown < 0.05) {
      this.pumpBottomed = false;
      const n = Math.min(PUMP.perStroke, this.bin);
      this.bin -= n;
      for (let i = 0; i < n; i++) {
        this.puffs.along(this.factory.pipe, 1.6 + i * 0.12, () => {
          this.finished++;
        });
      }
    }
  }

  private placeCamera(dt: number): void {
    const target = this.player.pos.clone();
    target.y += CAMERA.targetHeight;
    const dir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    // Pull in if a wall or machine is between the worker and the camera; ease
    // back out once it's clear.
    this.ray.set(target, dir);
    this.ray.far = CAMERA.distance + 0.5;
    const hit = this.ray.intersectObjects(this.factory.cameraBlockers, false)[0];
    const want = hit ? Math.max(1.2, hit.distance - 0.4) : CAMERA.distance;
    this.camDist = want < this.camDist ? want : this.camDist + (want - this.camDist) * Math.min(1, 4 * dt);
    this.camera.position.copy(target).addScaledVector(dir, this.camDist);
    // Backed right up to a wall, the camera can't get far enough behind;
    // slide it along the wall rather than through it.
    const c = this.camera.position;
    // The closer it's squeezed in, the higher it rises, so it looks down over
    // the worker's head instead of into the back of it.
    c.y += (1 - this.camDist / CAMERA.distance) * 3.5;
    c.x = clamp(c.x, -ROOM.halfX + 0.25, ROOM.halfX - 0.25);
    c.z = clamp(c.z, -ROOM.halfZ + 0.25, ROOM.halfZ - 0.25);
    c.y = clamp(c.y, 0.3, ROOM.height - 0.3);
    this.camera.lookAt(target);
  }
}

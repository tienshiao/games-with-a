import * as THREE from "three";
import { KERNELS, ROOM, STATIONS } from "./config";
import { type Box, Colliders } from "./collision";
import { part, sign, toon } from "./toon";

// The factory room and its machines, laid out along the back wall in process
// order (see STATIONS in config.ts):
//
//   1 HUSKER → 2 CLEANER → 3 POPPER → bin → PUMP → 4 BUTTER & SALT
//
// What's broken today: the cleaner's output spout is jammed open, so kernels
// pour out onto the floor instead of riding along to the popper. Shovel them
// into the popper's hopper. Popped corn lands in the bin; the hand pump pushes
// it up the glass pipe to butter & salt.

const BACK_Z = -7; // centre line of the machines

export class Factory {
  readonly group = new THREE.Group();
  readonly colliders = new Colliders();
  /** Things the camera shouldn't see through. */
  readonly cameraBlockers: THREE.Object3D[] = [];

  /** Where the jammed spout pours from, and which way. */
  readonly spillFrom = new THREE.Vector3(STATIONS.cleaner.x, 2.1, BACK_Z + 2.4);
  readonly spillDir = new THREE.Vector3(0, 0.6, 1);

  /** Kernels that fall in here get popped. */
  readonly hopper: Box;
  readonly hopperMouth = new THREE.Vector3(STATIONS.popper.x - 1.3, 1.6, BACK_Z + 3);
  /** Where popped corn flies out of the popper, and where it lands. */
  readonly popperChute = new THREE.Vector3(STATIONS.popper.x + 1.9, 3.1, BACK_Z);
  readonly binCenter = new THREE.Vector3(STATIONS.popper.x + 4.6, 0, BACK_Z + 0.5);
  /** The handle grip, for "is the worker close enough to pump". */
  readonly pumpGrip = new THREE.Vector3();
  readonly pumpStand = new THREE.Vector3();
  /** The glass pipe popcorn travels up when pumped. */
  readonly pipe: THREE.CatmullRomCurve3;
  readonly flavorHeapCenter = new THREE.Vector3(STATIONS.flavor.x, 0, BACK_Z + 3.3);

  private spinners: Array<{ obj: THREE.Object3D; axis: "x" | "y" | "z"; speed: number }> = [];
  private conveyors: Array<{ items: THREE.Object3D[]; from: THREE.Vector3; to: THREE.Vector3; speed: number }> = [];
  private alarm: THREE.Mesh;
  private alarmLight: THREE.PointLight;
  private pumpLever = new THREE.Group();
  private pumpPiston!: THREE.Object3D;
  private binHeap: THREE.Mesh;
  private flavorHeap: THREE.Mesh;
  private popperRattle: THREE.Object3D;
  private domeCorn: THREE.Object3D[] = [];
  private time = 0;
  private popping = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.buildRoom();
    this.buildHusker();
    this.buildCleaner();
    this.alarm = this.group.getObjectByName("alarm") as THREE.Mesh;
    this.alarmLight = this.group.getObjectByName("alarmLight") as THREE.PointLight;
    const popper = this.buildPopper();
    this.hopper = popper.hopper;
    this.popperRattle = popper.body;
    this.binHeap = this.buildBin();
    this.pipe = this.buildPump();
    this.flavorHeap = this.buildFlavor();
    this.buildClutter();
  }

  /** 0 = handle up, 1 = handle pushed all the way down. */
  setPumpHandle(down: number): void {
    // Grip end (local -x) dips as the handle goes down, so the far end —
    // and the piston rod hanging off it — rises.
    const angle = -0.45 + down * 0.9;
    this.pumpLever.rotation.z = angle;
    this.pumpPiston.position.y = 2.4 + 0.55 * Math.sin(angle) - 0.45;
  }

  /** Grow the heaps to show how much is in them (0 = empty, 1 = brimming). */
  setFill(bin: number, flavor: number): void {
    this.binHeap.visible = bin > 0.001;
    this.binHeap.scale.set(0.6 + bin * 0.4, Math.max(0.01, bin), 0.6 + bin * 0.4);
    this.flavorHeap.visible = flavor > 0.001;
    this.flavorHeap.scale.set(0.5 + flavor * 0.5, Math.max(0.01, flavor), 0.5 + flavor * 0.5);
  }

  /** The popper shakes and its dome fills with dancing corn while it has work. */
  popperBusy(seconds: number): void {
    this.popping = Math.max(this.popping, seconds);
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    for (const s of this.spinners) s.obj.rotation[s.axis] += s.speed * dt;
    for (const c of this.conveyors) {
      const len = c.from.distanceTo(c.to);
      c.items.forEach((item, k) => {
        const u = (((t * c.speed) / len + k / c.items.length) % 1 + 1) % 1;
        item.position.lerpVectors(c.from, c.to, u);
      });
    }

    // The broken cleaner's alarm.
    const on = Math.sin(t * 8) > 0;
    (this.alarm.material as THREE.MeshToonMaterial).emissive.setHex(on ? 0xff2200 : 0x330000);
    this.alarmLight.intensity = on ? 6 : 0;

    this.popping = Math.max(0, this.popping - dt);
    const busy = this.popping > 0;
    this.popperRattle.position.x = busy ? Math.sin(t * 60) * 0.03 : 0;
    this.domeCorn.forEach((c, k) => {
      c.visible = busy;
      c.position.y = 3.05 + Math.abs(Math.sin(t * 9 + k * 1.7)) * 0.5;
    });
  }

  // ---------------------------------------------------------------- room ---

  private buildRoom(): void {
    const { halfX, halfZ, height } = ROOM;

    // Checkerboard floor.
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#c9b48f";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#b39b74";
    g.fillRect(0, 0, 32, 32);
    g.fillRect(32, 32, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(halfX, halfZ);
    tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const floorMat = toon(0xffffff).clone();
    floorMat.map = tex;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(halfX * 2, halfZ * 2), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Hazard stripes around the machine area.
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(halfX * 2 - 2, 0.25),
      toon(0xffcc00)
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, 0.01, BACK_Z + 4.2);
    stripe.receiveShadow = true;
    this.group.add(stripe);

    // Walls: cream with a red band, thick enough to stop the camera.
    const wall = (x: number, z: number, sx: number, sz: number) => {
      const w = new THREE.Mesh(new THREE.BoxGeometry(sx, height, sz), toon(0xf1e3c6));
      w.position.set(x, height / 2, z);
      w.receiveShadow = true;
      const band = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.02, 0.6, sz + 0.02), toon(0xc0392b));
      band.position.y = -height / 2 + 1.4;
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.02, 0.3, sz + 0.02), toon(0x5d4037));
      skirt.position.y = -height / 2 + 0.15;
      w.add(band, skirt);
      this.group.add(w);
      this.cameraBlockers.push(w);
    };
    const t = 1;
    wall(0, -halfZ - t / 2, halfX * 2 + t * 2, t);
    wall(0, halfZ + t / 2, halfX * 2 + t * 2, t);
    wall(-halfX - t / 2, 0, t, halfZ * 2);
    wall(halfX + t / 2, 0, t, halfZ * 2);

    // Ceiling beams and hanging lamps.
    for (let x = -halfX + 4; x < halfX; x += 8) {
      const beam = part(new THREE.BoxGeometry(0.5, 0.6, halfZ * 2), 0x6d4c41, 0.03);
      beam.position.set(x, height - 0.3, 0);
      beam.castShadow = false;
      this.group.add(beam);
      for (const z of [-halfZ / 2, halfZ / 2]) {
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6), toon(0x222222));
        cord.position.set(x, height - 1.1, z);
        const shade = part(new THREE.ConeGeometry(0.6, 0.5, 14, 1, true), 0x2e7d32, 0.03);
        shade.position.set(x, height - 2, z);
        shade.castShadow = false;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
        bulb.position.set(x, height - 2.2, z);
        this.group.add(cord, shade, bulb);
      }
    }
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(halfX * 2, halfZ * 2), toon(0x4e342e));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = height;
    this.group.add(ceiling);

    // Big factory name on the back wall.
    const title = sign("POPCORN FACTORY", 0xc0392b, 10);
    title.position.set(0, 7.2, -halfZ + 0.02);
    this.group.add(title);
  }

  /** A station's name board, up on a post behind the machine. */
  private label(text: string, x: number, color: number, y = 5.6): void {
    const s = sign(text, color, 4.2);
    s.position.set(x, y, BACK_Z - 2.4);
    this.group.add(s);
  }

  /** A solid machine body that blocks walking, kernels and the camera. */
  private body(x: number, z: number, sx: number, sy: number, sz: number, color: number, y = sy / 2): THREE.Mesh {
    const m = part(new THREE.BoxGeometry(sx, sy, sz), color, 0.05);
    m.position.set(x, y, z);
    this.group.add(m);
    this.colliders.add(x, z, sx, sy, sz, y);
    this.cameraBlockers.push(m);
    return m;
  }

  private conveyor(from: THREE.Vector3, to: THREE.Vector3, make: () => THREE.Object3D, count: number, speed: number): void {
    const dir = to.clone().sub(from);
    const len = dir.length();
    const belt = part(new THREE.BoxGeometry(len, 0.15, 1.1), 0x37474f, 0.03);
    belt.position.copy(from).add(to).multiplyScalar(0.5);
    belt.position.y -= 0.12;
    belt.rotation.y = -Math.atan2(dir.z, dir.x);
    this.group.add(belt);
    // Legs.
    for (const u of [0.1, 0.9]) {
      const p = from.clone().lerp(to, u);
      const leg = part(new THREE.BoxGeometry(0.15, p.y - 0.2, 0.9), 0x546e7a, 0.03);
      leg.position.set(p.x, (p.y - 0.2) / 2, p.z);
      this.group.add(leg);
    }
    this.colliders.add(belt.position.x, belt.position.z, Math.abs(dir.x) + 0.2, belt.position.y + 0.1, 1.1);
    const items: THREE.Object3D[] = [];
    for (let i = 0; i < count; i++) {
      const it = make();
      this.group.add(it);
      items.push(it);
    }
    this.conveyors.push({ items, from, to, speed });
  }

  // ------------------------------------------------------------ stations ---

  private buildHusker(): void {
    const { x, color, label } = STATIONS.husker;
    this.body(x, BACK_Z, 4, 3.2, 3.4, color);
    // Intake funnel and chimney.
    const funnel = part(new THREE.CylinderGeometry(1.1, 0.6, 1, 16, 1, true), 0x388e3c);
    funnel.position.set(x - 0.6, 3.7, BACK_Z);
    const stack = part(new THREE.CylinderGeometry(0.3, 0.3, 2, 12), 0x795548);
    stack.position.set(x + 1.2, 4.2, BACK_Z - 1);
    // Spinning husk-ripper wheel on the front.
    const wheel = part(new THREE.CylinderGeometry(0.9, 0.9, 0.25, 8), 0xffeb3b);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 1.8, BACK_Z + 1.8);
    const hub = new THREE.Group();
    hub.position.copy(wheel.position);
    hub.add(part(new THREE.BoxGeometry(1.8, 0.2, 0.2), 0x6d4c41, 0.03));
    hub.add(part(new THREE.BoxGeometry(0.2, 1.8, 0.2), 0x6d4c41, 0.03));
    hub.position.z += 0.15;
    this.group.add(funnel, stack, wheel, hub);
    this.spinners.push({ obj: hub, axis: "z", speed: 3 });
    this.label(label, x, color);

    // Whole cobs ride in from the left...
    this.conveyor(
      new THREE.Vector3(-ROOM.halfX + 1, 1.3, BACK_Z),
      new THREE.Vector3(x - 2, 1.3, BACK_Z),
      () => {
        const cob = new THREE.Group();
        const corn = part(new THREE.CapsuleGeometry(0.17, 0.6, 4, 10), 0xffd54f, 0.03);
        corn.rotation.z = Math.PI / 2;
        const husk = part(new THREE.ConeGeometry(0.22, 0.5, 8), 0x7cb342, 0.03);
        husk.rotation.z = Math.PI / 2;
        husk.position.x = -0.45;
        cob.add(corn, husk);
        cob.position.y = 0.2;
        const holder = new THREE.Group();
        holder.add(cob);
        return holder;
      },
      4,
      0.8
    );
    // ...and kernels ride out to the cleaner.
    this.conveyor(
      new THREE.Vector3(x + 2, 1.1, BACK_Z),
      new THREE.Vector3(STATIONS.cleaner.x - 1.8, 1.1, BACK_Z),
      () => {
        const pile = new THREE.Group();
        for (let i = 0; i < 6; i++) {
          const k = new THREE.Mesh(new THREE.IcosahedronGeometry(KERNELS.radius * 1.2, 0), toon(0xffc21a));
          k.position.set((Math.random() - 0.5) * 0.4, 0.1 + Math.random() * 0.1, (Math.random() - 0.5) * 0.5);
          pile.add(k);
        }
        return pile;
      },
      6,
      1
    );
  }

  private buildCleaner(): void {
    const { x, color, label } = STATIONS.cleaner;
    this.body(x, BACK_Z, 3.4, 2.4, 3.2, color);
    // A big striped tumbler drum on top that scrubs the kernels.
    const drum = part(new THREE.CylinderGeometry(1.1, 1.1, 3, 12), 0x90caf9);
    drum.rotation.z = Math.PI / 2;
    drum.position.set(x, 3.4, BACK_Z);
    const spin = new THREE.Group();
    spin.position.copy(drum.position);
    for (let i = 0; i < 4; i++) {
      const slat = part(new THREE.BoxGeometry(3.1, 0.12, 0.3), 0x0d47a1, 0.02);
      const a = (i / 4) * Math.PI * 2;
      slat.position.set(0, Math.cos(a) * 1.1, Math.sin(a) * 1.1);
      slat.rotation.x = a;
      spin.add(slat);
    }
    this.group.add(drum, spin);
    this.spinners.push({ obj: spin, axis: "x", speed: 4 });
    for (const sx of [-1.3, 1.3]) {
      const stand = part(new THREE.BoxGeometry(0.3, 1.1, 1.4), 0x1565c0, 0.03);
      stand.position.set(x + sx, 2.6, BACK_Z);
      this.group.add(stand);
    }
    this.colliders.add(x, BACK_Z, 3.4, 2.4, 2.4, 3.4);

    // The jammed spout, sticking out the front toward the worker.
    const spout = part(new THREE.CylinderGeometry(0.35, 0.45, 1.2, 12, 1, true), 0x78909c);
    spout.rotation.x = Math.PI / 2 - 0.5;
    spout.position.set(x, 1.95, BACK_Z + 1.95);
    const flap = part(new THREE.BoxGeometry(0.8, 0.08, 0.6), 0xb71c1c, 0.03);
    flap.position.set(x + 0.45, 2.35, BACK_Z + 2.4);
    flap.rotation.z = -1.1;
    this.group.add(spout, flap);

    // Flashing alarm light.
    const alarm = part(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xff4400);
    alarm.material = toon(0xff3300).clone();
    alarm.name = "alarm";
    alarm.position.set(x + 1.2, 4.55, BACK_Z + 0.8);
    const light = new THREE.PointLight(0xff3300, 0, 8, 1.5);
    light.name = "alarmLight";
    light.position.set(x + 1.2, 5, BACK_Z + 1.4);
    this.group.add(alarm, light);
    this.label(label, x, color);
    const jam = sign("JAMMED!", 0xd32f2f, 2.2);
    jam.position.set(x, 4.6, BACK_Z - 2.35);
    jam.rotation.z = 0.1;
    this.group.add(jam);
  }

  private buildPopper(): { hopper: Box; body: THREE.Object3D } {
    const { x, color, label } = STATIONS.popper;
    // A big red kettle cart with a glass dome on top.
    const rattle = new THREE.Group();
    this.group.add(rattle);
    const base = part(new THREE.BoxGeometry(3.4, 2.4, 3.2), color, 0.05);
    base.position.set(x, 1.2, BACK_Z);
    const trim = part(new THREE.BoxGeometry(3.5, 0.25, 3.3), 0xffd54f, 0.03);
    trim.position.set(x, 2.45, BACK_Z);
    const kettle = part(new THREE.CylinderGeometry(1.2, 0.9, 0.6, 16), 0x9e9e9e);
    kettle.position.set(x, 2.85, BACK_Z);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.45, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshToonMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.35, depthWrite: false })
    );
    dome.position.set(x, 2.55, BACK_Z);
    const cap = part(new THREE.ConeGeometry(0.4, 0.6, 10), color);
    cap.position.set(x, 4.3, BACK_Z);
    rattle.add(base, trim, kettle, dome, cap);
    for (let i = 0; i < 10; i++) {
      const puff = popcornMesh();
      puff.position.set(x + (Math.random() - 0.5) * 1.6, 3, BACK_Z + (Math.random() - 0.5) * 1.6);
      puff.visible = false;
      rattle.add(puff);
      this.domeCorn.push(puff);
    }
    this.colliders.add(x, BACK_Z, 3.4, 2.6, 3.2);
    this.cameraBlockers.push(base);
    this.label(label, x, color);

    // The hopper: a funnel out front to shovel kernels into.
    const m = this.hopperMouth;
    const funnel = part(new THREE.CylinderGeometry(1, 0.35, 0.9, 16, 1, true), 0xffd54f);
    funnel.position.set(m.x, m.y - 0.35, m.z);
    funnel.material = toon(0xffd54f).clone();
    (funnel.material as THREE.Material).side = THREE.DoubleSide;
    const neck = part(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 12), 0xffb300);
    neck.position.set(m.x, 0.6, m.z);
    const feed = part(new THREE.BoxGeometry(0.4, 0.4, 1.5), 0xffb300, 0.03);
    feed.position.set(m.x, 1.5, m.z - 1.1);
    const arrow = sign("SHOVEL IN HERE", 0xffb300, 2.4);
    arrow.position.set(m.x, m.y + 1.3, m.z - 0.6);
    arrow.rotation.x = -0.2;
    this.group.add(funnel, neck, feed, arrow);
    // The funnel's stand blocks walking; the mouth above it swallows kernels.
    this.colliders.add(m.x, m.z, 0.7, 1.0, 0.7);
    const hopper: Box = {
      min: new THREE.Vector3(m.x - 0.85, m.y - 0.6, m.z - 0.85),
      max: new THREE.Vector3(m.x + 0.85, m.y + 0.3, m.z + 0.85),
    };

    // A chute out the right side throws fresh popcorn into the bin.
    const chute = part(new THREE.CylinderGeometry(0.35, 0.35, 1.2, 12, 1, true), 0x9e9e9e);
    chute.rotation.z = -Math.PI / 2 - 0.4;
    chute.position.copy(this.popperChute).add(new THREE.Vector3(-0.4, -0.2, 0));
    this.group.add(chute);
    return { hopper, body: rattle };
  }

  private buildBin(): THREE.Mesh {
    const c = this.binCenter;
    // An open crate: four sides you can see into.
    const w = 2.2, h = 1.1, d = 2.2, t = 0.15;
    const color = 0xa1887f;
    for (const [px, pz, sx, sz] of [
      [0, -d / 2, w, t],
      [0, d / 2, w, t],
      [-w / 2, 0, t, d],
      [w / 2, 0, t, d],
    ] as const) {
      const side = part(new THREE.BoxGeometry(sx, h, sz), color, 0.03);
      side.position.set(c.x + px, h / 2, c.z + pz);
      this.group.add(side);
    }
    this.colliders.add(c.x, c.z, w, h, d);
    const heap = new THREE.Mesh(lumpyDome(1), toon(0xfffbe8));
    heap.position.set(c.x, h * 0.5, c.z);
    heap.castShadow = true;
    this.group.add(heap);
    return heap;
  }

  private buildPump(): THREE.CatmullRomCurve3 {
    const px = this.binCenter.x + 2.6;
    const pz = BACK_Z + 2.2;
    // Pump body: a green cylinder on a base, piston rod on top.
    this.body(px, pz, 1.2, 0.4, 1.2, 0x455a64);
    const barrel = part(new THREE.CylinderGeometry(0.4, 0.45, 1.6, 14), 0x43a047);
    barrel.position.set(px, 1.2, pz);
    const piston = part(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8), 0xcfd8dc, 0.02);
    piston.position.set(px, 2.15, pz);
    const gauge = part(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 16), 0xffffff, 0.02);
    gauge.rotation.x = Math.PI / 2;
    gauge.position.set(px, 1.4, pz + 0.45);
    this.group.add(barrel, piston, gauge);
    this.pumpPiston = piston;
    this.colliders.add(px, pz, 0.9, 2, 0.9);

    // The lever: pivots on a post, long handle out toward the worker.
    const post = part(new THREE.BoxGeometry(0.15, 2.4, 0.15), 0x37474f, 0.03);
    post.position.set(px - 0.55, 1.2, pz);
    this.group.add(post);
    this.pumpLever.position.set(px - 0.55, 2.4, pz);
    const bar = part(new THREE.BoxGeometry(2.2, 0.12, 0.12), 0xe53935, 0.03);
    bar.position.x = 0.4;
    const grip = part(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 10), 0x212121, 0.03);
    grip.rotation.x = Math.PI / 2;
    grip.position.x = -0.6;
    this.pumpLever.add(bar, grip);
    this.group.add(this.pumpLever);
    this.setPumpHandle(0);

    // Stand where the worker grabs the grip (front of the pump), face the pump.
    this.pumpGrip.set(px - 1.15, 2.1, pz);
    this.pumpStand.set(px - 1.15, 0, pz + 0.85);
    const pumpSign = sign("PUMP", 0x43a047, 1.6);
    pumpSign.position.set(px, 3.5, pz - 0.6);
    this.group.add(pumpSign);

    // Glass pipe: from the bin, through the pump, up and over, down into
    // butter & salt.
    const fx = STATIONS.flavor.x;
    const pipe = new THREE.CatmullRomCurve3([
      new THREE.Vector3(this.binCenter.x, 0.6, this.binCenter.z),
      new THREE.Vector3(this.binCenter.x + 1.2, 1, pz - 0.6),
      new THREE.Vector3(px, 2.8, pz - 0.6),
      new THREE.Vector3(px + 0.8, 5.4, pz - 0.6),
      new THREE.Vector3(fx - 1.2, 5.6, BACK_Z),
      new THREE.Vector3(fx, 4.4, BACK_Z),
      new THREE.Vector3(fx, 3.4, BACK_Z),
    ]);
    const glass = new THREE.Mesh(
      new THREE.TubeGeometry(pipe, 80, 0.3, 12, false),
      new THREE.MeshToonMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.3, depthWrite: false })
    );
    const rimMat = toon(0x78909c);
    for (const u of [0.15, 0.35, 0.55, 0.75, 0.95]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 6, 16), rimMat);
      ring.position.copy(pipe.getPointAt(u));
      ring.lookAt(pipe.getPointAt(u).add(pipe.getTangentAt(u)));
      this.group.add(ring);
    }
    this.group.add(glass);
    return pipe;
  }

  private buildFlavor(): THREE.Mesh {
    const { x, color, label } = STATIONS.flavor;
    this.body(x, BACK_Z, 3.6, 2.2, 3.2, color);
    // Butter tank, salt shaker, and a tumbling drum.
    const butter = part(new THREE.CylinderGeometry(0.7, 0.7, 1.8, 16), 0xfff176);
    butter.position.set(x - 1.1, 3.1, BACK_Z - 0.6);
    const butterSign = sign("BUTTER", 0xf9a825, 1.3);
    butterSign.position.set(x - 1.1, 3.1, BACK_Z + 0.12);
    const shaker = part(new THREE.CylinderGeometry(0.45, 0.5, 1.4, 14), 0xfafafa);
    shaker.position.set(x + 1.1, 2.9, BACK_Z - 0.6);
    const lid = part(new THREE.SphereGeometry(0.47, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xb0bec5);
    lid.position.set(x + 1.1, 3.6, BACK_Z - 0.6);
    this.group.add(butter, butterSign, shaker, lid);
    const tumbler = part(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 8), 0xffca28);
    tumbler.rotation.x = Math.PI / 2;
    tumbler.position.set(x, 1.4, BACK_Z + 2.1);
    this.group.add(tumbler);
    this.spinners.push({ obj: tumbler, axis: "y", speed: 2 });
    this.label(label, x, color);

    // Finished popcorn piles up on a tray out front.
    const c = this.flavorHeapCenter;
    const tray = part(new THREE.BoxGeometry(3, 0.3, 2), 0x8d6e63, 0.03);
    tray.position.set(c.x, 0.15, c.z + 0.3);
    this.group.add(tray);
    this.colliders.add(c.x, c.z + 0.3, 3, 0.3, 2);
    const heap = new THREE.Mesh(lumpyDome(1.3), toon(0xffd54f));
    heap.position.set(c.x, 0.3, c.z + 0.3);
    heap.castShadow = true;
    this.group.add(heap);
    return heap;
  }

  /** Corn sacks and pallets so the floor doesn't feel empty. */
  private buildClutter(): void {
    const sack = (x: number, z: number, y = 0.45, rot = 0) => {
      const s = part(new THREE.SphereGeometry(0.55, 12, 10), 0xd7c49e, 0.04);
      s.scale.set(1, 0.8, 0.75);
      s.position.set(x, y, z);
      s.rotation.y = rot;
      const tie = part(new THREE.CylinderGeometry(0.12, 0.2, 0.25, 8), 0xa1887f, 0.02);
      tie.position.set(x, y + 0.5, z);
      this.group.add(s, tie);
    };
    // A pallet of sacks in the front-left corner.
    const pallet = this.body(-17, 9, 3, 0.3, 2.2, 0x8d6e63);
    pallet.castShadow = false;
    sack(-17.8, 8.5, 0.75, 0.3);
    sack(-16.4, 8.6, 0.75, -0.2);
    sack(-17.2, 9.6, 0.75, 0.1);
    sack(-17, 9, 1.55, 0.5);
    this.colliders.add(-17, 9, 3, 2, 2.2);
    // Barrels by the right wall.
    for (const [bx, bz] of [
      [19.5, 8],
      [20.5, 9.5],
      [19.2, 10.2],
    ] as const) {
      const barrel = part(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 14), 0xc62828);
      barrel.position.set(bx, 0.65, bz);
      const band = part(new THREE.CylinderGeometry(0.57, 0.57, 0.12, 14), 0x424242, 0.02);
      band.position.y = 0.3;
      barrel.add(band);
      this.group.add(barrel);
      this.colliders.add(bx, bz, 1.1, 1.3, 1.1);
    }
  }
}

/** One fluffy piece of popcorn: a few lumpy white balls stuck together. */
export function popcornMesh(scale = 1): THREE.Object3D {
  const g = new THREE.Group();
  const mat = toon(0xfffbe8);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12 * scale, 0), mat);
    b.position.set((Math.random() - 0.5) * 0.15 * scale, (Math.random() - 0.5) * 0.15 * scale, (Math.random() - 0.5) * 0.15 * scale);
    g.add(b);
  }
  return g;
}

/** A heap of popcorn: a dome with a bumpy, cloud-like surface. */
function lumpyDome(radius: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(radius, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Leave the rim on the ground; bump everything above it.
    if (v.y < 0.01) continue;
    const bump = 1 + 0.09 * Math.sin(v.x * 9) * Math.sin(v.y * 11) * Math.sin(v.z * 10 + 1);
    pos.setXYZ(i, v.x * bump, v.y * bump, v.z * bump);
  }
  geo.computeVertexNormals();
  return geo;
}

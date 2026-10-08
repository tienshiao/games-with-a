import Phaser from "phaser";
import * as THREE from "three";

// The 3D layer. Phaser still runs every scene — physics, tweens, input, HUD —
// but world objects are drawn by Three.js in a canvas underneath Phaser's
// (now transparent) one. Each bound Phaser object keeps doing its job
// invisibly; its mesh copies position, angle, scale, alpha and visibility
// from it once per frame, so none of the game logic needs to know.
//
// Coordinates: one Three unit is one Phaser pixel, on the z = 0 plane, with y
// flipped (Three's y points up). The camera is a perspective camera placed so
// that plane lines up with Phaser's camera pixel for pixel — gameplay reads
// exactly as before, but anything with depth shows its sides. Changing the
// perspective later means moving that camera; the bindings don't care.

/** Vertical field of view. Narrow enough that the z = 0 plane barely warps. */
const FOV = 32;
const DEFAULT_BACKGROUND = "#0b0f1e";

type Bindable = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Transform &
  Phaser.GameObjects.Components.Alpha &
  Phaser.GameObjects.Components.Visible &
  Phaser.GameObjects.Components.Depth;

type Flippable = Bindable & Phaser.GameObjects.Components.Flip;
type Framed = Bindable & { frame: Phaser.Textures.Frame };

export interface BindOptions<T extends Bindable> {
  /** Height off the gameplay plane; positive is toward the camera. */
  z?: number;
  /** Extra per-frame work, run after the transform is copied. */
  sync?: (obj: T, model: THREE.Object3D, dt: number) => void;
}

/** Optional behaviour a model keeps in its userData; the view calls it each frame. */
export interface ModelHooks {
  sync?: (dt: number) => void;
  frame?: (frame: number) => void;
  tint?: (tinted: boolean, color: number) => void;
}

interface Binding {
  obj: Bindable;
  model: THREE.Object3D;
  z: number;
  /** Each material's own opacity/transparency, which the object's alpha scales. */
  materials: Array<{ mat: THREE.Material; base: number; baseTransparent: boolean }>;
  sync?: (obj: any, model: THREE.Object3D, dt: number) => void;
}

let renderer: THREE.WebGLRenderer | undefined;
let current: SceneView | undefined;
const views = new WeakMap<Phaser.Scene, SceneView>();
const canvasTextures = new Map<string, THREE.Texture>();

/** Create the Three canvas under Phaser's and drive it from Phaser's loop. */
export function initWorld3D(game: Phaser.Game, parent: HTMLElement): void {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.autoClear = false;
  const canvas = renderer.domElement;
  canvas.classList.add("world3d");
  parent.prepend(canvas);

  const resize = () => renderer!.setSize(game.scale.width, game.scale.height);
  resize();
  game.scale.on(Phaser.Scale.Events.RESIZE, resize);

  // POST_RENDER fires after physics, tweens and camera follow have all settled
  // for the frame, so the two canvases always show the same moment.
  let last = performance.now();
  game.events.on(Phaser.Core.Events.POST_RENDER, () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (current) {
      current.render(renderer!, dt);
    } else {
      renderer!.setClearColor(DEFAULT_BACKGROUND);
      renderer!.clear();
    }
  });
}

/** The scene's 3D view, created on first use and torn down with the scene. */
export function view3d(scene: Phaser.Scene): SceneView {
  let view = views.get(scene);
  if (!view) {
    view = new SceneView(scene);
    views.set(scene, view);
  }
  return view;
}

/**
 * A Phaser canvas texture as a Three texture. Textures are drawn once at boot
 * and never change, so one upload serves every scene.
 */
export function canvasTexture(scene: Phaser.Scene, key: string): THREE.Texture {
  let tex = canvasTextures.get(key);
  if (!tex) {
    const source = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
    tex = new THREE.CanvasTexture(source);
    tex.colorSpace = THREE.SRGBColorSpace;
    canvasTextures.set(key, tex);
  }
  return tex;
}

export class SceneView {
  /** Gameplay space: perspective, follows the Phaser camera. */
  readonly world = new THREE.Scene();
  /** Screen-space scenery behind everything (stars, distant planets). */
  readonly backdrop = new THREE.Scene();

  private scene: Phaser.Scene;
  private camera = new THREE.PerspectiveCamera(FOV, 1, 1, 10000);
  private backdropCamera = new THREE.OrthographicCamera(0, 1, 0, -1, -1000, 1000);
  private background = new THREE.Color(DEFAULT_BACKGROUND);
  private bindings = new Map<Phaser.GameObjects.GameObject, Binding>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    current = this;

    // Key light from the upper left and slightly in front, like the old
    // sprites' painted highlights, over a cool sky/ground fill.
    this.world.add(new THREE.HemisphereLight(0xc4d4ff, 0x2a2440, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-0.6, 0.9, 1);
    this.world.add(sun);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.dispose());
  }

  setBackground(color: string): void {
    this.background.set(color);
  }

  /** Static scenery that isn't tied to a Phaser object (maze walls, floor). */
  add(object: THREE.Object3D): void {
    this.world.add(object);
  }

  /**
   * Draw `obj` as `model` from now on. Phaser stops drawing the object but it
   * keeps its body, tweens and animations; destroying it removes the model.
   */
  bind<T extends Bindable>(obj: T, model: THREE.Object3D, opts: BindOptions<T> = {}): T {
    return this.attach(obj, model, this.world, opts);
  }

  /**
   * Draw `obj` as a flat quad of its own texture — for scenery that stays
   * painted. Screen-fixed objects (scroll factor 0) go in the backdrop layer
   * behind all the models; the rest sit in the world at `z`.
   */
  bindFlat<T extends Framed>(
    obj: T,
    opts: { z?: number } = {}
  ): T {
    const frame = obj.frame;
    const mat = new THREE.MeshBasicMaterial({
      map: canvasTexture(this.scene, frame.texture.key),
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(sharedPlane(frame.width, frame.height), mat);
    // Painted layers overlap rather than intersect, so Phaser's depth order
    // still decides which is in front.
    mesh.renderOrder = obj.depth;
    const screenFixed = (obj as unknown as Phaser.GameObjects.Components.ScrollFactor)
      .scrollFactorX === 0;
    if (screenFixed) mat.depthTest = false;
    return this.attach(obj, mesh, screenFixed ? this.backdrop : this.world, {
      z: opts.z,
    });
  }

  private attach<T extends Bindable>(
    obj: T,
    model: THREE.Object3D,
    layer: THREE.Scene,
    opts: BindOptions<T>
  ): T {
    this.scene.cameras.main.ignore(obj);

    const materials: Binding["materials"] = [];
    model.traverse((node) => {
      const mat = (node as THREE.Mesh).material;
      if (!mat) return;
      for (const m of Array.isArray(mat) ? mat : [mat]) {
        materials.push({ mat: m, base: m.opacity, baseTransparent: m.transparent });
      }
    });

    const binding: Binding = { obj, model, z: opts.z ?? 0, materials, sync: opts.sync };
    this.bindings.set(obj, binding);
    layer.add(model);
    obj.once(Phaser.GameObjects.Events.DESTROY, () => this.unbind(obj));
    return obj;
  }

  private unbind(obj: Phaser.GameObjects.GameObject): void {
    const binding = this.bindings.get(obj);
    if (!binding) return;
    this.bindings.delete(obj);
    binding.model.removeFromParent();
    // Geometry is shared between models (see models.ts); materials are not.
    for (const { mat } of binding.materials) mat.dispose();
  }

  render(r: THREE.WebGLRenderer, dt: number): void {
    for (const b of this.bindings.values()) this.syncBinding(b, dt);

    const cam = this.scene.cameras.main;
    const w = cam.width;
    const h = cam.height;

    // Shake is applied by Phaser as a screen-space translate, not a scroll.
    const shake = cam.shakeEffect as unknown as {
      isRunning: boolean;
      _offsetX: number;
      _offsetY: number;
    };
    const sx = shake.isRunning ? shake._offsetX : 0;
    const sy = shake.isRunning ? shake._offsetY : 0;

    // Point the camera at the middle of Phaser's view, backed off until the
    // z = 0 plane fills the screen exactly.
    const cx = cam.scrollX + w / 2 - sx / cam.zoom;
    const cy = cam.scrollY + h / 2 - sy / cam.zoom;
    const dist = h / cam.zoom / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    this.camera.aspect = w / h;
    this.camera.near = dist * 0.05;
    this.camera.far = dist * 4;
    this.camera.position.set(cx, -cy, dist);
    this.camera.lookAt(cx, -cy, 0);
    this.camera.updateProjectionMatrix();

    this.backdropCamera.left = -sx;
    this.backdropCamera.right = w - sx;
    this.backdropCamera.top = sy;
    this.backdropCamera.bottom = sy - h;
    this.backdropCamera.updateProjectionMatrix();

    r.setClearColor(this.background);
    r.clear();
    r.render(this.backdrop, this.backdropCamera);
    r.clearDepth();
    r.render(this.world, this.camera);
  }

  private syncBinding(b: Binding, dt: number): void {
    const { obj, model } = b;
    model.visible = obj.visible && obj.alpha > 0;
    if (!model.visible) return;

    model.position.set(obj.x, -obj.y, b.z);
    model.rotation.z = -obj.rotation;
    const flip = obj as Flippable;
    model.scale.set(
      obj.scaleX * (flip.flipX ? -1 : 1),
      obj.scaleY * (flip.flipY ? -1 : 1),
      // Depth follows the larger of the two so squashes don't flatten it.
      Math.max(Math.abs(obj.scaleX), Math.abs(obj.scaleY))
    );

    for (const { mat, base, baseTransparent } of b.materials) {
      const opacity = base * obj.alpha;
      const transparent = baseTransparent || opacity < 1;
      if (mat.transparent !== transparent) {
        mat.transparent = transparent;
        mat.needsUpdate = true;
      }
      mat.opacity = opacity;
    }

    // Hooks a model can carry for itself (see models.ts): its own idle
    // motion, following a sprite's animation frame, and following a tint.
    const hooks = model.userData as ModelHooks;
    hooks.sync?.(dt);
    const sprite = obj as Partial<Framed>;
    if (hooks.frame && sprite.frame) hooks.frame(Number(sprite.frame.name) || 0);
    const tinted = obj as Partial<Phaser.GameObjects.Components.Tint>;
    if (hooks.tint && tinted.isTinted !== undefined) {
      hooks.tint(tinted.isTinted, tinted.tintTopLeft ?? 0xffffff);
    }

    b.sync?.(obj, model, dt);
  }

  private dispose(): void {
    for (const obj of [...this.bindings.keys()]) this.unbind(obj);
    this.world.clear();
    this.backdrop.clear();
    views.delete(this.scene);
    if (current === this) current = undefined;
  }
}

const planes = new Map<string, THREE.PlaneGeometry>();
function sharedPlane(w: number, h: number): THREE.PlaneGeometry {
  const key = `${w}x${h}`;
  let geo = planes.get(key);
  if (!geo) {
    geo = new THREE.PlaneGeometry(w, h);
    planes.set(key, geo);
  }
  return geo;
}

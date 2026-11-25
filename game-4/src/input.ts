import { LOOK, STICK } from "./config";

// One place that turns every kind of input into the same few signals the game
// reads each frame:
//
//   move    — where to walk, x = right, y = forward, length 0..1
//   look    — how far to turn the camera this frame (radians)
//   action  — the action button (shovel / pump) is held
//
// Keyboard + mouse:   WASD / arrows walk, mouse looks (pointer lock), click or
//                     E / Space is the action.
// Touch (iPad):       a thumb on the left side of the screen grabs a floating
//                     stick wherever it lands; a finger anywhere else drags to
//                     look. Both work at once, one per hand.
//
// Each pointer is tracked by its pointerId, and treated by its pointerType
// (not by guessing the device) — an iPad can have a trackpad or keyboard too.

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
const ACTION_KEYS = new Set(["KeyE", "Space", "Enter"]);

interface Drag {
  id: number;
  x: number;
  y: number;
}

export class Input {
  readonly move = { x: 0, y: 0 };
  /** True while any action source (key, click, button) is held. */
  action = false;
  /** Has this device been touched yet? The HUD shows touch controls once it has. */
  touchSeen = false;

  private keys = new Set<string>();
  private actionSources = new Set<string>();
  private lookX = 0;
  private lookY = 0;

  private stick: (Drag & { ox: number; oy: number }) | null = null;
  private stickVec = { x: 0, y: 0 };
  private lookDrag: Drag | null = null;
  /** A mouse dragging to look, when pointer lock isn't available. */
  private mouseDrag: Drag | null = null;
  private pointerLockBroken = false;

  private stickBase: HTMLDivElement;
  private stickKnob: HTMLDivElement;
  private listeners: Array<() => void> = [];

  constructor(
    private surface: HTMLElement,
    hud: HTMLElement
  ) {
    this.stickBase = div(hud, {
      position: "absolute",
      width: `${STICK.radius * 2}px`,
      height: `${STICK.radius * 2}px`,
      marginLeft: `${-STICK.radius}px`,
      marginTop: `${-STICK.radius}px`,
      borderRadius: "50%",
      border: "4px solid rgba(255,255,255,0.55)",
      background: "rgba(30,20,10,0.25)",
      boxSizing: "border-box",
      display: "none",
    });
    this.stickKnob = div(this.stickBase, {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: "56px",
      height: "56px",
      marginLeft: "-28px",
      marginTop: "-28px",
      borderRadius: "50%",
      background: "rgba(255,240,200,0.85)",
      boxShadow: "0 2px 0 rgba(0,0,0,0.35)",
    });

    if (navigator.maxTouchPoints > 0) this.touchSeen = true;

    this.on(window, "keydown", (e: KeyboardEvent) => {
      if (MOVE_KEYS[e.code] || ACTION_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (ACTION_KEYS.has(e.code)) this.actionSources.add(e.code);
      this.updateAction();
    });
    this.on(window, "keyup", (e: KeyboardEvent) => {
      this.keys.delete(e.code);
      this.actionSources.delete(e.code);
      this.updateAction();
    });
    // Losing focus drops all keyups on the floor — let go of everything.
    this.on(window, "blur", () => this.releaseAll());

    this.on(surface, "pointerdown", (e: PointerEvent) => this.pointerDown(e));
    this.on(surface, "pointermove", (e: PointerEvent) => this.pointerMove(e));
    this.on(surface, "pointerup", (e: PointerEvent) => this.pointerUp(e));
    this.on(surface, "pointercancel", (e: PointerEvent) => this.pointerUp(e));

    // While the pointer is locked, the mouse's movement arrives here.
    this.on(document, "mousemove", (e: MouseEvent) => {
      if (this.locked) {
        this.lookX += e.movementX * LOOK.mouse;
        this.lookY += e.movementY * LOOK.mouse;
      }
    });
    this.on(document, "pointerlockerror", () => {
      this.pointerLockBroken = true;
    });
    this.on(document, "pointerlockchange", () => {
      if (!this.locked) this.actionSources.delete("mouse");
      this.updateAction();
    });

    // No right-click menu, no iOS pinch / double-tap zoom.
    this.on(surface, "contextmenu", (e: Event) => e.preventDefault());
    this.on(document, "gesturestart", (e: Event) => e.preventDefault());
    this.on(document, "dblclick", (e: Event) => e.preventDefault());
  }

  /** No pointer lock here, so the mouse drags to look instead. */
  get dragLook(): boolean {
    return this.pointerLockBroken || !this.surface.requestPointerLock;
  }

  get locked(): boolean {
    return document.pointerLockElement === this.surface;
  }

  /** Camera turn since the last call, in radians. */
  takeLook(): { x: number; y: number } {
    const look = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return look;
  }

  /** Recompute `move` from the keys and the stick. Call once per frame. */
  update(): void {
    let x = 0;
    let y = 0;
    for (const code of this.keys) {
      const dir = MOVE_KEYS[code];
      if (dir) {
        x += dir[0];
        y += dir[1];
      }
    }
    const len = Math.hypot(x, y);
    if (len > 0) {
      this.move.x = x / len;
      this.move.y = y / len;
    } else {
      this.move.x = this.stickVec.x;
      this.move.y = this.stickVec.y;
    }
  }

  /** For on-screen buttons: hold/release the action under a name of their own. */
  setActionSource(name: string, held: boolean): void {
    if (held) this.actionSources.add(name);
    else this.actionSources.delete(name);
    this.updateAction();
  }

  dispose(): void {
    for (const off of this.listeners) off();
  }

  private pointerDown(e: PointerEvent): void {
    if (e.pointerType === "mouse") {
      if (e.button !== 0) return;
      if (this.locked) {
        this.actionSources.add("mouse");
        this.updateAction();
      } else if (!this.pointerLockBroken && this.surface.requestPointerLock) {
        // The first click only captures the mouse; it isn't an action.
        try {
          const req = this.surface.requestPointerLock() as unknown as Promise<void> | undefined;
          req?.catch?.(() => (this.pointerLockBroken = true));
        } catch {
          this.pointerLockBroken = true;
        }
      } else {
        this.mouseDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
        this.capture(e);
      }
      return;
    }

    // Touch or pen.
    this.touchSeen = true;
    const rect = this.surface.getBoundingClientRect();
    const inStickZone = e.clientX - rect.left < rect.width * STICK.zoneWidth;
    if (inStickZone && !this.stick) {
      this.stick = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY };
      this.showStick(e.clientX - rect.left, e.clientY - rect.top);
      this.capture(e);
    } else if (!this.lookDrag) {
      this.lookDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.capture(e);
    }
  }

  private pointerMove(e: PointerEvent): void {
    if (this.stick?.id === e.pointerId) {
      let dx = e.clientX - this.stick.ox;
      let dy = e.clientY - this.stick.oy;
      const dist = Math.hypot(dx, dy);
      if (dist > STICK.radius) {
        dx *= STICK.radius / dist;
        dy *= STICK.radius / dist;
      }
      this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      const tilt = Math.min(dist / STICK.radius, 1);
      if (tilt < STICK.deadZone) {
        this.stickVec.x = 0;
        this.stickVec.y = 0;
      } else {
        // Rescale past the dead zone so the stick still reaches full speed.
        const s = (tilt - STICK.deadZone) / (1 - STICK.deadZone) / (tilt * STICK.radius);
        this.stickVec.x = dx * s;
        this.stickVec.y = -dy * s;
      }
      return;
    }
    const drag =
      this.lookDrag?.id === e.pointerId
        ? this.lookDrag
        : this.mouseDrag?.id === e.pointerId
          ? this.mouseDrag
          : null;
    if (drag) {
      const k = e.pointerType === "mouse" ? LOOK.mouse : LOOK.touch;
      this.lookX += (e.clientX - drag.x) * k;
      this.lookY += (e.clientY - drag.y) * k;
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
  }

  private pointerUp(e: PointerEvent): void {
    if (this.stick?.id === e.pointerId) {
      this.stick = null;
      this.stickVec.x = 0;
      this.stickVec.y = 0;
      this.hideStick();
    }
    if (this.lookDrag?.id === e.pointerId) this.lookDrag = null;
    if (this.mouseDrag?.id === e.pointerId) this.mouseDrag = null;
    if (e.pointerType === "mouse") {
      this.actionSources.delete("mouse");
      this.updateAction();
    }
  }

  private showStick(x: number, y: number): void {
    const s = this.stickBase.style;
    s.left = `${x}px`;
    s.top = `${y}px`;
    s.display = "block";
    this.stickKnob.style.transform = "";
  }

  private hideStick(): void {
    this.stickBase.style.display = "none";
  }

  private capture(e: PointerEvent): void {
    try {
      this.surface.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-gone pointers can't be captured; harmless.
    }
  }

  private releaseAll(): void {
    this.keys.clear();
    this.actionSources.clear();
    this.stick = null;
    this.stickVec.x = 0;
    this.stickVec.y = 0;
    this.lookDrag = null;
    this.mouseDrag = null;
    this.hideStick();
    this.updateAction();
  }

  private updateAction(): void {
    this.action = this.actionSources.size > 0;
  }

  private on<E extends Event>(
    target: EventTarget,
    type: string,
    fn: (e: E) => void
  ): void {
    const handler = fn as EventListener;
    target.addEventListener(type, handler, { passive: false });
    this.listeners.push(() => target.removeEventListener(type, handler));
  }
}

function div(parent: HTMLElement, style: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, style);
  parent.appendChild(el);
  return el;
}

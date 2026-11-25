import { Input } from "./input";

// On-screen bits over the 3D view: the touch action button (bottom right) and
// a controls hint for keyboard players. Right-side buttons are DOM elements
// that catch their own touches, so touches on them never turn the camera.
//
// More buttons can go in `#hud` later the same way: give them the "button"
// class and call input.setActionSource (or a new signal) from their events.

export class Hud {
  private action: HTMLDivElement;
  private hint: HTMLDivElement;
  private label = "";

  constructor(
    private root: HTMLElement,
    private input: Input
  ) {
    this.action = document.createElement("div");
    this.action.className = "button";
    Object.assign(this.action.style, {
      position: "absolute",
      right: "calc(28px + env(safe-area-inset-right, 0px))",
      bottom: "28px",
      width: "120px",
      height: "120px",
      borderRadius: "50%",
      background: "radial-gradient(circle at 40% 35%, #ffe082, #ffb300 70%)",
      border: "5px solid #1a1208",
      boxShadow: "0 6px 0 #1a1208",
      color: "#1a1208",
      font: '900 22px "Trebuchet MS", "Arial Black", sans-serif',
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      boxSizing: "border-box",
    } satisfies Partial<CSSStyleDeclaration>);
    const press = (held: boolean) => (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      input.setActionSource("hud-action", held);
      if (held) {
        try {
          this.action.setPointerCapture(e.pointerId);
        } catch {
          // Pointer already gone; the press still counts.
        }
      }
      this.action.style.transform = held ? "translateY(5px)" : "";
      this.action.style.boxShadow = held ? "0 1px 0 #1a1208" : "0 6px 0 #1a1208";
    };
    this.action.addEventListener("pointerdown", press(true));
    this.action.addEventListener("pointerup", press(false));
    this.action.addEventListener("pointercancel", press(false));
    root.appendChild(this.action);

    this.hint = document.createElement("div");
    Object.assign(this.hint.style, {
      position: "absolute",
      left: "16px",
      top: "calc(12px + env(safe-area-inset-top, 0px))",
      padding: "8px 12px",
      borderRadius: "10px",
      background: "rgba(26,18,8,0.65)",
      color: "#fff8e1",
      font: '700 14px "Trebuchet MS", sans-serif',
      lineHeight: "1.5",
    } satisfies Partial<CSSStyleDeclaration>);
    root.appendChild(this.hint);
  }

  /** Call each frame with what the action button does right now. */
  update(actionLabel: string): void {
    const touch = this.input.touchSeen;
    this.action.style.display = touch ? "flex" : "none";
    if (actionLabel !== this.label) {
      this.label = actionLabel;
      this.action.textContent = actionLabel;
    }
    const hint = touch
      ? "Left thumb: walk · Drag: look · Button: " + actionLabel.toLowerCase()
      : this.input.locked
        ? `WASD: walk · Mouse: look · Click / E: ${actionLabel.toLowerCase()} · Esc: free mouse`
        : this.input.dragLook
          ? `WASD: walk · Drag: look · E: ${actionLabel.toLowerCase()}`
          : "Click to grab the mouse · WASD: walk";
    if (this.hint.textContent !== hint) this.hint.textContent = hint;
  }
}

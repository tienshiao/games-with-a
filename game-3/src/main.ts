import Phaser from "phaser";
import { MenuScene } from "./scenes/MenuScene";
import { GameScene } from "./scenes/GameScene";
import { MazeScene } from "./scenes/MazeScene";
import { GameOverScene } from "./scenes/GameOverScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: "#0b0f1e",
  scale: {
    parent: "game",
    // RESIZE: the canvas (and game world) fills the parent/window exactly — no
    // letterbox bars on desktop or iPad. Scenes lay themselves out from the live
    // scale.width/height and reflow on the "resize" event.
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: "100%",
    height: "100%",
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 1050 },
      debug: false,
    },
  },
  scene: [MenuScene, GameScene, MazeScene, GameOverScene],
};

const game = new Phaser.Game(config);

// iOS/iPadOS report a layout viewport taller than what's actually on screen, so
// a canvas sized to 100% height hangs off the bottom and anything anchored
// there — the item slot, the menu's control hints — gets clipped. Size the
// parent from visualViewport instead, minus the home-indicator inset.
const parent = document.getElementById("game")!;
const probe = document.getElementById("safe-area-probe")!;

function fitToViewport(): void {
  const vv = window.visualViewport;
  const doc = document.documentElement;
  // Take the smallest measure available — visualViewport is missing on iOS 12
  // and older, and innerHeight over-reports there. Undershooting just leaves a
  // band of page background, which matches the game's own backdrop.
  const width = Math.round(Math.min(vv?.width ?? Infinity, window.innerWidth, doc.clientWidth));
  const height = Math.round(
    Math.min(vv?.height ?? Infinity, window.innerHeight, doc.clientHeight) -
      probe.offsetHeight
  );
  parent.style.width = `${width}px`;
  parent.style.height = `${height}px`;
  game.scale.resize(width, height);
}

game.events.once(Phaser.Core.Events.READY, fitToViewport);
window.addEventListener("resize", fitToViewport);
window.visualViewport?.addEventListener("resize", fitToViewport);
// Safari settles its viewport a beat after the rotation finishes.
window.addEventListener("orientationchange", () => setTimeout(fitToViewport, 200));

// Dev-only handle for debugging/automated playtesting (stripped from prod builds).
if (import.meta.env.DEV) {
  (window as any).__game = game;
}

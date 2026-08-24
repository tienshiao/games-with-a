import Phaser from "phaser";
import { MenuScene } from "./scenes/MenuScene";
import { GameScene } from "./scenes/GameScene";
import { GameOverScene } from "./scenes/GameOverScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: "#0b0f1e",
  scale: {
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
  scene: [MenuScene, GameScene, GameOverScene],
};

const game = new Phaser.Game(config);

// Dev-only handle for debugging/automated playtesting (stripped from prod builds).
if (import.meta.env.DEV) {
  (window as any).__game = game;
}

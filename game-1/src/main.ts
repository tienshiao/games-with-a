import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { LavaScene } from "./scenes/LavaScene";
import { SnowScene } from "./scenes/SnowScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#1d1d2e",
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 300 },
      debug: false,
    },
  },
  scene: [GameScene, LavaScene, SnowScene],
};

new Phaser.Game(config);

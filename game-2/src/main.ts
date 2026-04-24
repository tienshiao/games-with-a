import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { MenuScene } from "./scenes/MenuScene";
import { GameOverScene } from "./scenes/GameOverScene";
import { CastleScene } from "./scenes/CastleScene";
import { VictoryScene } from "./scenes/VictoryScene";
import { BonusScene } from "./scenes/BonusScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 500,
  backgroundColor: "#5c94fc",
  pixelArt: true,
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 1200 },
      debug: false,
    },
  },
  scene: [MenuScene, GameScene, CastleScene, BonusScene, GameOverScene, VictoryScene],
};

new Phaser.Game(config);

import Phaser from "phaser";
import { createTextures } from "../textures";

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: "MenuScene" });
  }

  create(): void {
    createTextures(this);

    const cx = 400;
    const cy = 250;

    // Title
    this.add
      .text(cx, 120, "SUPER PLATFORMER", {
        fontSize: "48px",
        fontFamily: "monospace",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    // Decorative player sprite
    const player = this.add.sprite(cx, 210, "player-idle").setScale(3);
    this.anims.create({
      key: "menu-idle",
      frames: this.anims.generateFrameNumbers("player-idle", {
        start: 0,
        end: 1,
      }),
      frameRate: 3,
      repeat: -1,
    });
    player.play("menu-idle");

    // Instructions
    this.add
      .text(cx, 310, "Arrow Keys / WASD to move\nSpace / Up to jump", {
        fontSize: "18px",
        fontFamily: "monospace",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
        align: "center",
      })
      .setOrigin(0.5);

    const startText = this.add
      .text(cx, 410, "Press ENTER or SPACE to start", {
        fontSize: "22px",
        fontFamily: "monospace",
        color: "#ffde00",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    // Blink effect
    this.tweens.add({
      targets: startText,
      alpha: 0.2,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    this.input.keyboard!.once("keydown-SPACE", () =>
      this.scene.start("GameScene", { level: 1, score: 0 })
    );
    this.input.keyboard!.once("keydown-ENTER", () =>
      this.scene.start("GameScene", { level: 1, score: 0 })
    );
  }
}

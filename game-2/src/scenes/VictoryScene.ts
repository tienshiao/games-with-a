import Phaser from "phaser";

export class VictoryScene extends Phaser.Scene {
  constructor() {
    super({ key: "VictoryScene" });
  }

  create(data: { score: number }): void {
    const cx = 400;

    this.cameras.main.setBackgroundColor("#1a1a2e");

    this.add
      .text(cx, 80, "YOU WIN!", {
        fontSize: "64px",
        fontFamily: "monospace",
        color: "#ffde00",
        stroke: "#000000",
        strokeThickness: 8,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 170, "The chicken has been defeated!", {
        fontSize: "20px",
        fontFamily: "monospace",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 240, `Final Score: ${data.score}`, {
        fontSize: "32px",
        fontFamily: "monospace",
        color: "#ffde00",
        stroke: "#000000",
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    // Decorative player sprite
    const player = this.add.sprite(cx, 320, "player-idle").setScale(4);
    if (this.anims.exists("idle")) {
      player.play("idle");
    }

    const restartText = this.add
      .text(cx, 420, "Press ENTER or SPACE to play again", {
        fontSize: "20px",
        fontFamily: "monospace",
        color: "#44ff44",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: restartText,
      alpha: 0.2,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    this.time.delayedCall(500, () => {
      const restart = () => this.scene.start("GameScene", { level: 1, score: 0 });
      this.input.keyboard!.once("keydown-SPACE", restart);
      this.input.keyboard!.once("keydown-ENTER", restart);
    });
  }
}

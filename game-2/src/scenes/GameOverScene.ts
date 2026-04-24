import Phaser from "phaser";

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameOverScene" });
  }

  create(data: { score: number; distance: number; level?: number; scene?: string }): void {
    const cx = 400;
    const restartScene = data.scene ?? "GameScene";
    const level = data.level ?? 1;

    this.add
      .text(cx, 120, "GAME OVER", {
        fontSize: "56px",
        fontFamily: "monospace",
        color: "#ff4444",
        stroke: "#000000",
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 220, `Score: ${data.score}`, {
        fontSize: "28px",
        fontFamily: "monospace",
        color: "#ffde00",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 270, `Distance: ${data.distance}m`, {
        fontSize: "22px",
        fontFamily: "monospace",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    const restartText = this.add
      .text(cx, 380, "Press ENTER or SPACE to retry", {
        fontSize: "22px",
        fontFamily: "monospace",
        color: "#ffde00",
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

    const restart = () => {
      this.scene.start(restartScene, { level, score: 0 });
    };

    this.time.delayedCall(500, () => {
      this.input.keyboard!.once("keydown-SPACE", restart);
      this.input.keyboard!.once("keydown-ENTER", restart);
    });
  }
}

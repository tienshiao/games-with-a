import Phaser from "phaser";
import { createTextures } from "../textures";
import { Starfield } from "../background";
import { submitScore, getHighScore } from "../storage";
import { playClick } from "../sounds";

interface GameOverData {
  score?: number;
}

export class GameOverScene extends Phaser.Scene {
  private starfield!: Starfield;
  private items: { obj: Phaser.GameObjects.Text; fy: number }[] = [];

  constructor() {
    super({ key: "GameOverScene" });
  }

  create(data: GameOverData): void {
    createTextures(this);
    this.starfield = new Starfield(this);
    this.items = [];

    const score = data?.score ?? 0;
    const prevBest = getHighScore();
    const best = submitScore(score);
    const isNewBest = score > prevBest && score > 0;

    // Each item is positioned by a vertical fraction of the live window height.
    const add = (
      fy: number,
      text: string,
      style: Phaser.Types.GameObjects.Text.TextStyle
    ): Phaser.GameObjects.Text => {
      const obj = this.add.text(0, 0, text, style).setOrigin(0.5);
      this.items.push({ obj, fy });
      return obj;
    };

    add(0.25, "GAME OVER", {
      fontSize: "56px",
      fontFamily: "monospace",
      fontStyle: "bold",
      color: "#ff5a3c",
      stroke: "#000000",
      strokeThickness: 8,
    });

    add(0.4, `SCORE  ${score}`, {
      fontSize: "34px",
      fontFamily: "monospace",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 5,
    });

    add(0.465, `BEST   ${best}`, {
      fontSize: "26px",
      fontFamily: "monospace",
      color: "#ffd44a",
      stroke: "#000000",
      strokeThickness: 4,
    });

    if (isNewBest) {
      const nb = add(0.54, "NEW BEST!", {
        fontSize: "24px",
        fontFamily: "monospace",
        fontStyle: "bold",
        color: "#5dff8f",
        stroke: "#000000",
        strokeThickness: 4,
      });
      this.tweens.add({
        targets: nb,
        scale: 1.15,
        duration: 500,
        yoyo: true,
        repeat: -1,
      });
    }

    const retry = add(0.7, "TAP TO RETRY", {
      fontSize: "30px",
      fontFamily: "monospace",
      fontStyle: "bold",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 5,
    });
    this.tweens.add({
      targets: retry,
      alpha: 0.25,
      duration: 650,
      yoyo: true,
      repeat: -1,
    });

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);

    // Brief input lock so the death tap doesn't instantly restart
    this.time.delayedCall(400, () => {
      const restart = () => {
        playClick();
        this.scene.start("GameScene");
      };
      this.input.once("pointerdown", restart);
      this.input.keyboard!.once("keydown-SPACE", restart);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });
  }

  private layout(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    for (const { obj, fy } of this.items) {
      obj.setPosition(w / 2, h * fy);
    }
  }

  override update(_time: number, delta: number): void {
    this.starfield.update(delta);
  }
}

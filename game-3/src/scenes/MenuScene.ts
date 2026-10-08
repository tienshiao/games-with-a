import Phaser from "phaser";
import { createTextures } from "../textures";
import { Starfield } from "../background";
import { view3d } from "../three/world3d";
import { rocketModel } from "../three/models";
import { getHighScore } from "../storage";
import { playClick } from "../sounds";

export class MenuScene extends Phaser.Scene {
  private starfield!: Starfield;
  private rocket!: Phaser.GameObjects.Sprite;
  private rocketBaseY = 0;
  private title!: Phaser.GameObjects.Text;
  private subtitle!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "MenuScene" });
  }

  create(): void {
    createTextures(this);
    this.starfield = new Starfield(this);

    this.rocket = this.add.sprite(0, 0, "rocket").setScale(2.4);
    view3d(this).bind(this.rocket, rocketModel({ spin: true }));

    this.title = this.add
      .text(0, 0, "The Beginning of\nCrazy Animals", {
        fontSize: "46px",
        fontFamily: "monospace",
        fontStyle: "bold",
        color: "#ffffff",
        stroke: "#1a2440",
        strokeThickness: 8,
        align: "center",
        lineSpacing: 4,
      })
      .setOrigin(0.5);

    this.subtitle = this.add
      .text(0, 0, "dodge the asteroids", {
        fontSize: "18px",
        fontFamily: "monospace",
        color: "#8fa6d8",
      })
      .setOrigin(0.5);

    const best = getHighScore();
    this.bestText = this.add
      .text(0, 0, `BEST: ${best}`, {
        fontSize: "24px",
        fontFamily: "monospace",
        color: "#ffd44a",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.prompt = this.add
      .text(0, 0, "TAP TO START", {
        fontSize: "30px",
        fontFamily: "monospace",
        fontStyle: "bold",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: this.prompt,
      alpha: 0.25,
      duration: 650,
      yoyo: true,
      repeat: -1,
    });

    this.hint = this.add
      .text(0, 0, "tap  •  click  •  space", {
        fontSize: "15px",
        fontFamily: "monospace",
        color: "#5d6b8c",
      })
      .setOrigin(0.5);

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);

    // Any input starts the game (covers touch, mouse, keyboard)
    const start = () => {
      playClick();
      this.scene.start("GameScene");
    };
    this.input.once("pointerdown", start);
    this.input.keyboard!.once("keydown-SPACE", start);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });
  }

  // Position everything proportionally so it stays centered at any window size.
  private layout(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    // The title is the widest element — shrink it on narrow screens so the
    // longest line never runs off the sides.
    const maxTitleWidth = w * 0.9;
    this.title.setScale(Math.min(1, maxTitleWidth / this.title.width));
    this.title.setPosition(cx, h * 0.17);
    // Hang the subtitle off the title's real bottom edge — a fixed fraction of
    // the height collides with the second line on short windows.
    // displayHeight already accounts for the fit-to-width scale above.
    this.subtitle.setPosition(cx, this.title.y + this.title.displayHeight / 2 + 20);
    this.rocketBaseY = h * 0.37;
    this.rocket.setPosition(cx, this.rocketBaseY);
    this.bestText.setPosition(cx, h * 0.55);
    this.prompt.setPosition(cx, h * 0.69);
    this.hint.setPosition(cx, h - 40);
  }

  override update(time: number, delta: number): void {
    this.starfield.update(delta);
    // Gentle bob (replaces a fixed tween so it survives relayout on resize)
    this.rocket.y = this.rocketBaseY + Math.sin(time / 550) * 16;
    this.rocket.angle = Math.sin(time / 550) * 5;
  }
}

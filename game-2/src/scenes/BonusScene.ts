import Phaser from "phaser";
import { createTextures } from "../textures";
import { playCoin, playJump } from "../sounds";

const TILE = 32;
const PLAYER_SPEED = 200;
const JUMP_VELOCITY = -500;
const ROOM_WIDTH = 800;
const ROOM_HEIGHT = 500;
const FLOOR_Y = 14 * TILE; // 448
const CEILING_Y = 2 * TILE; // 64

export class BonusScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private coins!: Phaser.Physics.Arcade.StaticGroup;
  private exitPipe!: Phaser.GameObjects.Image;
  private exitPipeBounds!: { x: number; y: number; halfW: number };
  private coinsCollected = 0;
  private exited = false;

  constructor() {
    super({ key: "BonusScene" });
  }

  create(): void {
    this.coinsCollected = 0;
    this.exited = false;

    createTextures(this);

    this.cameras.main.setBackgroundColor("#0a0a20");
    this.physics.world.setBounds(0, 0, ROOM_WIDTH, ROOM_HEIGHT);

    // Walls, floor, ceiling
    this.walls = this.physics.add.staticGroup();
    this.buildRoom();

    // Coins
    this.coins = this.physics.add.staticGroup();
    this.placeCoins();

    // Exit pipe (right side, on floor)
    const pipeX = ROOM_WIDTH - 80;
    const pipeTopY = FLOOR_Y - 64;
    this.exitPipe = this.add
      .image(pipeX, pipeTopY + 32, "pipe-warp")
      .setDepth(4);
    this.exitPipeBounds = {
      x: pipeX,
      y: pipeTopY,
      halfW: 24,
    };

    // Player - drops in from the top-left
    this.player = this.physics.add.sprite(80, CEILING_Y + 32, "player-idle");
    this.player.setCollideWorldBounds(true);
    this.player.setSize(16, 28);
    this.player.setOffset(8, 4);
    this.player.setDepth(10);

    // Solid pipe body so the player can stand on top of it
    const exitPipeSolid = this.walls
      .create(pipeX, pipeTopY + 32, "pipe-warp")
      .setSize(48, 64)
      .refreshBody();
    exitPipeSolid.setVisible(false); // we use the decorative image above

    this.physics.add.collider(this.player, this.walls);
    this.physics.add.overlap(
      this.player,
      this.coins,
      this.collectCoin,
      undefined,
      this
    );

    // Controls
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // HUD
    this.add
      .text(ROOM_WIDTH / 2, 20, "BONUS ROOM", {
        fontSize: "18px",
        fontFamily: "monospace",
        color: "#ffdd44",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setDepth(100);

    this.add
      .text(
        ROOM_WIDTH / 2,
        ROOM_HEIGHT - 24,
        "Stand on the pipe and press DOWN to exit",
        {
          fontSize: "12px",
          fontFamily: "monospace",
          color: "#aaaaaa",
        }
      )
      .setOrigin(0.5, 0.5)
      .setDepth(100);
  }

  update(): void {
    if (this.exited) return;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down;

    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const jump =
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      Phaser.Input.Keyboard.JustDown(this.wasd.up);
    const down =
      Phaser.Input.Keyboard.JustDown(this.cursors.down) ||
      Phaser.Input.Keyboard.JustDown(this.wasd.down);

    if (left) {
      this.player.setVelocityX(-PLAYER_SPEED);
      this.player.setFlipX(true);
    } else if (right) {
      this.player.setVelocityX(PLAYER_SPEED);
      this.player.setFlipX(false);
    } else {
      this.player.setVelocityX(0);
    }

    if (jump && onGround) {
      this.player.setVelocityY(JUMP_VELOCITY);
      playJump();
    }

    if (!onGround) {
      this.player.play("jump", true);
    } else if (left || right) {
      this.player.play("run", true);
    } else {
      this.player.play("idle", true);
    }

    // Exit check - standing on the exit pipe and pressing down
    if (down && onGround) {
      const ep = this.exitPipeBounds;
      const onPipe =
        Math.abs(this.player.x - ep.x) < ep.halfW &&
        Math.abs(this.player.y + 14 - ep.y) < 6;
      if (onPipe) this.exit();
    }
  }

  private buildRoom(): void {
    // Floor
    for (let x = 0; x < ROOM_WIDTH; x += TILE) {
      this.walls
        .create(x + TILE / 2, FLOOR_Y + TILE / 2, "ground")
        .setSize(TILE, TILE)
        .refreshBody();
      this.walls
        .create(x + TILE / 2, FLOOR_Y + TILE / 2 + TILE, "ground")
        .setSize(TILE, TILE)
        .refreshBody();
    }
    // Ceiling
    for (let x = 0; x < ROOM_WIDTH; x += TILE) {
      this.walls
        .create(x + TILE / 2, CEILING_Y - TILE / 2, "brick")
        .setSize(TILE, TILE)
        .refreshBody();
    }
    // Left wall
    for (let y = CEILING_Y; y < FLOOR_Y; y += TILE) {
      this.walls
        .create(TILE / 2, y + TILE / 2, "brick")
        .setSize(TILE, TILE)
        .refreshBody();
    }
    // Right wall
    for (let y = CEILING_Y; y < FLOOR_Y; y += TILE) {
      this.walls
        .create(ROOM_WIDTH - TILE / 2, y + TILE / 2, "brick")
        .setSize(TILE, TILE)
        .refreshBody();
    }
  }

  private placeCoins(): void {
    // Three rows of coins
    const rows = [
      { y: FLOOR_Y - TILE * 2, startX: 120, count: 10 },
      { y: FLOOR_Y - TILE * 4, startX: 160, count: 8 },
      { y: FLOOR_Y - TILE * 6, startX: 200, count: 6 },
    ];
    for (const row of rows) {
      for (let i = 0; i < row.count; i++) {
        const coin = this.coins.create(
          row.startX + i * TILE,
          row.y,
          "coin",
          0
        ) as Phaser.Physics.Arcade.Sprite;
        coin.setSize(12, 14);
        coin.play("coin-spin");
      }
    }
  }

  private collectCoin(
    _p:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Tilemaps.Tile,
    coin: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ): void {
    (coin as Phaser.Physics.Arcade.Sprite).destroy();
    this.coinsCollected++;
    playCoin();
  }

  private exit(): void {
    if (this.exited) return;
    this.exited = true;

    // Sink animation into the exit pipe
    const pipeTopY = this.exitPipeBounds.y;
    (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.player.setVelocity(0, 0);
    this.player.setX(this.exitPipeBounds.x);
    this.player.play("idle", true);

    this.tweens.add({
      targets: this.player,
      y: pipeTopY + 32,
      alpha: 0,
      duration: 450,
      ease: "Sine.easeIn",
      onComplete: () => {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () => {
          this.events.emit("bonus-complete", this.coinsCollected * 100);
        });
      },
    });
  }
}

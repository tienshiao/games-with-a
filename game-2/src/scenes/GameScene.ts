import Phaser from "phaser";
import { createTextures } from "../textures";
import { generateLevel, type LevelData } from "../level";
import {
  playCoin,
  playFlap,
  playHurt,
  playJump,
  playPowerup,
  playQBlock,
  playWarp,
} from "../sounds";

const TILE = 32;
const PLAYER_SPEED = 220;
const JUMP_VELOCITY = -520;
const FLAP_VELOCITY = -380;
const WORLD_WIDTH = 6400; // 200 tiles wide
const WORLD_HEIGHT = 800; // extended downward for safe pits

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private questionBlocks!: Phaser.Physics.Arcade.StaticGroup;
  private coins!: Phaser.Physics.Arcade.StaticGroup;
  private enemies!: Phaser.Physics.Arcade.Group;
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private maxCameraX = 0;
  private isDead = false;
  private levelData!: LevelData;
  private warpPipes: { x: number; topY: number }[] = [];
  private inPipeTransition = false;
  private hasCape = false;
  private capeInvincible = false;
  private capeSprite?: Phaser.GameObjects.Image;
  private checkpointReached = false;
  private checkpointX = 0;
  private checkpointY = 0;
  private checkpointSprite!: Phaser.Physics.Arcade.Sprite;
  private checkpointScore = 0;
  private level = 1;

  constructor() {
    super({ key: "GameScene" });
  }

  create(data?: { level?: number; score?: number }): void {
    this.level = data?.level ?? 1;
    this.score = data?.score ?? 0;
    this.maxCameraX = 0;
    this.isDead = false;
    this.inPipeTransition = false;
    this.warpPipes = [];
    this.hasCape = false;
    this.capeInvincible = false;
    this.capeSprite = undefined;
    this.checkpointReached = false;
    this.checkpointScore = 0;

    createTextures(this);
    this.createAnimations();

    this.levelData = generateLevel(WORLD_WIDTH / TILE);

    // World bounds - extended height, no bottom collision so deadly pits work
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.physics.world.setBoundsCollision(true, true, true, false);

    // Background decorations
    this.createBackground();

    // Platforms
    this.platforms = this.physics.add.staticGroup();
    this.questionBlocks = this.physics.add.staticGroup();
    this.buildPlatforms();

    // Coins
    this.coins = this.physics.add.staticGroup();
    this.placeCoins();

    // Enemies
    this.enemies = this.physics.add.group({ allowGravity: true });
    this.placeEnemies();

    // Player
    this.player = this.physics.add.sprite(80, 300, "player-idle");
    this.player.setCollideWorldBounds(false);
    this.player.setSize(16, 28);
    this.player.setOffset(8, 4);
    this.player.setDepth(10);

    // Collisions
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.collider(
      this.player,
      this.questionBlocks,
      this.hitQuestionBlock,
      undefined,
      this
    );
    this.physics.add.collider(this.enemies, this.questionBlocks);
    this.physics.add.overlap(
      this.player,
      this.coins,
      this.collectCoin,
      undefined,
      this
    );
    this.physics.add.overlap(
      this.player,
      this.enemies,
      this.hitEnemy,
      undefined,
      this
    );

    // Camera - follow vertically too so we can see safe pits
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.15);
    this.cameras.main.setDeadzone(100, 50);

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
      .text(400, 16, `World ${this.level}`, {
        fontSize: "20px",
        fontFamily: "monospace",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setScrollFactor(0)
      .setDepth(100)
      .setOrigin(0.5, 0);

    this.scoreText = this.add
      .text(16, 16, `Score: ${this.score}`, {
        fontSize: "20px",
        fontFamily: "monospace",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setScrollFactor(0)
      .setDepth(100);

    // Checkpoint flag in the middle
    const cp = this.levelData.checkpoint;
    this.checkpointX = cp.x * TILE + TILE / 2;
    this.checkpointY = cp.y * TILE; // bottom-aligned to ground surface
    this.checkpointSprite = this.physics.add.sprite(
      this.checkpointX,
      this.checkpointY,
      "checkpoint"
    );
    this.checkpointSprite.setOrigin(0.5, 1);
    this.checkpointSprite.body!.allowGravity = false;
    (this.checkpointSprite.body as Phaser.Physics.Arcade.Body).setImmovable(true);
    this.checkpointSprite.setDepth(5);

    this.physics.add.overlap(
      this.player,
      this.checkpointSprite,
      this.reachCheckpoint,
      undefined,
      this
    );

    // Flag at the end - bottom aligned to ground
    this.add.image(WORLD_WIDTH - 100, 500 - TILE, "flagpole").setOrigin(0.5, 1);
  }

  update(): void {
    if (this.capeSprite) {
      const offsetX = this.player.flipX ? 8 : -8;
      this.capeSprite.setPosition(
        this.player.x + offsetX,
        this.player.y + 2
      );
      this.capeSprite.setAlpha(this.player.alpha);
      this.capeSprite.setFlipX(this.player.flipX);
    }

    if (this.isDead || this.inPipeTransition) return;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down;

    // Horizontal movement
    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const jump =
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      Phaser.Input.Keyboard.JustDown(this.wasd.up);
    const down =
      Phaser.Input.Keyboard.JustDown(this.cursors.down) ||
      Phaser.Input.Keyboard.JustDown(this.wasd.down);

    // Enter warp pipe when pressing down while standing on top of one
    if (down && onGround) {
      for (const wp of this.warpPipes) {
        if (
          Math.abs(this.player.x - wp.x) < 20 &&
          this.player.y < wp.topY - 5
        ) {
          this.enterWarpPipe(wp);
          return;
        }
      }
    }

    if (left) {
      this.player.setVelocityX(-PLAYER_SPEED);
      this.player.setFlipX(true);
    } else if (right) {
      this.player.setVelocityX(PLAYER_SPEED);
      this.player.setFlipX(false);
    } else {
      this.player.setVelocityX(0);
    }

    // Jump / flap
    if (jump) {
      if (onGround) {
        this.player.setVelocityY(JUMP_VELOCITY);
        playJump();
      } else if (this.hasCape) {
        this.player.setVelocityY(FLAP_VELOCITY);
        playFlap();
      }
    }

    // Animations
    if (!onGround) {
      this.player.play("jump", true);
    } else if (left || right) {
      this.player.play("run", true);
    } else {
      this.player.play("idle", true);
    }

    // Prevent going back - relaxed while caped so the player can fly anywhere
    if (!this.hasCape) {
      this.maxCameraX = Math.max(
        this.maxCameraX,
        this.cameras.main.scrollX
      );
      this.cameras.main.scrollX = Math.max(
        this.cameras.main.scrollX,
        this.maxCameraX
      );
      const leftBound = this.maxCameraX + 8;
      if (this.player.x < leftBound) {
        this.player.x = leftBound;
        body.velocity.x = Math.max(0, body.velocity.x);
      }
    } else {
      // Keep player inside the world horizontally
      if (this.player.x < 8) {
        this.player.x = 8;
        body.velocity.x = Math.max(0, body.velocity.x);
      }
    }

    // Fall death - only if below the safe pit floor level
    if (this.player.y > WORLD_HEIGHT + 50) {
      this.playerDeath();
    }

    // Reached flag
    if (this.player.x >= WORLD_WIDTH - 120) {
      this.score += 1000;
      this.playerWin();
    }

    // Update enemy movement
    this.enemies.getChildren().forEach((e) => {
      const enemy = e as Phaser.Physics.Arcade.Sprite;
      const eb = enemy.body as Phaser.Physics.Arcade.Body;
      if (eb.blocked.left) {
        enemy.setVelocityX(60);
        enemy.setFlipX(true);
      } else if (eb.blocked.right) {
        enemy.setVelocityX(-60);
        enemy.setFlipX(false);
      }
      // Kill enemies that fall off the world
      if (enemy.y > WORLD_HEIGHT + 50) enemy.destroy();
    });
  }

  private createAnimations(): void {
    if (this.anims.exists("idle")) return;

    this.anims.create({
      key: "idle",
      frames: this.anims.generateFrameNumbers("player-idle", {
        start: 0,
        end: 1,
      }),
      frameRate: 4,
      repeat: -1,
    });

    this.anims.create({
      key: "run",
      frames: this.anims.generateFrameNumbers("player-run", {
        start: 0,
        end: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });

    this.anims.create({
      key: "jump",
      frames: [{ key: "player-jump", frame: 0 }],
      frameRate: 1,
    });

    this.anims.create({
      key: "coin-spin",
      frames: this.anims.generateFrameNumbers("coin", { start: 0, end: 3 }),
      frameRate: 8,
      repeat: -1,
    });

    this.anims.create({
      key: "goomba-walk",
      frames: this.anims.generateFrameNumbers("goomba", { start: 0, end: 1 }),
      frameRate: 4,
      repeat: -1,
    });

    this.anims.create({
      key: "qblock-shine",
      frames: this.anims.generateFrameNumbers("qblock", { start: 0, end: 1 }),
      frameRate: 3,
      repeat: -1,
    });
  }

  private createBackground(): void {
    // Clouds
    for (let x = 100; x < WORLD_WIDTH; x += Phaser.Math.Between(200, 500)) {
      const y = Phaser.Math.Between(30, 120);
      const s = Phaser.Math.FloatBetween(0.8, 2.0);
      this.add
        .image(x, y, "cloud")
        .setScale(s)
        .setAlpha(0.6)
        .setScrollFactor(0.3)
        .setDepth(-2);
    }

    // Hills
    for (let x = 0; x < WORLD_WIDTH; x += Phaser.Math.Between(300, 600)) {
      const s = Phaser.Math.FloatBetween(1, 2.5);
      this.add
        .image(x, 500 - TILE, "hill")
        .setOrigin(0.5, 1)
        .setScale(s, s * 0.7)
        .setDepth(-1)
        .setScrollFactor(0.5);
    }
  }

  private buildPlatforms(): void {
    const { ground, floatingPlatforms, pipes, safePits } = this.levelData;

    // Ground tiles
    for (const seg of ground) {
      for (let x = seg.start; x < seg.end; x++) {
        // Top row
        this.platforms
          .create(x * TILE + TILE / 2, 500 - TILE / 2, "ground")
          .setSize(TILE, TILE)
          .refreshBody();
        // Second row for depth
        this.platforms
          .create(x * TILE + TILE / 2, 500 + TILE / 2, "ground")
          .setSize(TILE, TILE)
          .refreshBody();
      }
    }

    // Floating platforms (brick / question blocks)
    for (const plat of floatingPlatforms) {
      for (let i = 0; i < plat.width; i++) {
        if (plat.type === "question") {
          const block = this.questionBlocks
            .create(
              (plat.x + i) * TILE + TILE / 2,
              plat.y * TILE + TILE / 2,
              "qblock",
              0
            )
            .setSize(TILE, TILE)
            .refreshBody() as Phaser.Physics.Arcade.Sprite;
          block.setData("used", false);
          block.setData("contains", Math.random() < 0.33 ? "feather" : "coin");
          block.play("qblock-shine");
        } else {
          this.platforms
            .create(
              (plat.x + i) * TILE + TILE / 2,
              plat.y * TILE + TILE / 2,
              "brick",
              0
            )
            .setSize(TILE, TILE)
            .refreshBody();
        }
      }
    }

    // Safe pits - floor, walls, and step to climb out
    for (const pit of safePits) {
      const pitWidth = pit.end - pit.start;

      // Floor
      for (let x = pit.start; x < pit.end; x++) {
        this.platforms
          .create(x * TILE + TILE / 2, pit.floorY * TILE + TILE / 2, "brick", 0)
          .setSize(TILE, TILE)
          .refreshBody();
      }

      // Left wall (from ground down to pit floor)
      for (let y = 15; y <= pit.floorY; y++) {
        this.platforms
          .create(
            (pit.start - 1) * TILE + TILE / 2,
            y * TILE + TILE / 2,
            "ground"
          )
          .setSize(TILE, TILE)
          .refreshBody();
      }

      // Right wall
      for (let y = 15; y <= pit.floorY; y++) {
        this.platforms
          .create(
            pit.end * TILE + TILE / 2,
            y * TILE + TILE / 2,
            "ground"
          )
          .setSize(TILE, TILE)
          .refreshBody();
      }

      // Steps to climb out (right side) - staircase going up
      const steps = pit.floorY - 15; // how many rows to climb
      for (let s = 0; s < steps; s++) {
        const stepX = pit.end - 1 - s;
        if (stepX <= pit.start) break;
        const stepY = pit.floorY - s;
        this.platforms
          .create(
            stepX * TILE + TILE / 2,
            stepY * TILE + TILE / 2,
            "brick",
            0
          )
          .setSize(TILE, TILE)
          .refreshBody();
      }
    }

    // Pipes
    for (const p of pipes) {
      const cx = p.x * TILE + 24;
      const cy = p.y * TILE - 16;
      const texture = p.canWarp ? "pipe-warp" : "pipe";
      this.platforms
        .create(cx, cy, texture)
        .setSize(48, 64)
        .refreshBody();
      if (p.canWarp) {
        // Track top-center of this pipe for down-warp detection
        this.warpPipes.push({ x: cx, topY: cy - 32 });
      }
    }
  }

  private placeCoins(): void {
    for (const c of this.levelData.coins) {
      const coin = this.coins.create(
        c.x * TILE + TILE / 2,
        c.y * TILE + TILE / 2,
        "coin",
        0
      );
      coin.setSize(12, 14);
      (coin as Phaser.Physics.Arcade.Sprite).play("coin-spin");
    }
  }

  private placeEnemies(): void {
    for (const e of this.levelData.enemies) {
      const enemy = this.enemies.create(
        e.x * TILE + TILE / 2,
        e.y * TILE - TILE / 2,
        "goomba",
        0
      ) as Phaser.Physics.Arcade.Sprite;
      enemy.setSize(24, 28);
      enemy.setOffset(4, 4);
      enemy.play("goomba-walk");
      enemy.setVelocityX(e.dir === "left" ? -60 : 60);
      enemy.setBounce(0);
      (enemy.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(false);
    }
  }

  private collectCoin(
    _player:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Tilemaps.Tile,
    coin: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ): void {
    (coin as Phaser.Physics.Arcade.Sprite).destroy();
    this.score += 100;
    this.scoreText.setText(`Score: ${this.score}`);
    playCoin();
  }

  private hitEnemy(
    _player:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Tilemaps.Tile,
    enemy: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;

    // Stomp from above
    if (body.velocity.y > 0 && this.player.y < (enemy as any).y - 10) {
      (enemy as Phaser.Physics.Arcade.Sprite).destroy();
      this.player.setVelocityY(-300); // bounce
      this.score += 200;
      this.scoreText.setText(`Score: ${this.score}`);
      return;
    }
    if (this.capeInvincible) return;
    if (this.hasCape) {
      this.loseCape();
      return;
    }
    this.playerDeath();
  }

  private hitQuestionBlock(
    _player:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Tilemaps.Tile,
    block: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ): void {
    const sprite = block as Phaser.Physics.Arcade.Sprite;
    if (sprite.getData("used")) return;

    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    const blockBody = sprite.body as Phaser.Physics.Arcade.StaticBody;
    // Only trigger when player hits the block from below
    if (!(playerBody.touching.up && blockBody.touching.down)) return;

    sprite.setData("used", true);
    sprite.anims.stop();
    sprite.setTexture("qblock-used");
    playQBlock();

    // Bump animation - visual only, static body stays put
    const baseY = sprite.y;
    this.tweens.add({
      targets: sprite,
      y: baseY - 8,
      duration: 90,
      yoyo: true,
      ease: "Quad.easeOut",
    });

    const contains = sprite.getData("contains") as "coin" | "feather";
    if (contains === "feather") {
      this.spawnFeather(sprite.x, baseY - TILE / 2);
    } else {
      this.popCoinReward(sprite.x, sprite.y - TILE / 2);
      this.score += 200;
      this.scoreText.setText(`Score: ${this.score}`);
    }
  }

  private popCoinReward(x: number, startY: number): void {
    const popCoin = this.add.sprite(x, startY, "coin", 0).setDepth(6);
    popCoin.play("coin-spin");
    this.tweens.add({
      targets: popCoin,
      y: startY - TILE * 1.6,
      duration: 260,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: popCoin,
          y: startY - TILE * 0.8,
          alpha: 0,
          duration: 180,
          ease: "Quad.easeIn",
          onComplete: () => popCoin.destroy(),
        });
      },
    });
  }

  private spawnFeather(x: number, startY: number): void {
    const feather = this.physics.add.sprite(x, startY, "feather");
    feather.setDepth(6);
    const fbody = feather.body as Phaser.Physics.Arcade.Body;
    fbody.setAllowGravity(false);
    fbody.setImmovable(true);

    // Pop up out of the block, then bob in place
    const restY = startY - TILE * 1.5;
    this.tweens.add({
      targets: feather,
      y: restY,
      duration: 350,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: feather,
          y: restY - 6,
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      },
    });

    this.physics.add.overlap(
      this.player,
      feather,
      () => this.collectFeather(feather),
      undefined,
      this
    );
  }

  private collectFeather(feather: Phaser.Physics.Arcade.Sprite): void {
    feather.destroy();
    if (this.hasCape) {
      // Already caped - small bonus instead
      this.score += 1000;
      this.scoreText.setText(`Score: ${this.score}`);
      playPowerup();
      return;
    }
    this.hasCape = true;
    this.player.setTint(0xffd94a);
    this.capeSprite = this.add
      .image(this.player.x, this.player.y, "cape")
      .setDepth(9)
      .setOrigin(0.5, 0.4);
    // Subtle flutter
    this.tweens.add({
      targets: this.capeSprite,
      scaleY: 1.08,
      duration: 260,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    playPowerup();
  }

  private loseCape(): void {
    this.hasCape = false;
    this.capeInvincible = true;
    this.player.clearTint();
    if (this.capeSprite) {
      const cape = this.capeSprite;
      this.capeSprite = undefined;
      this.tweens.add({
        targets: cape,
        alpha: 0,
        y: cape.y - 20,
        duration: 400,
        onComplete: () => cape.destroy(),
      });
    }
    playHurt();

    // Brief invincibility flash
    this.tweens.add({
      targets: this.player,
      alpha: 0.3,
      duration: 90,
      yoyo: true,
      repeat: 10,
      onComplete: () => {
        this.player.setAlpha(1);
        this.capeInvincible = false;
      },
    });
  }

  private enterWarpPipe(wp: { x: number; topY: number }): void {
    if (this.inPipeTransition) return;
    this.inPipeTransition = true;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    this.player.setX(wp.x);
    this.player.play("idle", true);
    playWarp();

    this.tweens.add({
      targets: this.player,
      y: wp.topY + 40,
      alpha: 0,
      duration: 450,
      ease: "Sine.easeIn",
      onComplete: () => {
        this.cameras.main.fadeOut(250, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () => {
          this.openBonusScene(wp);
        });
      },
    });
  }

  private openBonusScene(wp: { x: number; topY: number }): void {
    const bonus = this.scene.get("BonusScene");
    bonus.events.once("bonus-complete", (scoreDelta: number) => {
      this.scene.stop("BonusScene");
      this.scene.resume();
      this.returnFromPipe(wp, scoreDelta);
    });
    this.scene.pause();
    this.scene.launch("BonusScene");
  }

  private returnFromPipe(
    wp: { x: number; topY: number },
    scoreDelta: number
  ): void {
    if (scoreDelta > 0) {
      this.score += scoreDelta;
      this.scoreText.setText(`Score: ${this.score}`);
    }

    this.cameras.main.fadeIn(300, 0, 0, 0);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    this.player.setPosition(wp.x, wp.topY + 40);
    this.player.setAlpha(0);
    playWarp();

    this.tweens.add({
      targets: this.player,
      y: wp.topY - 30,
      alpha: 1,
      duration: 400,
      ease: "Sine.easeOut",
      onComplete: () => {
        body.enable = true;
        body.setVelocity(0, 0);
        this.inPipeTransition = false;
      },
    });
  }

  private reachCheckpoint(): void {
    if (this.checkpointReached) return;
    this.checkpointReached = true;
    this.checkpointScore = this.score;

    // Turn the flag green
    this.checkpointSprite.setTint(0x44ff44);

    // Brief text flash
    const txt = this.add
      .text(this.checkpointX, this.checkpointY - 40, "CHECKPOINT!", {
        fontSize: "16px",
        fontFamily: "monospace",
        color: "#44ff44",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(100);

    this.tweens.add({
      targets: txt,
      y: txt.y - 30,
      alpha: 0,
      duration: 1200,
      onComplete: () => txt.destroy(),
    });
  }

  private playerDeath(): void {
    if (this.isDead) return;
    this.isDead = true;
    this.hasCape = false;
    this.capeInvincible = false;
    if (this.capeSprite) {
      this.capeSprite.destroy();
      this.capeSprite = undefined;
    }

    this.player.clearTint();
    this.player.setTint(0xff0000);
    this.player.setVelocityX(0);
    this.player.setVelocityY(-400);
    // Remove platform collider so player falls through
    const colliders = this.physics.world.colliders.getActive();
    if (colliders.length > 0) {
      this.physics.world.removeCollider(colliders[0]);
    }

    if (this.checkpointReached) {
      // Respawn at checkpoint
      this.time.delayedCall(1200, () => {
        this.respawnAtCheckpoint();
      });
    } else {
      // Restart the current level
      this.time.delayedCall(1500, () => {
        this.scene.start("GameScene", { level: this.level, score: 0 });
      });
    }
  }

  private respawnAtCheckpoint(): void {
    this.isDead = false;
    this.score = this.checkpointScore;
    this.scoreText.setText(`Score: ${this.score}`);

    // Reset player
    this.player.clearTint();
    this.player.setPosition(this.checkpointX, this.checkpointY - TILE);
    this.player.setVelocity(0, 0);
    (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);

    // Re-add platform collider
    this.physics.add.collider(this.player, this.platforms);

    // Reset camera lock to checkpoint position
    this.maxCameraX = Math.max(0, this.checkpointX - 400);
    this.cameras.main.scrollX = this.maxCameraX;

    // Brief invincibility flash
    this.tweens.add({
      targets: this.player,
      alpha: 0.3,
      duration: 100,
      yoyo: true,
      repeat: 8,
      onComplete: () => {
        this.player.setAlpha(1);
      },
    });
  }

  private playerWin(): void {
    if (this.isDead) return;
    this.isDead = true;

    this.player.setVelocity(0, 0);
    (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

    // Slide down flagpole
    this.tweens.add({
      targets: this.player,
      y: 500 - TILE * 2,
      duration: 1000,
      onComplete: () => {
        this.time.delayedCall(1000, () => {
          if (this.level < 2) {
            // Advance to next outdoor level
            this.scene.start("GameScene", {
              level: this.level + 1,
              score: this.score,
            });
          } else {
            // After level 2, go to castle
            this.scene.start("CastleScene", { score: this.score });
          }
        });
      },
    });
  }
}

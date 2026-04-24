import Phaser from "phaser";
import { createTextures } from "../textures";
import { generateCastleLevel, type CastleLevelData } from "../level";

const TILE = 32;
const PLAYER_SPEED = 220;
const JUMP_VELOCITY = -520;
const CASTLE_WIDTH = 4800; // 150 tiles
const CASTLE_HEIGHT = 800;

export class CastleScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private coins!: Phaser.Physics.Arcade.StaticGroup;
  private enemies!: Phaser.Physics.Arcade.Group;
  private lavaGroup!: Phaser.Physics.Arcade.StaticGroup;
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private maxCameraX = 0;
  private isDead = false;
  private levelData!: CastleLevelData;
  private checkpointReached = false;
  private checkpointX = 0;
  private checkpointY = 0;
  private checkpointSprite!: Phaser.Physics.Arcade.Sprite;
  private checkpointScore = 0;

  // Boss
  private boss!: Phaser.Physics.Arcade.Sprite;
  private bossHP = 3;
  private bossActive = false;
  private bossHitCooldown = false;
  private bossHPText!: Phaser.GameObjects.Text;
  private bossDirection = -1;
  private bossWalls!: Phaser.Physics.Arcade.StaticGroup;

  constructor() {
    super({ key: "CastleScene" });
  }

  create(data?: { score?: number }): void {
    this.score = data?.score ?? 0;
    this.maxCameraX = 0;
    this.isDead = false;
    this.checkpointReached = false;
    this.checkpointScore = 0;
    this.bossHP = 3;
    this.bossActive = false;
    this.bossHitCooldown = false;

    createTextures(this);
    this.createAnimations();

    this.levelData = generateCastleLevel(CASTLE_WIDTH / TILE);

    // World bounds
    this.physics.world.setBounds(0, 0, CASTLE_WIDTH, CASTLE_HEIGHT);
    this.physics.world.setBoundsCollision(true, true, true, false);

    // Dark background
    this.cameras.main.setBackgroundColor("#1a1a2e");

    // Platforms
    this.platforms = this.physics.add.staticGroup();
    this.buildPlatforms();

    // Lava
    this.lavaGroup = this.physics.add.staticGroup();
    this.placeLava();

    // Torches (decorative)
    this.placeTorches();

    // Coins
    this.coins = this.physics.add.staticGroup();
    this.placeCoins();

    // Enemies
    this.enemies = this.physics.add.group({ allowGravity: true });
    this.placeEnemies();

    // Player
    this.player = this.physics.add.sprite(80, (this.levelData.platforms[0]?.y ?? 15) * TILE - TILE, "player-idle");
    this.player.setCollideWorldBounds(false);
    this.player.setSize(16, 28);
    this.player.setOffset(8, 4);
    this.player.setDepth(10);

    // Boss chicken
    this.createBoss();

    // Collisions
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.collider(this.boss, this.platforms);
    this.physics.add.overlap(this.player, this.coins, this.collectCoin as any, undefined, this);
    this.physics.add.overlap(this.player, this.enemies, this.hitEnemy as any, undefined, this);
    this.physics.add.overlap(this.player, this.lavaGroup, this.hitLava as any, undefined, this);
    this.physics.add.overlap(this.player, this.boss, this.hitBoss as any, undefined, this);

    // Camera
    this.cameras.main.setBounds(0, 0, CASTLE_WIDTH, CASTLE_HEIGHT);
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
      .text(400, 16, "World 3 - Castle", {
        fontSize: "20px",
        fontFamily: "monospace",
        color: "#ff6644",
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

    this.bossHPText = this.add
      .text(16, 42, "", {
        fontSize: "16px",
        fontFamily: "monospace",
        color: "#ff4444",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setScrollFactor(0)
      .setDepth(100);

    // Checkpoint
    const cp = this.levelData.checkpoint;
    this.checkpointX = cp.x * TILE + TILE / 2;
    this.checkpointY = cp.y * TILE;
    this.checkpointSprite = this.physics.add.sprite(this.checkpointX, this.checkpointY, "checkpoint");
    this.checkpointSprite.setOrigin(0.5, 1);
    (this.checkpointSprite.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    (this.checkpointSprite.body as Phaser.Physics.Arcade.Body).setImmovable(true);
    this.checkpointSprite.setDepth(5);
    this.physics.add.overlap(this.player, this.checkpointSprite, this.reachCheckpoint, undefined, this);
  }

  override update(): void {
    if (this.isDead) return;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down;

    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const jump =
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      Phaser.Input.Keyboard.JustDown(this.wasd.up);

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
    }

    if (!onGround) {
      this.player.play("jump", true);
    } else if (left || right) {
      this.player.play("run", true);
    } else {
      this.player.play("idle", true);
    }

    // Prevent going back
    this.maxCameraX = Math.max(this.maxCameraX, this.cameras.main.scrollX);
    this.cameras.main.scrollX = Math.max(this.cameras.main.scrollX, this.maxCameraX);
    const leftBound = this.maxCameraX + 8;
    if (this.player.x < leftBound) {
      this.player.x = leftBound;
      body.velocity.x = Math.max(0, body.velocity.x);
    }

    // Fall death
    if (this.player.y > CASTLE_HEIGHT + 50) {
      this.playerDeath();
    }

    // Update enemies
    this.enemies.getChildren().forEach((e) => {
      const enemy = e as Phaser.Physics.Arcade.Sprite;
      const eb = enemy.body as Phaser.Physics.Arcade.Body;
      if (eb.blocked.left) { enemy.setVelocityX(60); enemy.setFlipX(true); }
      else if (eb.blocked.right) { enemy.setVelocityX(-60); enemy.setFlipX(false); }
      if (enemy.y > CASTLE_HEIGHT + 50) enemy.destroy();
    });

    // Boss AI
    this.updateBoss();
  }

  private createBoss(): void {
    const bx = this.levelData.bossX;
    const by = this.levelData.bossFloorY;

    // Spawn boss standing on the arena platform surface
    // Platform top is at by * TILE, boss origin is center, so place feet on platform
    this.boss = this.physics.add.sprite(
      (bx + 6) * TILE,
      by * TILE - 40, // 40 = half the boss height, so feet rest on platform
      "boss-chicken",
      0
    );
    this.boss.setSize(48, 70);
    this.boss.setOffset(8, 5);
    this.boss.setDepth(10);
    this.boss.setBounce(0);

    // Freeze the boss completely until the player arrives
    const bossBody = this.boss.body as Phaser.Physics.Arcade.Body;
    bossBody.setAllowGravity(false);
    bossBody.setImmovable(true);
    this.boss.setVelocity(0, 0);

    // Invisible walls on both sides of the arena to keep boss contained
    // Use "brick" texture but make them invisible
    this.bossWalls = this.physics.add.staticGroup();
    const wallHeight = 200;
    const arenaLeft = bx * TILE;
    const arenaRight = (bx + 12) * TILE;

    // Left wall
    for (let wy = by - 6; wy <= by; wy++) {
      const w = this.bossWalls.create(arenaLeft - TILE / 2, wy * TILE + TILE / 2, "castle-block");
      w.setSize(TILE, TILE).setVisible(false).refreshBody();
    }
    // Right wall
    for (let wy = by - 6; wy <= by; wy++) {
      const w = this.bossWalls.create(arenaRight + TILE / 2, wy * TILE + TILE / 2, "castle-block");
      w.setSize(TILE, TILE).setVisible(false).refreshBody();
    }

    this.physics.add.collider(this.boss, this.bossWalls);

    if (!this.anims.exists("chicken-walk")) {
      this.anims.create({
        key: "chicken-walk",
        frames: this.anims.generateFrameNumbers("boss-chicken", { start: 0, end: 1 }),
        frameRate: 4,
        repeat: -1,
      });
    }
    this.boss.play("chicken-walk");
  }

  private updateBoss(): void {
    if (!this.boss || !this.boss.active) return;

    const bossBody = this.boss.body as Phaser.Physics.Arcade.Body;
    const bx = this.levelData.bossX * TILE;
    const arenaRight = (this.levelData.bossX + 12) * TILE;
    const leftEdge = bx + 40;
    const rightEdge = arenaRight - 40;

    // Always clamp boss position to arena (safety net on top of walls)
    if (this.boss.x < leftEdge) {
      this.boss.x = leftEdge;
      bossBody.velocity.x = 0;
    } else if (this.boss.x > rightEdge) {
      this.boss.x = rightEdge;
      bossBody.velocity.x = 0;
    }

    // Activate boss when player enters arena
    if (!this.bossActive && this.player.x > bx - TILE * 2) {
      this.bossActive = true;
      this.bossHPText.setText(`Boss: ${"❤".repeat(this.bossHP)}`);
      this.bossDirection = -1;
      // Unfreeze the boss
      bossBody.setAllowGravity(true);
      bossBody.setImmovable(false);
    }

    if (!this.bossActive) return;

    // Reverse direction at edges
    if (this.boss.x <= leftEdge) {
      this.bossDirection = 1;
    } else if (this.boss.x >= rightEdge) {
      this.bossDirection = -1;
    }

    // Also reverse on wall collision
    if (bossBody.blocked.left) this.bossDirection = 1;
    if (bossBody.blocked.right) this.bossDirection = -1;

    // Speed increases as HP decreases
    const speed = 80 + (3 - this.bossHP) * 50;
    this.boss.setVelocityX(speed * this.bossDirection);
    this.boss.setFlipX(this.bossDirection > 0);

    // Occasional jump (only while on the platform)
    if (bossBody.blocked.down && Math.random() < 0.01) {
      this.boss.setVelocityY(-350);
    }
  }

  private hitBoss(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    _boss: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ): void {
    if (this.bossHitCooldown || this.isDead) return;

    const body = this.player.body as Phaser.Physics.Arcade.Body;

    // Stomp from above
    if (body.velocity.y > 0 && this.player.y < this.boss.y - 20) {
      this.bossHitCooldown = true;
      this.bossHP--;
      this.player.setVelocityY(-400); // bounce high

      // Flash boss red
      this.boss.setTint(0xff0000);
      this.time.delayedCall(200, () => {
        if (this.boss.active) this.boss.clearTint();
        this.bossHitCooldown = false;
      });

      this.bossHPText.setText(`Boss: ${"❤".repeat(Math.max(0, this.bossHP))}`);
      this.score += 500;
      this.scoreText.setText(`Score: ${this.score}`);

      if (this.bossHP <= 0) {
        this.defeatBoss();
      }
    } else {
      // Hit from the side = damage to player
      this.playerDeath();
    }
  }

  private defeatBoss(): void {
    this.bossActive = false;

    // Boss defeat animation
    this.boss.setVelocity(0, -300);
    this.boss.setTint(0xff0000);
    (this.boss.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

    this.tweens.add({
      targets: this.boss,
      y: this.boss.y - 100,
      alpha: 0,
      angle: 720,
      duration: 1500,
      onComplete: () => {
        this.boss.destroy();
        this.score += 5000;
        this.scoreText.setText(`Score: ${this.score}`);
        this.bossHPText.setText("DEFEATED!");

        this.time.delayedCall(2000, () => {
          this.scene.start("VictoryScene", { score: this.score });
        });
      },
    });
  }

  // --- Building methods ---

  private createAnimations(): void {
    if (this.anims.exists("idle")) return;
    this.anims.create({ key: "idle", frames: this.anims.generateFrameNumbers("player-idle", { start: 0, end: 1 }), frameRate: 4, repeat: -1 });
    this.anims.create({ key: "run", frames: this.anims.generateFrameNumbers("player-run", { start: 0, end: 3 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: "jump", frames: [{ key: "player-jump", frame: 0 }], frameRate: 1 });
    this.anims.create({ key: "coin-spin", frames: this.anims.generateFrameNumbers("coin", { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: "goomba-walk", frames: this.anims.generateFrameNumbers("goomba", { start: 0, end: 1 }), frameRate: 4, repeat: -1 });
    this.anims.create({ key: "lava-anim", frames: this.anims.generateFrameNumbers("lava", { start: 0, end: 1 }), frameRate: 3, repeat: -1 });
  }

  private buildPlatforms(): void {
    for (const plat of this.levelData.platforms) {
      const tex = plat.type === "castle" ? "castle-block" : "brick";
      for (let i = 0; i < plat.width; i++) {
        this.platforms
          .create((plat.x + i) * TILE + TILE / 2, plat.y * TILE + TILE / 2, tex, 0)
          .setSize(TILE, TILE)
          .refreshBody();
        // Add a second row below for thickness
        this.platforms
          .create((plat.x + i) * TILE + TILE / 2, plat.y * TILE + TILE / 2 + TILE, tex, 0)
          .setSize(TILE, TILE)
          .refreshBody();
      }
    }
  }

  private placeLava(): void {
    for (const l of this.levelData.lava) {
      for (let x = l.start; x < l.end; x++) {
        // Lava at the bottom of the world (below all platforms)
        const lavaY = 18 * TILE + TILE / 2; // just below the starting ground level
        const lv = this.lavaGroup.create(x * TILE + TILE / 2, lavaY, "lava", 0);
        lv.setSize(TILE, TILE).refreshBody();
        (lv as Phaser.Physics.Arcade.Sprite).play?.("lava-anim");
        // Second row
        const lv2 = this.lavaGroup.create(x * TILE + TILE / 2, lavaY + TILE, "lava", 0);
        lv2.setSize(TILE, TILE).refreshBody();
        (lv2 as Phaser.Physics.Arcade.Sprite).play?.("lava-anim");
      }
    }
  }

  private placeTorches(): void {
    for (const t of this.levelData.torches) {
      this.add.image(t.x * TILE + TILE / 2, t.y * TILE + TILE / 2, "torch").setDepth(3);
    }
  }

  private placeCoins(): void {
    for (const c of this.levelData.coins) {
      const coin = this.coins.create(c.x * TILE + TILE / 2, c.y * TILE + TILE / 2, "coin", 0);
      coin.setSize(12, 14);
      (coin as Phaser.Physics.Arcade.Sprite).play("coin-spin");
    }
  }

  private placeEnemies(): void {
    for (const e of this.levelData.enemies) {
      const enemy = this.enemies.create(
        e.x * TILE + TILE / 2, e.y * TILE - TILE / 2, "goomba", 0
      ) as Phaser.Physics.Arcade.Sprite;
      enemy.setSize(24, 28).setOffset(4, 4);
      enemy.play("goomba-walk");
      enemy.setVelocityX(e.dir === "left" ? -60 : 60);
      (enemy.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(false);
    }
  }

  private collectCoin(
    _p: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    coin: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ): void {
    (coin as Phaser.Physics.Arcade.Sprite).destroy();
    this.score += 100;
    this.scoreText.setText(`Score: ${this.score}`);
  }

  private hitEnemy(
    _p: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    enemy: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (body.velocity.y > 0 && this.player.y < (enemy as any).y - 10) {
      (enemy as Phaser.Physics.Arcade.Sprite).destroy();
      this.player.setVelocityY(-300);
      this.score += 200;
      this.scoreText.setText(`Score: ${this.score}`);
    } else {
      this.playerDeath();
    }
  }

  private hitLava(): void {
    this.playerDeath();
  }

  private reachCheckpoint(): void {
    if (this.checkpointReached) return;
    this.checkpointReached = true;
    this.checkpointScore = this.score;
    this.checkpointSprite.setTint(0x44ff44);

    const txt = this.add
      .text(this.checkpointX, this.checkpointY - 40, "CHECKPOINT!", {
        fontSize: "16px", fontFamily: "monospace", color: "#44ff44",
        stroke: "#000000", strokeThickness: 3,
      })
      .setOrigin(0.5).setDepth(100);

    this.tweens.add({
      targets: txt, y: txt.y - 30, alpha: 0, duration: 1200,
      onComplete: () => txt.destroy(),
    });
  }

  private playerDeath(): void {
    if (this.isDead) return;
    this.isDead = true;

    this.player.setTint(0xff0000);
    this.player.setVelocityX(0);
    this.player.setVelocityY(-400);
    const colliders = this.physics.world.colliders.getActive();
    if (colliders.length > 0) {
      this.physics.world.removeCollider(colliders[0]);
    }

    if (this.checkpointReached) {
      this.time.delayedCall(1200, () => this.respawnAtCheckpoint());
    } else {
      // Restart the castle level
      this.time.delayedCall(1500, () => {
        this.scene.start("CastleScene", { score: 0 });
      });
    }
  }

  private respawnAtCheckpoint(): void {
    this.isDead = false;
    this.score = this.checkpointScore;
    this.scoreText.setText(`Score: ${this.score}`);

    this.player.clearTint();
    this.player.setPosition(this.checkpointX, this.checkpointY - TILE);
    this.player.setVelocity(0, 0);
    (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);

    this.physics.add.collider(this.player, this.platforms);
    this.maxCameraX = Math.max(0, this.checkpointX - 400);
    this.cameras.main.scrollX = this.maxCameraX;

    this.tweens.add({
      targets: this.player, alpha: 0.3, duration: 100,
      yoyo: true, repeat: 8,
      onComplete: () => this.player.setAlpha(1),
    });
  }
}

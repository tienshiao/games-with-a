import Phaser from "phaser";

export class LavaScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private coins!: Phaser.Physics.Arcade.Group;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private lava!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private totalCoinsCollected = 0;
  private readonly maxCoins = 20;
  private flagpoleShown = false;
  private flag: Phaser.GameObjects.Rectangle | null = null;
  private lavaGlow!: Phaser.GameObjects.Rectangle;

  constructor() {
    super("LavaScene");
  }

  preload() {
    if (!this.textures.exists("player")) {
      const gfx = this.make.graphics({ x: 0, y: 0 }, false);
      gfx.fillStyle(0x6fa8dc);
      gfx.fillRect(0, 0, 32, 48);
      gfx.generateTexture("player", 32, 48);
      gfx.clear();
      gfx.fillStyle(0xffd700);
      gfx.fillCircle(10, 10, 10);
      gfx.fillStyle(0xdaa520);
      gfx.fillCircle(10, 10, 6);
      gfx.fillStyle(0xffd700);
      gfx.fillCircle(10, 10, 4);
      gfx.generateTexture("coin", 20, 20);
      gfx.destroy();
    }
  }

  create() {
    // Dark volcanic background
    this.cameras.main.setBackgroundColor("#2a0a0a");

    // Lava pool at the bottom
    this.lava = this.physics.add.staticGroup();
    const lavaRect = this.add.rectangle(400, 590, 800, 20, 0xff4400);
    this.lava.add(lavaRect);

    // Animated lava glow
    this.lavaGlow = this.add.rectangle(400, 588, 800, 24, 0xff6600, 0.4);
    this.tweens.add({
      targets: this.lavaGlow,
      alpha: 0.15,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });

    // Lava bubble particles
    this.time.addEvent({
      delay: 400,
      loop: true,
      callback: () => {
        const bx = Phaser.Math.Between(50, 750);
        const bubble = this.add.circle(bx, 585, Phaser.Math.Between(2, 5), 0xffaa00);
        this.tweens.add({
          targets: bubble,
          y: 565,
          alpha: 0,
          scale: 0.3,
          duration: 600,
          onComplete: () => bubble.destroy(),
        });
      },
    });

    // Platforms (dark rock)
    this.platforms = this.physics.add.staticGroup();

    // Rock platforms - no ground, just floating rocks over lava
    const plat1 = this.add.rectangle(100, 550, 120, 20, 0x4a3030);
    this.platforms.add(plat1);

    const plat2 = this.add.rectangle(300, 480, 120, 20, 0x4a3030);
    this.platforms.add(plat2);

    const plat3 = this.add.rectangle(550, 420, 120, 20, 0x4a3030);
    this.platforms.add(plat3);

    const plat4 = this.add.rectangle(700, 350, 120, 20, 0x4a3030);
    this.platforms.add(plat4);

    const plat5 = this.add.rectangle(450, 280, 120, 20, 0x4a3030);
    this.platforms.add(plat5);

    const plat6 = this.add.rectangle(200, 350, 120, 20, 0x4a3030);
    this.platforms.add(plat6);

    const plat7 = this.add.rectangle(350, 180, 150, 20, 0x4a3030);
    this.platforms.add(plat7);

    // Lava drip decorations on some platforms
    this.add.rectangle(300, 492, 4, 10, 0xff4400);
    this.add.rectangle(550, 432, 4, 10, 0xff4400);

    // Player
    this.player = this.physics.add.sprite(100, 500, "player") as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    this.player.setBounce(0.2);
    this.player.setCollideWorldBounds(true);

    // Coins
    this.coins = this.physics.add.group();
    const coinPositions = [
      [100, 520], [300, 450], [550, 390], [700, 320],
      [450, 250], [200, 320], [350, 150], [150, 450],
      [400, 380], [600, 280], [250, 250], [500, 170],
    ];
    for (const [x, y] of coinPositions) {
      const coin = this.coins.create(x, y, "coin") as Phaser.Physics.Arcade.Sprite;
      coin.setBounceY(0);
      coin.body.setAllowGravity(false);
    }

    // Collisions
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.overlap(this.player, this.coins, this.collectCoin, undefined, this);
    this.physics.add.overlap(this.player, this.lava, this.hitLava, undefined, this);

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();

    // Score
    this.scoreText = this.add.text(16, 16, "Score: 0", {
      fontSize: "24px",
      color: "#ff8844",
    });

    // Level label
    this.add.text(16, 46, "Level 2 - Lava Cavern", {
      fontSize: "14px",
      color: "#aa5533",
    });
  }

  update() {
    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-200);
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(200);
    } else {
      this.player.setVelocityX(0);
    }

    if (this.cursors.up.isDown && this.player.body.touching.down) {
      this.player.setVelocityY(-380);
    }
  }

  private hitLava() {
    // Reset player to start
    this.player.setPosition(100, 500);
    this.player.setVelocity(0, 0);

    // Flash screen red
    this.cameras.main.flash(300, 255, 0, 0);
  }

  private spawnFlagpole() {
    // Pole on top platform (350, 180)
    this.add.rectangle(380, 120, 4, 100, 0xcccccc);
    this.flag = this.add.rectangle(392, 80, 20, 14, 0xe03030);
    this.physics.add.existing(this.flag, true);
    this.physics.add.overlap(this.player, this.flag, this.touchFlag, undefined, this);
  }

  private touchFlag() {
    if (!this.flag) return;
    this.flag = null;
    this.launchFireworks();
  }

  private launchFireworks() {
    const colors = [0xff4444, 0xff8800, 0xffdd44, 0xff6600, 0xffaa00];

    const burst = (x: number, y: number, delay: number) => {
      this.time.delayedCall(delay, () => {
        this.playFireworkSound();
        const color = Phaser.Utils.Array.GetRandom(colors);
        for (let i = 0; i < 20; i++) {
          const angle = (Math.PI * 2 * i) / 20;
          const speed = Phaser.Math.Between(80, 200);
          const particle = this.add.circle(x, y, Phaser.Math.Between(2, 4), color);
          this.tweens.add({
            targets: particle,
            x: x + Math.cos(angle) * speed,
            y: y + Math.sin(angle) * speed,
            alpha: 0,
            scale: 0,
            duration: Phaser.Math.Between(600, 1000),
            ease: "Power2",
            onComplete: () => particle.destroy(),
          });
        }
      });
    };

    burst(200, 150, 0);
    burst(600, 100, 300);
    burst(400, 80, 600);
    burst(150, 200, 900);
    burst(650, 180, 1200);

    this.time.delayedCall(2500, () => {
      this.showLevelComplete();
    });
  }

  private showLevelComplete() {
    const overlay = this.add.rectangle(400, 300, 800, 600, 0x000000, 0.5);

    const title = this.add.text(400, 260, "Level Complete!", {
      fontSize: "48px",
      color: "#ff8844",
      fontStyle: "bold",
    }).setOrigin(0.5);

    const prompt = this.add.text(400, 330, "Press space to continue", {
      fontSize: "20px",
      color: "#cccccc",
    }).setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: 0.3,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    this.input.keyboard!.once("keydown-SPACE", () => {
      overlay.destroy();
      title.destroy();
      prompt.destroy();
      this.scene.start("SnowScene");
    });
  }

  private playFireworkSound() {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    const bufferSize = ctx.sampleRate * 0.3;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.15, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(800, now);
    bandpass.frequency.exponentialRampToValueAtTime(2000, now + 0.15);
    noise.connect(bandpass).connect(noiseGain).connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.25);

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(300 + Math.random() * 200, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.2);
    oscGain.gain.setValueAtTime(0.3, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(oscGain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);

    const crackleBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const crackleData = crackleBuffer.getChannelData(0);
    for (let i = 0; i < crackleData.length; i++) {
      crackleData[i] = Math.random() > 0.97 ? (Math.random() * 2 - 1) : 0;
    }
    const crackle = ctx.createBufferSource();
    crackle.buffer = crackleBuffer;
    const crackleGain = ctx.createGain();
    crackleGain.gain.setValueAtTime(0.001, now);
    crackleGain.gain.setValueAtTime(0.2, now + 0.1);
    crackleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    crackle.connect(crackleGain).connect(ctx.destination);
    crackle.start(now + 0.1);
    crackle.stop(now + 0.5);

    setTimeout(() => ctx.close(), 700);
  }

  private playChaChingSound() {
    const audioCtx = new AudioContext();
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = "square";
    osc1.frequency.setValueAtTime(1200, audioCtx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.05);
    gain1.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    osc1.connect(gain1).connect(audioCtx.destination);
    osc1.start(audioCtx.currentTime);
    osc1.stop(audioCtx.currentTime + 0.08);

    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(2400, audioCtx.currentTime + 0.07);
    gain2.gain.setValueAtTime(0.001, audioCtx.currentTime);
    gain2.gain.setValueAtTime(0.25, audioCtx.currentTime + 0.07);
    gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
    osc2.connect(gain2).connect(audioCtx.destination);
    osc2.start(audioCtx.currentTime + 0.07);
    osc2.stop(audioCtx.currentTime + 0.35);

    setTimeout(() => audioCtx.close(), 500);
  }

  private collectCoin(_player: Phaser.GameObjects.GameObject, coin: Phaser.GameObjects.GameObject) {
    (coin as Phaser.Physics.Arcade.Sprite).disableBody(true, true);
    this.playChaChingSound();
    this.score += 10;
    this.totalCoinsCollected++;
    this.scoreText.setText(`Score: ${this.score}`);

    if (this.score >= 200 && !this.flagpoleShown) {
      this.flagpoleShown = true;
      this.spawnFlagpole();
    }

    if (this.coins.countActive(true) === 0 && this.totalCoinsCollected < this.maxCoins) {
      const remaining = this.maxCoins - this.totalCoinsCollected;
      let spawned = 0;
      const positions = [
        [100, 520], [300, 450], [550, 390], [700, 320],
        [450, 250], [200, 320], [350, 150], [150, 450],
        [400, 380], [600, 280], [250, 250], [500, 170],
      ];
      this.coins.children.iterate((child) => {
        if (spawned >= remaining) return false;
        const c = child as Phaser.Physics.Arcade.Sprite;
        const pos = positions[spawned % positions.length];
        c.enableBody(true, pos[0], pos[1], true, true);
        c.body.setAllowGravity(false);
        spawned++;
        return true;
      });
    }
  }
}

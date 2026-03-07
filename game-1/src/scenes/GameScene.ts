import Phaser from "phaser";

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private coins!: Phaser.Physics.Arcade.Group;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private flagpoleShown = false;
  private flag: Phaser.GameObjects.Rectangle | null = null;
  private totalCoinsCollected = 0;
  private readonly maxCoins = 20;

  constructor() {
    super("GameScene");
  }

  preload() {
    // Generate a player texture since we have no sprite assets
    const gfx = this.make.graphics({ x: 0, y: 0 }, false);
    gfx.fillStyle(0x6fa8dc);
    gfx.fillRect(0, 0, 32, 48);
    gfx.generateTexture("player", 32, 48);
    gfx.clear();

    // Generate a coin texture
    gfx.fillStyle(0xffd700);
    gfx.fillCircle(10, 10, 10);
    gfx.fillStyle(0xdaa520);
    gfx.fillCircle(10, 10, 6);
    gfx.fillStyle(0xffd700);
    gfx.fillCircle(10, 10, 4);
    gfx.generateTexture("coin", 20, 20);
    gfx.destroy();
  }

  create() {
    // Platforms
    this.platforms = this.physics.add.staticGroup();

    // Ground
    const ground = this.add.rectangle(400, 580, 800, 40, 0x4a6741);
    this.platforms.add(ground);

    // Ledges
    const ledge1 = this.add.rectangle(600, 440, 200, 20, 0x4a6741);
    this.platforms.add(ledge1);

    const ledge2 = this.add.rectangle(50, 320, 200, 20, 0x4a6741);
    this.platforms.add(ledge2);

    const ledge3 = this.add.rectangle(750, 250, 200, 20, 0x4a6741);
    this.platforms.add(ledge3);

    const ledge4 = this.add.rectangle(400, 180, 200, 20, 0x4a6741);
    this.platforms.add(ledge4);

    // Tree (decorative)
    this.add.rectangle(400, 535, 20, 50, 0x8b5e3c); // trunk
    // triangle(x, y, x1, y1, x2, y2, x3, y3, fillColor) - coords are relative to position
    this.add.triangle(400, 490, 0, 40, 60, 40, 30, 0, 0x2d8b46); // lower canopy
    this.add.triangle(400, 465, 0, 35, 50, 35, 25, 0, 0x3aa854); // upper canopy

    // Player
    this.player = this.physics.add.sprite(100, 500, "player") as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    this.player.setBounce(0.2);
    this.player.setCollideWorldBounds(true);

    // Coins
    this.coins = this.physics.add.group();
    for (let i = 0; i < 12; i++) {
      const x = 70 + i * 60;
      const coin = this.coins.create(x, 0, "coin") as Phaser.Physics.Arcade.Sprite;
      coin.setBounceY(Phaser.Math.FloatBetween(0.3, 0.5));
    }

    // Collisions
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.coins, this.platforms);
    this.physics.add.overlap(this.player, this.coins, this.collectCoin, undefined, this);

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();

    // Score
    this.scoreText = this.add.text(16, 16, "Score: 0", {
      fontSize: "24px",
      color: "#ffffff",
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
      this.player.setVelocityY(-350);
    }
  }

  private spawnFlagpole() {
    // Pole on top platform (platform is at 400, 180)
    this.add.rectangle(440, 120, 4, 100, 0xcccccc); // pole
    this.flag = this.add.rectangle(452, 80, 20, 14, 0xe03030);
    this.physics.add.existing(this.flag, true); // static body
    this.physics.add.overlap(this.player, this.flag, this.touchFlag, undefined, this);
  }

  private touchFlag() {
    if (!this.flag) return;
    this.flag = null;
    this.launchFireworks();
  }

  private launchFireworks() {
    const colors = [0xff4444, 0x44ff44, 0xffdd44, 0x44aaff, 0xff44ff, 0xff8800];

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

    // Multiple bursts at different positions and times
    burst(200, 150, 0);
    burst(600, 100, 300);
    burst(400, 80, 600);
    burst(150, 200, 900);
    burst(650, 180, 1200);

    // Show level complete text after fireworks finish
    this.time.delayedCall(2500, () => {
      this.showLevelComplete();
    });
  }

  private showLevelComplete() {
    // Dim overlay
    const overlay = this.add.rectangle(400, 300, 800, 600, 0x000000, 0.5);

    const title = this.add.text(400, 260, "Level Complete!", {
      fontSize: "48px",
      color: "#ffffff",
      fontStyle: "bold",
    }).setOrigin(0.5);

    const prompt = this.add.text(400, 330, "Press space to continue", {
      fontSize: "20px",
      color: "#cccccc",
    }).setOrigin(0.5);

    // Blink the prompt
    this.tweens.add({
      targets: prompt,
      alpha: 0.3,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    // Wait for space key
    this.input.keyboard!.once("keydown-SPACE", () => {
      overlay.destroy();
      title.destroy();
      prompt.destroy();
      this.scene.start("LavaScene");
    });
  }

  private playFireworkSound() {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Whoosh (rising noise burst)
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

    // Pop/boom
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

    // Crackle (high frequency noise tail)
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

    // First "cha" - short high metallic hit
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

    // "Ching" - bright ringing tone
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

    // Cleanup
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
      this.coins.children.iterate((child) => {
        if (spawned >= remaining) return false;
        const c = child as Phaser.Physics.Arcade.Sprite;
        c.enableBody(true, c.x, 0, true, true);
        c.setBounceY(Phaser.Math.FloatBetween(0.3, 0.5));
        spawned++;
        return true;
      });
    }
  }
}

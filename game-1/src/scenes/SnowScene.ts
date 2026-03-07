import Phaser from "phaser";

export class SnowScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private coins!: Phaser.Physics.Arcade.Group;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private penguins!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private totalCoinsCollected = 0;
  private readonly maxCoins = 20;
  private flagpoleShown = false;
  private flag: Phaser.GameObjects.Rectangle | null = null;

  constructor() {
    super("SnowScene");
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

    if (!this.textures.exists("penguin")) {
      const gfx = this.make.graphics({ x: 0, y: 0 }, false);
      // Body (black oval)
      gfx.fillStyle(0x1a1a2e);
      gfx.fillEllipse(15, 20, 22, 30);
      // Belly (white oval)
      gfx.fillStyle(0xeeeeee);
      gfx.fillEllipse(15, 22, 12, 20);
      // Eyes
      gfx.fillStyle(0xffffff);
      gfx.fillCircle(10, 12, 3);
      gfx.fillCircle(20, 12, 3);
      gfx.fillStyle(0x000000);
      gfx.fillCircle(10, 12, 1.5);
      gfx.fillCircle(20, 12, 1.5);
      // Beak
      gfx.fillStyle(0xff8800);
      gfx.fillTriangle(15, 15, 12, 19, 18, 19);
      // Feet
      gfx.fillStyle(0xff8800);
      gfx.fillEllipse(10, 35, 8, 4);
      gfx.fillEllipse(20, 35, 8, 4);
      gfx.generateTexture("penguin", 30, 38);
      gfx.destroy();
    }
  }

  create() {
    // Snowy sky
    this.cameras.main.setBackgroundColor("#c8d8e8");

    // Falling snow
    this.time.addEvent({
      delay: 80,
      loop: true,
      callback: () => {
        const sx = Phaser.Math.Between(0, 800);
        const flake = this.add.circle(sx, -5, Phaser.Math.Between(1, 3), 0xffffff);
        this.tweens.add({
          targets: flake,
          y: 610,
          x: sx + Phaser.Math.Between(-40, 40),
          alpha: 0.5,
          duration: Phaser.Math.Between(3000, 5000),
          onComplete: () => flake.destroy(),
        });
      },
    });

    // Platforms (ice/snow)
    this.platforms = this.physics.add.staticGroup();

    // Snowy ground
    const ground = this.add.rectangle(400, 580, 800, 40, 0xf0f0f0);
    this.platforms.add(ground);

    // Ice platforms
    const plat1 = this.add.rectangle(150, 460, 160, 18, 0xd0e8f0);
    this.platforms.add(plat1);

    const plat2 = this.add.rectangle(400, 400, 140, 18, 0xd0e8f0);
    this.platforms.add(plat2);

    const plat3 = this.add.rectangle(650, 460, 160, 18, 0xd0e8f0);
    this.platforms.add(plat3);

    const plat4 = this.add.rectangle(250, 300, 140, 18, 0xd0e8f0);
    this.platforms.add(plat4);

    const plat5 = this.add.rectangle(550, 320, 140, 18, 0xd0e8f0);
    this.platforms.add(plat5);

    const plat6 = this.add.rectangle(400, 200, 180, 18, 0xd0e8f0);
    this.platforms.add(plat6);

    // Snow mounds on ground (decorative)
    this.add.ellipse(150, 562, 80, 20, 0xffffff);
    this.add.ellipse(500, 562, 100, 24, 0xffffff);
    this.add.ellipse(700, 562, 70, 18, 0xffffff);

    // Snowman (decorative)
    this.add.circle(650, 545, 18, 0xffffff); // bottom
    this.add.circle(650, 522, 13, 0xffffff); // middle
    this.add.circle(650, 505, 9, 0xffffff);  // head
    this.add.circle(647, 503, 2, 0x000000);  // left eye
    this.add.circle(653, 503, 2, 0x000000);  // right eye
    this.add.rectangle(650, 508, 6, 2, 0xff6600); // nose/carrot

    // Penguins that patrol platforms
    this.penguins = this.physics.add.group();
    this.spawnPenguin(150, 420, 80, 220);
    this.spawnPenguin(650, 420, 570, 730);
    this.spawnPenguin(400, 360, 330, 470);
    this.spawnPenguin(300, 540, 200, 400);

    // Player
    this.player = this.physics.add.sprite(100, 500, "player") as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    this.player.setBounce(0.2);
    this.player.setCollideWorldBounds(true);

    // Coins
    this.coins = this.physics.add.group();
    const coinPositions = [
      [150, 430], [400, 370], [650, 430], [250, 270],
      [550, 290], [400, 170], [100, 540], [300, 540],
      [500, 540], [700, 540], [200, 400], [600, 380],
    ];
    for (const [x, y] of coinPositions) {
      const coin = this.coins.create(x, y, "coin") as Phaser.Physics.Arcade.Sprite;
      coin.setBounceY(0);
      coin.body.setAllowGravity(false);
    }

    // Collisions
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.penguins, this.platforms);
    this.physics.add.overlap(this.player, this.coins, this.collectCoin, undefined, this);
    this.physics.add.overlap(this.player, this.penguins, this.hitPenguin, undefined, this);

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();

    // Score
    this.scoreText = this.add.text(16, 16, "Score: 0", {
      fontSize: "24px",
      color: "#335577",
    });

    this.add.text(16, 46, "Level 3 - Frozen Tundra", {
      fontSize: "14px",
      color: "#5577aa",
    });
  }

  private spawnPenguin(x: number, y: number, minX: number, maxX: number) {
    const penguin = this.penguins.create(x, y, "penguin") as Phaser.Physics.Arcade.Sprite;
    penguin.setBounce(0);
    penguin.setData("minX", minX);
    penguin.setData("maxX", maxX);
    penguin.setData("speed", Phaser.Math.Between(40, 70));
    penguin.setVelocityX(penguin.getData("speed"));
  }

  update() {
    // Player movement - slippery ice physics
    if (this.cursors.left.isDown) {
      this.player.setVelocityX(Phaser.Math.Linear(this.player.body.velocity.x, -220, 0.05));
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(Phaser.Math.Linear(this.player.body.velocity.x, 220, 0.05));
    } else {
      this.player.setVelocityX(Phaser.Math.Linear(this.player.body.velocity.x, 0, 0.03));
    }

    if (this.cursors.up.isDown && this.player.body.touching.down) {
      this.player.setVelocityY(-360);
    }

    // Penguin patrol
    this.penguins.children.iterate((child) => {
      const p = child as Phaser.Physics.Arcade.Sprite;
      if (p.x <= p.getData("minX")) {
        p.setVelocityX(p.getData("speed"));
        p.setFlipX(false);
      } else if (p.x >= p.getData("maxX")) {
        p.setVelocityX(-p.getData("speed"));
        p.setFlipX(true);
      }
      return true;
    });
  }

  private hitPenguin(_player: Phaser.GameObjects.GameObject, penguin: Phaser.GameObjects.GameObject) {
    const p = penguin as Phaser.Physics.Arcade.Sprite;

    // If player is falling and above the penguin, stomp it
    if (this.player.body.velocity.y > 0 && this.player.body.y + this.player.body.height - 10 < p.body!.y) {
      p.disableBody(true, true);
      this.player.setVelocityY(-250); // bounce up
    } else {
      // Otherwise, player gets hurt
      this.player.setPosition(100, 500);
      this.player.setVelocity(0, 0);
      this.cameras.main.flash(300, 150, 200, 255);
    }
  }

  private spawnFlagpole() {
    // On top platform (400, 200)
    this.add.rectangle(440, 140, 4, 100, 0xcccccc);
    this.flag = this.add.rectangle(452, 100, 20, 14, 0xe03030);
    this.physics.add.existing(this.flag, true);
    this.physics.add.overlap(this.player, this.flag, this.touchFlag, undefined, this);
  }

  private touchFlag() {
    if (!this.flag) return;
    this.flag = null;
    this.launchFireworks();
  }

  private launchFireworks() {
    const colors = [0x88ccff, 0xffffff, 0xaaddff, 0x66aaee, 0xccddff, 0x44bbff];

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

    burst(200, 100, 0);
    burst(600, 80, 300);
    burst(400, 60, 600);
    burst(150, 120, 900);
    burst(650, 100, 1200);

    this.time.delayedCall(2500, () => {
      this.showLevelComplete();
    });
  }

  private showLevelComplete() {
    const overlay = this.add.rectangle(400, 300, 800, 600, 0x000000, 0.5);

    const title = this.add.text(400, 260, "You beat the game!", {
      fontSize: "48px",
      color: "#aaddff",
      fontStyle: "bold",
    }).setOrigin(0.5);

    const prompt = this.add.text(400, 330, "Congratulations!", {
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

    this.playVictorySong();
  }

  private playVictorySong() {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Simple triumphant melody
    // Notes: C5, E5, G5, C6, G5, C6, E6, C6, G5, E5, C5 (rising fanfare then resolve)
    const notes: [number, number, number][] = [
      // [frequency, startTime, duration]
      [523, 0, 0.2],       // C5
      [659, 0.2, 0.2],     // E5
      [784, 0.4, 0.2],     // G5
      [1047, 0.6, 0.4],    // C6 (hold)
      [784, 1.1, 0.15],    // G5
      [880, 1.25, 0.15],   // A5
      [1047, 1.4, 0.4],    // C6 (hold)
      [1175, 1.9, 0.15],   // D6
      [1319, 2.05, 0.15],  // E6
      [1047, 2.2, 0.3],    // C6
      [1319, 2.6, 0.5],    // E6 (hold)
      [1568, 3.2, 0.8],    // G6 (final long hold)
    ];

    // Lead melody (bright square wave)
    for (const [freq, start, dur] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0.12, now + start);
      gain.gain.setValueAtTime(0.12, now + start + dur * 0.7);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur);
    }

    // Harmony (softer sine an octave lower for depth)
    const harmonyNotes: [number, number, number][] = [
      [262, 0, 0.6],       // C4
      [392, 0.6, 0.5],     // G4
      [349, 1.1, 0.5],     // F4
      [523, 1.6, 0.5],     // C5
      [659, 2.2, 0.5],     // E5
      [784, 2.8, 1.2],     // G5
    ];

    for (const [freq, start, dur] of harmonyNotes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0.08, now + start);
      gain.gain.setValueAtTime(0.08, now + start + dur * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur);
    }

    // Bass notes (triangle wave)
    const bassNotes: [number, number, number][] = [
      [131, 0, 0.6],      // C3
      [196, 0.6, 0.5],    // G3
      [175, 1.1, 0.5],    // F3
      [262, 1.6, 0.6],    // C4
      [330, 2.2, 0.6],    // E4
      [392, 2.8, 1.2],    // G4
    ];

    for (const [freq, start, dur] of bassNotes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0.1, now + start);
      gain.gain.setValueAtTime(0.1, now + start + dur * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur);
    }

    setTimeout(() => ctx.close(), 5000);
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
        [150, 430], [400, 370], [650, 430], [250, 270],
        [550, 290], [400, 170], [100, 540], [300, 540],
        [500, 540], [700, 540], [200, 400], [600, 380],
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

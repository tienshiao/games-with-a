import Phaser from "phaser";

export function createTextures(scene: Phaser.Scene) {
  if (scene.textures.exists("ground")) return; // already created

  // --- Ground tile (32x32) ---
  const ground = scene.textures.createCanvas("ground", 32, 32)!;
  const gctx = ground.getContext();
  gctx.fillStyle = "#8B4513";
  gctx.fillRect(0, 0, 32, 32);
  gctx.fillStyle = "#6B3410";
  gctx.fillRect(0, 0, 32, 4);
  gctx.fillStyle = "#4e8b2f";
  gctx.fillRect(0, 0, 32, 6);
  gctx.fillStyle = "#3a6b22";
  gctx.fillRect(0, 0, 32, 2);
  // Dirt texture dots
  gctx.fillStyle = "#7a3b10";
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(Math.random() * 28) + 2;
    const y = Math.floor(Math.random() * 20) + 10;
    gctx.fillRect(x, y, 3, 3);
  }
  ground.refresh();

  // --- Brick block (32x32) ---
  const brick = scene.textures.createCanvas("brick", 32, 32)!;
  const bctx = brick.getContext();
  bctx.fillStyle = "#c84c09";
  bctx.fillRect(0, 0, 32, 32);
  bctx.strokeStyle = "#2b2b2b";
  bctx.lineWidth = 1;
  // Brick pattern
  bctx.strokeRect(1, 1, 14, 7);
  bctx.strokeRect(17, 1, 14, 7);
  bctx.strokeRect(1, 9, 30, 7);
  bctx.strokeRect(1, 17, 14, 7);
  bctx.strokeRect(17, 17, 14, 7);
  bctx.strokeRect(1, 25, 30, 6);
  brick.refresh();

  // --- Question block (32x32, 2 frames) ---
  const qblock = scene.textures.createCanvas("qblock", 64, 32)!;
  const qctx = qblock.getContext();
  for (let f = 0; f < 2; f++) {
    const ox = f * 32;
    qctx.fillStyle = f === 0 ? "#ffaa00" : "#dd8800";
    qctx.fillRect(ox, 0, 32, 32);
    qctx.strokeStyle = "#8B4513";
    qctx.lineWidth = 2;
    qctx.strokeRect(ox + 1, 1, 30, 30);
    // Question mark
    qctx.fillStyle = "#ffffff";
    qctx.font = "bold 20px monospace";
    qctx.textAlign = "center";
    qctx.fillText("?", ox + 16, 24);
  }
  qblock.refresh();
  // Add frame data
  scene.textures.get("qblock").add(0, 0, 0, 0, 32, 32);
  scene.textures.get("qblock").add(1, 0, 32, 0, 32, 32);

  // --- Feather (16x20) ---
  const feather = scene.textures.createCanvas("feather", 16, 20)!;
  const fthctx = feather.getContext();
  // Teardrop shape
  fthctx.fillStyle = "#ffd44a";
  fthctx.beginPath();
  fthctx.moveTo(8, 2);
  fthctx.quadraticCurveTo(3, 9, 8, 18);
  fthctx.quadraticCurveTo(13, 9, 8, 2);
  fthctx.fill();
  fthctx.strokeStyle = "#a87f00";
  fthctx.lineWidth = 1;
  fthctx.stroke();
  // Spine
  fthctx.beginPath();
  fthctx.moveTo(8, 3);
  fthctx.lineTo(8, 17);
  fthctx.stroke();
  // Barbs
  fthctx.strokeStyle = "#ffb800";
  for (let i = 0; i < 3; i++) {
    const y = 7 + i * 3;
    fthctx.beginPath();
    fthctx.moveTo(8, y);
    fthctx.lineTo(5, y + 2);
    fthctx.moveTo(8, y);
    fthctx.lineTo(11, y + 2);
    fthctx.stroke();
  }
  feather.refresh();

  // --- Cape (20x26) — worn by player while caped ---
  const cape = scene.textures.createCanvas("cape", 20, 26)!;
  const cpctx2 = cape.getContext();
  // Main cape body - trapezoidal cloth
  cpctx2.fillStyle = "#ffcc00";
  cpctx2.beginPath();
  cpctx2.moveTo(6, 0);
  cpctx2.lineTo(14, 0);
  cpctx2.lineTo(19, 26);
  cpctx2.lineTo(1, 26);
  cpctx2.closePath();
  cpctx2.fill();
  // Dark shading along the right/back edge
  cpctx2.fillStyle = "#b38600";
  cpctx2.beginPath();
  cpctx2.moveTo(14, 0);
  cpctx2.lineTo(19, 26);
  cpctx2.lineTo(15, 26);
  cpctx2.lineTo(11, 0);
  cpctx2.closePath();
  cpctx2.fill();
  // Highlight stripe
  cpctx2.fillStyle = "#ffe04a";
  cpctx2.fillRect(6, 2, 2, 22);
  // Scalloped bottom hem
  cpctx2.fillStyle = "#996f00";
  cpctx2.fillRect(1, 23, 18, 3);
  // Neck/collar band
  cpctx2.fillStyle = "#d99c00";
  cpctx2.fillRect(6, 0, 8, 3);
  cape.refresh();

  // --- Used question block (32x32, dimmed empty block) ---
  const qused = scene.textures.createCanvas("qblock-used", 32, 32)!;
  const quctx = qused.getContext();
  quctx.fillStyle = "#8a5a1f";
  quctx.fillRect(0, 0, 32, 32);
  quctx.strokeStyle = "#5a3a12";
  quctx.lineWidth = 2;
  quctx.strokeRect(1, 1, 30, 30);
  // Recessed rivets at corners
  quctx.fillStyle = "#5a3a12";
  quctx.fillRect(4, 4, 3, 3);
  quctx.fillRect(25, 4, 3, 3);
  quctx.fillRect(4, 25, 3, 3);
  quctx.fillRect(25, 25, 3, 3);
  qused.refresh();

  // --- Player idle (32x32, 2 frames) ---
  const pidle = scene.textures.createCanvas("player-idle", 64, 32)!;
  const pictx = pidle.getContext();
  for (let f = 0; f < 2; f++) {
    drawPlayer(pictx, f * 32, f === 0 ? 0 : -1);
  }
  pidle.refresh();
  scene.textures.get("player-idle").add(0, 0, 0, 0, 32, 32);
  scene.textures.get("player-idle").add(1, 0, 32, 0, 32, 32);

  // --- Player run (32x32, 4 frames) ---
  const prun = scene.textures.createCanvas("player-run", 128, 32)!;
  const prctx = prun.getContext();
  for (let f = 0; f < 4; f++) {
    drawPlayer(prctx, f * 32, f);
  }
  prun.refresh();
  for (let f = 0; f < 4; f++) {
    scene.textures.get("player-run").add(f, 0, f * 32, 0, 32, 32);
  }

  // --- Player jump (32x32, 1 frame) ---
  const pjump = scene.textures.createCanvas("player-jump", 32, 32)!;
  const pjctx = pjump.getContext();
  drawPlayerJump(pjctx, 0);
  pjump.refresh();

  // --- Coin (16x16, 4 frames) ---
  const coin = scene.textures.createCanvas("coin", 64, 16)!;
  const cctx = coin.getContext();
  const coinWidths = [14, 10, 4, 10];
  for (let f = 0; f < 4; f++) {
    const ox = f * 16 + 8;
    const w = coinWidths[f];
    cctx.fillStyle = "#ffde00";
    cctx.beginPath();
    cctx.ellipse(ox, 8, w / 2, 7, 0, 0, Math.PI * 2);
    cctx.fill();
    cctx.strokeStyle = "#c8a800";
    cctx.lineWidth = 1;
    cctx.beginPath();
    cctx.ellipse(ox, 8, w / 2, 7, 0, 0, Math.PI * 2);
    cctx.stroke();
  }
  coin.refresh();
  for (let f = 0; f < 4; f++) {
    scene.textures.get("coin").add(f, 0, f * 16, 0, 16, 16);
  }

  // --- Enemy (goomba-like, 32x32, 2 frames) ---
  const enemy = scene.textures.createCanvas("goomba", 64, 32)!;
  const ectx = enemy.getContext();
  for (let f = 0; f < 2; f++) {
    drawGoomba(ectx, f * 32, f);
  }
  enemy.refresh();
  scene.textures.get("goomba").add(0, 0, 0, 0, 32, 32);
  scene.textures.get("goomba").add(1, 0, 32, 0, 32, 32);

  // --- Flag pole (16x320) ---
  const flag = scene.textures.createCanvas("flagpole", 16, 320)!;
  const fctx = flag.getContext();
  fctx.fillStyle = "#888888";
  fctx.fillRect(6, 0, 4, 320);
  // Flag
  fctx.fillStyle = "#ff0000";
  fctx.beginPath();
  fctx.moveTo(10, 10);
  fctx.lineTo(10, 50);
  fctx.lineTo(40, 30);
  fctx.closePath();
  fctx.fill();
  // Ball on top
  fctx.fillStyle = "#ffde00";
  fctx.beginPath();
  fctx.arc(8, 5, 5, 0, Math.PI * 2);
  fctx.fill();
  flag.refresh();

  // --- Checkpoint flag (16x64, shorter than flagpole) ---
  const cpFlag = scene.textures.createCanvas("checkpoint", 20, 64)!;
  const cpctx = cpFlag.getContext();
  // Pole
  cpctx.fillStyle = "#aaaaaa";
  cpctx.fillRect(8, 0, 4, 64);
  // Flag (white/silver when inactive - turns green via tint when activated)
  cpctx.fillStyle = "#ffffff";
  cpctx.beginPath();
  cpctx.moveTo(12, 4);
  cpctx.lineTo(12, 24);
  cpctx.lineTo(28, 14);
  cpctx.closePath();
  cpctx.fill();
  cpctx.strokeStyle = "#888888";
  cpctx.lineWidth = 1;
  cpctx.beginPath();
  cpctx.moveTo(12, 4);
  cpctx.lineTo(12, 24);
  cpctx.lineTo(28, 14);
  cpctx.closePath();
  cpctx.stroke();
  // Ball on top
  cpctx.fillStyle = "#cccccc";
  cpctx.beginPath();
  cpctx.arc(10, 3, 3, 0, Math.PI * 2);
  cpctx.fill();
  cpFlag.refresh();

  // --- Pipe (48x64) ---
  const pipe = scene.textures.createCanvas("pipe", 48, 64)!;
  const ppctx = pipe.getContext();
  // Pipe body
  ppctx.fillStyle = "#1ea31e";
  ppctx.fillRect(6, 16, 36, 48);
  // Pipe top (wider)
  ppctx.fillStyle = "#2ec42e";
  ppctx.fillRect(0, 0, 48, 20);
  // Highlights
  ppctx.fillStyle = "#3edd3e";
  ppctx.fillRect(4, 0, 6, 20);
  ppctx.fillRect(10, 16, 4, 48);
  // Dark edge
  ppctx.fillStyle = "#0e7a0e";
  ppctx.fillRect(40, 0, 4, 20);
  ppctx.fillRect(38, 16, 4, 48);
  pipe.refresh();

  // --- Warp pipe (48x64) - same pipe, dark hole on top suggests it goes somewhere ---
  const pipeWarp = scene.textures.createCanvas("pipe-warp", 48, 64)!;
  const pwctx = pipeWarp.getContext();
  pwctx.fillStyle = "#1ea31e";
  pwctx.fillRect(6, 16, 36, 48);
  pwctx.fillStyle = "#2ec42e";
  pwctx.fillRect(0, 0, 48, 20);
  pwctx.fillStyle = "#3edd3e";
  pwctx.fillRect(4, 0, 6, 20);
  pwctx.fillRect(10, 16, 4, 48);
  pwctx.fillStyle = "#0e7a0e";
  pwctx.fillRect(40, 0, 4, 20);
  pwctx.fillRect(38, 16, 4, 48);
  // Dark opening at top — the warp hole
  pwctx.fillStyle = "#061806";
  pwctx.fillRect(10, 4, 28, 10);
  pwctx.fillStyle = "#000000";
  pwctx.fillRect(12, 6, 24, 6);
  pipeWarp.refresh();

  // --- Cloud (64x32) ---
  const cloud = scene.textures.createCanvas("cloud", 64, 32)!;
  const clctx = cloud.getContext();
  clctx.fillStyle = "#ffffff";
  clctx.globalAlpha = 0.8;
  clctx.beginPath();
  clctx.ellipse(20, 20, 14, 10, 0, 0, Math.PI * 2);
  clctx.fill();
  clctx.beginPath();
  clctx.ellipse(32, 14, 16, 12, 0, 0, Math.PI * 2);
  clctx.fill();
  clctx.beginPath();
  clctx.ellipse(44, 20, 14, 10, 0, 0, Math.PI * 2);
  clctx.fill();
  cloud.refresh();

  // --- Hill (128x64) ---
  const hill = scene.textures.createCanvas("hill", 128, 64)!;
  const hctx = hill.getContext();
  hctx.fillStyle = "#2d8b2d";
  hctx.beginPath();
  hctx.ellipse(64, 64, 64, 50, 0, Math.PI, 0);
  hctx.fill();
  hctx.fillStyle = "#3aa33a";
  hctx.beginPath();
  hctx.ellipse(64, 64, 50, 38, 0, Math.PI, 0);
  hctx.fill();
  hill.refresh();

  // --- Castle block (32x32) ---
  const castle = scene.textures.createCanvas("castle-block", 32, 32)!;
  const castctx = castle.getContext();
  // Dark stone base
  castctx.fillStyle = "#3a3a3a";
  castctx.fillRect(0, 0, 32, 32);
  // Mortar lines (lighter grey)
  castctx.strokeStyle = "#555555";
  castctx.lineWidth = 1;
  // Horizontal mortar
  castctx.beginPath();
  castctx.moveTo(0, 8); castctx.lineTo(32, 8);
  castctx.moveTo(0, 16); castctx.lineTo(32, 16);
  castctx.moveTo(0, 24); castctx.lineTo(32, 24);
  castctx.stroke();
  // Vertical mortar (offset every other row for brick pattern)
  castctx.beginPath();
  castctx.moveTo(16, 0); castctx.lineTo(16, 8);
  castctx.moveTo(0, 8); castctx.lineTo(0, 16);
  castctx.moveTo(24, 8); castctx.lineTo(24, 16);
  castctx.moveTo(8, 16); castctx.lineTo(8, 24);
  castctx.moveTo(28, 16); castctx.lineTo(28, 24);
  castctx.moveTo(16, 24); castctx.lineTo(16, 32);
  castctx.stroke();
  // Subtle stone variation
  castctx.fillStyle = "#2e2e2e";
  castctx.fillRect(1, 1, 14, 6);
  castctx.fillRect(25, 9, 6, 6);
  castctx.fillRect(9, 17, 18, 6);
  castctx.fillStyle = "#444444";
  castctx.fillRect(17, 1, 14, 6);
  castctx.fillRect(1, 9, 22, 6);
  castle.refresh();

  // --- Lava (32x32, 2 frames side by side = 64x32) ---
  const lava = scene.textures.createCanvas("lava", 64, 32)!;
  const lvctx = lava.getContext();
  for (let f = 0; f < 2; f++) {
    const ox = f * 32;
    // Base deep red
    lvctx.fillStyle = "#cc2200";
    lvctx.fillRect(ox, 0, 32, 32);
    // Orange glow patches
    lvctx.fillStyle = "#ff6600";
    const offsets = f === 0
      ? [[4, 6, 10, 8], [18, 14, 12, 10], [2, 22, 14, 8]]
      : [[8, 4, 12, 10], [22, 12, 8, 12], [4, 20, 10, 10]];
    for (const [px, py, pw, ph] of offsets) {
      lvctx.fillRect(ox + px, py, pw, ph);
    }
    // Bright yellow hot spots
    lvctx.fillStyle = "#ffcc00";
    const hotSpots = f === 0
      ? [[8, 8, 5, 4], [22, 18, 4, 5]]
      : [[12, 6, 6, 4], [26, 16, 4, 6]];
    for (const [hx, hy, hw, hh] of hotSpots) {
      lvctx.fillRect(ox + hx, hy, hw, hh);
    }
    // White-hot core highlights
    lvctx.fillStyle = "#ffee88";
    const cores = f === 0
      ? [[10, 9, 2, 2], [23, 20, 2, 2]]
      : [[14, 7, 2, 2], [27, 18, 2, 2]];
    for (const [cx, cy, cw, ch] of cores) {
      lvctx.fillRect(ox + cx, cy, cw, ch);
    }
    // Dark crust lines
    lvctx.strokeStyle = "#881100";
    lvctx.lineWidth = 1;
    lvctx.beginPath();
    if (f === 0) {
      lvctx.moveTo(ox + 2, 4); lvctx.lineTo(ox + 14, 6);
      lvctx.moveTo(ox + 16, 24); lvctx.lineTo(ox + 30, 22);
    } else {
      lvctx.moveTo(ox + 4, 2); lvctx.lineTo(ox + 18, 5);
      lvctx.moveTo(ox + 12, 26); lvctx.lineTo(ox + 28, 24);
    }
    lvctx.stroke();
  }
  lava.refresh();
  scene.textures.get("lava").add(0, 0, 0, 0, 32, 32);
  scene.textures.get("lava").add(1, 0, 32, 0, 32, 32);

  // --- Torch (16x32) ---
  const torch = scene.textures.createCanvas("torch", 16, 32)!;
  const tctx = torch.getContext();
  // Mount bracket
  tctx.fillStyle = "#555555";
  tctx.fillRect(2, 14, 12, 4);
  // Torch handle
  tctx.fillStyle = "#8B4513";
  tctx.fillRect(6, 12, 4, 18);
  // Handle base
  tctx.fillStyle = "#6B3410";
  tctx.fillRect(5, 28, 6, 4);
  // Flame outer (orange)
  tctx.fillStyle = "#ff6600";
  tctx.beginPath();
  tctx.ellipse(8, 8, 5, 7, 0, 0, Math.PI * 2);
  tctx.fill();
  // Flame tip
  tctx.fillStyle = "#ff4400";
  tctx.beginPath();
  tctx.moveTo(4, 8);
  tctx.lineTo(8, 0);
  tctx.lineTo(12, 8);
  tctx.closePath();
  tctx.fill();
  // Flame inner (yellow)
  tctx.fillStyle = "#ffcc00";
  tctx.beginPath();
  tctx.ellipse(8, 9, 3, 4, 0, 0, Math.PI * 2);
  tctx.fill();
  // Flame core (white-yellow)
  tctx.fillStyle = "#ffeeaa";
  tctx.beginPath();
  tctx.ellipse(8, 10, 1.5, 2.5, 0, 0, Math.PI * 2);
  tctx.fill();
  torch.refresh();

  // --- Boss chicken (64x80, 2 frames side by side = 128x80) ---
  const bossChicken = scene.textures.createCanvas("boss-chicken", 128, 80)!;
  const bcctx = bossChicken.getContext();
  for (let f = 0; f < 2; f++) {
    drawBossChicken(bcctx, f * 64, f);
  }
  bossChicken.refresh();
  scene.textures.get("boss-chicken").add(0, 0, 0, 0, 64, 80);
  scene.textures.get("boss-chicken").add(1, 0, 64, 0, 64, 80);
}

function drawTriangleBody(ctx: CanvasRenderingContext2D, ox: number, topY: number, botY: number) {
  // Triangle pointing right: left edge is tall, right is the point
  // Top-left, bottom-left, right point
  const leftX = ox + 2;
  const rightX = ox + 30;
  const midY = (topY + botY) / 2;

  // Yellow fill
  ctx.fillStyle = "#f0e020";
  ctx.beginPath();
  ctx.moveTo(leftX, topY);
  ctx.lineTo(rightX, midY);
  ctx.lineTo(leftX, botY);
  ctx.closePath();
  ctx.fill();

  // Orange stripes (vertical bars like the drawing)
  ctx.fillStyle = "#e06000";
  const stripeCount = 5;
  for (let i = 0; i < stripeCount; i++) {
    const t = (i + 0.5) / stripeCount;
    const cx = leftX + t * (rightX - leftX - 4);
    // Height of triangle at this x
    const halfH = ((1 - t) * (botY - topY)) / 2;
    const sy = midY - halfH * 0.6;
    const sh = halfH * 1.2;
    if (sh > 2) {
      ctx.fillRect(cx - 1, sy + 1, 3, sh - 2);
    }
  }

  // Black outline
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(leftX, topY);
  ctx.lineTo(rightX, midY);
  ctx.lineTo(leftX, botY);
  ctx.closePath();
  ctx.stroke();
}

function drawTopSticks(ctx: CanvasRenderingContext2D, ox: number, topY: number, botY: number) {
  const leftX = ox + 2;
  const rightX = ox + 30;
  const midY = (topY + botY) / 2;
  ctx.strokeStyle = "#222222";
  ctx.lineWidth = 1.5;
  // Sticks along the top edge of the triangle, angling up-right
  const stickCount = 6;
  for (let i = 0; i < stickCount; i++) {
    const t = (i + 0.4) / (stickCount + 0.5);
    const baseX = leftX + t * (rightX - leftX);
    const baseY = topY + t * (midY - topY);
    // Each stick angles up and slightly right
    const tipX = baseX + 2 + i * 0.5;
    const tipY = baseY - 7 - Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
  }
}

function drawBottomLegs(
  ctx: CanvasRenderingContext2D,
  ox: number,
  topY: number,
  botY: number,
  frame: number
) {
  const leftX = ox + 2;
  const rightX = ox + 30;
  const midY = (topY + botY) / 2;
  ctx.strokeStyle = "#222222";
  ctx.lineWidth = 1.5;
  // Stick legs hanging down from bottom edge, animated
  const legCount = 7;
  for (let i = 0; i < legCount; i++) {
    const t = (i + 0.3) / (legCount + 0.3);
    const baseX = leftX + t * (rightX - leftX);
    const baseY = botY + t * (midY - botY);
    // Animate: alternate legs swing forward/back
    const swing = (i % 2 === 0 ? 1 : -1) * (frame % 2 === 0 ? 2 : -2);
    const tipX = baseX + swing;
    const tipY = baseY + 5 + Math.abs(swing) * 0.5;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
  }
}

function drawFace(ctx: CanvasRenderingContext2D, ox: number, topY: number, botY: number, excited: boolean) {
  const midY = (topY + botY) / 2;
  // Eye positioned in the front-right area of the triangle
  const eyeX = ox + 22;
  const eyeY = midY - 1;
  const eyeR = excited ? 4 : 3.5;

  // White of eye
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(eyeX, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(eyeX, eyeY, eyeR, 0, Math.PI * 2);
  ctx.stroke();
  // Pupil
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(eyeX + 1, eyeY, excited ? 2 : 1.8, 0, Math.PI * 2);
  ctx.fill();
  // Shine
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(eyeX + 2, eyeY - 1.5, 1, 0, Math.PI * 2);
  ctx.fill();

  // Happy mouth - below and slightly right of eye
  const mouthX = eyeX + 1;
  const mouthY = eyeY + 5;
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1.5;
  if (excited) {
    // Open happy mouth
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(mouthX, mouthY, 2.5, 0, Math.PI);
    ctx.fill();
  } else {
    // Smile curve
    ctx.beginPath();
    ctx.arc(mouthX, mouthY - 1, 3, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, ox: number, frame: number) {
  const topY = 4;
  const botY = 22;

  drawTopSticks(ctx, ox, topY, botY);
  drawTriangleBody(ctx, ox, topY, botY);
  drawFace(ctx, ox, topY, botY, false);
  drawBottomLegs(ctx, ox, topY, botY, frame);
}

function drawPlayerJump(ctx: CanvasRenderingContext2D, ox: number) {
  const topY = 4;
  const botY = 20;

  drawTopSticks(ctx, ox, topY, botY);
  drawTriangleBody(ctx, ox, topY, botY);
  drawFace(ctx, ox, topY, botY, true);
  // Legs splayed out more when jumping
  const leftX = ox + 2;
  const rightX = ox + 30;
  const midY = (topY + botY) / 2;
  ctx.strokeStyle = "#222222";
  ctx.lineWidth = 1.5;
  const legCount = 7;
  for (let i = 0; i < legCount; i++) {
    const t = (i + 0.3) / (legCount + 0.3);
    const baseX = leftX + t * (rightX - leftX);
    const baseY = botY + t * (midY - botY);
    // Legs splay outward when jumping
    const spread = (i - legCount / 2) * 1.5;
    const tipX = baseX + spread;
    const tipY = baseY + 7;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
  }
}

function drawGoomba(ctx: CanvasRenderingContext2D, ox: number, frame: number) {
  // Body (brown mushroom shape)
  ctx.fillStyle = "#a0522d";
  ctx.beginPath();
  ctx.ellipse(ox + 16, 14, 14, 12, 0, Math.PI, 0);
  ctx.fill();

  // Bottom body
  ctx.fillStyle = "#d2a068";
  ctx.fillRect(ox + 6, 14, 20, 10);

  // Eyes
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(ox + 8, 8, 6, 6);
  ctx.fillRect(ox + 18, 8, 6, 6);
  // Pupils
  ctx.fillStyle = "#000000";
  ctx.fillRect(ox + 11, 10, 3, 4);
  ctx.fillRect(ox + 18, 10, 3, 4);

  // Angry eyebrows
  ctx.fillStyle = "#000000";
  ctx.fillRect(ox + 8, 7, 6, 2);
  ctx.fillRect(ox + 18, 7, 6, 2);

  // Feet
  ctx.fillStyle = "#000000";
  if (frame === 0) {
    ctx.fillRect(ox + 4, 24, 10, 8);
    ctx.fillRect(ox + 18, 24, 10, 8);
  } else {
    ctx.fillRect(ox + 6, 24, 10, 8);
    ctx.fillRect(ox + 16, 24, 10, 8);
  }
}

function drawBossChicken(ctx: CanvasRenderingContext2D, ox: number, frame: number) {
  // --- Legs and feet (yellow) ---
  ctx.fillStyle = "#e8b830";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  const legSpread = frame === 0 ? 0 : 2;

  // Left leg
  ctx.fillStyle = "#e8b830";
  ctx.fillRect(ox + 18 - legSpread, 58, 5, 14);
  ctx.strokeRect(ox + 18 - legSpread, 58, 5, 14);
  // Left foot (big spread toes)
  ctx.fillStyle = "#e8b830";
  ctx.beginPath();
  ctx.moveTo(ox + 12 - legSpread, 74);
  ctx.lineTo(ox + 20 - legSpread, 72);
  ctx.lineTo(ox + 28 - legSpread, 74);
  ctx.lineTo(ox + 28 - legSpread, 78);
  ctx.lineTo(ox + 12 - legSpread, 78);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Toe lines
  ctx.beginPath();
  ctx.moveTo(ox + 16 - legSpread, 74);
  ctx.lineTo(ox + 16 - legSpread, 78);
  ctx.moveTo(ox + 24 - legSpread, 74);
  ctx.lineTo(ox + 24 - legSpread, 78);
  ctx.stroke();

  // Right leg
  ctx.fillStyle = "#e8b830";
  ctx.fillRect(ox + 38 + legSpread, 58, 5, 14);
  ctx.strokeRect(ox + 38 + legSpread, 58, 5, 14);
  // Right foot
  ctx.beginPath();
  ctx.moveTo(ox + 32 + legSpread, 74);
  ctx.lineTo(ox + 40 + legSpread, 72);
  ctx.lineTo(ox + 50 + legSpread, 74);
  ctx.lineTo(ox + 50 + legSpread, 78);
  ctx.lineTo(ox + 32 + legSpread, 78);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Toe lines
  ctx.beginPath();
  ctx.moveTo(ox + 38 + legSpread, 74);
  ctx.lineTo(ox + 38 + legSpread, 78);
  ctx.moveTo(ox + 44 + legSpread, 74);
  ctx.lineTo(ox + 44 + legSpread, 78);
  ctx.stroke();

  // --- Body (white oval, penguin-like upright stance) ---
  ctx.fillStyle = "#f0f0f0";
  ctx.beginPath();
  ctx.ellipse(ox + 32, 42, 20, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(ox + 32, 42, 20, 22, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Belly highlight (slightly lighter center)
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(ox + 32, 46, 12, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- Left wing (with feather finger details) ---
  const lwAngle = frame === 0 ? 0.15 : 0.4;
  ctx.save();
  ctx.translate(ox + 14, 38);
  ctx.rotate(-lwAngle);
  ctx.fillStyle = "#e8e8e8";
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 16, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Feather finger details sticking out at bottom of left wing
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-4, 14); ctx.lineTo(-7, 20);
  ctx.moveTo(-1, 15); ctx.lineTo(-2, 22);
  ctx.moveTo(2, 14); ctx.lineTo(3, 21);
  ctx.stroke();
  ctx.restore();

  // --- Right wing (simpler flipper shape) ---
  const rwAngle = frame === 0 ? -0.15 : -0.5;
  ctx.save();
  ctx.translate(ox + 50, 38);
  ctx.rotate(rwAngle);
  ctx.fillStyle = "#e8e8e8";
  ctx.beginPath();
  ctx.ellipse(0, 0, 6, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 6, 14, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // --- Head (white circle on top of body) ---
  ctx.fillStyle = "#f0f0f0";
  ctx.beginPath();
  ctx.arc(ox + 32, 18, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ox + 32, 18, 13, 0, Math.PI * 2);
  ctx.stroke();

  // --- Red comb (3 pointed spikes on top) ---
  ctx.fillStyle = "#dd2222";
  ctx.beginPath();
  ctx.moveTo(ox + 24, 8);
  ctx.lineTo(ox + 26, 0);
  ctx.lineTo(ox + 28, 7);
  ctx.lineTo(ox + 31, -1);
  ctx.lineTo(ox + 34, 7);
  ctx.lineTo(ox + 37, 1);
  ctx.lineTo(ox + 40, 8);
  ctx.lineTo(ox + 38, 10);
  ctx.lineTo(ox + 24, 10);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ox + 24, 8);
  ctx.lineTo(ox + 26, 0);
  ctx.lineTo(ox + 28, 7);
  ctx.lineTo(ox + 31, -1);
  ctx.lineTo(ox + 34, 7);
  ctx.lineTo(ox + 37, 1);
  ctx.lineTo(ox + 40, 8);
  ctx.stroke();

  // --- Beak (yellow triangle pointing right) ---
  ctx.fillStyle = "#e8b830";
  ctx.beginPath();
  ctx.moveTo(ox + 44, 16);
  ctx.lineTo(ox + 56, 20);
  ctx.lineTo(ox + 44, 22);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ox + 44, 16);
  ctx.lineTo(ox + 56, 20);
  ctx.lineTo(ox + 44, 22);
  ctx.closePath();
  ctx.stroke();

  // --- Angry eye ---
  // White of eye
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(ox + 38, 17, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(ox + 38, 17, 4, 0, Math.PI * 2);
  ctx.stroke();
  // Pupil (small, angry)
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(ox + 39, 17, 2, 0, Math.PI * 2);
  ctx.fill();
  // Angry eyebrow (angled down towards center)
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(ox + 33, 11);
  ctx.lineTo(ox + 42, 13);
  ctx.stroke();
}

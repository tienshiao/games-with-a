export interface SafePit {
  start: number; // tile x where pit begins
  end: number; // tile x where pit ends
  floorY: number; // tile y of the pit floor
}

export interface LevelData {
  ground: { start: number; end: number }[];
  floatingPlatforms: {
    x: number;
    y: number;
    width: number;
    type: "brick" | "question";
  }[];
  coins: { x: number; y: number }[];
  enemies: { x: number; y: number; dir: "left" | "right" }[];
  pipes: { x: number; y: number }[];
  safePits: SafePit[];
  checkpoint: { x: number; y: number };
}

/**
 * Procedurally generates a Mario-style level.
 * All coordinates are in tile units (32px each).
 * Ground is at y=15 (row 15 = 480px, the top of the ground row at 500-32=468).
 */
export function generateLevel(widthInTiles: number): LevelData {
  const GROUND_Y = 15; // tile row for ground surface

  const PIT_FLOOR_Y = 20; // tile row for safe pit floors (below ground)

  // --- Ground segments with gaps ---
  const ground: LevelData["ground"] = [];
  const safePits: SafePit[] = [];
  let gx = 0;
  let gapIndex = 0;

  // Always start with solid ground under the player
  const firstSegLen = randInt(15, 25);
  ground.push({ start: 0, end: firstSegLen });
  gx = firstSegLen;

  while (gx < widthInTiles - 20) {
    // Decide: safe pit (wider, has floor) or deadly gap (narrow, bottomless)
    const isSafePit = gapIndex > 0 && Math.random() < 0.3; // ~30% chance, never first gap
    const gapSize = isSafePit ? randInt(5, 7) : randInt(2, 4);
    const gapStart = gx;
    gx += gapSize;

    if (isSafePit) {
      safePits.push({ start: gapStart, end: gx, floorY: PIT_FLOOR_Y });
    }

    // Segment
    const segLen = randInt(8, 30);
    const segEnd = Math.min(gx + segLen, widthInTiles);
    ground.push({ start: gx, end: segEnd });
    gx = segEnd;
    gapIndex++;
  }

  // Ensure ground at the very end for the flagpole
  if (ground[ground.length - 1].end < widthInTiles) {
    ground.push({ start: widthInTiles - 15, end: widthInTiles });
  }

  // --- Floating platforms ---
  const floatingPlatforms: LevelData["floatingPlatforms"] = [];
  for (let x = 10; x < widthInTiles - 20; x += randInt(6, 16)) {
    const platY = randInt(9, 12);
    const platW = randInt(2, 5);
    const type = Math.random() < 0.3 ? "question" : "brick";
    floatingPlatforms.push({ x, y: platY, width: platW, type });

    // Sometimes add a second tier
    if (Math.random() < 0.2) {
      floatingPlatforms.push({
        x: x + 1,
        y: platY - 3,
        width: randInt(2, 3),
        type: "brick",
      });
    }
  }

  // --- Coins ---
  const coins: LevelData["coins"] = [];

  // Coins above floating platforms
  for (const plat of floatingPlatforms) {
    if (Math.random() < 0.6) {
      for (let i = 0; i < plat.width; i++) {
        coins.push({ x: plat.x + i, y: plat.y - 2 });
      }
    }
  }

  // Coins inside safe pits (bonus reward for exploring)
  for (const pit of safePits) {
    for (let x = pit.start; x < pit.end; x++) {
      coins.push({ x, y: pit.floorY - 2 });
    }
  }

  // Coins on ground in arcs
  for (const seg of ground) {
    const segW = seg.end - seg.start;
    if (segW > 10 && Math.random() < 0.5) {
      const arcStart = seg.start + randInt(2, Math.floor(segW / 2));
      const arcLen = randInt(3, 6);
      for (let i = 0; i < arcLen; i++) {
        const h = Math.sin((i / (arcLen - 1)) * Math.PI) * 3;
        coins.push({
          x: arcStart + i,
          y: GROUND_Y - 2 - Math.round(h),
        });
      }
    }
  }

  // --- Enemies ---
  const enemies: LevelData["enemies"] = [];
  for (const seg of ground) {
    const segW = seg.end - seg.start;
    if (segW < 6) continue;

    // Place 1-3 enemies per segment
    const count = Math.min(3, Math.floor(segW / 8));
    for (let i = 0; i < count; i++) {
      const ex = seg.start + randInt(3, segW - 2);
      enemies.push({
        x: ex,
        y: GROUND_Y - 1,
        dir: Math.random() < 0.5 ? "left" : "right",
      });
    }
  }

  // --- Pipes ---
  const pipes: LevelData["pipes"] = [];
  for (const seg of ground) {
    if (seg.end - seg.start > 12 && Math.random() < 0.5) {
      const px = seg.start + randInt(4, seg.end - seg.start - 4);
      pipes.push({ x: px, y: GROUND_Y });
    }
  }

  // --- Checkpoint near the middle of the level ---
  const midTile = Math.floor(widthInTiles / 2);
  // Find the ground segment closest to the middle
  let bestSeg = ground[Math.floor(ground.length / 2)];
  let bestDist = Infinity;
  for (const seg of ground) {
    const segMid = (seg.start + seg.end) / 2;
    const d = Math.abs(segMid - midTile);
    if (d < bestDist && seg.end - seg.start >= 6) {
      bestDist = d;
      bestSeg = seg;
    }
  }
  const checkpointX = Math.floor((bestSeg.start + bestSeg.end) / 2);
  const checkpoint = { x: checkpointX, y: GROUND_Y };

  return { ground, floatingPlatforms, coins, enemies, pipes, safePits, checkpoint };
}

export interface CastleLevelData {
  platforms: { x: number; y: number; width: number; type: "castle" | "brick" }[];
  lava: { start: number; end: number }[];
  torches: { x: number; y: number }[];
  coins: { x: number; y: number }[];
  enemies: { x: number; y: number; dir: "left" | "right" }[];
  bossX: number;
  bossFloorY: number;
  checkpoint: { x: number; y: number };
}

/**
 * Generates a castle-themed level that ascends from left to right,
 * ending with a boss arena. All coordinates are in tile units (32px each).
 */
export function generateCastleLevel(widthInTiles: number = 150): CastleLevelData {
  const platforms: CastleLevelData["platforms"] = [];
  const lava: CastleLevelData["lava"] = [];
  const torches: CastleLevelData["torches"] = [];
  const coins: CastleLevelData["coins"] = [];
  const enemies: CastleLevelData["enemies"] = [];

  const BOSS_ARENA_WIDTH = 12;
  const BOSS_FLOOR_Y = 8;
  const START_Y = 15; // ground level on the left

  // --- Starting floor ---
  const startFloorWidth = randInt(8, 12);
  platforms.push({ x: 0, y: START_Y, width: startFloorWidth, type: "castle" });

  // --- Ascending platforms toward the boss arena ---
  // We need to climb from y=15 down to y=8 (up on screen) over the level width.
  // Reserve the last BOSS_ARENA_WIDTH + a few tiles for the boss area.
  const climbEnd = widthInTiles - BOSS_ARENA_WIDTH - 4;
  let cx = startFloorWidth; // current x cursor
  let cy = START_Y; // current y (descending = going up on screen)

  // Target: go from START_Y to BOSS_FLOOR_Y over the climbing section
  const totalRise = START_Y - BOSS_FLOOR_Y; // 7 tiles of vertical climb
  const totalRun = climbEnd - cx;

  while (cx < climbEnd) {
    // Lava pit gap between platforms
    const gapSize = randInt(2, 4);
    const lavaStart = cx;
    const lavaEnd = Math.min(cx + gapSize, climbEnd);
    if (gapSize >= 2) {
      lava.push({ start: lavaStart, end: lavaEnd });
    }
    cx = lavaEnd;

    if (cx >= climbEnd) break;

    // Calculate how much to ascend for this platform
    const progressRatio = (cx - startFloorWidth) / totalRun;
    const targetY = Math.round(START_Y - totalRise * progressRatio);

    // Occasionally step up more aggressively, but generally follow the curve
    const stepUp = randInt(0, 2);
    cy = Math.max(targetY - 1, Math.min(cy - stepUp, targetY + 1));
    // Clamp so we don't go above boss floor or below start
    cy = Math.max(BOSS_FLOOR_Y, Math.min(cy, START_Y));

    const platWidth = randInt(4, 10);
    const platEnd = Math.min(cx + platWidth, climbEnd);
    const actualWidth = platEnd - cx;
    if (actualWidth < 2) break;

    const type = Math.random() < 0.7 ? "castle" as const : "brick" as const;
    platforms.push({ x: cx, y: cy, width: actualWidth, type });

    // Place a torch on the left edge of some platforms
    if (Math.random() < 0.5) {
      torches.push({ x: cx, y: cy - 2 });
    }
    // Place a torch on the right edge sometimes
    if (actualWidth >= 5 && Math.random() < 0.4) {
      torches.push({ x: cx + actualWidth - 1, y: cy - 2 });
    }

    // Coins above the platform in an arc or line
    if (Math.random() < 0.6) {
      const coinCount = randInt(2, Math.min(actualWidth, 5));
      const coinStartX = cx + Math.floor((actualWidth - coinCount) / 2);
      for (let i = 0; i < coinCount; i++) {
        const arcH = coinCount > 2
          ? Math.round(Math.sin((i / (coinCount - 1)) * Math.PI) * 2)
          : 1;
        coins.push({ x: coinStartX + i, y: cy - 2 - arcH });
      }
    }

    // Enemies on wider platforms
    if (actualWidth >= 5 && Math.random() < 0.5) {
      const numEnemies = randInt(1, Math.min(2, Math.floor(actualWidth / 5)));
      for (let e = 0; e < numEnemies; e++) {
        const ex = cx + randInt(1, actualWidth - 2);
        enemies.push({ x: ex, y: cy - 1, dir: Math.random() < 0.5 ? "left" : "right" });
      }
    }

    // Sometimes add a small elevated sub-platform for variety
    if (Math.random() < 0.25 && actualWidth >= 6) {
      const subX = cx + randInt(1, actualWidth - 3);
      const subW = randInt(2, 3);
      platforms.push({ x: subX, y: cy - 3, width: subW, type: "brick" });
      // Coins on the sub-platform
      for (let i = 0; i < subW; i++) {
        coins.push({ x: subX + i, y: cy - 5 });
      }
    }

    cx = platEnd;
  }

  // --- Boss arena ---
  const bossX = widthInTiles - BOSS_ARENA_WIDTH - 2;
  // Bridge from last platform to boss arena
  if (cx < bossX) {
    const bridgeGap = bossX - cx;
    if (bridgeGap >= 2) {
      lava.push({ start: cx, end: bossX });
    }
  }

  // Boss arena floor
  platforms.push({ x: bossX, y: BOSS_FLOOR_Y, width: BOSS_ARENA_WIDTH, type: "castle" });

  // Torches flanking the boss arena
  torches.push({ x: bossX, y: BOSS_FLOOR_Y - 3 });
  torches.push({ x: bossX + BOSS_ARENA_WIDTH - 1, y: BOSS_FLOOR_Y - 3 });
  torches.push({ x: bossX + Math.floor(BOSS_ARENA_WIDTH / 2), y: BOSS_FLOOR_Y - 4 });

  // --- Checkpoint near the halfway point ---
  const midX = Math.floor(widthInTiles / 2);
  // Find the platform closest to the midpoint
  let bestPlat = platforms[0];
  let bestDist = Infinity;
  for (const plat of platforms) {
    const platMid = plat.x + plat.width / 2;
    const d = Math.abs(platMid - midX);
    if (d < bestDist && plat.width >= 4) {
      bestDist = d;
      bestPlat = plat;
    }
  }
  const checkpoint = {
    x: Math.floor(bestPlat.x + bestPlat.width / 2),
    y: bestPlat.y,
  };

  // Place a torch at the checkpoint for visual emphasis
  torches.push({ x: checkpoint.x, y: checkpoint.y - 2 });

  return {
    platforms,
    lava,
    torches,
    coins,
    enemies,
    bossX,
    bossFloorY: BOSS_FLOOR_Y,
    checkpoint,
  };
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

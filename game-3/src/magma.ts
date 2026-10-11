// Terrain for the fourth level: a causeway of cooled rock winding across a
// lake of lava, ending in a short bridge to the arena where the boss waits.
//
// The ground is a tile grid where a tile is either rock or lava. The path is
// laid down by a cursor that alternates between walking forward (up the grid)
// and sideways, stamping a 2x2 block of rock at every step — so the causeway
// is two tiles wide and its centreline runs along the tile corners. Because
// every step overlaps the last, the start is always connected to the goal.

/** Side of one ground tile, in world pixels. */
export const MAGMA_TILE = 96;

const COLS = 13;
// The boss arena fills the width of the grid at the top of it, and a straight
// bridge two tiles wide joins the end of the causeway to it.
const ARENA_ROWS = 9;
const BRIDGE_ROWS = 3;
const ROWS = 40 + ARENA_ROWS + BRIDGE_ROWS;
// Lava kept clear around the outside, so the edge of the grid is never rock.
const BORDER = 2;
// Tiles walked forward between switchbacks. Three or more leaves at least one
// row of lava between one sideways run and the next.
const FORWARD_MIN = 3;
const FORWARD_MAX = 5;
const SIDE_MIN = 2;
const SPUR_LENGTH = 3;

export interface MagmaPoint {
  /** World pixels. */
  x: number;
  y: number;
}

/** A rectangle of the world, in world pixels. */
export interface MagmaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MagmaWorld {
  cols: number;
  rows: number;
  /** rock[row][col] — true where there is ground; everything else is lava. */
  rock: boolean[][];
  /** Where the hero starts, at the bottom of the grid, facing up it. */
  start: MagmaPoint;
  /** The middle of the bridge, where the "?" block floats. */
  block: MagmaPoint;
  /** The slab the boss is fought on, past the bridge. */
  arena: MagmaRect;
  crystals: MagmaPoint[];
}

/** True when the world-pixel point is over rock. Off the grid is lava. */
export function isRock(world: MagmaWorld, x: number, y: number): boolean {
  const tx = Math.floor(x / MAGMA_TILE);
  const ty = Math.floor(y / MAGMA_TILE);
  return world.rock[ty]?.[tx] ?? false;
}

export function generateMagma(): MagmaWorld {
  const rock: boolean[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => false)
  );
  const between = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

  // The cursor is the tile corner the 2x2 stamp is centred on: it covers
  // columns x-1..x and rows y-1..y.
  const stamp = (x: number, y: number, reach = 1): void => {
    for (let ty = y - reach; ty < y + reach; ty++) {
      for (let tx = x - reach; tx < x + reach; tx++) rock[ty]![tx] = true;
    }
  };
  const corner = (x: number, y: number): MagmaPoint => ({
    x: x * MAGMA_TILE,
    y: y * MAGMA_TILE,
  });

  const minX = BORDER + 2;
  const maxX = COLS - BORDER - 2;
  const startY = ROWS - BORDER - 2;
  const arenaBottom = BORDER + ARENA_ROWS;
  // The causeway ends on a slab two tiles deep either side of this row.
  const goalY = arenaBottom + BRIDGE_ROWS + 2;

  let x = Math.floor(COLS / 2);
  let y = startY;
  stamp(x, y, 2); // a wide slab to find your feet on
  const start = corner(x, y);

  const crystals: MagmaPoint[] = [];
  let side = Math.random() < 0.5 ? -1 : 1;
  let leg = 0;

  while (y > goalY) {
    const steps = Math.min(between(FORWARD_MIN, FORWARD_MAX), y - goalY);
    for (let i = 0; i < steps; i++) stamp(x, --y);
    if (y <= goalY) break;

    // Run sideways, bouncing off whichever edge is too close to run toward.
    const room = side < 0 ? x - minX : maxX - x;
    if (room < SIDE_MIN) side = -side;
    const run = between(SIDE_MIN, side < 0 ? x - minX : maxX - x);

    // Every other corner grows a one-tile-wide spur out the far side, with a
    // crystal at its tip — the risky ones. The rest sit on the path itself.
    if (leg % 2 === 0) {
      const dir = -side;
      const tip = dir < 0 ? x - 1 - SPUR_LENGTH : x + SPUR_LENGTH;
      if (tip >= BORDER && tip < COLS - BORDER) {
        for (let i = 1; i <= SPUR_LENGTH; i++) rock[y]![dir < 0 ? x - 1 - i : x + i] = true;
        crystals.push({ x: (tip + 0.5) * MAGMA_TILE, y: (y + 0.5) * MAGMA_TILE });
      }
    } else {
      crystals.push(corner(x, y));
    }

    for (let i = 0; i < run; i++) {
      x += side;
      stamp(x, y);
    }
    side = -side;
    leg++;
  }

  stamp(x, y, 2);

  // Straight on from the end slab: the bridge, then the arena.
  for (let ty = arenaBottom; ty < y - 2; ty++) {
    rock[ty]![x - 1] = rock[ty]![x] = true;
  }
  for (let ty = BORDER; ty < arenaBottom; ty++) {
    for (let tx = BORDER; tx < COLS - BORDER; tx++) rock[ty]![tx] = true;
  }

  return {
    cols: COLS,
    rows: ROWS,
    rock,
    start,
    block: { x: x * MAGMA_TILE, y: (arenaBottom + BRIDGE_ROWS / 2) * MAGMA_TILE },
    arena: {
      x: BORDER * MAGMA_TILE,
      y: BORDER * MAGMA_TILE,
      width: (COLS - 2 * BORDER) * MAGMA_TILE,
      height: ARENA_ROWS * MAGMA_TILE,
    },
    crystals,
  };
}

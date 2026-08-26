// Maze generation for the second level.
//
// The maze lives on an odd-sized grid where odd/odd coordinates are the cells
// the player walks through and even coordinates are the walls between them.
// A cell grid of C x R becomes a (2C+1) x (2R+1) tile grid, which means every
// corridor is exactly one tile wide and always has a wall around the outside.

export interface Maze {
  /** Tile columns, always odd. */
  cols: number;
  /** Tile rows, always odd. */
  rows: number;
  /** walls[row][col] — true where a wall tile sits. */
  walls: boolean[][];
  cellCols: number;
  cellRows: number;
  /** Cells (in cell coordinates) with exactly one open neighbour. */
  deadEnds: Array<{ cx: number; cy: number }>;
}

/** Tile coordinates of the corridor tile for a cell. */
export function cellToTile(cx: number, cy: number): { tx: number; ty: number } {
  return { tx: cx * 2 + 1, ty: cy * 2 + 1 };
}

/**
 * Recursive-backtracker maze: walk to a random unvisited neighbour, knocking
 * out the wall in between, and back up when boxed in. Produces a "perfect"
 * maze — exactly one path between any two cells, so every crystal is always
 * reachable and the level can't generate itself unwinnable.
 */
export function generateMaze(cellCols: number, cellRows: number): Maze {
  const cols = cellCols * 2 + 1;
  const rows = cellRows * 2 + 1;

  // Start solid and carve corridors out of it.
  const walls: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => true)
  );

  const visited: boolean[][] = Array.from({ length: cellRows }, () =>
    Array.from({ length: cellCols }, () => false)
  );

  const open = (tx: number, ty: number): void => {
    walls[ty]![tx] = false;
  };

  const stack: Array<{ cx: number; cy: number }> = [{ cx: 0, cy: 0 }];
  visited[0]![0] = true;
  open(1, 1);

  const dirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  while (stack.length) {
    const cur = stack[stack.length - 1]!;
    const options = dirs.filter(({ dx, dy }) => {
      const nx = cur.cx + dx;
      const ny = cur.cy + dy;
      return (
        nx >= 0 && nx < cellCols && ny >= 0 && ny < cellRows && !visited[ny]![nx]
      );
    });

    if (!options.length) {
      stack.pop();
      continue;
    }

    const { dx, dy } = options[Math.floor(Math.random() * options.length)]!;
    const nx = cur.cx + dx;
    const ny = cur.cy + dy;
    visited[ny]![nx] = true;

    const from = cellToTile(cur.cx, cur.cy);
    const to = cellToTile(nx, ny);
    open(to.tx, to.ty);
    open((from.tx + to.tx) / 2, (from.ty + to.ty) / 2); // the wall between them
    stack.push({ cx: nx, cy: ny });
  }

  // Dead ends make the best hiding places for crystals — they're the cells a
  // player only enters on purpose.
  const deadEnds: Array<{ cx: number; cy: number }> = [];
  for (let cy = 0; cy < cellRows; cy++) {
    for (let cx = 0; cx < cellCols; cx++) {
      const { tx, ty } = cellToTile(cx, cy);
      const openSides = dirs.filter(({ dx, dy }) => !walls[ty + dy]![tx + dx]).length;
      if (openSides === 1) deadEnds.push({ cx, cy });
    }
  }

  return { cols, rows, walls, cellCols, cellRows, deadEnds };
}

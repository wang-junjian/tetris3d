// AI 玩家：落点枚举 + Dellacherie 启发式评估（作为内置引擎与 Jev 的候选筛选/回退）
import {
  COLS, ROWS, shapeCells, collides, ghostY, lockPiece, fullRows, clearRows,
} from './tetris';
import type { Board, PieceType } from './tetris';

export interface Placement {
  rot: number;
  x: number;
  y: number; // 最终落点
  board: Board; // 落子并消行后的棋盘
  linesCleared: number;
  landingHeight: number; // 方块重心高度
  metrics: BoardMetrics;
  score: number; // 启发式评分，越高越好
}

export interface BoardMetrics {
  aggregateHeight: number;
  holes: number;
  bumpiness: number;
  maxHeight: number;
  columnHeights: number[];
}

export function boardMetrics(board: Board): BoardMetrics {
  const columnHeights: number[] = [];
  let holes = 0;
  for (let x = 0; x < COLS; x++) {
    let h = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (board[y][x] !== 0) { h = y + 1; break; }
    }
    columnHeights.push(h);
    for (let y = 0; y < h; y++) {
      if (board[y][x] === 0) holes++;
    }
  }
  const aggregateHeight = columnHeights.reduce((a, b) => a + b, 0);
  let bumpiness = 0;
  for (let x = 0; x < COLS - 1; x++) bumpiness += Math.abs(columnHeights[x] - columnHeights[x + 1]);
  const maxHeight = Math.max(...columnHeights);
  return { aggregateHeight, holes, bumpiness, maxHeight, columnHeights };
}

// Dellacherie 特征权重
const W = {
  landingHeight: -0.35,
  lines: 0.9,
  aggregateHeight: -0.510066,
  holes: -0.75663,
  bumpiness: -0.184483,
  wells: -0.25,
};

function wellDepth(heights: number[]): number {
  let wells = 0;
  for (let x = 0; x < COLS; x++) {
    const left = x === 0 ? ROWS + 2 : heights[x - 1];
    const right = x === COLS - 1 ? ROWS + 2 : heights[x + 1];
    const d = Math.min(left, right) - heights[x];
    if (d > 0) wells += (d * (d + 1)) / 2;
  }
  return wells;
}

export function enumeratePlacements(board: Board, type: PieceType): Placement[] {
  const out: Placement[] = [];
  const seen = new Set<string>();
  for (let rot = 0; rot < 4; rot++) {
    const cells = shapeCells(type, rot);
    const minX = -Math.min(...cells.map((c) => c[0]));
    const maxX = COLS - 1 - Math.max(...cells.map((c) => c[0]));
    for (let x = minX; x <= maxX; x++) {
      // 找一个不碰撞的起始 y
      let startY = ROWS;
      while (startY > -4 && collides(board, type, rot, x, startY)) startY--;
      if (startY <= -4) continue;
      const y = ghostY(board, { type, rot, x, y: startY });
      if (collides(board, type, rot, x, y)) continue;
      const key = `${rot}:${x}:${y}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const locked = lockPiece(board, { type, rot, x, y });
      const rows = fullRows(locked);
      const cleared = clearRows(locked, rows);
      const metrics = boardMetrics(cleared);
      const landingHeight = y + cells.reduce((a, c) => a + c[1], 0) / cells.length + 1;
      const wells = wellDepth(metrics.columnHeights);
      const score =
        W.landingHeight * landingHeight +
        W.lines * rows.length +
        W.aggregateHeight * metrics.aggregateHeight +
        W.holes * metrics.holes +
        W.bumpiness * metrics.bumpiness +
        W.wells * wells;

      out.push({ rot, x, y, board: cleared, linesCleared: rows.length, landingHeight, metrics, score });
    }
  }
  return out;
}

export function bestPlacement(board: Board, type: PieceType): Placement | null {
  const all = enumeratePlacements(board, type);
  if (all.length === 0) return null;
  return all.reduce((a, b) => (b.score > a.score ? b : a));
}

export function topPlacements(board: Board, type: PieceType, n: number): Placement[] {
  return enumeratePlacements(board, type)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

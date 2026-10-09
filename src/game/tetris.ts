// 3D 俄罗斯方块核心逻辑（纯逻辑，与渲染无关）

export const COLS = 10;
export const ROWS = 20;
export const HIDDEN = 4; // 顶部隐藏缓冲行
export const TOTAL = ROWS + HIDDEN;

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export const PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// 每种方块的颜色（贴近街机电光色系）
export const PIECE_COLORS: Record<PieceType, number> = {
  I: 0x35e0ff,
  O: 0xffd23d,
  T: 0xb45cff,
  S: 0xc6d32d, // 电光青柠
  Z: 0xff624d, // 珊瑚红
  J: 0x4d6bff, // 电光蓝
  L: 0xff8a3d, // 霓橙
};

export const PIECE_IDS: Record<PieceType, number> = {
  I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7,
};
export const ID_TO_PIECE: PieceType[] = ['I', 'I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// 每个方块的 4 个旋转态，格子坐标 [x, y]，y 向上
const SHAPES: Record<PieceType, [number, number][][]> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
};

export function shapeCells(type: PieceType, rot: number): [number, number][] {
  return SHAPES[type][((rot % 4) + 4) % 4];
}

export type Board = number[][]; // board[y][x]，y=0 为底部可见行，值为 PIECE_IDS 或 0

export function emptyBoard(): Board {
  return Array.from({ length: TOTAL }, () => new Array(COLS).fill(0));
}

export interface ActivePiece {
  type: PieceType;
  rot: number;
  x: number; // 形状左下角在棋盘上的 x
  y: number;
}

export function collides(board: Board, type: PieceType, rot: number, x: number, y: number): boolean {
  for (const [cx, cy] of shapeCells(type, rot)) {
    const bx = x + cx;
    const by = y + cy;
    if (bx < 0 || bx >= COLS || by < 0) return true;
    if (by < TOTAL && board[by][bx] !== 0) return true;
  }
  return false;
}

export function spawnPiece(type: PieceType): ActivePiece {
  return { type, rot: 0, x: 3, y: TOTAL - 3 };
}

export function tryMove(board: Board, p: ActivePiece, dx: number, dy: number): ActivePiece | null {
  const nx = p.x + dx;
  const ny = p.y + dy;
  if (collides(board, p.type, p.rot, nx, ny)) return null;
  return { ...p, x: nx, y: ny };
}

// 旋转（带简单踢墙）
export function tryRotate(board: Board, p: ActivePiece, dir: 1 | -1): ActivePiece | null {
  const nrot = (((p.rot + dir) % 4) + 4) % 4;
  const kicks: [number, number][] = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, 1], [0, -1]];
  for (const [kx, ky] of kicks) {
    if (!collides(board, p.type, nrot, p.x + kx, p.y + ky)) {
      return { ...p, rot: nrot, x: p.x + kx, y: p.y + ky };
    }
  }
  return null;
}

// 硬降落点 y
export function ghostY(board: Board, p: ActivePiece): number {
  let y = p.y;
  while (!collides(board, p.type, p.rot, p.x, y - 1)) y--;
  return y;
}

export function lockPiece(board: Board, p: ActivePiece): Board {
  const nb = board.map((r) => r.slice());
  const id = PIECE_IDS[p.type];
  for (const [cx, cy] of shapeCells(p.type, p.rot)) {
    const bx = p.x + cx;
    const by = p.y + cy;
    if (by >= 0 && by < TOTAL && bx >= 0 && bx < COLS) nb[by][bx] = id;
  }
  return nb;
}

// 返回填满的行号（按 y 升序）
export function fullRows(board: Board): number[] {
  const rows: number[] = [];
  for (let y = 0; y < TOTAL; y++) {
    if (board[y].every((c) => c !== 0)) rows.push(y);
  }
  return rows;
}

export function clearRows(board: Board, rows: number[]): Board {
  const keep = board.filter((_, y) => !rows.includes(y)).map((r) => r.slice());
  while (keep.length < TOTAL) keep.push(new Array(COLS).fill(0));
  return keep;
}

export function isTopOut(board: Board): boolean {
  for (let y = ROWS; y < TOTAL; y++) {
    if (board[y].some((c) => c !== 0)) return true;
  }
  return false;
}

// 7-bag 随机发牌器
export class Bag {
  private queue: PieceType[] = [];
  next(): PieceType {
    if (this.queue.length === 0) {
      this.queue = [...PIECE_TYPES];
      for (let i = this.queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
      }
    }
    return this.queue.shift()!;
  }
  peek(n: number): PieceType[] {
    const saved = [...this.queue];
    const out: PieceType[] = [];
    for (let i = 0; i < n; i++) {
      if (saved.length === 0) {
        const bag = [...PIECE_TYPES];
        for (let k = bag.length - 1; k > 0; k--) {
          const j = Math.floor(Math.random() * (k + 1));
          [bag[k], bag[j]] = [bag[j], bag[k]];
        }
        saved.push(...bag);
      }
      out.push(saved.shift()!);
    }
    return out;
  }
}

const SCORE_TABLE = [0, 100, 300, 500, 800];

export function scoreFor(lines: number, level: number): number {
  return (SCORE_TABLE[Math.min(lines, 4)] ?? 0) * level;
}

export function levelFor(lines: number): number {
  return Math.floor(lines / 10) + 1;
}

// 重力间隔（毫秒）
export function gravityMs(level: number): number {
  return Math.max(60, Math.round(800 * Math.pow(0.85, level - 1)));
}

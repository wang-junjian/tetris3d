// Jev (TypeSafe System One) API 客户端
// API Key / Endpoint / Model 全部来自用户设置（localStorage），绝不硬编码。
import { ROWS, COLS } from './tetris';
import type { Board, PieceType } from './tetris';
import { boardMetrics } from './ai';
import type { Placement, BoardMetrics } from './ai';

export interface JevConfig {
  apiKey: string;
  endpoint: string; // 默认 https://api.typesafe.ai/v1/systemone
  model: string;    // 默认 jev-latest
}

export const JEV_DEFAULT_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_DEFAULT_MODEL = 'jev-latest';

export interface JevDecision {
  candidateId: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export class JevError extends Error {
  status?: number;
  constructor(msg: string, status?: number) {
    super(msg);
    this.status = status;
  }
}

// 把棋盘压缩成文本描述（供 Jev 评估）
function describeBoard(board: Board) {
  const m: BoardMetrics = boardMetrics(board);
  // 20 行的位图（# 填充，. 空），从上到下
  const bitmap: string[] = [];
  for (let y = ROWS - 1; y >= 0; y--) {
    let row = '';
    for (let x = 0; x < COLS; x++) row += board[y][x] !== 0 ? '#' : '.';
    bitmap.push(row);
  }
  return {
    column_heights: m.columnHeights,
    max_height: m.maxHeight,
    holes: m.holes,
    bumpiness: m.bumpiness,
    bitmap_top_to_bottom: bitmap,
  };
}

function describeCandidate(p: Placement, id: string) {
  return {
    id,
    rotation: p.rot,
    column: p.x,
    lines_cleared: p.linesCleared,
    landing_height: Math.round(p.landingHeight * 10) / 10,
    resulting_holes: p.metrics.holes,
    resulting_max_height: p.metrics.maxHeight,
    resulting_bumpiness: p.metrics.bumpiness,
    heuristic_rank_score: Math.round(p.score * 100) / 100,
  };
}

/**
 * 请求 Jev 在给定候选落点中选择一个。
 * @throws JevError 网络/鉴权/超时等错误
 */
export async function jevChoosePlacement(
  config: JevConfig,
  board: Board,
  piece: PieceType,
  candidates: Placement[],
  signal?: AbortSignal,
): Promise<JevDecision> {
  if (!config.apiKey) throw new JevError('未配置 Jev API Key');

  const ids = candidates.map((_, i) => `candidate_${i + 1}`);
  const state = {
    game: '3D Tetris (10x20 well)',
    objective:
      'Choose the best placement for the current tetromino. Survive long-term: keep the stack low and flat, avoid holes, prefer clearing lines, avoid blocking wells, keep the board open for future pieces.',
    board: describeBoard(board),
    current_piece: piece,
    candidate_placements: candidates.map((c, i) => describeCandidate(c, ids[i])),
  };

  const criteria: Record<string, string> = {};
  candidates.forEach((c, i) => {
    criteria[ids[i]] =
      `Rotation ${c.rot}, column ${c.x}: clears ${c.linesCleared} line(s), ` +
      `leaves ${c.metrics.holes} hole(s), max height ${c.metrics.maxHeight}, bumpiness ${c.metrics.bumpiness}.`;
  });

  const body = {
    // 浏览器请求发往本站同源代理 /api/jev/systemone，由后端携带 Key 转发到上游，
    // 避开浏览器跨域限制；endpoint 为上游 Jev API 地址，可在设置中修改。
    apiKey: config.apiKey.trim(),
    endpoint: (config.endpoint || JEV_DEFAULT_ENDPOINT).trim(),
    model: config.model || JEV_DEFAULT_MODEL,
    state,
    questions: {
      best_move: {
        type: 'choice',
        instructions:
          'You are an expert Tetris player. Given the board state and the candidate placements for the current piece, choose the single best placement for long-term survival and line clears.',
        criteria,
      },
    },
  };

  let res: Response;
  try {
    res = await fetch('/api/jev/systemone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    throw new JevError(`网络请求失败：${e?.message ?? e}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new JevError(`Jev API 返回 HTTP ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`, res.status);
  }

  const json = await res.json();
  const ans = json?.answers?.best_move;
  if (!ans || typeof ans.choice !== 'string') {
    throw new JevError('Jev 响应格式异常：缺少 answers.best_move.choice');
  }
  const idx = ids.indexOf(ans.choice);
  if (idx < 0) throw new JevError(`Jev 返回了未知候选：${ans.choice}`);
  return {
    candidateId: ans.choice,
    confidence: typeof ans.confidence === 'number' ? ans.confidence : 0,
    probabilities: ans.probabilities ?? {},
  };
}

/** 从候选 id 找到下标 */
export function candidateIndex(candidateId: string): number {
  const m = /candidate_(\d+)/.exec(candidateId);
  return m ? parseInt(m[1], 10) - 1 : -1;
}

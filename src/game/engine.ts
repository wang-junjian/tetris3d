// 游戏引擎：驱动游戏循环、人机两种模式、Jev/内置 AI 决策与动作执行
import {
  emptyBoard, spawnPiece, collides, tryMove, tryRotate,
  ghostY, lockPiece, fullRows, clearRows, isTopOut, Bag, scoreFor, levelFor, gravityMs,
} from './tetris';
import type { Board, ActivePiece, PieceType } from './tetris';
import { bestPlacement, topPlacements } from './ai';
import type { Placement } from './ai';
import { jevChoosePlacement, candidateIndex } from './jev';
import type { JevConfig } from './jev';

export type GameStatus = 'idle' | 'playing' | 'clearing' | 'paused' | 'gameover';
export type PlayMode = 'human' | 'ai';
export type AiEngine = 'builtin' | 'jev';

export interface Stats { score: number; lines: number; level: number; pieces: number; }

export interface EngineEvents {
  onRender: (board: Board, active: ActivePiece | null, ghost: number | null) => void;
  onStats: (s: Stats) => void;
  onQueue: (q: PieceType[]) => void;
  onStatus: (s: GameStatus) => void;
  onAiLog: (msg: string) => void;
  onLineClear: (rows: number[]) => void; // 开始消行动画
  onGameOver: (score: number) => void;
}

const CLEAR_ANIM_MS = 380;
const JEV_CONFIDENCE_THRESHOLD = 0.4;
const JEV_CANDIDATES = 6;

export class GameEngine {
  board: Board = emptyBoard();
  active: ActivePiece | null = null;
  status: GameStatus = 'idle';
  mode: PlayMode = 'human';
  aiEngine: AiEngine = 'builtin';
  aiStepMs = 200;
  stats: Stats = { score: 0, lines: 0, level: 1, pieces: 0 };

  private bag = new Bag();
  private queue: PieceType[] = [];
  private gravityAcc = 0;
  private aiAcc = 0;
  private plan: { rot: number; x: number } | null = null;
  private deciding = false;
  private jevAbort: AbortController | null = null;
  private jevConfig: JevConfig = { apiKey: '', endpoint: '', model: '' };
  private decisionToken = 0;
  private ev: EngineEvents;

  constructor(ev: EngineEvents) { this.ev = ev; }

  setJevConfig(c: JevConfig) { this.jevConfig = c; }
  setMode(m: PlayMode) {
    this.mode = m;
    this.plan = null;
    this.deciding = false;
    this.jevAbort?.abort();
    // 人类 → AI 中途切换：当前方块还没有决策计划，立即为它在位决策
    if (m === 'ai' && this.status === 'playing' && this.active) {
      this.decideAi(this.active);
    }
  }
  setAiEngine(e: AiEngine) { this.aiEngine = e; }

  start() {
    this.jevAbort?.abort();
    this.board = emptyBoard();
    this.bag = new Bag();
    this.queue = [];
    this.stats = { score: 0, lines: 0, level: 1, pieces: 0 };
    this.gravityAcc = 0;
    this.plan = null;
    this.deciding = false;
    this.decisionToken++;
    this.status = 'playing';
    while (this.queue.length < 4) this.queue.push(this.bag.next());
    this.ev.onStats(this.stats);
    this.ev.onStatus(this.status);
    this.spawn();
  }

  pause() {
    if (this.status === 'playing') { this.status = 'paused'; this.ev.onStatus(this.status); }
    else if (this.status === 'paused') { this.status = 'playing'; this.ev.onStatus(this.status); }
  }

  stop() {
    this.status = 'idle';
    this.active = null;
    this.jevAbort?.abort();
    this.ev.onStatus(this.status);
    this.emitRender();
  }

  private pushQueue(): PieceType {
    while (this.queue.length < 4) this.queue.push(this.bag.next());
    const t = this.queue.shift()!;
    while (this.queue.length < 4) this.queue.push(this.bag.next());
    this.ev.onQueue([...this.queue]);
    return t;
  }

  private spawn() {
    const type = this.pushQueue();
    const p = spawnPiece(type);
    if (collides(this.board, p.type, p.rot, p.x, p.y)) {
      this.active = p;
      this.emitRender();
      this.gameOver();
      return;
    }
    this.active = p;
    this.plan = null;
    this.gravityAcc = 0;
    this.emitRender();
    if (this.mode === 'ai') this.decideAi(p);
  }

  private async decideAi(piece: ActivePiece) {
    if (this.deciding) return;
    this.deciding = true;
    const token = ++this.decisionToken;
    const boardSnapshot = this.board.map((r) => r.slice());
    const type = piece.type;

    if (this.aiEngine === 'jev' && this.jevConfig.apiKey) {
      this.ev.onAiLog(`JEV ▶ 正在评估 ${type} 方块候选落点…`);
      this.jevAbort = new AbortController();
      const timeout = setTimeout(() => this.jevAbort?.abort(), 12000);
      try {
        const candidates = topPlacements(boardSnapshot, type, JEV_CANDIDATES);
        if (candidates.length === 0) throw new Error('无可用落点');
        const decision = await jevChoosePlacement(
          this.jevConfig, boardSnapshot, type, candidates, this.jevAbort.signal,
        );
        clearTimeout(timeout);
        const idx = candidateIndex(decision.candidateId);
        const chosen = candidates[idx];
        if (chosen && decision.confidence >= JEV_CONFIDENCE_THRESHOLD) {
          this.plan = { rot: chosen.rot, x: chosen.x };
          this.ev.onAiLog(
            `JEV ✓ 选择候选 #${idx + 1}（旋转 ${chosen.rot}，列 ${chosen.x}），置信度 ${decision.confidence.toFixed(2)}`,
          );
        } else if (chosen) {
          this.plan = { rot: chosen.rot, x: chosen.x };
          this.ev.onAiLog(`JEV ~ 置信度 ${decision.confidence.toFixed(2)} 偏低，仍采用其选择`);
        } else {
          throw new Error('候选匹配失败');
        }
      } catch (e: any) {
        clearTimeout(timeout);
        if (e?.name === 'AbortError') {
          this.ev.onAiLog('JEV ✕ 请求超时，回退内置启发式引擎');
        } else {
          this.ev.onAiLog(`JEV ✕ ${e?.message ?? e}，回退内置启发式引擎`);
        }
        const best = bestPlacement(boardSnapshot, type);
        if (best) this.plan = { rot: best.rot, x: best.x };
      }
    } else {
      const best: Placement | null = bestPlacement(boardSnapshot, type);
      if (best) {
        this.plan = { rot: best.rot, x: best.x };
        if (this.aiEngine === 'jev') {
          this.ev.onAiLog('JEV ! 未配置 API Key，使用内置启发式引擎（设置中可配置 Key）');
        } else {
          this.ev.onAiLog(`AI ▶ 内置引擎选择：旋转 ${best.rot}，列 ${best.x}`);
        }
      }
    }
    // 决策返回时若已重开/换块（令牌失效），丢弃陈旧计划
    if (token !== this.decisionToken) {
      this.plan = null;
      this.deciding = false;
      return;
    }
    this.deciding = false;
  }

  private emitRender() {
    this.ev.onRender(
      this.board,
      this.active,
      this.active ? ghostY(this.board, this.active) : null,
    );
  }

  // 人类输入
  humanMove(dx: number) { if (this.canControl()) { const n = tryMove(this.board, this.active!, dx, 0); if (n) { this.active = n; this.emitRender(); } } }
  humanRotate(dir: 1 | -1) { if (this.canControl()) { const n = tryRotate(this.board, this.active!, dir); if (n) { this.active = n; this.emitRender(); } } }
  humanSoftDrop(): boolean {
    if (!this.canControl()) return false;
    const n = tryMove(this.board, this.active!, 0, -1);
    if (n) { this.active = n; this.emitRender(); return true; }
    this.lockCurrent();
    return false;
  }
  humanHardDrop() {
    if (!this.canControl()) return;
    const y = ghostY(this.board, this.active!);
    this.active = { ...this.active!, y };
    this.lockCurrent();
  }
  private canControl() {
    return this.status === 'playing' && this.mode === 'human' && this.active && !this.deciding;
  }

  private lockCurrent() {
    if (!this.active) return;
    this.board = lockPiece(this.board, this.active);
    this.stats.pieces++;
    this.active = null;
    const rows = fullRows(this.board);
    if (rows.length > 0) {
      this.status = 'clearing';
      this.ev.onStatus(this.status);
      this.emitRender();
      this.ev.onLineClear(rows);
      window.setTimeout(() => {
        this.board = clearRows(this.board, rows);
        this.stats.lines += rows.length;
        this.stats.score += scoreFor(rows.length, this.stats.level);
        this.stats.level = levelFor(this.stats.lines);
        this.ev.onStats(this.stats);
        if (this.status === 'clearing') {
          this.status = 'playing';
          this.ev.onStatus(this.status);
        }
        if (isTopOut(this.board)) { this.gameOver(); return; }
        this.spawn();
      }, CLEAR_ANIM_MS);
    } else {
      if (isTopOut(this.board)) { this.emitRender(); this.gameOver(); return; }
      this.spawn();
    }
  }

  private gameOver() {
    this.status = 'gameover';
    this.active = null;
    this.jevAbort?.abort();
    this.ev.onStatus(this.status);
    this.emitRender();
    this.ev.onGameOver(this.stats.score);
  }

  /** 主循环 tick，dtMs 为距上次的时间 */
  tick(dtMs: number) {
    if (this.status !== 'playing' || !this.active) return;

    if (this.mode === 'ai') {
      // 等待决策；若无计划且未在决策中（如暂停恢复、中途切换），自愈触发一次决策
      if (!this.plan) {
        if (!this.deciding && this.active) this.decideAi(this.active);
        return;
      }
      this.aiAcc += dtMs;
      while (this.aiAcc >= this.aiStepMs && this.plan && this.active) {
        this.aiAcc -= this.aiStepMs;
        this.execAiStep();
      }
      return;
    }

    // 人类模式重力
    this.gravityAcc += dtMs;
    const g = gravityMs(this.stats.level);
    while (this.gravityAcc >= g) {
      this.gravityAcc -= g;
      const n = tryMove(this.board, this.active, 0, -1);
      if (n) { this.active = n; this.emitRender(); }
      else { this.lockCurrent(); break; }
    }
  }

  private execAiStep() {
    if (!this.active || !this.plan) return;
    // 1. 旋转到位
    if (this.active.rot !== this.plan.rot) {
      let diff = (this.plan.rot - this.active.rot + 4) % 4;
      const dir: 1 | -1 = diff <= 2 ? 1 : -1;
      const n = tryRotate(this.board, this.active, dir);
      if (n) { this.active = n; this.emitRender(); return; }
      // 旋转失败，放弃旋转直接进入移动
      this.plan.rot = this.active.rot;
      return;
    }
    // 2. 水平移动到位
    if (this.active.x !== this.plan.x) {
      const dx = Math.sign(this.plan.x - this.active.x);
      const n = tryMove(this.board, this.active, dx, 0);
      if (n) { this.active = n; this.emitRender(); return; }
      // 被挡住，直接落
    }
    // 3. 硬降
    const y = ghostY(this.board, this.active);
    this.active = { ...this.active, y };
    this.emitRender();
    this.plan = null;
    this.lockCurrent();
  }
}

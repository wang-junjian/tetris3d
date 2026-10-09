// 验收 A1~A3：AI 逻辑级测试。运行：npx vite-node verifier/v1/logic-test.ts
import {
  emptyBoard, spawnPiece, collides, Bag,
} from '../../src/game/tetris';
import { enumeratePlacements, bestPlacement, boardMetrics } from '../../src/game/ai';

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} :: ${detail}`);
  if (!ok) failures++;
}

// A2 落点枚举合理性
const tCount = enumeratePlacements(emptyBoard(), 'T').length;
check('A2 空板T候选数 30~40', tCount >= 30 && tCount <= 40, `count=${tCount}`);

// A1 内置引擎存活（5 局取中位数，消除单局随机性）
const trials: number[] = [];
let lastMetrics = boardMetrics(emptyBoard());
for (let trial = 0; trial < 5; trial++) {
  const bag = new Bag();
  let b = emptyBoard();
  let alive = 0;
  for (let i = 0; i < 300; i++) {
    const t = bag.next();
    const sp = spawnPiece(t);
    if (collides(b, sp.type, sp.rot, sp.x, sp.y)) break;
    const bp = bestPlacement(b, t);
    if (!bp) break;
    b = bp.board;
    alive++;
  }
  trials.push(alive);
  if (alive >= 300) lastMetrics = boardMetrics(b);
}
trials.sort((a, b) => a - b);
const median = trials[2];
check('A1 内置引擎存活中位数≥300块', median >= 300, `trials=${trials.join(',')} median=${median}`);
check('A1 存活局终盘 maxHeight≤12', lastMetrics.maxHeight <= 12, `maxHeight=${lastMetrics.maxHeight}`);
check('A1 存活局终盘 holes≤10', lastMetrics.holes <= 10, `holes=${lastMetrics.holes}`);

// A3 两种引擎的 plan 生成路径（Jev 无 key 时回退内置，此处验证决策源均有落点）
const pT = bestPlacement(emptyBoard(), 'T');
const pI = bestPlacement(emptyBoard(), 'I');
check('A3 决策产生有效 plan', !!pT && !!pI && !collides(emptyBoard(), 'T', pT!.rot, pT!.x, pT!.y),
  `T→(rot=${pT?.rot},x=${pT?.x}) I→(rot=${pI?.rot},x=${pI?.x})`);

process.exit(failures === 0 ? 0 : 1);

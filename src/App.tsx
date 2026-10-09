import { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine } from '@/game/engine';
import type { Stats, GameStatus, PlayMode } from '@/game/engine';
import { PIECE_COLORS, shapeCells } from '@/game/tetris';
import type { PieceType } from '@/game/tetris';
import { TetrisScene } from '@/three/TetrisScene';
import { SettingsDialog, loadSettings, saveSettings } from '@/components/SettingsDialog';
import type { AppSettings } from '@/components/SettingsDialog';
import { HelpDialog } from '@/components/HelpDialog';
import { Button } from '@/components/ui/button';

function cssColor(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function NextPreview({ types }: { types: PieceType[] }) {
  return (
    <div className="space-y-3">
      {types.slice(0, 3).map((t, i) => {
        const cells = shapeCells(t, 0);
        const color = cssColor(PIECE_COLORS[t]);
        return (
          <div key={i} className={`grid grid-cols-4 gap-[3px] w-fit ${i > 0 ? 'opacity-50 scale-90 origin-left' : ''}`}>
            {Array.from({ length: 8 }).map((_, k) => {
              const x = k % 4;
              const y = 1 - Math.floor(k / 4);
              const filled = cells.some(([cx, cy]) => cx === x && cy === y);
              return (
                <div
                  key={k}
                  className="w-3.5 h-3.5"
                  style={{
                    background: filled ? color : 'transparent',
                    boxShadow: filled ? `0 0 8px ${color}` : 'none',
                  }}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stats, setStats] = useState<Stats>({ score: 0, lines: 0, level: 1, pieces: 0 });
  const [queue, setQueue] = useState<PieceType[]>([]);
  const [status, setStatus] = useState<GameStatus>('idle');
  const [aiLog, setAiLog] = useState<string[]>([]);
  const [best, setBest] = useState<number>(() => Number(localStorage.getItem('tetris3d.best') ?? 0));

  const pushLog = useCallback((msg: string) => {
    setAiLog((prev) => {
      if (prev.length > 0 && prev[prev.length - 1] === msg) return prev;
      return [...prev.slice(-5), msg];
    });
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;
    const scene = new TetrisScene(mountRef.current);

    const engine = new GameEngine({
      onRender: (board, active, ghost) => scene.sync(board, active, ghost),
      onStats: setStats,
      onQueue: setQueue,
      onStatus: setStatus,
      onAiLog: pushLog,
      onLineClear: (rows) => scene.flashRows(rows),
      onGameOver: (score) => {
        setBest((b) => {
          const nb = Math.max(b, score);
          localStorage.setItem('tetris3d.best', String(nb));
          return nb;
        });
      },
    });
    engineRef.current = engine;

    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      engine.tick(now - last);
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      engine.stop();
      scene.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 同步设置到引擎
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    e.setJevConfig({ apiKey: settings.apiKey, endpoint: settings.endpoint, model: settings.model });
    e.setAiEngine(settings.aiEngine);
    e.aiStepMs = settings.aiSpeed;
    e.setMode(settings.mode);
  }, [settings]);

  // 键盘控制
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const e = engineRef.current;
      if (!e) return;
      if (ev.key === 'Enter') {
        if (e.status === 'idle' || e.status === 'gameover') e.start();
        return;
      }
      if (ev.key === 'p' || ev.key === 'P') { e.pause(); return; }
      if (e.mode !== 'human') return;
      switch (ev.key) {
        case 'ArrowLeft': e.humanMove(-1); ev.preventDefault(); break;
        case 'ArrowRight': e.humanMove(1); ev.preventDefault(); break;
        case 'ArrowDown': e.humanSoftDrop(); ev.preventDefault(); break;
        case 'ArrowUp': case 'x': case 'X': e.humanRotate(1); ev.preventDefault(); break;
        case 'z': case 'Z': e.humanRotate(-1); ev.preventDefault(); break;
        case ' ': e.humanHardDrop(); ev.preventDefault(); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSaveSettings = (s: AppSettings) => {
    setSettings(s);
    saveSettings(s);
  };

  const startOrRestart = () => engineRef.current?.start();
  const togglePause = () => engineRef.current?.pause();
  const setMode = (m: PlayMode) =>
    setSettings((s) => { const ns = { ...s, mode: m }; saveSettings(ns); return ns; });

  const statusLabel: Record<GameStatus, string> = {
    idle: '待命', playing: '进行中', clearing: '消行', paused: '已暂停', gameover: '游戏结束',
  };

  const modeToggle = (compact = false) => (
    <div className="flex gap-1">
      {(['human', 'ai'] as PlayMode[]).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className={`flex-1 ${compact ? 'px-2 py-1 text-[9px]' : 'px-2 py-1.5 text-[10px]'} font-pixel border transition-colors ${
            settings.mode === m
              ? 'border-[#c6d32d] text-[#c6d32d] bg-[#c6d32d]/10'
              : 'border-[#5660ff]/30 text-[#9aa0d0] hover:border-[#5660ff]'
          }`}
        >
          {m === 'human' ? '人类' : 'AI'}
        </button>
      ))}
    </div>
  );

  const touchBtn =
    'w-14 h-12 panel text-[#c9ceff] font-pixel text-xs active:bg-[#3834ff]/30 select-none';

  return (
    <div className="dot-grid relative h-full w-full overflow-hidden">
      {/* 3D 画布 */}
      <div ref={mountRef} className="absolute inset-0 touch-none" />

      {/* 顶栏 */}
      <header className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 md:px-5 py-2.5 md:py-3 pointer-events-none">
        <div className="pointer-events-auto">
          <h1 className="font-pixel text-[12px] md:text-base neon-text text-white">
            TETRIS<span className="text-[#5660ff]">·</span>3D
          </h1>
          <p className="hidden md:block text-[10px] tracking-[0.3em] text-[#7c86ff] mt-1">POWERED BY JEV · SYSTEM ONE</p>
        </div>
        <div className="flex gap-1.5 md:gap-2 pointer-events-auto">
          <Button
            size="sm"
            onClick={startOrRestart}
            className="bg-[#3834ff] hover:bg-[#4a46ff] text-white font-pixel text-[8px] md:text-[9px] h-7 md:h-8 px-2.5 md:px-3"
          >
            {status === 'playing' || status === 'paused' || status === 'clearing' ? '重开' : '开始'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={togglePause}
            disabled={status !== 'playing' && status !== 'paused'}
            className="border-[#5660ff]/50 text-[#c9ceff] bg-transparent hover:bg-[#3834ff]/20 font-pixel text-[8px] md:text-[9px] h-7 md:h-8 px-2.5 md:px-3"
          >
            {status === 'paused' ? '继续' : '暂停'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setHelpOpen(true)}
            className="border-[#5660ff]/50 text-[#c9ceff] bg-transparent hover:bg-[#3834ff]/20 font-pixel text-[8px] md:text-[9px] h-7 md:h-8 px-2.5 md:px-3"
          >
            帮助
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSettingsOpen(true)}
            className="border-[#5660ff]/50 text-[#c9ceff] bg-transparent hover:bg-[#3834ff]/20 font-pixel text-[8px] md:text-[9px] h-7 md:h-8 px-2.5 md:px-3"
          >
            设置
          </Button>
        </div>
      </header>

      {/* 移动端顶部数据条（桌面端隐藏） */}
      <div className="md:hidden absolute top-12 left-3 right-3 panel px-3 py-2">
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="panel-title">Score</p>
            <p className="font-pixel text-[11px] text-white mt-0.5">{stats.score}</p>
          </div>
          <div>
            <p className="panel-title">Lines</p>
            <p className="font-pixel text-[11px] text-[#c6d32d] mt-0.5">{stats.lines}</p>
          </div>
          <div>
            <p className="panel-title">Level</p>
            <p className="font-pixel text-[11px] text-[#ff624d] mt-0.5">{stats.level}</p>
          </div>
          <div>
            <p className="panel-title">Best</p>
            <p className="font-pixel text-[11px] text-[#ffa7f0] mt-0.5">{best}</p>
          </div>
        </div>
        <div className="mt-2">{modeToggle(true)}</div>
      </div>

      {/* 桌面端左侧 HUD */}
      <aside className="hidden md:block absolute left-5 top-24 space-y-4 w-44">
        <div className="panel p-3">
          <p className="panel-title">Score</p>
          <p className="font-pixel text-lg text-white mt-1">{stats.score}</p>
        </div>
        <div className="panel p-3 grid grid-cols-2 gap-2">
          <div>
            <p className="panel-title">Lines</p>
            <p className="font-pixel text-sm text-[#c6d32d] mt-1">{stats.lines}</p>
          </div>
          <div>
            <p className="panel-title">Level</p>
            <p className="font-pixel text-sm text-[#ff624d] mt-1">{stats.level}</p>
          </div>
          <div>
            <p className="panel-title">Pieces</p>
            <p className="font-pixel text-sm text-[#f3f3f3] mt-1">{stats.pieces}</p>
          </div>
          <div>
            <p className="panel-title">Best</p>
            <p className="font-pixel text-sm text-[#ffa7f0] mt-1">{best}</p>
          </div>
        </div>
        <div className="panel p-3">
          <p className="panel-title">Mode</p>
          <div className="mt-2">{modeToggle()}</div>
          <p className="text-[10px] text-[#6a70a8] mt-2">
            引擎：{settings.aiEngine === 'jev' ? (settings.apiKey ? 'JEV 模型' : 'JEV（未配 Key → 内置）') : '内置启发式'}
          </p>
          <p className="text-[10px] text-[#6a70a8]">状态：{statusLabel[status]}</p>
        </div>
      </aside>

      {/* 桌面端右侧 HUD */}
      <aside className="hidden md:block absolute right-5 top-24 space-y-4 w-48">
        <div className="panel p-3">
          <p className="panel-title">Next</p>
          <div className="mt-2"><NextPreview types={queue} /></div>
        </div>
        <div className="panel p-3">
          <p className="panel-title">AI Log</p>
          <div className="mt-2 space-y-1 min-h-[72px]">
            {aiLog.length === 0 && <p className="text-[10px] text-[#6a70a8]">— 等待决策 —</p>}
            {aiLog.map((l, i) => (
              <p key={`${i}-${l.slice(0, 8)}`} className="text-[10px] leading-relaxed text-[#b9c0ff] break-all">{l}</p>
            ))}
          </div>
        </div>
      </aside>

      {/* 移动端：数据抽屉按钮 */}
      <button
        onClick={() => setDrawerOpen((v) => !v)}
        className="md:hidden absolute right-3 bottom-36 panel px-3 py-2 font-pixel text-[9px] text-[#c9ceff] z-20"
      >
        {drawerOpen ? '收起 ▸' : '◂ NEXT/LOG'}
      </button>

      {/* 移动端：NEXT / AI LOG 抽屉 */}
      <div
        className={`md:hidden absolute top-[104px] right-0 bottom-0 w-44 p-3 space-y-4 bg-[#06081e]/90 backdrop-blur border-l border-[#5660ff]/30 transition-transform duration-300 z-10 ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="panel p-3">
          <p className="panel-title">Next</p>
          <div className="mt-2"><NextPreview types={queue} /></div>
        </div>
        <div className="panel p-3">
          <p className="panel-title">AI Log</p>
          <div className="mt-2 space-y-1">
            {aiLog.length === 0 && <p className="text-[10px] text-[#6a70a8]">— 等待决策 —</p>}
            {aiLog.map((l, i) => (
              <p key={`${i}-${l.slice(0, 8)}`} className="text-[10px] leading-relaxed text-[#b9c0ff] break-all">{l}</p>
            ))}
          </div>
        </div>
      </div>

      {/* 移动端：触屏操作（人类模式） */}
      {settings.mode === 'human' && status === 'playing' && (
        <div className="md:hidden absolute bottom-4 inset-x-0 flex justify-center gap-2 z-10">
          <button className={touchBtn} onClick={() => engineRef.current?.humanMove(-1)}>◀</button>
          <button className={touchBtn} onClick={() => engineRef.current?.humanRotate(1)}>⟳</button>
          <button className={touchBtn} onClick={() => engineRef.current?.humanSoftDrop()}>▼</button>
          <button className={touchBtn} onClick={() => engineRef.current?.humanHardDrop()}>⤓</button>
          <button className={touchBtn} onClick={() => engineRef.current?.humanMove(1)}>▶</button>
        </div>
      )}

      {/* 桌面端底部操作提示 */}
      <footer className="hidden md:flex absolute bottom-3 left-0 right-0 justify-center pointer-events-none">
        <p className="text-[10px] tracking-widest text-[#6a70a8]">
          ← → 移动 · ↑/X 旋转 · Z 反转 · ↓ 软降 · SPACE 硬降 · P 暂停 · ENTER 开始 · 拖动画面旋转视角
        </p>
      </footer>

      {/* 中央覆盖层 */}
      {(status === 'idle' || status === 'gameover' || status === 'paused') && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#030412]/60 backdrop-blur-[2px] pointer-events-none">
          <div className="text-center space-y-5 pointer-events-auto px-6">
            {status === 'gameover' ? (
              <>
                <p className="font-pixel text-xl md:text-2xl text-[#ff624d] neon-text">GAME OVER</p>
                <p className="font-pixel text-sm text-white">SCORE {stats.score}</p>
              </>
            ) : status === 'paused' ? (
              <p className="font-pixel text-lg md:text-xl text-[#c6d32d] neon-text">PAUSED</p>
            ) : (
              <>
                <p className="font-pixel text-lg md:text-xl text-white neon-text">TETRIS·3D</p>
                <p className="text-xs text-[#9aa0d0]">点击「开始」或按 ENTER</p>
              </>
            )}
            <Button
              onClick={status === 'paused' ? togglePause : startOrRestart}
              className="bg-[#3834ff] hover:bg-[#4a46ff] text-white font-pixel text-[10px] px-8"
            >
              {status === 'paused' ? '继续' : status === 'gameover' ? '再来一局' : '开始游戏'}
            </Button>
          </div>
        </div>
      )}

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSave={handleSaveSettings}
      />
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

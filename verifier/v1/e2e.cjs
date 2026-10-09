// 验收 B1~B3 + C1 + 视觉截图。前置：生产服务运行于 http://localhost:3000
// 运行：node verifier/v1/e2e.cjs
const { chromium } = require('playwright-core');
const path = require('path');

const BASE = 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'runs');
const KEY = process.env.JEV_TEST_KEY || '';
let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} :: ${detail}`);
  if (!ok) failures++;
};

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--use-gl=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message));

  const readStat = async (label) => {
    return page.$$eval('aside p', (ps, lb) => {
      const el = ps.find(p => p.textContent.trim() === lb);
      return el && el.nextElementSibling ? el.nextElementSibling.textContent.trim() : null;
    }, label);
  };
  const readLogs = () => page.$$eval('p',
    ps => ps.map(p => p.textContent).filter(t => t && (t.includes('JEV') || t.includes('AI'))));

  // ---------- C1：默认 AI 速度 200ms ----------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.click('button:has-text("设置")');
  await page.waitForTimeout(600);
  const speedText = await page.locator('text=/AI 动作速度：\\d+ms/').first().textContent();
  check('C1 AI 默认 200ms/步', speedText.includes('200ms'), speedText.trim());
  await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(OUT, 'v1-idle.png') });

  // ---------- B1：内置引擎实战 ----------
  await page.evaluate(() => {
    localStorage.setItem('tetris3d.settings.v1', JSON.stringify({
      apiKey: '', endpoint: 'https://api.typesafe.ai/v1/systemone',
      model: 'jev-latest', aiEngine: 'builtin', aiSpeed: 60, mode: 'ai',
    }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.click('button:text-is("开始游戏")');
  await page.waitForTimeout(20000);
  const pieces1 = parseInt(await readStat('Pieces') || '0', 10);
  const score1 = parseInt(await readStat('Score') || '0', 10);
  check('B1 内置引擎落子≥15', pieces1 >= 15, `pieces=${pieces1}`);
  check('B1 内置引擎分数≥0', score1 >= 0, `score=${score1}`);
  await page.screenshot({ path: path.join(OUT, 'v1-ai-builtin.png') });

  // ---------- B2：Jev 引擎实战 ----------
  if (KEY) {
    await page.evaluate((k) => {
      localStorage.setItem('tetris3d.settings.v1', JSON.stringify({
        apiKey: k, endpoint: 'https://api.typesafe.ai/v1/systemone',
        model: 'jev-latest', aiEngine: 'jev', aiSpeed: 200, mode: 'ai',
      }));
    }, KEY);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.click('button:text-is("开始游戏")');
    await page.waitForTimeout(25000);
    const logs = await readLogs();
    const okCount = logs.filter(l => l.includes('JEV ✓')).length;
    check('B2 Jev 真实决策≥1次', okCount >= 1, `JEV✓=${okCount} 最近=${logs.slice(-2).join(' | ')}`);
    await page.screenshot({ path: path.join(OUT, 'v1-ai-jev.png') });
  } else {
    console.log('SKIP B2（未提供 JEV_TEST_KEY 环境变量）');
  }

  // ---------- B3：无 Key 回退 ----------
  await page.evaluate(() => {
    localStorage.setItem('tetris3d.settings.v1', JSON.stringify({
      apiKey: '', endpoint: 'https://api.typesafe.ai/v1/systemone',
      model: 'jev-latest', aiEngine: 'jev', aiSpeed: 100, mode: 'ai',
    }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.click('button:text-is("开始游戏")');
  await page.waitForTimeout(12000);
  const logs3 = await readLogs();
  const fellBack = logs3.some(l => l.includes('未配置 API Key'));
  const pieces3 = parseInt(await readStat('Pieces') || '0', 10);
  check('B3 无Key回退内置引擎', fellBack && pieces3 >= 3, `回退提示=${fellBack} pieces=${pieces3}`);
  await page.screenshot({ path: path.join(OUT, 'v1-ai-fallback.png') });

  // ---------- B4：人类→AI→人类→AI 中途切换不卡死 ----------
  await page.evaluate(() => {
    localStorage.setItem('tetris3d.settings.v1', JSON.stringify({
      apiKey: '', endpoint: 'https://api.typesafe.ai/v1/systemone',
      model: 'jev-latest', aiEngine: 'builtin', aiSpeed: 80, mode: 'human',
    }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.click('button:text-is("开始游戏")');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Space'); // 人类手动硬降一块
  await page.waitForTimeout(800);
  const p1 = parseInt(await readStat('Pieces') || '0', 10);
  await page.click('button:text-is("AI"):visible'); // 切到 AI
  await page.waitForTimeout(8000);
  const p2 = parseInt(await readStat('Pieces') || '0', 10);
  check('B4 人类→AI 切换后 AI 接管', p2 > p1, `humanPieces=${p1} → aiPieces=${p2}`);
  await page.click('button:text-is("人类"):visible'); // 切回人类
  await page.waitForTimeout(1000);
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  const p3 = parseInt(await readStat('Pieces') || '0', 10);
  await page.click('button:text-is("AI"):visible'); // 再次切回 AI
  await page.waitForTimeout(8000);
  const p4 = parseInt(await readStat('Pieces') || '0', 10);
  check('B4 二次切换仍工作', p4 > p3, `pieces: ${p3} → ${p4}`);
  await page.screenshot({ path: path.join(OUT, 'v1-mode-toggle.png') });

  // ---------- D4：控制台 ----------
  const realErrors = consoleErrors.filter(e => !e.includes('404'));
  check('D4 无控制台错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | ') || 'clean');

  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('E2E ERROR:', e.message); process.exit(2); });

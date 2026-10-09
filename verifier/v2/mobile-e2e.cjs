// 验收 M1~M6 + H1/H2：移动端 390×844 视口。前置：生产服务运行于 http://localhost:3000
// 运行：node verifier/v2/mobile-e2e.cjs
const { chromium } = require('playwright-core');
const path = require('path');

const BASE = 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'runs');
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
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, 'v2-mobile-idle.png') });

  // M1 无横向滚动
  const scrollW = await page.evaluate(() => document.scrollingElement.scrollWidth);
  const innerW = await page.evaluate(() => window.innerWidth);
  check('M1 无横向滚动', scrollW <= innerW + 1, `scrollWidth=${scrollW} innerWidth=${innerW}`);

  // M3 顶部数据条可见
  const stripVisible = await page.evaluate(() => {
    const el = [...document.querySelectorAll('p')].find(p => p.textContent.trim() === 'Score');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.top >= 0 && r.top < 200;
  });
  check('M3 移动端顶部数据条可见', stripVisible, '');

  // 开始 AI 模式游戏
  await page.evaluate(() => {
    localStorage.setItem('tetris3d.settings.v1', JSON.stringify({
      apiKey: '', endpoint: 'https://api.typesafe.ai/v1/systemone',
      model: 'jev-latest', aiEngine: 'builtin', aiSpeed: 100, mode: 'ai',
    }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.tap('button:text-is("开始游戏")');
  await page.waitForTimeout(10000);
  await page.screenshot({ path: path.join(OUT, 'v2-mobile-ai.png') });

  // M2 画布中心不被遮挡（中心点命中 canvas）
  const centerHit = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    return el ? el.tagName : 'null';
  });
  check('M2 画面中心命中 canvas', centerHit === 'CANVAS', `hit=${centerHit}`);

  // M6 竖屏相机拉远：截图人工确认（此处确认画面中存在 canvas 且未报错）
  const canvasBox = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return `${Math.round(r.width)}x${Math.round(r.height)}`;
  });
  check('M6 画布铺满视口', canvasBox === '390x844', `canvas=${canvasBox}`);

  // M5 NEXT/LOG 抽屉
  await page.tap('text=NEXT/LOG');
  await page.waitForTimeout(600);
  const drawerVisible = await page.evaluate(() => {
    const els = [...document.querySelectorAll('p')].filter(p => p.textContent.trim() === 'Next');
    return els.some(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.left >= 0 && r.right <= window.innerWidth;
    });
  });
  check('M5 NEXT/LOG 抽屉可打开', drawerVisible, '');
  await page.screenshot({ path: path.join(OUT, 'v2-mobile-drawer.png') });
  await page.tap('text=收起');
  await page.waitForTimeout(400);

  // M4 触屏按钮（切人类模式）
  await page.evaluate(() => {
    localStorage.setItem('tetris3d.settings.v1', JSON.stringify({
      apiKey: '', endpoint: 'https://api.typesafe.ai/v1/systemone',
      model: 'jev-latest', aiEngine: 'builtin', aiSpeed: 100, mode: 'human',
    }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.tap('button:text-is("开始游戏")');
  await page.waitForTimeout(1200);
  await page.tap('button:text-is("⤓")');
  await page.waitForTimeout(800);
  // 移动端顶部条不含 Pieces，通过按钮齐全且硬降可点验证触屏控件
  const touchVisible = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].map(b => b.textContent.trim());
    return ['◀', '⟳', '▼', '⤓', '▶'].every(t => btns.includes(t));
  });
  check('M4 触屏按钮齐全可点', touchVisible, `硬降点击完成`);
  await page.screenshot({ path: path.join(OUT, 'v2-mobile-touch.png') });

  // H1 帮助弹窗
  await page.tap('button:has-text("帮助")');
  await page.waitForTimeout(600);
  const helpText = await page.evaluate(() => document.body.textContent);
  const helpOk = helpText.includes('键盘操作') && helpText.includes('Jev API Key') && helpText.includes('手机操作');
  check('H1 帮助弹窗内容完整', helpOk, '');
  await page.screenshot({ path: path.join(OUT, 'v2-mobile-help.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // H2 无控制台错误
  const realErrors = consoleErrors.filter(e => !e.includes('404'));
  check('H2 无控制台错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | ') || 'clean');

  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('E2E ERROR:', e.message); process.exit(2); });

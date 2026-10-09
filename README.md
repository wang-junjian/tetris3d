# TETRIS·3D — 3D 俄罗斯方块（人类 / AI 双模式）

Three.js 打造的 3D 俄罗斯方块：发光机柜深井、圆角发光体素、消行动画。支持**人类手动**与 **AI 代玩**两种模式，AI 由两种决策引擎驱动：

- **JEV 模型**：接入 TypeSafe 的 Jev（System One）模型，每步把棋盘状态与候选落点发给 Jev 的 Choice 原语，返回最优落点与置信度
- **内置启发式**：本地 Dellacherie 风格评估（空洞 / 高度 / 平整度 / 消行），离线可用，实测 300+ 块不顶出

Jev 请求失败、超时或置信度过低时自动回退内置引擎，游戏不中断。

## 功能

- 人类模式：键盘（←→ 移动 / ↑·X 旋转 / Z 反转 / ↓ 软降 / 空格硬降 / P 暂停）
- 移动端：响应式布局 + 触屏按钮 + NEXT/日志抽屉，竖屏相机自适应
- AI 模式：双引擎可切换，速度可调（默认 200ms/步），决策日志实时可见
- 人机模式可随时中途切换
- API Key 在页面「设置」中配置，仅存浏览器 localStorage，不硬编码

## 技术栈

React 19 + TypeScript + Vite + Tailwind + shadcn/ui · Three.js（Bloom 后期）· Hono 后端（Jev API 代理，解决浏览器 CORS）

## 本地运行

```bash
npm install
npm run dev        # http://localhost:3000
```

生产：

```bash
npm run build
npm start          # http://localhost:3000
```

Docker：

```bash
docker build -t tetris3d .
docker run -p 3000:3000 --env-file .env tetris3d
```

## 配置 Jev API Key

打开页面右上角「设置」，粘贴你的 Jev API Key 并保存即可（Key 只存在你自己浏览器的 localStorage）。AI 决策请求经本站后端 `/api/jev/systemone` 代理转发至 Jev API，服务端不存储、不记录 Key。

## 自部署环境变量

复制 `.env.example` 为 `.env`。其中 `APP_ID / APP_SECRET / DATABASE_URL / KIMI_*` 是平台模板变量——本应用的 Kimi 登录与数据库功能未启用，自部署时填入任意占位值即可通过启动检查。

## 验收测试

`verifier/` 目录内置验收套件（逻辑存活测试、桌面/移动端端到端、模式切换回归）：

```bash
npx vite-node verifier/v1/logic-test.ts          # AI 逻辑级测试
node verifier/v1/e2e.cjs                          # 桌面端到端（需先 npm start）
node verifier/v2/mobile-e2e.cjs                   # 移动端端到端
# Jev 真实 API 用例：JEV_TEST_KEY=<你的key> node verifier/v1/e2e.cjs
```

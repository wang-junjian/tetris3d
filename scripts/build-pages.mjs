// GitHub Pages 静态站点构建
//
// GitHub Pages 只能托管静态文件，本项目的 Hono 后端（/api/*）不会被部署。
// 因此这里只做三件事：
//   1. 用指定 base 跑 vite build（项目站点位于 https://<user>.github.io/<repo>/，
//      默认 base 为 '/' 会让所有资源 404，必须写成仓库子路径）；
//   2. 把 dist/public 组装成 dist/pages（CI 直接上传这个目录）；
//   3. 补 .nojekyll（跳过 Jekyll，保证 _ 开头的资源不被吞）、404.html（SPA 回退）
//      和 build.txt（线上可核对是否为最新提交）。
//
// 用法：
//   node scripts/build-pages.mjs                    # 默认 base=/tetris3d/
//   VITE_BASE=/ npm run build:pages                 # 部署到自定义域名根路径时
import { build } from 'vite';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const base = process.env.VITE_BASE || '/tetris3d/';
const srcDir = resolve(root, 'dist/public');
const outDir = resolve(root, 'dist/pages');

console.log(`[pages] base = ${base}`);

await rm(outDir, { recursive: true, force: true });
await build({ root, base });

const indexHtml = resolve(srcDir, 'index.html');
if (!existsSync(indexHtml)) {
  throw new Error(`[pages] 构建失败：未找到 ${indexHtml}`);
}

await mkdir(outDir, { recursive: true });
await cp(srcDir, outDir, { recursive: true });

await writeFile(resolve(outDir, '.nojekyll'), '');
await cp(indexHtml, resolve(outDir, '404.html'));
await writeFile(
  resolve(outDir, 'build.txt'),
  `Playable build of commit ${process.env.GITHUB_SHA ?? 'local'}\n`,
);

console.log(`[pages] 产物已就绪：${outDir}`);

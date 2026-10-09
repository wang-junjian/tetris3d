// Three.js 3D 场景：实心机柜式深井 + 正视可读视角 + 圆角发光体素 + 消行动画
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  COLS, ROWS, ID_TO_PIECE, PIECE_COLORS, shapeCells,
} from '../game/tetris';
import type { Board, ActivePiece, PieceType } from '../game/tetris';

const CELL = 1;
const WELL_W = COLS * CELL;   // 10
const WELL_H = ROWS * CELL;   // 20
const WELL_D = 3.2;

// 调色板（电光蓝主调）
const PALETTE = {
  bg: 0x030412,
  blue: 0x3834ff,
  deepBlue: 0x030fc6,
  panel: 0x0a0f30,
  metal: 0x0d1233,
  lime: 0xc6d32d,
  coral: 0xff624d,
  pink: 0xffa7f0,
};

interface CellMesh { mesh: THREE.Mesh; }

export class TetrisScene {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private cellMeshes = new Map<string, CellMesh>();
  private activeGroup = new THREE.Group();
  private ghostGroup = new THREE.Group();
  private clearingMeshes: THREE.Mesh[] = [];
  private clearT = -1;
  private particles!: THREE.Points;
  private clock = new THREE.Clock();
  private disposed = false;
  private dangerMat!: THREE.MeshStandardMaterial;
  private stackHigh = false;
  private boxGeo = new RoundedBoxGeometry(CELL * 0.94, CELL * 0.94, CELL * 0.94, 3, 0.09);
  private edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(CELL * 0.96, CELL * 0.96, CELL * 0.96));
  private materials = new Map<string, THREE.MeshStandardMaterial>();

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.bg);
    this.scene.fog = new THREE.Fog(PALETTE.bg, 45, 100);

    // 正视为主：水平偏角 ~7°，俯视 ~6°，保证格子位置清晰可辨
    this.camera = new THREE.PerspectiveCamera(
      40, container.clientWidth / container.clientHeight, 0.1, 200,
    );
    this.camera.position.set(4.5, 12.6, 38);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, WELL_H / 2 - 0.5, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 18;
    this.controls.maxDistance = 44;
    // 限制旋转范围：防止视角歪到看不清落点
    this.controls.minAzimuthAngle = -0.5;
    this.controls.maxAzimuthAngle = 0.5;
    this.controls.minPolarAngle = 1.25;
    this.controls.maxPolarAngle = 1.66;
    this.controls.enablePan = false;

    // 竖屏（手机）自动拉远，保证整个机柜入画
    this.fitCamera();

    // 灯光
    const ambient = new THREE.AmbientLight(0x9aa2ff, 0.45);
    this.scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(6, 26, 18);
    this.scene.add(key);
    // 正面补光：让正对镜头的方块面足够亮但不过曝
    const fill = new THREE.PointLight(0xaab4ff, 15, 70);
    fill.position.set(0, 12, 26);
    this.scene.add(fill);
    const rimBlue = new THREE.PointLight(PALETTE.blue, 120, 70);
    rimBlue.position.set(-14, 18, -6);
    this.scene.add(rimBlue);
    const rimPink = new THREE.PointLight(PALETTE.pink, 70, 60);
    rimPink.position.set(13, 7, 12);
    this.scene.add(rimPink);

    this.buildCabinet();
    this.buildFloor();
    this.buildParticles();

    this.scene.add(this.activeGroup);
    this.scene.add(this.ghostGroup);

    // 后期泛光
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight), 0.5, 0.6, 0.75,
    );
    this.composer.addPass(bloom);

    window.addEventListener('resize', this.onResize);
    this.animate();
  }

  private materialFor(id: number, active = false): THREE.MeshStandardMaterial {
    const mkey = `${id}:${active ? 'a' : 'l'}`;
    let m = this.materials.get(mkey);
    if (!m) {
      const color = PIECE_COLORS[ID_TO_PIECE[id] as PieceType] ?? 0xffffff;
      const deep = new THREE.Color(color).multiplyScalar(active ? 0.72 : 0.6);
      m = new THREE.MeshStandardMaterial({
        color: deep, emissive: color, emissiveIntensity: active ? 0.9 : 0.5,
        roughness: 0.3, metalness: 0.2,
      });
      this.materials.set(mkey, m);
    }
    return m;
  }

  /** 实心机柜：背板 / 侧板 / 立柱霓虹条 / 底座 / 顶梁 / 危险线 */
  private buildCabinet() {
    const cab = new THREE.Group();

    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x0e1440, roughness: 0.45, metalness: 0.55,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x161d52, roughness: 0.28, metalness: 0.85,
    });
    const neonMat = new THREE.MeshStandardMaterial({
      color: PALETTE.deepBlue, emissive: PALETTE.blue, emissiveIntensity: 3.2,
      roughness: 0.3, metalness: 0.2,
    });

    // 背板（实心）
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(WELL_W + 1.2, WELL_H + 1.2, 0.4), panelMat,
    );
    back.position.set(0, WELL_H / 2, -WELL_D / 2 - 0.2);
    cab.add(back);

    // 背板上的网格线（单元格坐标参考）
    const gridMat = new THREE.LineBasicMaterial({
      color: PALETTE.blue, transparent: true, opacity: 0.3,
    });
    const gridPts: THREE.Vector3[] = [];
    const gz = -WELL_D / 2 + 0.02;
    for (let x = 0; x <= COLS; x++) {
      gridPts.push(new THREE.Vector3(x - WELL_W / 2, 0, gz));
      gridPts.push(new THREE.Vector3(x - WELL_W / 2, WELL_H, gz));
    }
    for (let y = 0; y <= ROWS; y++) {
      gridPts.push(new THREE.Vector3(-WELL_W / 2, y, gz));
      gridPts.push(new THREE.Vector3(WELL_W / 2, y, gz));
    }
    cab.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(gridPts), gridMat,
    ));

    // 侧板（深色玻璃，挡住侧面杂乱视角但保留纵深）
    const sideMat = new THREE.MeshPhysicalMaterial({
      color: 0x101740, transparent: true, opacity: 0.35,
      roughness: 0.15, metalness: 0.4, side: THREE.DoubleSide,
    });
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.3, WELL_H + 1.2, WELL_D + 0.6), sideMat);
      side.position.set(sx * (WELL_W / 2 + 0.45), WELL_H / 2, 0);
      cab.add(side);
    }

    // 四根立柱 + 朝内的霓虹灯带
    const postGeo = new THREE.BoxGeometry(0.55, WELL_H + 1.2, 0.55);
    const stripGeo = new THREE.BoxGeometry(0.14, WELL_H - 0.4, 0.14);
    const corners: [number, number][] = [
      [-WELL_W / 2 - 0.45, -WELL_D / 2 - 0.15], [WELL_W / 2 + 0.45, -WELL_D / 2 - 0.15],
      [-WELL_W / 2 - 0.45, WELL_D / 2 + 0.15], [WELL_W / 2 + 0.45, WELL_D / 2 + 0.15],
    ];
    for (const [x, z] of corners) {
      const post = new THREE.Mesh(postGeo, metalMat);
      post.position.set(x, WELL_H / 2, z);
      cab.add(post);
      // 面向井中心方向的灯带
      const strip = new THREE.Mesh(stripGeo, neonMat);
      strip.position.set(x - Math.sign(x) * 0.3, WELL_H / 2, z);
      cab.add(strip);
    }

    // 底座：主机台 + 更宽的底盘 + 正面霓虹条
    const base = new THREE.Mesh(new THREE.BoxGeometry(WELL_W + 2.6, 1.4, WELL_D + 2.2), metalMat);
    base.position.set(0, -0.7, 0);
    cab.add(base);
    const baseTrim = new THREE.Mesh(new THREE.BoxGeometry(WELL_W + 2.7, 0.14, 0.14), neonMat);
    baseTrim.position.set(0, -0.06, WELL_D / 2 + 1.1);
    cab.add(baseTrim);
    // 底座两侧霓虹
    for (const sx of [-1, 1]) {
      const sideTrim = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, WELL_D + 2.2), neonMat);
      sideTrim.position.set(sx * (WELL_W / 2 + 1.32), -0.06, 0);
      cab.add(sideTrim);
    }
    const slab = new THREE.Mesh(new THREE.BoxGeometry(WELL_W + 5.5, 0.5, WELL_D + 4.5), panelMat);
    slab.position.set(0, -1.65, 0);
    cab.add(slab);
    // 底盘前沿霓虹
    const slabTrim = new THREE.Mesh(new THREE.BoxGeometry(WELL_W + 5.6, 0.1, 0.12), neonMat);
    slabTrim.position.set(0, -1.38, (WELL_D + 4.5) / 2 - 0.05);
    cab.add(slabTrim);

    // 顶梁 + 顶部霓虹
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(WELL_W + 2.0, 0.7, WELL_D + 1.4), metalMat);
    lintel.position.set(0, WELL_H + 0.55, 0);
    cab.add(lintel);
    const lintelGlow = new THREE.Mesh(new THREE.BoxGeometry(WELL_W + 2.1, 0.14, 0.14), neonMat);
    lintelGlow.position.set(0, WELL_H + 0.25, WELL_D / 2 + 0.72);
    cab.add(lintelGlow);

    // 危险线（堆叠过高时脉动）
    this.dangerMat = new THREE.MeshStandardMaterial({
      color: 0x661206, emissive: PALETTE.coral, emissiveIntensity: 0.7,
      transparent: true, opacity: 0.9,
    });
    const danger = new THREE.Mesh(new THREE.BoxGeometry(WELL_W, 0.06, 0.06), this.dangerMat);
    danger.position.set(0, WELL_H - 0.06, WELL_D / 2 - 0.02);
    cab.add(danger);

    this.scene.add(cab);
  }

  private buildFloor() {
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x04051a, roughness: 0.35, metalness: 0.75,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.92;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(110, 70, PALETTE.blue, 0x11164a);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.28;
    grid.position.y = -1.9;
    this.scene.add(grid);

    // 机柜下方的径向辉光
    const glowTex = this.makeRadialGlowTexture();
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 22),
      new THREE.MeshBasicMaterial({
        map: glowTex, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -1.89;
    this.scene.add(glow);
  }

  private makeRadialGlowTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    g.addColorStop(0, 'rgba(72, 80, 255, 0.85)');
    g.addColorStop(0.45, 'rgba(40, 46, 200, 0.28)');
    g.addColorStop(1, 'rgba(3, 4, 18, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private buildParticles() {
    const N = 240;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 50;
      pos[i * 3 + 1] = Math.random() * 32;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 50;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x6d78ff, size: 0.09, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);
  }

  /** 同步棋盘 + 活动方块 + 投影 */
  sync(board: Board, active: ActivePiece | null, ghost: number | null) {
    const wanted = new Set<string>();
    let maxH = 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const id = board[y][x];
        if (id === 0) continue;
        if (y + 1 > maxH) maxH = y + 1;
        const key = `${x},${y}`;
        wanted.add(key);
        if (!this.cellMeshes.has(key)) {
          const mesh = new THREE.Mesh(this.boxGeo, this.materialFor(id));
          mesh.position.set(x - WELL_W / 2 + 0.5, y + 0.5, 0);
          const edges = new THREE.LineSegments(
            this.edgeGeo,
            new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14 }),
          );
          mesh.add(edges);
          mesh.scale.setScalar(0.01);
          (mesh as any).spawnT = 0;
          this.scene.add(mesh);
          this.cellMeshes.set(key, { mesh });
        }
      }
    }
    for (const [key, c] of this.cellMeshes) {
      if (!wanted.has(key)) {
        this.scene.remove(c.mesh);
        this.cellMeshes.delete(key);
      }
    }
    this.stackHigh = maxH >= 14;

    // 活动方块（隐藏缓冲行不渲染，避免露出机柜顶）
    this.activeGroup.clear();
    if (active) {
      const mat = this.materialFor(this.idOf(active), true);
      for (const [cx, cy] of shapeCells(active.type, active.rot)) {
        const py = active.y + cy;
        if (py >= ROWS) continue;
        const m = new THREE.Mesh(this.boxGeo, mat);
        m.position.set(active.x + cx - WELL_W / 2 + 0.5, py + 0.5, 0);
        this.activeGroup.add(m);
      }
    }

    // 投影：方块色轮廓 + 极淡填充，落点一眼可辨
    this.ghostGroup.clear();
    if (active && ghost !== null && ghost < active.y) {
      const color = PIECE_COLORS[active.type];
      const fillMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.1, depthWrite: false,
      });
      const lineMat = new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.55,
      });
      for (const [cx, cy] of shapeCells(active.type, active.rot)) {
        const px = active.x + cx - WELL_W / 2 + 0.5;
        const py = ghost + cy + 0.5;
        const fill = new THREE.Mesh(this.boxGeo, fillMat);
        fill.position.set(px, py, 0);
        const outline = new THREE.LineSegments(this.edgeGeo, lineMat);
        outline.position.set(px, py, 0);
        this.ghostGroup.add(fill);
        this.ghostGroup.add(outline);
      }
    }
  }

  private idOf(p: ActivePiece): number {
    return { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 }[p.type];
  }

  /** 消行动画：这些行闪烁 */
  flashRows(rows: number[]) {
    this.clearingMeshes = [];
    for (const y of rows) {
      for (let x = 0; x < COLS; x++) {
        const c = this.cellMeshes.get(`${x},${y}`);
        if (c) {
          c.mesh.material = (c.mesh.material as THREE.MeshStandardMaterial).clone();
          this.clearingMeshes.push(c.mesh);
        }
      }
    }
    this.clearT = 0;
  }

  /** 根据宽高比调整相机距离：竖屏拉远，横屏用默认距离 */
  private fitCamera() {
    const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
    const target = this.controls.target;
    const dir = this.camera.position.clone().sub(target).normalize();
    const dist = aspect >= 1 ? 38 : Math.min(64, 38 * Math.pow(1 / aspect, 0.78));
    this.camera.position.copy(target.clone().add(dir.multiplyScalar(dist)));
  }

  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.fitCamera();
  };

  private animate = () => {
    if (this.disposed) return;
    requestAnimationFrame(this.animate);
    const dt = this.clock.getDelta();
    const t = this.clock.elapsedTime;

    // 出生缩放动画
    for (const c of this.cellMeshes.values()) {
      const m = c.mesh as any;
      if (m.spawnT !== undefined && m.spawnT < 1) {
        m.spawnT = Math.min(1, m.spawnT + dt * 7);
        const s = 1 - Math.pow(1 - m.spawnT, 3);
        m.scale.setScalar(Math.max(0.01, s));
      }
    }

    // 消行闪烁
    if (this.clearT >= 0) {
      this.clearT += dt;
      const k = this.clearT / 0.38;
      if (k >= 1) {
        this.clearT = -1;
        this.clearingMeshes = [];
      } else {
        const pulse = Math.sin(k * Math.PI * 5) * 0.5 + 0.5;
        for (const m of this.clearingMeshes) {
          const mat = m.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = 0.4 + pulse * 2.6;
          m.scale.setScalar(1 - k * 0.55);
        }
      }
    }

    // 危险线脉动
    if (this.dangerMat) {
      this.dangerMat.emissiveIntensity = this.stackHigh
        ? 1.2 + Math.sin(t * 6) * 0.9
        : 0.7;
    }

    // 粒子缓慢上浮
    const posAttr = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      let y = posAttr.getY(i) + dt * 0.6;
      if (y > 32) y = 0;
      posAttr.setY(i, y);
    }
    posAttr.needsUpdate = true;

    this.controls.update();
    this.composer.render();
  };

  dispose() {
    this.disposed = true;
    window.removeEventListener('resize', this.onResize);
    this.controls.dispose();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}

/**
 * src/scenes/core/svgParts.js
 * ------------------------------------------------------------------
 * AZ-CORE 01 的 2D/SVG 投影：**与 3D 共用同一份 GEOMETRY 参数**。
 * 用途有两处：
 *   1. Control Hub 的 SYSTEM VIEW（2D 静态架构预览）
 *   2. WebGL 不可用时的可操作兜底视图
 * 因此 2D 与 3D 不可能出现“两个不一致的核心”（M0.1_TASK §7.2）。
 * ------------------------------------------------------------------
 */
import { GEOMETRY } from '../../data/content.js';

export const SVG_VIEW = 300; // viewBox 0 0 300 300，中心 (150,150)
const ORIGIN_Y = 262; // 俯视投影的基线下移量
const SCALE = 66; // 1 世界单位 = 66 px

/** 三组轨道的倾角在俯视投影中的椭圆扁平度（与 3D 倾角一致，不另设参数） */
const RING_FLATTEN = [0.16, 0.62, 0.36];
const RING_SCALE_XZ = [0.86, 1.0, 0.9];

const px = (n) => Number(n.toFixed(2));

/** 轨道椭圆：rz 方向 → SVG 纵向，rx 方向 → SVG 横向
 *  同时给出前后两段弧，用于表达“后侧被核心遮挡、前侧在核心之上”的层次 */
function ringPath(radius, sxz, flat) {
  const cx = SVG_VIEW / 2;
  const cy = ORIGIN_Y;
  const rx = radius * SCALE * sxz;
  const ry = radius * SCALE * flat;
  const n = (v) => Number(v.toFixed(2));
  return {
    cx,
    cy,
    rx: n(rx),
    ry: n(ry),
    // 后侧：从右端点经上弧到左端点
    back: `M ${n(cx + rx)} ${cy} A ${n(rx)} ${n(ry)} 0 0 1 ${n(cx - rx)} ${cy}`,
    // 前侧：从左端点经下弧回右端点
    front: `M ${n(cx - rx)} ${cy} A ${n(rx)} ${n(ry)} 0 0 1 ${n(cx + rx)} ${cy}`,
  };
}

/** 端口：与 3D 相同的黄金角分布 + 球面坐标 */
function portPoints() {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const bands = [-0.62, 0.05, 0.62];
  const out = [];
  for (let i = 0; i < GEOMETRY.portCount; i++) {
    const y = bands[i % 3];
    const t = (i / GEOMETRY.portCount) * Math.PI * 2 + golden * Math.floor(i / 3);
    const r = Math.cos(Math.asin(Math.min(0.999, y)));
    const radius = GEOMETRY.portRadius + (i % 3) * 0.13;
    const wx = Math.cos(t) * r * radius;
    const wy = y * radius;
    const wz = Math.sin(t) * r * radius;
    const persp = 1 / (1 + wz * 0.16);
    out.push({
      id: `svg-port-${i}`,
      index: i,
      x: px(150 + wx * SCALE * persp),
      y: px(ORIGIN_Y + wy * SCALE * persp),
      s: px(persp),
      z: wz,
    });
  }
  return out.sort((a, b) => a.z - b.z);
}

const RINGS = GEOMETRY.rings.map((cfg, i) => ({
  id: cfg.id,
  tilt: cfg.tilt,
  ...ringPath(cfg.radius, RING_SCALE_XZ[i], RING_FLATTEN[i]),
}));

const PORTS = portPoints();

/** 外壳切面轮廓（俯视投影下的多面体剪影，非正圆） */
const SHELL_FACETS = [
  'M 150 112 L 186 132 L 186 172 L 150 196 L 114 172 L 114 132 Z',
  'M 150 112 L 150 150 L 186 132',
  'M 150 150 L 186 172',
  'M 150 150 L 150 196',
  'M 150 150 L 114 172',
  'M 150 150 L 114 132',
];

/** 图形实际占用的区域：中心 (150,153)，最外层轨道到 y≈283，端口到 x≈107/193 */
export const SVG_BOX = '30 12 240 284';

/**
 * @param {object} options
 * @param {boolean} options.withLabels 是否保留图形标签（说明文字由 HTML 承载，默认只留图形）
 * @param {Record<number, string>} options.portMarks 端口序号 → 端口标识的映射；
 *   命中的接口会在二维投影上获得独立标记，用来同步 M0.2 的装配状态
 */
export function renderCoreSvg({ withLabels = true, portMarks = {} } = {}) {
  const ports = PORTS.map((p) => {
    const portId = portMarks[p.index];
    const cls = portId ? 'svg-part svg-port svg-port--target' : 'svg-part svg-port';
    const attr = portId ? ` data-port="${portId}"` : '';
    return `<g class="${cls}"${attr} data-part="ports" data-index="${p.index}" data-state="free" transform="translate(${p.x} ${p.y}) scale(${p.s})">
         <polygon points="0,-9 7.8,-4.5 7.8,4.5 0,9 -7.8,4.5 -7.8,-4.5" />
         <polygon class="svg-port-core" points="0,-3.4 3,-1.7 3,1.7 0,3.4 -3,1.7 -3,-1.7" />
       </g>`;
  }).join('');

  const ringBack = RINGS.map(
    (r) =>
      `<g class="svg-part" data-part="${r.id}">
         <ellipse cx="${r.cx}" cy="${r.cy}" rx="${r.rx}" ry="${r.ry}" class="svg-ring-halo" />
         <path d="${r.back}" class="svg-ring" />
       </g>`
  ).join('');

  const ringFront = RINGS.map(
    (r) =>
      `<g class="svg-part" data-part="${r.id}" aria-hidden="true">
         <path d="${r.front}" class="svg-ring" />
       </g>`
  ).join('');

  return `<svg viewBox="${SVG_BOX}" role="img" aria-label="AZ-CORE 01 二维结构投影图：黑曜几何核、三组机械轨道与 12 个接口定位点">
  <defs>
    <radialGradient id="coreGlow" cx="50%" cy="42%" r="60%">
      <stop offset="0%" stop-color="#dff6ff" stop-opacity="0.85" />
      <stop offset="45%" stop-color="#77d8ec" stop-opacity="0.32" />
      <stop offset="100%" stop-color="#77d8ec" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="facetGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2a3644" />
      <stop offset="55%" stop-color="#131b24" />
      <stop offset="100%" stop-color="#0b1016" />
    </linearGradient>
  </defs>

  <!-- 后侧轨道 → 核心 → 前侧轨道：用遮挡关系表达真实空间层次 -->
  <g class="svg-back">${ringBack}</g>

  <!-- L0 黑曜切面外壳 + L1 能量核 -->
  <g class="svg-part" data-part="shell">
    <polygon points="150,108 190,130 190,174 150,198 110,174 110,130" fill="url(#facetGrad)" class="svg-shell" />
    ${SHELL_FACETS.slice(1).map((d) => `<path d="${d}" class="svg-facet" />`).join('')}
  </g>
  <g class="svg-part" data-part="core">
    <circle cx="150" cy="153" r="56" fill="url(#coreGlow)" />
    <circle cx="150" cy="153" r="35" class="svg-energy" />
  </g>
  <g class="svg-part" data-part="constraint">
    <circle cx="150" cy="153" r="76" class="svg-constraint" />
  </g>

  <g class="svg-front">${ringFront}</g>

  <!-- 前侧端口 -->
  <g class="svg-front">${ports}</g>

  <!-- 说明文字改由 HTML 承载：不贴进 SVG，既不会与图形重叠，也便于中文排版与选中复制 -->
</svg>`;
}

/** 选中态高亮：SVG 与 3D 由同一个 selection 驱动 */
export function applySvgSelection(svgRoot, part) {
  if (!svgRoot) return;
  svgRoot.querySelectorAll('.svg-part').forEach((el) => {
    const isSel = !!part && el.dataset.part === part;
    el.classList.toggle('is-selected', isSel);
    el.classList.toggle('is-dim', !!part && !isSel);
  });
}

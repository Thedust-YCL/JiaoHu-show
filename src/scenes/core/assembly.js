/**
 * src/scenes/core/assembly.js
 * ------------------------------------------------------------------
 * AZ-CORE 01 —— 机械天体仪轨道 + 黑曜几何奇点 + 少量神经式数据流。
 * 造型身份冻结（DESIGN_SYSTEM §3）：程序化生成，无外部模型/贴图文件，
 * 可随静态产物离线打包。
 *
 * 材质状态由 materialRegistry 统一管理，视觉高亮只读取 sceneState，
 * 不持有任何业务判断（PRD §7.1）。
 * ------------------------------------------------------------------
 */
import * as THREE from 'three';
import { GEOMETRY } from '../../data/content.js';

/* ------------------------------------------------------------------ *
 * 1. 黑曜切面：非索引三角面 → 合并同位置顶点 → 按面做确定性扰动
 * ------------------------------------------------------------------ */
function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

function createFacetedShell(radius, perturb) {
  // IcosahedronGeometry 在部分 Three.js 版本中已是非索引几何：仅在确实有索引时转换，
  // 避免控制台出现“BufferGeometry is already non-indexed”的无意义警告
  const source = new THREE.IcosahedronGeometry(radius, 0);
  const base = source.index ? source.toNonIndexed() : source;
  const pos = base.getAttribute('position');
  const count = pos.count;
  const out = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const skip = new Set();
  const key = (i) =>
    `${pos.getX(i).toFixed(3)}|${pos.getY(i).toFixed(3)}|${pos.getZ(i).toFixed(3)}`;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i < count; i += 3) {
    if (skip.has(i)) continue;
    const k = key(i);
    // 收集所有共享该顶点的三角面（二十面体每个顶点被 5 个面共享）
    const group = [];
    for (let j = 0; j < count; j += 3) {
      if (skip.has(j)) continue;
      if (key(j) === k || key(j + 1) === k || key(j + 2) === k) {
        group.push(j);
        skip.add(j);
      }
    }
    a.fromBufferAttribute(pos, i);
    const h = hash3(a.x, a.y, a.z);
    const d = 1 + (h * 2 - 1) * perturb;
    for (const g of group) {
      a.fromBufferAttribute(pos, g);
      b.fromBufferAttribute(pos, g + 1);
      c.fromBufferAttribute(pos, g + 2);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      n.crossVectors(ab, ac).normalize();
      for (let v = 0; v < 3; v++) {
        const idx = g + v;
        out[idx * 3] = pos.getX(idx) * d;
        out[idx * 3 + 1] = pos.getY(idx) * d;
        out[idx * 3 + 2] = pos.getZ(idx) * d;
        nrm[idx * 3] = n.x;
        nrm[idx * 3 + 1] = n.y;
        nrm[idx * 3 + 2] = n.z;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return geo;
}

/* ------------------------------------------------------------------ *
 * 2. 材质注册表：统一记录基础态与选中态
 * ------------------------------------------------------------------ */
class MaterialRegistry {
  constructor() {
    this.items = [];
  }
  register(material, part, { base, selected, dim }) {
    const item = { material, part, base, selected, dim };
    this.items.push(item);
    material.userData.registry = item;
    return material;
  }
}

const shellVert = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - wp.xyz);
  vPos = position;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const shellFrag = /* glsl */ `
uniform float uTime;
uniform float uEnergy;
uniform float uSelect;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vPos;

// 三向接缝距离场：得到细窄、可读的几何裂隙，而不是大面积泛光
float seamLine(vec3 p, float scale) {
  vec3 q = p * scale;
  vec3 f = abs(fract(q) - 0.5);
  vec3 w = fwidth(q) * 1.6;
  vec3 l = smoothstep(w, vec3(0.0), f);
  return max(max(l.x, l.y), l.z);
}

void main() {
  float fres = pow(1.0 - max(dot(vNormalW, vViewDir), 0.0), 2.0);

  // 主光方向与冷色边缘光：让每个切面有可读的明暗差，而不是一团黑
  vec3 L = normalize(vec3(0.62, 0.58, 0.52));
  float ndl = max(dot(vNormalW, L), 0.0);
  vec3 R = normalize(vec3(-0.55, 0.2, -0.8));
  float ndr = max(dot(vNormalW, R), 0.0);

  vec3 obsidian = vec3(0.038, 0.049, 0.063);
  // 高光面用 pow 拉开差距，保证多边形切面在截图里能被数出来
  vec3 col = obsidian * (0.45 + ndl * 1.25 + ndr * 0.45 + fres * 0.95);
  col += vec3(0.08, 0.115, 0.15) * pow(ndl, 4.5);

  // 主裂隙：细窄、克制的冷白能量
  float s = seamLine(vPos, 2.6);
  float glow = s * (0.14 + uEnergy * 0.62);
  col += mix(vec3(0.12, 0.40, 0.50), vec3(0.66, 0.90, 0.98), s) * glow;

  // 次级细刻度：只在近观时可见，提供精密仪器读感
  float t = seamLine(vPos, 6.2);
  col += vec3(0.32, 0.55, 0.63) * t * 0.06 * (0.3 + uEnergy);

  // 轮廓光：保证静止截图里剪影清晰
  col += vec3(0.20, 0.48, 0.56) * fres * 0.22;
  // 选中反馈
  col += vec3(0.42, 0.68, 0.78) * uSelect * (0.12 + s * 0.5);

  gl_FragColor = vec4(col, 1.0);
}`;

const energyVert = /* glsl */ `
varying vec3 vPos;
varying vec3 vNormalW;
void main() {
  vPos = position;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const energyFrag = /* glsl */ `
uniform float uTime;
uniform float uEnergy;
varying vec3 vPos;
varying vec3 vNormalW;
void main() {
  float swirl = sin(vPos.x * 9.0 + uTime * 0.9)
              * cos(vPos.y * 7.0 - uTime * 0.7)
              * sin(vPos.z * 11.0 + uTime * 0.5);
  float veins = smoothstep(0.25, 0.98, abs(swirl));
  float i = (0.05 + veins * 0.26) * uEnergy;
  vec3 col = mix(vec3(0.16, 0.42, 0.52), vec3(0.72, 0.90, 0.98), veins);
  gl_FragColor = vec4(col * i, i * 0.85);
}`;

/* ------------------------------------------------------------------ *
 * 3. 主体装配
 * ------------------------------------------------------------------ */
export function createCore() {
  const registry = new MaterialRegistry();
  const root = new THREE.Group();
  root.name = 'AZ-CORE-01';

  /** pivot：整体姿态（用户拖拽 / 待机自转都作用在它上面） */
  const pivot = new THREE.Group();
  root.add(pivot);

  const origin = new THREE.Vector3();

  /* ---- L0 黑曜切面外壳 ---- */
  const shellMat = new THREE.ShaderMaterial({
    vertexShader: shellVert,
    fragmentShader: shellFrag,
    uniforms: { uTime: { value: 0 }, uEnergy: { value: 0.4 }, uSelect: { value: 0 } },
  });
  registry.register(shellMat, 'shell', {
    base: { uEnergy: 0.4, uSelect: 0 },
    selected: { uSelect: 0.5, uEnergy: 0.95 },
    dim: { uEnergy: 0.3, uSelect: 0 },
  });
  const shell = new THREE.Mesh(createFacetedShell(GEOMETRY.coreRadius, GEOMETRY.shellPerturb), shellMat);
  shell.name = 'shell';
  pivot.add(shell);

  /* 棱线：让切面关系在远景与静态截图中依然清晰 */
  const edges = new THREE.Group();
  edges.name = 'shell-edges';
  const edgeMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(0.42, 0.78, 0.88),
    transparent: true,
    opacity: 0.26,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  registry.register(edgeMat, 'shell', { base: { opacity: 0.15 }, selected: { opacity: 0.5 }, dim: { opacity: 0.09 } });
  const edgeGeo = new THREE.EdgesGeometry(shell.geometry, 1);
  edges.add(new THREE.LineSegments(edgeGeo, edgeMat));
  edges.scale.setScalar(1.006);
  pivot.add(edges);

  /* ---- L1 内部能量核 ---- */
  const energyMat = new THREE.ShaderMaterial({
    vertexShader: energyVert,
    fragmentShader: energyFrag,
    uniforms: { uTime: { value: 0 }, uEnergy: { value: 0.35 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  registry.register(energyMat, 'core', {
    base: { uEnergy: 0.35 },
    selected: { uEnergy: 1.0 },
    dim: { uEnergy: 0.25 },
  });
  const energy = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 2), energyMat);
  energy.name = 'energy';
  pivot.add(energy);

  /* ---- L1-R 内部约束环与刻度 ---- */
  const constraintGroup = new THREE.Group();
  constraintGroup.name = 'constraint';
  const constraintMat = new THREE.MeshStandardMaterial({
    color: 0x2a3644,
    metalness: 0.9,
    roughness: 0.42,
    emissive: new THREE.Color(0x0d2a34),
    emissiveIntensity: 0.5,
  });
  registry.register(constraintMat, 'constraint', {
    base: {},
    selected: { emissiveIntensity: 1.35, color: new THREE.Color(0x3d4e60) },
    dim: {},
  });
  const constraintRing = new THREE.Mesh(
    new THREE.TorusGeometry(GEOMETRY.constraintRingRadius, 0.013, 8, 128),
    constraintMat
  );
  constraintRing.rotation.x = Math.PI / 2;
  constraintGroup.add(constraintRing);

  // 外侧断续刻度环：机械感来自“可读的刻度”，不是发光魔法阵
  const dashMat = new THREE.LineDashedMaterial({
    color: 0x77d8ec,
    transparent: true,
    opacity: 0.34,
    dashSize: 0.055,
    gapSize: 0.05,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  registry.register(dashMat, 'constraint', { base: { opacity: 0.34 }, selected: { opacity: 0.8 }, dim: { opacity: 0.2 } });
  const dashPts = [];
  for (let i = 0; i <= 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    dashPts.push(new THREE.Vector3(Math.cos(a) * (GEOMETRY.constraintRingRadius + 0.06), 0, Math.sin(a) * (GEOMETRY.constraintRingRadius + 0.06)));
  }
  const dashRing = new THREE.Line(new THREE.BufferGeometry().setFromPoints(dashPts), dashMat);
  dashRing.computeLineDistances();
  constraintGroup.add(dashRing);

  const tickMat = new THREE.MeshBasicMaterial({ color: 0x77d8ec, transparent: true, opacity: 0.3 });
  registry.register(tickMat, 'constraint', { base: { opacity: 0.3 }, selected: { opacity: 0.75 }, dim: { opacity: 0.18 } });
  const tickGeo = new THREE.BoxGeometry(0.006, 0.045, 0.006);
  const ticks = new THREE.InstancedMesh(tickGeo, tickMat, 72);
  const m4 = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  const tmpS = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    tmpV.set(Math.cos(a) * GEOMETRY.constraintRingRadius, 0, Math.sin(a) * GEOMETRY.constraintRingRadius);
    m4.compose(tmpV, tmpQ, tmpS);
    ticks.setMatrixAt(i, m4);
  }
  constraintGroup.add(ticks);
  pivot.add(constraintGroup);

  /* ---- L2 三组机械轨道 ---- */
  const rings = GEOMETRY.rings.map((cfg, i) => {
    const group = new THREE.Group();
    group.name = cfg.id;
    group.rotation.set(THREE.MathUtils.degToRad(cfg.tilt), 0, THREE.MathUtils.degToRad(cfg.tilt * 0.35));
    group.userData.tilt = cfg.tilt;
    group.userData.baseRotation = group.rotation.clone();

    // 每条轨道独立材质：选中时只高亮对应轨道，不牵动其他结构
    const mat = new THREE.MeshStandardMaterial({
      color: 0xa7b3bf,
      metalness: 0.85,
      roughness: 0.3,
      emissive: new THREE.Color(0x14313d),
      emissiveIntensity: 0.5,
    });
    registry.register(mat, cfg.id, {
      base: {},
      selected: { emissiveIntensity: 1.15, color: new THREE.Color(0xc7d6e2) },
      dim: {},
    });

    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(cfg.radius, cfg.thickness, 10, 160),
      mat
    );
    torus.rotation.x = Math.PI / 2;
    torus.userData.part = cfg.id;
    group.add(torus);

    // 刻度：外缘的细小机械齿，提供“精密仪器”读感
    const greebleCount = 72;
    const gGeo = new THREE.BoxGeometry(0.014, 0.028 + i * 0.004, 0.022);
    const gm = new THREE.InstancedMesh(gGeo, mat, greebleCount);
    const gQ = new THREE.Quaternion();
    for (let k = 0; k < greebleCount; k++) {
      const a = (k / greebleCount) * Math.PI * 2;
      tmpV.set(Math.cos(a) * cfg.radius, 0, Math.sin(a) * cfg.radius);
      gQ.setFromEuler(new THREE.Euler(0, -a, 0));
      m4.compose(tmpV, gQ, tmpS);
      gm.setMatrixAt(k, m4);
    }
    group.add(gm);

    // 每组的“母轨”细环，制造前后层次
    const outer = new THREE.Mesh(new THREE.TorusGeometry(cfg.radius + 0.15, 0.008, 6, 128), mat);
    outer.rotation.x = Math.PI / 2;
    group.add(outer);

    pivot.add(group);
    return group;
  });

  /* ---- L3 接口 / 装配定位点 ---- */
  const portsGroup = new THREE.Group();
  portsGroup.name = 'ports';
  const portMat = new THREE.MeshStandardMaterial({
    color: 0x59677a,
    metalness: 0.95,
    roughness: 0.4,
    emissive: new THREE.Color(0x123642),
    emissiveIntensity: 0.55,
  });
  registry.register(portMat, 'ports', {
    base: {},
    selected: { emissiveIntensity: 1.4, color: new THREE.Color(0x9fb4c6) },
    dim: {},
  });
  const portCoreMat = new THREE.MeshBasicMaterial({ color: 0x77d8ec, transparent: true, opacity: 0.32 });
  registry.register(portCoreMat, 'ports', { base: { opacity: 0.32 }, selected: { opacity: 0.85 }, dim: { opacity: 0.2 } });

  const ports = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const bands = [-0.62, 0.05, 0.62];
  const housing = new THREE.CylinderGeometry(0.088, 0.1, 0.06, 6, 1);
  const insert = new THREE.CylinderGeometry(0.05, 0.05, 0.012, 6, 1);
  for (let i = 0; i < GEOMETRY.portCount; i++) {
    const y = bands[i % 3];
    const t = (i / GEOMETRY.portCount) * Math.PI * 2 + golden * Math.floor(i / 3);
    const r = Math.cos(Math.asin(Math.min(0.999, y)));
    const radius = GEOMETRY.portRadius + (i % 3) * 0.13;
    const dir = new THREE.Vector3(Math.cos(t) * r, y, Math.sin(t) * r).normalize();

    const port = new THREE.Group();
    port.name = `port-${i}`;
    port.position.copy(dir).multiplyScalar(radius);
    port.lookAt(origin);
    port.rotateX(Math.PI / 2);

    const h = new THREE.Mesh(housing, portMat);
    const ins = new THREE.Mesh(insert, portCoreMat);
    ins.position.y = 0.032;
    h.userData.part = 'ports';
    ins.userData.part = 'ports';
    port.add(h, ins);
    port.userData.part = 'ports';
    port.userData.index = i;
    portsGroup.add(port);
    ports.push(port);
  }
  pivot.add(portsGroup);

  /* ---- L4 数据脉冲（低密度、事件驱动强度） ---- */
  const flowCurves = [
    [new THREE.Vector3(0.2, 1.9, 1.1), new THREE.Vector3(0.5, 0.9, 2.4), new THREE.Vector3(-0.2, 0.4, 3.0)],
    [new THREE.Vector3(-1.8, -0.7, 1.6), new THREE.Vector3(-0.8, -0.3, 2.2), new THREE.Vector3(0.4, -0.2, 2.9)],
    [new THREE.Vector3(1.3, -1.4, -0.9), new THREE.Vector3(0.7, -0.6, -2.2), new THREE.Vector3(-0.3, -0.3, -2.9)],
  ];
  const flows = new THREE.Group();
  flows.name = 'flows';
  const flowMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(0.36, 0.78, 0.9),
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  registry.register(flowMat, 'flows', { base: { opacity: 0.16 }, selected: { opacity: 0.42 }, dim: { opacity: 0.1 } });
  const pulseGeo = new THREE.BufferGeometry();
  const pulsePos = new Float32Array(flowCurves.length * 3);
  pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePos, 3));
  const pulseMat = new THREE.PointsMaterial({
    color: new THREE.Color(0.78, 0.97, 1.0),
    size: 0.055,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  registry.register(pulseMat, 'flows', { base: { opacity: 0.85 }, selected: { opacity: 1 }, dim: { opacity: 0.5 } });
  const curves = flowCurves.map((p) => new THREE.QuadraticBezierCurve3(p[0], p[1], p[2]));
  const flowLines = curves.map((c) => {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.getPoints(64)), flowMat);
    line.userData.part = 'flows';
    flows.add(line);
    return line;
  });
  const pulses = new THREE.Points(pulseGeo, pulseMat);
  flows.add(pulses);
  pivot.add(flows);

  /* ---- 射线拾取代理：小构件也可稳定点选 ---- */
  const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const proxies = {};
  const addProxy = (id, mesh, part) => {
    mesh.userData.part = part || id;
    mesh.userData.proxy = true;
    proxies[id] = mesh;
    pivot.add(mesh);
  };
  addProxy('shell', new THREE.Mesh(new THREE.IcosahedronGeometry(1.16, 1), pickMat), 'shell');
  addProxy('constraint', new THREE.Mesh(new THREE.TorusGeometry(GEOMETRY.constraintRingRadius, 0.09, 6, 48), pickMat), 'constraint');
  GEOMETRY.rings.forEach((cfg) =>
    addProxy(cfg.id, new THREE.Mesh(new THREE.TorusGeometry(cfg.radius, 0.16, 6, 72), pickMat), cfg.id)
  );
  const portMeshes = [];
  ports.forEach((p) => p.children.forEach((c) => portMeshes.push(c)));
  addProxy('channels', new THREE.Mesh(new THREE.IcosahedronGeometry(0.98, 1), pickMat), 'channels');
  const flowProxy = new THREE.Mesh(new THREE.IcosahedronGeometry(3.0, 1), pickMat);
  flowProxy.userData.part = 'flows';
  flows.add(flowProxy);
  proxies['flows'] = flowProxy;

  /* ---- 选中定位标记：沿结构半径的精密刻度弧 + 四角准星（克制、几何化） ---- */
  const marker = new THREE.Group();
  marker.name = 'locator';
  marker.visible = false;
  const markerMat = new THREE.LineBasicMaterial({
    color: 0xf0bd78,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const markerMatSoft = new THREE.LineBasicMaterial({
    color: 0xf0bd78,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });

  // 主刻度弧：约 96° 的圆弧，标在被选结构的半径上
  const arcPts = [];
  const ARC = Math.PI * 0.53;
  for (let i = 0; i <= 40; i++) {
    const a = -ARC / 2 + (i / 40) * ARC;
    arcPts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
  }
  const markerArc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts), markerMat);
  marker.add(markerArc);

  // 端点准星与中心十字：提供可读的定位语义
  const tickPts = [];
  const addTick = (x, y, dx, dy) => {
    tickPts.push(new THREE.Vector3(x, y, 0), new THREE.Vector3(x + dx, y + dy, 0));
  };
  const arcEnds = [
    [Math.cos(-ARC / 2), Math.sin(-ARC / 2)],
    [Math.cos(ARC / 2), Math.sin(ARC / 2)],
  ];
  for (const [cx, cy] of arcEnds) {
    const nx = -cy;
    const ny = cx;
    addTick(cx, cy, nx * 0.09, ny * 0.09);
    addTick(cx, cy, -nx * 0.09, -ny * 0.09);
  }
  addTick(-0.055, 0, 0.11, 0);
  addTick(0, -0.055, 0, 0.11);
  const markerTicks = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tickPts), markerMat);
  marker.add(markerTicks);

  // 内圈参考弧（软色），表示结构内边界
  const innerPts = [];
  for (let i = 0; i <= 40; i++) {
    const a = -ARC / 2 + (i / 40) * ARC;
    innerPts.push(new THREE.Vector3(Math.cos(a) * 0.82, Math.sin(a) * 0.82, 0));
  }
  marker.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(innerPts), markerMatSoft));
  root.add(marker);

  /* 每帧更新：轨道自转、脉冲、材质状态都由 sceneState 驱动 */
  const clock = { t: 0 };
  const pulseT = [0, 0.34, 0.67];

  /* ------------------------------------------------------------------ *
   * 视觉状态映射：注册表条目自带 part 归属，选中/常态/调暗只读 sceneState。
   * 这里不做任何业务判断，也不保存第二套真假状态。
   * ------------------------------------------------------------------ */
  function applyVisualState(state) {
    const sel = state.selection;
    for (const item of registry.items) {
      const part = item.part;
      const isSel = !!sel && part === sel;
      const isDim = !!sel && part !== sel;
      const mode = isSel ? 'selected' : isDim ? 'dim' : 'base';
      const target = isSel ? item.selected : isDim ? item.dim : item.base;
      const boost = !sel && part === 'shell' ? (state.lit ?? 0) : 0;

      for (const [key, value] of Object.entries(target)) {
        if (item.material.uniforms && item.material.uniforms[key]) {
          const next = boost > 0 && key === 'uEnergy' ? Math.max(value, item.base.uEnergy + boost * 0.55) : value;
          item.material.uniforms[key].value = next;
        } else {
          item.material[key] = value;
        }
      }
      if (item.mode !== mode) {
        item.mode = mode;
        item.material.needsUpdate = true;
      }
    }
  }

  /** 相机聚焦某部件时使用的参考包围盒中心与半径 */
  function getPartFrame(part) {
    const radius = {
      shell: 1.05,
      core: 0.95,
      constraint: 1.25,
      'ring-1': 1.5,
      'ring-2': 1.95,
      'ring-3': 2.45,
      ports: 2.8,
      channels: 1.1,
      flows: 3.05,
    }[part] || 1.6;
    return { center: new THREE.Vector3(0, 0, 0), radius };
  }

  /** 射线拾取目标：不可见代理 + 真实端口网格（保证小构件也能稳定点选） */
  function getPickables() {
    return [...Object.values(proxies), ...portMeshes];
  }

  /**
   * 选中高亮：材质切换之外，把 Amber 定位标记放到被选结构上，
   * 让“选中”在静帧里也成立（不只靠颜色）。
   */
  function setSelected(part) {
    const scale =
      {
        shell: 1.34,
        core: 1.05,
        constraint: 1.2,
        'ring-1': 1.45,
        'ring-2': 1.9,
        'ring-3': 2.4,
        ports: 2.78,
        channels: 1.12,
        flows: 2.9,
      }[part] || 1.6;
    if (!part) {
      marker.visible = false;
      return;
    }
    marker.visible = true;
    marker.scale.setScalar(scale);
    marker.position.set(0, 0, 0);
  }

  function update(dt, state) {
    clock.t += dt;
    const t = clock.t;

    shellMat.uniforms.uTime.value = t;
    energyMat.uniforms.uTime.value = t;

    rings.forEach((group, i) => {
      const cfg = GEOMETRY.rings[i];
      const spin = state.idle ? cfg.speed * (state.reduced ? 0.25 : 1) : 0;
      group.rotation.y += THREE.MathUtils.degToRad(spin) * dt * 6;
      group.rotation.z = group.userData.baseRotation.z + Math.sin(t * 0.14 + i) * 0.012 * (state.idle ? 1 : 0);
    });
    constraintGroup.rotation.y -= dt * 0.05 * (state.idle ? 1 : 0);
    energy.rotation.y += dt * 0.09;
    energy.rotation.x += dt * 0.04;

    // 数据脉冲：低密度循环，强度跟随 sceneState.activity
    const speed = state.reduced ? 0.05 : 0.16;
    for (let i = 0; i < pulseT.length; i++) {
      pulseT[i] = (pulseT[i] + dt * speed * (0.6 + state.activity * 0.8)) % 1;
      const p = curves[i].getPoint(pulseT[i]);
      pulsePos[i * 3] = p.x;
      pulsePos[i * 3 + 1] = p.y;
      pulsePos[i * 3 + 2] = p.z;
    }
    pulseGeo.getAttribute('position').needsUpdate = true;

    // 端口呼吸
    ports.forEach((port, i) => {
      const k = 0.86 + Math.sin(t * 0.8 + i * 0.7) * 0.14;
      port.scale.setScalar(0.94 + k * 0.06);
    });

    marker.rotation.z = t * 0.25;
    markerTicks.rotation.z = -t * 0.4;
  }

  return {
    root,
    pivot,
    shell,
    energy,
    rings,
    constraintGroup,
    portsGroup,
    ports,
    flows,
    flowLines,
    proxies,
    marker,
    shellMat,
    energyMat,
    registry,
    applyVisualState,
    getPartFrame,
    getPickables,
    setSelected,
    update,
  };
}

/**
 * src/scenes/core/modules3d.js
 * ------------------------------------------------------------------
 * AZ-CORE 01 的 L3 接口热点与能力模块的三维装配表现。
 *
 * 边界（M0.2_TASK §4.1 / §11）：本模块**只做表现**。它不判断业务状态、
 * 不写配置、不做校验；逻辑状态由 constructor store 派生后传进来，
 * 动画成功与否绝不会反向决定业务数据是否存在。
 * ------------------------------------------------------------------
 */
import * as THREE from 'three';
import { PORTS } from '../../features/constructor/model/modules.js';

/** 状态 → 语义色（Cyan 表示连接就绪，Amber 表示未配置，Red 表示非法） */
const STATUS_COLOR = {
  Ready: 0x77d8ec,
  Unconfigured: 0xf0bd78,
  Attached: 0x77d8ec,
  Disabled: 0x5a6a78,
  Invalid: 0xff8585,
  Available: 0x8ba0b2,
};

const EXECUTION_TONE_COLOR = Object.freeze({
  signal: 0x77d8ec,
  started: 0x77d8ec,
  info: 0x77d8ec,
  success: 0x80d9b4,
  attention: 0xf0bd78,
  blocked: 0xf0bd78,
  unresolved: 0xf0bd78,
  error: 0xff8585,
  muted: 0xaabee0,
  skipped: 0xaabee0,
});

export function executionToneColor(tone) {
  return EXECUTION_TONE_COLOR[tone] || EXECUTION_TONE_COLOR.signal;
}

function portStateColor(state) {
  return state === 'preview'
    ? 0xf0bd78
    : state === 'invalid'
      ? 0xff8585
      : state === 'occupied'
        ? 0x77d8ec
        : STATUS_COLOR.Available;
}

const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t) => t * t * t;

function orientSegment(mesh, from, to) {
  const delta = new THREE.Vector3().subVectors(to, from);
  const len = Math.max(1e-4, delta.length());
  mesh.position.copy(from).addScaledVector(delta, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, delta.normalize());
  mesh.scale.set(1, len, 1);
}

/* ------------------------------------------------------------------ *
 * 两个模块必须看起来是两种不同的东西，而不是两个共享开关的按钮。
 * 造型尺寸按 1.55 倍统一放大：在标准镜位（约 7.4 单位）下仍能被清楚辨认。
 * ------------------------------------------------------------------ */
const HOUSING_SCALE = 1.8;

function createSearchHousing() {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xc3d4de, metalness: 0.58, roughness: 0.42, emissive: 0x24505f, emissiveIntensity: 1.15 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x9fe8f8, transparent: true, opacity: 0.95 });
  const scan = new THREE.MeshBasicMaterial({ color: 0xcaf4ff, transparent: true, opacity: 0.7 });

  // 六角扫描盘：轴指向核心
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.048, 6), metal);
  disc.rotation.x = Math.PI / 2;
  group.add(disc);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.0075, 6, 36), metal);
  group.add(collar);

  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.014, 14), glow);
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.03;
  group.add(lens);

  for (let i = 0; i < 3; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.008, 0.004), scan);
    bar.position.z = 0.026;
    bar.rotation.z = (i / 3) * Math.PI;
    group.add(bar);
  }

  group.scale.setScalar(HOUSING_SCALE);
  return { group, materials: [metal, glow, scan], glowMats: [glow, scan] };
}

function createReaderHousing() {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xb9cbd8, metalness: 0.55, roughness: 0.44, emissive: 0x24505f, emissiveIntensity: 1.05 });
  const line = new THREE.MeshBasicMaterial({ color: 0xcaf4ff, transparent: true, opacity: 0.72 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x9fe8f8, transparent: true, opacity: 0.92 });

  // 数据板：与六角扫描盘在轮廓上完全不同
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.205, 0.265, 0.022), metal);
  group.add(plate);

  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.275, 0.03), metal);
  spine.position.x = -0.105;
  group.add(spine);

  for (let i = 0; i < 3; i++) {
    const text = new THREE.Mesh(new THREE.BoxGeometry(0.125 - i * 0.028, 0.008, 0.004), line);
    text.position.set(0.012, 0.072 - i * 0.045, 0.014);
    group.add(text);
  }

  const corner = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.008), glow);
  corner.position.set(0.062, -0.092, 0.014);
  group.add(corner);

  group.scale.setScalar(HOUSING_SCALE);
  return { group, materials: [metal, line, glow], glowMats: [line, glow] };
}

function createHousing(moduleId) {
  if(moduleId==='document_reader')return createReaderHousing();
  const housing=createSearchHousing();
  if(moduleId!=='announcement_search')housing.group.scale.multiplyScalar(0.55);
  return housing;
}

/* ==================================================================== *
 * 能力模块装配层
 * ==================================================================== */
export function createModuleBay({ core, reduced = false }) {
  const group = new THREE.Group();
  group.name = 'MODULE-BAY';
  core.pivot.add(group);

  const anchors = new Map();
  const hotspots = new Map();
  const instances = new Map();

  const enterDuration = reduced ? 0.14 : 0.58;
  const exitDuration = reduced ? 0.1 : 0.42;

  /* ---------------- 端口锚点与热点 ---------------- */
  for (const port of Object.values(PORTS)) {
    const node = core.ports[port.anchorIndex];
    if (!node) continue;
    const anchorLocal = node.position.clone();
    const dir = anchorLocal.clone().normalize();
    anchors.set(port.id, { anchorLocal, dir, node, radius: anchorLocal.length() });

    const spot = new THREE.Group();
    spot.name = `HOTSPOT-${port.id}`;
    spot.position.copy(anchorLocal);
    spot.quaternion.setFromUnitVectors(Z_AXIS, dir.clone());

    const ringMat = new THREE.MeshBasicMaterial({ color: STATUS_COLOR.Available, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.009, 6, 44), ringMat);
    spot.add(ring);

    const haloMat = new THREE.MeshBasicMaterial({ color: STATUS_COLOR.Available, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.36, 40), haloMat);
    spot.add(halo);

    const hexPoints = [];
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      hexPoints.push(new THREE.Vector3(Math.cos(a) * 0.31, Math.sin(a) * 0.31, 0));
    }
    const hexMat = new THREE.LineBasicMaterial({ color: STATUS_COLOR.Available, transparent: true, opacity: 0.5, depthWrite: false });
    const hex = new THREE.Line(new THREE.BufferGeometry().setFromPoints(hexPoints), hexMat);
    spot.add(hex);

    const hubMat = new THREE.MeshBasicMaterial({ color: STATUS_COLOR.Available, transparent: true, opacity: 0.3, depthWrite: false });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 6), hubMat);
    hub.rotation.x = Math.PI / 2;
    spot.add(hub);

    group.add(spot);

    // 拾取代理：命中范围比真实网格大，保证鼠标与触屏都能稳定选中端口
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.46, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.copy(anchorLocal);
    hit.userData.portId = port.id;
    hit.userData.hotspot = true;
    group.add(hit);

    hotspots.set(port.id, { spot, ringMat, haloMat, hexMat, hubMat, hit, ring, halo, phase: Math.random() * Math.PI * 2 });
  }

  /* ---------------- 预览与提示层 ---------------- */
  const previewGroup = new THREE.Group();
  previewGroup.visible = false;
  group.add(previewGroup);

  const previewLineMat = new THREE.LineDashedMaterial({ color: 0xf0bd78, dashSize: 0.09, gapSize: 0.07, transparent: true, opacity: 0.75, depthWrite: false });
  const previewLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]), previewLineMat);
  previewGroup.add(previewLine);

  let previewHousing = null;
  let previewPortId = null;

  function clearPreview() {
    if (previewHousing) {
      previewGroup.remove(previewHousing.group);
      disposeHousing(previewHousing);
      previewHousing = null;
    }
    previewGroup.visible = false;
    previewPortId = null;
  }

  function setPreview(moduleId, portId) {
    if (!moduleId || !portId || !anchors.has(portId)) {
      clearPreview();
      return;
    }
    if (previewPortId !== portId || !previewHousing) {
      clearPreview();
      const housing = createHousing(moduleId);
      housing.materials.forEach((m) => {
        m.transparent = true;
        m.opacity = Math.min(0.34, m.opacity * 0.42);
        m.depthWrite = false;
      });
      const orient = new THREE.Group();
      const anchor = anchors.get(portId);
      orient.quaternion.setFromUnitVectors(Z_AXIS, anchor.dir.clone());
      orient.add(housing.group);
      previewGroup.add(orient);
      previewHousing = { ...housing, orient };
      previewPortId = portId;
    }
    previewGroup.visible = true;
  }

  /* ---------------- 已装配模块实例 ---------------- */
  /**
   * M0.3 执行回放聚焦状态：null 表示没有聚焦。
   * 它只是表现层状态，不参与任何业务判断。
   */
  let execFocus = null;
  let execTone = 'signal';
  let playbackPaused=false;

  function portIdForModule(moduleId) {
    for (const port of Object.values(PORTS)) {
      if (port.accepts.includes(moduleId)) return port.id;
    }
    return null;
  }

  function createInstance(moduleId, portId) {
    const anchor = anchors.get(portId);
    if (!anchor) return null;
    const housing = createHousing(moduleId);

    const root = new THREE.Group();
    root.name = `MODULE-${moduleId}`;
    const orient = new THREE.Group();
    orient.quaternion.setFromUnitVectors(Z_AXIS, anchor.dir.clone());
    orient.add(housing.group);
    root.add(orient);
    group.add(root);

    // 连接关系：从约束环外侧到模块的实体连线
    const linkMat = new THREE.MeshBasicMaterial({ color: STATUS_COLOR.Unconfigured, transparent: true, opacity: 0.85, depthWrite: false });
    const link = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 1, 6), linkMat);
    group.add(link);

    // 锁定脉冲：表示「连接关系已建立」，不是模拟 API 请求成功
    const pulseMat = new THREE.MeshBasicMaterial({ color: 0xcaf4ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const pulse = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 44), pulseMat);
    pulse.visible = false;
    orient.add(pulse);

    // 常驻柔和光环：让装配后的模块在暗场中也能被稳定定位（颜色随状态变化）
    const haloMat = new THREE.MeshBasicMaterial({ color: STATUS_COLOR.Unconfigured, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.7, 44), haloMat);
    halo.position.z = -0.05;
    orient.add(halo);

    const target = anchor.anchorLocal.clone().addScaledVector(anchor.dir, 0.3);
    const inst = {
      moduleId,
      portId,
      root,
      orient,
      housing,
      link,
      linkMat,
      pulse,
      pulseMat,
      halo,
      haloMat,
      target,
      phase: instances.size * 1.7,
      status: 'Unconfigured',
      state: 'enter',
      t: 0,
      pulseT: 1,
      spin: 0,
      removed: false,
    };
    instances.set(moduleId, inst);
    return inst;
  }

  function disposeHousing(housing) {
    housing.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
    const mats = new Set([...housing.materials, ...(housing.glowMats || [])]);
    mats.forEach((m) => m.dispose());
  }

  function removeInstance(moduleId) {
    const inst = instances.get(moduleId);
    if (!inst) return;
    inst.state = 'exit';
    inst.t = 0;
    inst.removed = true;
    inst.pulse.visible = false;
  }

  function dropInstance(inst) {
    group.remove(inst.root);
    group.remove(inst.link);
    disposeHousing(inst.housing);
    inst.linkMat.dispose();
    inst.link.geometry.dispose();
    inst.pulse.geometry.dispose();
    inst.pulseMat.dispose();
    inst.halo.geometry.dispose();
    inst.haloMat.dispose();
    instances.delete(inst.moduleId);
  }

  /**
   * 与权威配置同步：新增的入场、消失的退场、其余只更新状态与位置。
   * 重复调用是幂等的，因此视图切换、窗口变化都不会制造幽灵模块。
   */
  function sync(modules, statuses) {
    const wanted = new Set();
    for (const m of modules || []) {
      wanted.add(m.moduleId);
      let inst = instances.get(m.moduleId);
      if (!inst) inst = createInstance(m.moduleId, m.portId);
      if (!inst) continue;
      const status = statuses?.[m.moduleId] || 'Unconfigured';
      if (inst.status !== status) {
        inst.status = status;
        applyStatusColor(inst);
      }
      if (inst.removed) {
        inst.removed = false;
        inst.state = 'enter';
        inst.t = 0;
      }
    }
    for (const [moduleId, inst] of [...instances]) {
      if (!wanted.has(moduleId) && inst.state !== 'exit') removeInstance(moduleId);
    }
  }

  function applyStatusColor(inst) {
    const color = STATUS_COLOR[inst.status] || STATUS_COLOR.Available;
    inst.linkMat.color.setHex(color);
    inst.haloMat.color.setHex(color);
    inst.housing.glowMats.forEach((m) => m.color.setHex(color));
    const dim = inst.status === 'Disabled';
    inst.linkMat.opacity = dim ? 0.32 : 0.85;
    inst.haloMat.opacity = dim ? 0.07 : inst.status === 'Ready' ? 0.2 : 0.14;
    // M0.3：记录基准不透明度，执行回放聚焦时按倍率重算，而不是逐帧累乘
    inst.glowBase = dim ? 0.28 : 0.7;
    inst.housing.glowMats.forEach((m) => (m.opacity = inst.glowBase));
  }

  /**
   * 端口热点状态：free / preview / occupied / invalid。
   * 颜色只是辅助，兼容性另有文字与形状说明（M0.2_TASK §6）。
   */
  function setPortStates(portStates) {
    // 有明确目标或错误时，其余接口统一降亮：让「现在该看哪个接口」一眼可读
    const hasFocus = Object.values(portStates || {}).some((v) => v === 'preview' || v === 'invalid');
    for (const [portId, spot] of hotspots) {
      const state = portStates?.[portId] || 'free';
      const color = portStateColor(state);
      const dimmed = hasFocus && state === 'free';
      spot.ringMat.color.setHex(color);
      spot.hexMat.color.setHex(color);
      spot.hubMat.color.setHex(color);
      spot.haloMat.color.setHex(color);
      spot.ringMat.opacity = dimmed ? 0.14 : state === 'preview' ? 0.95 : state === 'occupied' ? 0.75 : 0.45;
      spot.haloMat.opacity = dimmed ? 0.02 : state === 'preview' ? 0.2 : state === 'invalid' ? 0.16 : 0.07;
      spot.hexMat.opacity = dimmed ? 0.16 : state === 'preview' ? 0.9 : 0.5;
      spot.state = state;
      // 基准值：执行回放聚焦按倍率重算，避免逐帧累乘导致接口淡出
      spot.baseOpacity = { ring: spot.ringMat.opacity, halo: spot.haloMat.opacity, hex: spot.hexMat.opacity };
    }
  }

  /**
   * M0.3 执行回放聚焦：只有当前事件涉及的模块与接口保持全亮，其余降亮。
   * 它只改变视觉表现，绝不改变任何业务状态；传 null 表示清除聚焦。
   */
  function setExecutionFocus(moduleId, tone = 'signal') {
    execFocus = moduleId || null;
    execTone = tone;
    if (!execFocus) return;
    const inst = instances.get(execFocus);
    if (inst) {
      const color = executionToneColor(execTone);
      inst.pulseMat.color.setHex(color);
      inst.pulseT = 0;
      inst.pulse.visible = true;
    }
  }

  function clearExecutionFocus() {
    execFocus = null;
    execTone = 'signal';
    for (const spot of hotspots.values()) {
      const color = portStateColor(spot.state);
      spot.ringMat.color.setHex(color);
      spot.hexMat.color.setHex(color);
      spot.hubMat.color.setHex(color);
      spot.haloMat.color.setHex(color);
      const base = spot.baseOpacity || { ring: 0.45, halo: 0.07, hex: 0.5 };
      spot.ringMat.opacity = base.ring;
      spot.hexMat.opacity = base.hex;
      spot.haloMat.opacity = base.halo;
    }
    for (const inst of instances.values()) applyStatusColor(inst);
  }

  function getExecutionFocus() {
    if (!execFocus) return null;
    return { moduleId: execFocus, portId: portIdForModule(execFocus), tone: execTone, hasInstance: instances.has(execFocus) };
  }

  function update(dt) {
    const time = performance.now() / 1000;

    // 热点呼吸：可装配接口始终可被肉眼定位，但不喧宾夺主
    for (const spot of hotspots.values()) {
      const pulse = 0.86 + Math.sin(time * 1.1 + spot.phase) * 0.14;
      const scale = spot.state === 'preview' ? 1.06 * pulse : pulse;
      spot.spot.scale.setScalar(scale);
      spot.halo.rotation.z += dt * (spot.state === 'preview' ? 0.9 : 0.25);
    }

    // M0.3 执行回放聚焦：从基准值重算接口亮度，避免逐帧累乘导致淡出
    if (execFocus) {
      const focusPort = portIdForModule(execFocus);
      const focusColor = executionToneColor(execTone);
      for (const [portId, spot] of hotspots) {
        const on = portId === focusPort;
        const color = on ? focusColor : portStateColor(spot.state);
        spot.ringMat.color.setHex(color);
        spot.hexMat.color.setHex(color);
        spot.hubMat.color.setHex(color);
        spot.haloMat.color.setHex(color);
        const base = spot.baseOpacity || { ring: 0.45, halo: 0.07, hex: 0.5 };
        spot.ringMat.opacity = on ? Math.max(base.ring, 0.92) : base.ring * 0.22;
        spot.hexMat.opacity = on ? Math.max(base.hex, 0.85) : base.hex * 0.22;
        spot.haloMat.opacity = on ? 0.24 : base.halo * 0.2;
      }
    }

    // 预览幽灵：沿径向轻微浮动，表达「尚未锁定」
    if (previewGroup.visible && previewPortId) {
      const anchor = anchors.get(previewPortId);
      if (anchor) {
        const bob = Math.sin(time * 2.2) * 0.025;
        const pos = anchor.anchorLocal.clone().addScaledVector(anchor.dir, 0.72 + bob);
        previewHousing.orient.position.copy(pos);
        const from = anchor.dir.clone().multiplyScalar(1.22);
        previewLine.geometry.setFromPoints([from, pos]);
        previewLine.computeLineDistances();
      }
    }

    for (const inst of [...instances.values()]) {
      const anchor = anchors.get(inst.portId);
      if (!anchor) continue;

      if (inst.state === 'enter') {
        inst.t = Math.min(1, inst.t + dt / enterDuration);
        const e = easeOutCubic(inst.t);
        // 沿一条可解释的弧线靠近接口：从侧面环绕切入，而不是凭空出现
        const startDir = anchor.dir.clone().applyAxisAngle(UP, 0.92).normalize();
        const p0 = startDir.multiplyScalar(anchor.radius + 0.92);
        const p1 = anchor.dir.clone().multiplyScalar(anchor.radius + 0.5);
        const p2 = inst.target;
        const inv = 1 - e;
        const pos = p0.multiplyScalar(inv * inv).addScaledVector(p1, 2 * inv * e).addScaledVector(p2, e * e);
        inst.root.position.copy(pos);
        inst.root.rotation.y = -1.5 * inv;
        inst.root.rotation.z = 0.5 * inv;
        inst.root.scale.setScalar(0.82 + e * 0.18);
        if (inst.t >= 1) {
          inst.state = 'idle';
          inst.root.position.copy(inst.target);
          inst.root.rotation.set(0, 0, 0);
          inst.root.scale.setScalar(1);
          inst.pulseT = 0;
          inst.pulse.visible = true;
        }
      } else if (inst.state === 'exit') {
        inst.t = Math.min(1, inst.t + dt / exitDuration);
        const e = easeInCubic(inst.t);
        const startDir = anchor.dir.clone().applyAxisAngle(UP, 0.92).normalize();
        const away = startDir.multiplyScalar(anchor.radius + 1.05);
        inst.root.position.lerpVectors(inst.target, away, e);
        inst.root.rotation.y = -1.6 * e;
        inst.root.scale.setScalar(1 - e * 0.75);
        if (inst.t >= 1) dropInstance(inst);
      } else {
        inst.root.position.copy(inst.target);
      }

      // 连接线：只有「已启用且合法」的实例才呈现活跃线路
      const from = anchor.dir.clone().multiplyScalar(1.22);
      const to = inst.root.position.clone().addScaledVector(anchor.dir, -0.02);
      orientSegment(inst.link, from, to);
      const active = inst.status === 'Ready';
      inst.linkMat.opacity = inst.status === 'Disabled' ? 0.24 : active ? 0.9 : 0.5;
      inst.link.visible = inst.state !== 'exit';

      // 锁定脉冲
      if (inst.pulse.visible) {
        inst.pulseT = Math.min(1, inst.pulseT + (playbackPaused?0:dt) / (reduced ? 0.18 : 0.42));
        const k = inst.pulseT;
        inst.pulse.scale.setScalar(1 + k * 1.8);
        inst.pulseMat.opacity = (1 - k) * 0.85;
        if (k >= 1) inst.pulse.visible = false;
      }

      // 常驻光环的低频呼吸
      const haloBase = inst.status === 'Disabled' ? 0.07 : inst.status === 'Ready' ? 0.2 : 0.14;
      inst.haloMat.opacity = haloBase * (0.78 + Math.sin(time * 1.4 + inst.phase) * 0.22);
      inst.halo.rotation.z += dt * 0.12;

      // 轻微自转：让模块看起来是通电的机械件，而不是静态贴纸
      if (inst.state === 'idle' && inst.status !== 'Disabled') {
        inst.spin += dt * (inst.status === 'Ready' ? 0.5 : 0.18);
        inst.housing.group.rotation.z = Math.sin(inst.spin) * 0.08;
      }

      // M0.3 执行回放聚焦：只有当前事件涉及的模块保持全亮，其余明显降亮
      if (execFocus) {
        const on = inst.moduleId === execFocus;
        const color = on ? executionToneColor(execTone) : (STATUS_COLOR[inst.status] || STATUS_COLOR.Available);
        inst.linkMat.color.setHex(color);
        inst.haloMat.color.setHex(color);
        inst.housing.glowMats.forEach((m) => m.color.setHex(color));
        inst.linkMat.opacity *= on ? 1 : 0.14;
        inst.haloMat.opacity *= on ? 1.5 : 0.18;
        const glowK = on ? 1.35 : 0.18;
        inst.housing.glowMats.forEach((m) => (m.opacity = (inst.glowBase ?? 0.7) * glowK));
      }
    }
  }

  function getHitboxes() {
    return [...hotspots.values()].map((s) => s.hit);
  }

  /** 端口锚点世界坐标：供 DOM 标签定位与拖拽吸附提示使用 */
  function getAnchorWorld(portId, out = new THREE.Vector3()) {
    const spot = hotspots.get(portId);
    if (!spot) return null;
    return spot.spot.getWorldPosition(out);
  }

  function getPreviewPortId() {
    return previewPortId;
  }

  function setVisible(visible) {
    group.visible = visible;
  }

  function dispose() {
    clearPreview();
    for (const inst of [...instances.values()]) dropInstance(inst);
    for (const spot of hotspots.values()) {
      spot.spot.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
      });
      [spot.ringMat, spot.haloMat, spot.hexMat, spot.hubMat].forEach((m) => m.dispose());
      disposeHit(spot.hit);
    }
    previewLine.geometry.dispose();
    previewLineMat.dispose();
    core.pivot.remove(group);
  }

  function disposeHit(hit) {
    hit.geometry.dispose();
    hit.material.dispose();
    group.remove(hit);
  }

  return {
    group,
    anchors,
    sync,
    setPreview,
    clearPreview,
    setPortStates,
    update,
    getHitboxes,
    getAnchorWorld,
    getPreviewPortId,
    setExecutionFocus,
    setPlaybackPaused:value=>{playbackPaused=!!value;},
    clearExecutionFocus,
    getExecutionFocus,
    setVisible,
    dispose,
    hasInstance: (moduleId) => instances.has(moduleId),
    instanceStatus: (moduleId) => instances.get(moduleId)?.status || null,
    instanceCount: () => instances.size,
  };
}

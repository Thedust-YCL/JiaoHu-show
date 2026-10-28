/**
 * src/scenes/intro/timeline.js
 * ------------------------------------------------------------------
 * AZ / INITIALIZATION SEQUENCE — 五镜头时间线（总时长基线 11s）。
 *
 * 设计要点（M0.1_TASK §5.1）：
 *  · 任何时刻 SKIP 都落到唯一稳定终态（Hub + IDLE），不留半装配与镜头漂移
 *  · 起点与终点共用同一套相机与核心对象，不是硬切到另一颗球
 *  · prefers-reduced-motion 时用静态姿态 + 极短淡入
 *  · 纯时间推进，无随机量，可重复复现
 * ------------------------------------------------------------------
 */
import * as THREE from 'three';
import { GEOMETRY } from '../../data/content.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** 每个镜头的参考机位（来自 DESIGN_SYSTEM §5 / M0.1_TASK §5 镜头表） */
export const SHOTS = [
  { no: '01', en: 'THE VOID', cn: '虚空', start: 0, end: 2.0, from: V(0, 0, 12), to: V(0.25, 0.12, 10.2), ease: 'smooth' },
  { no: '02', en: 'AWAKEN', cn: '核心唤醒', start: 2.0, end: 4.2, from: V(0.25, 0.12, 10.2), to: V(1.5, 0.8, 8.5), ease: 'smooth' },
  { no: '03', en: 'ASSEMBLE', cn: '轨道装配', start: 4.2, end: 7.2, from: V(1.5, 0.8, 8.5), to: V(2.8, 1.4, 8.0), ease: 'inout' },
  { no: '04', en: 'IDENTIFY', cn: '身份确认', start: 7.2, end: 9.0, from: V(2.8, 1.4, 8.0), to: V(0.9, 0.32, 7.4), ease: 'out' },
  { no: '05', en: 'ENTER SYSTEM', cn: '进入系统', start: 9.0, end: 11.0, from: V(0.9, 0.32, 7.4), to: V(GEOMETRY.hubCamera.x, GEOMETRY.hubCamera.y, GEOMETRY.hubCamera.z), ease: 'out' },
];

export const TOTAL_DURATION = SHOTS[SHOTS.length - 1].end;
const HUB_DIR = V(GEOMETRY.hubCamera.x, GEOMETRY.hubCamera.y, GEOMETRY.hubCamera.z).normalize();
const HUB_DISTANCE = Math.hypot(GEOMETRY.hubCamera.x, GEOMETRY.hubCamera.y, GEOMETRY.hubCamera.z);
const HUB_POS = HUB_DIR.clone().multiplyScalar(HUB_DISTANCE);
const EASE = {
  smooth: (x) => x * x * (3 - 2 * x),
  inout: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  out: (x) => 1 - Math.pow(1 - x, 3),
  linear: (x) => x,
};

export const REDUCED_DURATION = 0.75;

export function createTimeline({ reduced = false } = {}) {
  const duration = reduced ? REDUCED_DURATION : TOTAL_DURATION;
  const t = { value: 0, playing: false, finished: false };

  const dur = (start, end) => (reduced ? duration * ((end - start) / TOTAL_DURATION) : end - start);
  const at = (time) => (reduced ? (time / TOTAL_DURATION) * duration : time);

  function play() {
    t.value = 0;
    t.playing = true;
    t.finished = false;
  }

  /** 跳过 / 结束：不经过任何中间态，直接得到唯一确定的终态 */
  function finish() {
    t.value = duration;
    t.playing = false;
    t.finished = true;
  }

  function advance(dt) {
    if (!t.playing) return false;
    t.value = Math.min(duration, t.value + dt);
    if (t.value >= duration) {
      t.playing = false;
      t.finished = true;
    }
    return true;
  }

  /** 当前处于第几个镜头（开场 HUD 用） */
  function currentShot() {
    const time = reduced ? (t.value / duration) * TOTAL_DURATION : t.value;
    let index = 0;
    for (let i = 0; i < SHOTS.length; i++) if (time >= SHOTS[i].start) index = i;
    return { index, shot: SHOTS[index], time, progress: t.value / duration };
  }

  /**
   * 计算本帧场景状态。返回的对象是**唯一**的视觉真相来源，
   * 3D、HUD 与日志都读取它。
   */
  function sample() {
    const time = reduced ? (t.value / duration) * TOTAL_DURATION : t.value;
    const camera = new THREE.Vector3().copy(HUB_POS);
    const target = new THREE.Vector3(0, 0, 0);

    if (!t.finished && !reduced) {
      let active = SHOTS[0];
      for (const s of SHOTS) if (time >= s.start) active = s;
      const span = active.end - active.start || 1;
      const local = THREE.MathUtils.clamp((time - active.start) / span, 0, 1);
      const e = EASE[active.ease](local);
      camera.lerpVectors(active.from, active.to, e);
    }

    // 轨道装配进度：Shot 03 起分批进入，Shot 05 精密归位
    const assembly = [];
    for (let i = 0; i < GEOMETRY.rings.length; i++) {
      const s = at(4.2 + i * 0.55);
      const e = at(6.9 + i * 0.62);
      assembly.push(reduced ? 1 : easeOutCubic(THREE.MathUtils.clamp((t.value - s) / Math.max(1e-4, e - s), 0, 1)));
    }

    // 外壳裂隙与能量在 Shot 02 点亮
    const lit = reduced ? 1 : smoothclamp((time - 2.0) / 1.7);
    const chrome = reduced ? 1 : smoothclamp((time - 7.1) / 1.3);
    const panels = reduced ? 1 : smoothclamp((time - 9.15) / 1.5);

    return { camera, target, progress: t.value / duration, assembly, lit, chrome, panels, time, reduced };
  }

  return { t, play, finish, advance, sample, currentShot, duration, TOTAL_DURATION, reduced };
}

function smoothclamp(x) {
  const v = THREE.MathUtils.clamp(x, 0, 1);
  return v * v * (3 - 2 * v);
}
function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

/** 依据开场所处的镜头切换 HUD 字幕（DOM 由 app 层负责） */
export function shotLabel(shot) {
  return {
    idx: shot.no,
    en: shot.en,
    cn: shot.cn,
    desc: {
      '01': '纯黑空间中的极小白光，几何面仅局部显现。',
      '02': '多面体裂隙依次点亮，露出完整形态。',
      '03': '三组机械轨道分批进入并精密归位。',
      '04': '核心稳定，刻度与品牌浮现。',
      '05': '镜头后撤，控制台面板自然出现。',
    }[shot.no],
  };
}

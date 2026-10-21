/**
 * src/scenes/camera/rig.js
 * ------------------------------------------------------------------
 * 相机与交互骨架：受控 OrbitControls、待机自转、部件聚焦补间、重置视角。
 * 约束（M0.1_TASK §6.2）：不穿入模型、不缩到失去主体、不极端翻转，
 * 停止拖动后渐进恢复低强度待机。
 * ------------------------------------------------------------------
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GEOMETRY } from '../../data/content.js';

export function createRig(canvas, camera, target, { reduced = false } = {}) {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.rotateSpeed = 0.62;
  controls.zoomSpeed = 0.75;
  controls.minDistance = GEOMETRY.zoom.min;
  controls.maxDistance = GEOMETRY.zoom.max;
  controls.minPolarAngle = THREE.MathUtils.degToRad(56);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(124);
  controls.target.copy(target);
  controls.enabled = true;

  /* ---------------- 待机自转 ---------------- */
  const idle = {
    yaw: 0,
    speed: reduced ? 0.018 : 0.055, // rad/s，极慢
    weight: 0,
    targetWeight: 1,
  };

  let userHold = 0; // 用户交互后的暂停计时
  let dragging = false;
  let externalHold = false; // M0.2：装配预览 / 拖拽期间由业务层显式暂停自转
  const focusTween = {
    active: false,
    t: 0,
    dur: 0.62,
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
  };

  /** 竖屏 / 窄视口自动后撤：水平 FOV 比纵向窄得多，不后撤就会裁掉最外层轨道 */
  function fitDistance() {
    const aspect = camera.aspect || 1;
    const contentRadius = GEOMETRY.rings[GEOMETRY.rings.length - 1].radius * 1.12;
    const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * aspect);
    return THREE.MathUtils.clamp(
      contentRadius / Math.tan(Math.min(THREE.MathUtils.degToRad(camera.fov), hFov) / 2),
      GEOMETRY.zoom.min,
      GEOMETRY.zoom.max
    );
  }

  controls.addEventListener('start', () => {
    dragging = true;
    userHold = 3.5;
    idle.targetWeight = 0.12;
    stopFocus();
  });
  controls.addEventListener('end', () => {
    dragging = false;
    userHold = 2.6;
  });

  function stopFocus() {
    focusTween.active = false;
  }

  /** 部件聚焦：只调整距离与目标，保持当前视角方向，避免“镜头乱飞” */
  function focusPart(partRadius, center) {
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const margin = 1.46;
    const dist = THREE.MathUtils.clamp((partRadius * margin) / Math.tan(fov / 2), GEOMETRY.zoom.min, GEOMETRY.zoom.max - 0.6);
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0.42, 0.32, 1);
    dir.normalize();
    const desiredTarget = center.clone().multiplyScalar(0.72); // 轻微调焦而非整体平移
    const desiredCam = desiredTarget.clone().add(dir.multiplyScalar(dist));
    stopFocus();
    focusTween.from.copy(camera.position);
    focusTween.to.copy(desiredCam);
    focusTween.fromTarget = controls.target.clone();
    focusTween.toTarget = desiredTarget;
    focusTween.t = 0;
    focusTween.dur = reduced ? 0.14 : 0.62;
    focusTween.active = true;
    userHold = 2.2;
  }

  /** 回到标准镜位：取消所有残余动画，落到唯一确定姿态 */
  function resetView({ instant = false } = {}) {
    stopFocus();
    controls.target.set(GEOMETRY.hubCamera.target.x, GEOMETRY.hubCamera.target.y, GEOMETRY.hubCamera.target.z);
    const dir = new THREE.Vector3(
      GEOMETRY.hubCamera.x,
      GEOMETRY.hubCamera.y,
      GEOMETRY.hubCamera.z
    ).normalize();
    const p = dir.multiplyScalar(fitDistance());
    if (instant || reduced) {
      camera.position.copy(p);
      camera.lookAt(controls.target);
    } else {
      focusTween.from.copy(camera.position);
      focusTween.to.copy(p);
      focusTween.fromTarget = controls.target.clone();
      focusTween.toTarget = new THREE.Vector3(0, 0, 0);
      focusTween.t = 0;
      focusTween.dur = 0.8;
      focusTween.active = true;
    }
    userHold = 1.2;
    idle.targetWeight = 1;
  }

  /** 开场结束后把控制权交给用户，同时保留待机自转 */
  function enterIdle(instant = false) {
    controls.target.set(0, 0, 0);
    const dir = new THREE.Vector3(
      GEOMETRY.hubCamera.x,
      GEOMETRY.hubCamera.y,
      GEOMETRY.hubCamera.z
    ).normalize();
    const p = dir.multiplyScalar(fitDistance());
    if (instant) camera.position.copy(p);
    else {
      focusTween.from.copy(camera.position);
      focusTween.to.copy(p);
      focusTween.fromTarget = controls.target.clone();
      focusTween.toTarget = new THREE.Vector3(0, 0, 0);
      focusTween.t = 0;
      focusTween.dur = 1.1;
      focusTween.active = true;
    }
    idle.targetWeight = 1;
    userHold = 1.6;
  }

  function update(dt) {
    // 聚焦补间
    if (focusTween.active) {
      focusTween.t = Math.min(1, focusTween.t + dt / focusTween.dur);
      const e = 1 - Math.pow(1 - focusTween.t, 3);
      camera.position.lerpVectors(focusTween.from, focusTween.to, e);
      controls.target.lerpVectors(focusTween.fromTarget, focusTween.toTarget, e);
      if (focusTween.t >= 1) stopFocus();
    }

    // 待机权重：用户操作后渐进恢复
    if (userHold > 0) userHold = Math.max(0, userHold - dt);
    else if (!dragging && !focusTween.active && !externalHold) idle.targetWeight = 1;
    idle.weight += (idle.targetWeight - idle.weight) * Math.min(1, dt * 1.2);

    controls.update();

    // 中心完整状态下的自转：只作用于对象，不改变相机读数
    const spin = idle.speed * idle.weight * dt;
    idle.yaw += spin;
    return spin;
  }

  return {
    controls,
    camera,
    idle,
    update,
    focusPart,
    resetView,
    enterIdle,
    stopFocus,
    isDragging: () => dragging,
    getYaw: () => idle.yaw,
    /**
     * M0.2：装配预览 / 引导拖拽期间暂停核心自转，防止目标在指针下移动。
     * 立即把权重归零（不做缓动），结束后由业务层恢复。
     */
    setIdlePaused(paused) {
      externalHold = !!paused;
      if (externalHold) {
        idle.targetWeight = 0;
        idle.weight = 0;
        stopFocus();
      } else {
        idle.targetWeight = 1;
        userHold = Math.max(userHold, 0.6);
      }
    },
    isIdlePaused: () => externalHold,
  };
}

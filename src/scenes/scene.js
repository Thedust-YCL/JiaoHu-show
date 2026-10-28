/**
 * src/scenes/scene.js
 * ------------------------------------------------------------------
 * WebGL 场景装配：渲染器、灯光、后期、拾取、降级、资源释放。
 *
 * 分层原则（PRD §7.1 / §12）：
 *   本模块只把 sceneState 映射为视觉表现，不持有业务真相，
 *   也绝不从动画反推“执行成功”。
 * ------------------------------------------------------------------
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createCore } from './core/assembly.js';
import { createModuleBay } from './core/modules3d.js';
import { createRig } from './camera/rig.js';
import { GEOMETRY } from '../data/content.js';

/* 胶片收尾：暗角 + 极轻扫描线，只在后期可用时启用 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 1.05 },
    uScan: { value: 0.05 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uScan;
    uniform vec2 uResolution;
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float vig = smoothstep(0.34, 0.92, length(d) * uVignette);
      c.rgb *= 1.0 - vig * 0.62;
      float scan = sin(vUv.y * uResolution.y * 1.6) * 0.5 + 0.5;
      c.rgb *= 1.0 - uScan * scan;
      c.rgb = mix(c.rgb, c.rgb * vec3(0.97, 0.995, 1.03), 0.6);
      gl_FragColor = c;
    }`,
};

function detectCapability() {
  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;
  const smallViewport = Math.min(window.innerWidth, window.innerHeight) < 620;
  const lowPower = coarse || smallViewport || cores <= 4 || mem <= 4;
  let webgl = false;
  try {
    const c = document.createElement('canvas');
    webgl = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    webgl = false;
  }
  return { reduced, webgl, lowPower, coarse };
}

/** Frame-rate diagnostics use real elapsed time, not the capped animation step. */
export function createFrameMeter() {
  let elapsed = 0;
  let frames = 0;
  let fps = 0;
  return {
    recordFrame(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      elapsed += seconds;
      frames++;
      if (elapsed + Number.EPSILON >= 0.5) {
        fps = frames / elapsed;
        elapsed = 0;
        frames = 0;
      }
    },
    getFps: () => fps,
  };
}

export function createScene({ stageEl, canvasHost, onLog, onContextLost }) {
  const caps = detectCapability();

  if (!caps.webgl) {
    return { ok: false, caps, reason: 'WEBGL_UNAVAILABLE' };
  }

  const canvas = document.createElement('canvas');
  canvasHost.appendChild(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !caps.lowPower,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
  } catch (error) {
    onLog?.('GL', `渲染器创建失败：${error.message}`, 'error');
    canvas.remove();
    return { ok: false, caps, reason: 'RENDERER_CREATE_FAILED' };
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, caps.lowPower ? 1.35 : 1.85));
  renderer.setClearColor(0x05070a, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.34;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // 后期通道由多个 pass 组成，关闭自动重置才能得到整帧的真实统计
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05070a, 0.028);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
  camera.position.set(0, 0, 12);
  camera.lookAt(0, 0, 0);

  /* ---------------- 灯光：体现切面、轨道厚度与材质层次 ---------------- */
  const lights = new THREE.Group();
  const ambient = new THREE.AmbientLight(0x33455a, 1.15);
  const key = new THREE.DirectionalLight(0xd9e6f2, 1.6);
  key.position.set(4.2, 5.4, 6.0);
  const rimCyan = new THREE.PointLight(0x77d8ec, 18, 20, 2);
  rimCyan.position.set(-4.6, 2.2, -3.4);
  const rimWarm = new THREE.PointLight(0xf0bd78, 6, 16, 2);
  rimWarm.position.set(3.6, -3.0, -4.4);
  const under = new THREE.DirectionalLight(0x5a7f92, 0.6);
  under.position.set(-3.0, -5.0, 2.0);
  lights.add(ambient, key, rimCyan, rimWarm, under);
  scene.add(lights);

  /* ---------------- AZ-CORE 01 ---------------- */
  const core = createCore();
  const coreRoot = new THREE.Group();
  coreRoot.add(core.root);
  scene.add(coreRoot);

  /** M0.2：L3 接口热点 + 能力模块装配表现（只做表现，不做业务判断） */
  const bay = createModuleBay({ core, reduced: caps.reduced });

  const rig = createRig(canvas, camera, new THREE.Vector3(0, 0, 0), { reduced: caps.reduced });

  /* ---------------- 后期：受控 Bloom + 收尾 ---------------- */
  let composer = null;
  let gradePass = null;
  let bloomPass = null;
  try {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // 受控泛光：阈值偏高，只让能量裂隙与真实活动发光，避免整颗核心泛白
    bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), caps.lowPower ? 0.34 : 0.52, 0.62, 0.86);
    composer.addPass(bloomPass);
    gradePass = new ShaderPass(GradeShader);
    composer.addPass(gradePass);
  } catch (error) {
    onLog?.('渲染', `后期通道不可用，已回退直接渲染：${error.message}`, 'attention');
    gradePass?.dispose();
    bloomPass?.dispose();
    composer?.dispose();
    composer = null;
    gradePass = null;
    bloomPass = null;
  }
  if (caps.lowPower && bloomPass) bloomPass.strength = 0.26;

  /* ---------------- 尺寸 ---------------- */
  function resize() {
    const w = Math.max(1, canvasHost.clientWidth || stageEl.clientWidth);
    const h = Math.max(1, canvasHost.clientHeight || stageEl.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    const pr = renderer.getPixelRatio();
    if (gradePass) gradePass.uniforms.uResolution.value.set(w * pr, h * pr);
  }
  resize();

  /* ---------------- 拾取：真实射线检测，不用假热区 ---------------- */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pickables = core.getPickables();
  const portHitboxes = bay.getHitboxes();

  function toPointer(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    return rect;
  }

  function pickAt(clientX, clientY) {
    toPointer(clientX, clientY);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    if (!hits.length) return null;
    // 端口为真实网格（非零透明度视图），命中即优先，避免被外壳代理吞掉
    const portHit = hits.find((h) => h.object.userData.part === 'ports');
    if (portHit) return 'ports';
    // 其余为不可见代理：取最近的命中层（外壳 > 约束环 > 轨道 > 通道 > 数据流）
    return hits[0].object.userData.part || null;
  }

  /**
   * 只针对 M0.2 预定义兼容端口的拾取。
   * 命中代理比真实机械接口大，保证鼠标与触屏都能稳定选中。
   */
  function pickPortAt(clientX, clientY) {
    toPointer(clientX, clientY);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(portHitboxes, false);
    return hits.length ? hits[0].object.userData.portId : null;
  }

  /** 屏幕坐标是否落在三维舞台内（拖拽只在舞台区域内吸附端口） */
  function isInsideStage(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  /* ---------------- 上下文丢失兜底 ---------------- */
  const handleContextLost = (e) => {
    e.preventDefault();
    onLog?.('GL', 'WebGL 上下文丢失，已切换到 2D/SVG 兜底视图', 'error');
    onContextLost?.();
  };
  canvas.addEventListener('webglcontextlost', handleContextLost, false);

  /* ---------------- 每帧 ---------------- */
  const visual = { selection: null, lit: 0, activity: 0.35, idle: false, reduced: caps.reduced, assembly: [1, 1, 1] };
  const frameMeter = createFrameMeter();
  let firstFrameDone = false;
  const lastStats = { calls: 0, triangles: 0 };

  const RING_TILT = GEOMETRY.rings.map((r) => r.tilt);

  function applyAssembly() {
    // 轨道装配：BOOTING 期间由外侧沿自身法线进入并归位。
    // 这是启动序列的视觉表现，与 M0.2 的“能力模块装配业务”无关。
    core.rings.forEach((group, i) => {
      const a = visual.assembly[i] ?? 1;
      const e = 1 - Math.pow(1 - a, 3);
      group.visible = a > 0.015;
      group.scale.setScalar(0.001 + e * 0.999);
      group.rotation.x = THREE.MathUtils.degToRad(RING_TILT[i]) + (1 - e) * -1.05;
      group.rotation.z = group.userData.baseRotation.z * (0.4 + e * 0.6);
    });

    core.portsGroup.children.forEach((port, i) => {
      const a = visual.assembly[i % 3] ?? 1;
      const e = 1 - Math.pow(1 - a, 3);
      port.scale.setScalar(0.001 + e * 0.999);
    });
    core.flows.visible = (visual.assembly[2] ?? 1) > 0.55;
  }

  /** 唤醒亮度：灯光强度跟随同一条 lit 曲线，避免开场出现“假亮” */
  function applyLighting() {
    const f = visual.bootLight ?? 1;
    lights.children.forEach((l) => {
      if (l.userData.base === undefined) l.userData.base = l.intensity;
      l.intensity = l.userData.base * f;
    });
  }

  function tick(dt, elapsed = dt) {
    // 页面不可见时冻结更新，避免无意义渲染
    if (document.hidden) return;

    renderer.info.reset();
    applyAssembly();
    applyLighting();
    core.applyVisualState(visual);
    core.setSelected(visual.selection);
    core.update(dt, visual);
    bay.update(dt);
    const spin = rig.update(dt);
    coreRoot.rotation.y += spin;

    if (composer) composer.render();
    else renderer.render(scene, camera);

    // renderer.info 每帧渲染前会重置，必须在渲染后立即取快照
    lastStats.calls = renderer.info.render.calls;
    lastStats.triangles = renderer.info.render.triangles;

    // 真实性能读数
    frameMeter.recordFrame(elapsed);
    if (!firstFrameDone) {
      firstFrameDone = true;
      onLog?.('GL', `首帧渲染完成 · ${renderer.getContext().getParameter(renderer.getContext().VERSION)}`, 'signal');
    }
  }

  return {
    ok: true,
    caps,
    scene,
    camera,
    renderer,
    core,
    coreRoot,
    bay,
    rig,
    composer,
    bloomPass,
    hasPost: !!composer,
    visual,
    resize,
    tick,
    pickAt,
    pickPortAt,
    isInsideStage,
    getFps: () => frameMeter.getFps(),
    getStats: () => ({
      calls: lastStats.calls,
      triangles: lastStats.triangles,
      programs: renderer.info.programs?.length ?? 0,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      fps: frameMeter.getFps(),
    }),
    dispose() {
      rig.controls.dispose();
      bay.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
        mats.forEach((m) => {
          Object.values(m).forEach((v) => {
            if (v && v.isTexture) v.dispose();
          });
          m.dispose();
        });
      });
      gradePass?.dispose();
      bloomPass?.dispose();
      composer?.dispose?.();
      renderer.dispose();
      canvas.removeEventListener('webglcontextlost', handleContextLost, false);
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

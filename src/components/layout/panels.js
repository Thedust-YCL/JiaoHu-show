/**
 * src/components/layout/panels.js
 * ------------------------------------------------------------------
 * Control Hub 的 DOM 层（DESIGN_SYSTEM §6）。
 * 重要正文全部由 HTML 呈现，不贴到 3D Canvas 上；
 * 未开放入口一律 disabled + aria-disabled，并给出阶段说明（禁止假按钮）。
 *
 * M0.2 起：左侧 Dock 顶部接入能力架（由 features/constructor 注入），
 * 右侧 Inspector 支持渲染模块配置视图；二维系统视图已改为真实投影，
 * 由 features/constructor/views/systemView.js 承担。
 * ------------------------------------------------------------------
 */
import { NAV, PARTS, PART_ORDER, CHAPTERS, TERM_INDEX, BOUNDARIES, MILESTONES, SIMULATED_CONSTANT } from '../../data/content.js';
import { log } from '../../state/store.js';
import { h, md } from '../../features/constructor/components/dom.js';

/* ==================================================================== *
 * 顶栏
 * ==================================================================== */
export function Topbar({ onReplay, onToggleDock, onToggleInspect, onToggleStatus }) {
  const el = h('header', { class: 'topbar', role: 'banner' });

  const left = h('div', { class: 'topbar__left' });
  left.append(
    h('div', { class: 'brand' }, `
      <span class="brand__mark" aria-hidden="true">A<b>/</b>0</span>
      <span class="brand__text">
        <span class="brand__name">AGENT / ZERO</span>
        <span class="brand__sub">AN INTERACTIVE ATLAS OF AGENTIC AI</span>
      </span>`),
    h('span', { class: 'topbar__sep', 'aria-hidden': 'true' })
  );

  const center = h('div', { class: 'topbar__center' }, `
    <b>从语言，到行动。</b>
    <span class="topbar__sep" aria-hidden="true"></span>
    <span>本地教学模拟 · 无后端 · 无真实模型调用</span>`);

  const right = h('div', { class: 'topbar__right' });
  const mk = (label, title, onClick, pressed) => {
    const b = h('button', { class: 'iconbtn', type: 'button', title, 'aria-label': title, 'aria-pressed': pressed ? 'true' : 'false' }, label);
    b.addEventListener('click', onClick);
    return b;
  };

  const dockBtn = mk(
    `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h11M2.5 8h11M2.5 12h11"/></svg>`,
    '显示或隐藏左侧导航（快捷键 D）',
    onToggleDock
  );
  const inspectBtn = mk(
    `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M9.5 3v10"/></svg>`,
    '显示或隐藏右侧检视面板（快捷键 I）',
    onToggleInspect
  );
  const statusBtn = mk(
    `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M2.5 10.5h11"/></svg>`,
    '显示或隐藏底部事件区（快捷键 E）',
    onToggleStatus
  );
  const replayBtn = h('button', { class: 'btn tip', type: 'button', 'data-tip': '重播约 11 秒开场序列' }, '重播开场');
  replayBtn.addEventListener('click', onReplay);

  right.append(dockBtn, inspectBtn, statusBtn, h('span', { class: 'topbar__sep', 'aria-hidden': 'true' }), replayBtn);
  el.append(left, center, right);

  return {
    el,
    setPressed({ dock, inspect, status }) {
      dockBtn.setAttribute('aria-pressed', dock ? 'true' : 'false');
      inspectBtn.setAttribute('aria-pressed', inspect ? 'true' : 'false');
      statusBtn.setAttribute('aria-pressed', status ? 'true' : 'false');
    },
  };
}

/* ==================================================================== *
 * 左导航 / 能力架 + 术语索引
 * ==================================================================== */
export function Dock({ onMode, onTerm, onToggleCollapse, bayEl }) {
  const el = h('aside', { class: 'dock surface', 'aria-label': '主导航与能力架' });
  const head = h('div', { class: 'panel-head' }, `
    <span class="panel-head__title">导航</span>`);
  const collapse = h('button', { class: 'btn btn--sm', type: 'button', 'aria-label': '折叠或展开左侧导航' }, '折叠');
  head.append(collapse);

  const scroll = h('div', { class: 'dock__scroll' });
  // M0.2 能力架：常驻 Dock 顶部，装配入口不藏在二级页面里
  if (bayEl) scroll.append(bayEl);
  const modeGroup = h('div', { class: 'dock__group' });
  modeGroup.append(h('div', { class: 'dock__group-label' }, '<span>主要入口</span><span>M0.3</span>'));

  const items = new Map();
  for (const item of NAV) {
    const btn = h(
      'button',
      {
        class: 'navitem',
        type: 'button',
        'data-locked': item.locked ? 'true' : 'false',
        'aria-current': 'false',
        'aria-label': `${item.name}（${item.en}）｜${item.cn}｜阶段 ${item.milestone}`,
      },
      `<span class="navitem__idx">${item.idx}</span>
       <span class="navitem__body">
         <span class="navitem__name">${item.name}</span>
         <span class="navitem__cn">${item.cn}</span>
       </span>
       <span class="navitem__flag">${item.locked ? item.milestone.split(' ')[0] : '已实现'}</span>`
    );
    btn.addEventListener('click', () => onMode(item));
    items.set(item.id, btn);
    modeGroup.append(btn);
  }
  scroll.append(modeGroup);

  const termGroup = h('div', { class: 'dock__group' });
  termGroup.append(
    h('div', { class: 'dock__group-label' }, `<span>术语索引</span><span>${TERM_INDEX.length} 个</span>`),
    h('div', { class: 'note note--info', style: 'margin:0 4px 8px' }, `
      <span class="note__key">索引</span>
      <span>这里是全站术语速查（点击展开一行中文解释）。要看概念之间的<b>语义关系图</b>，请进入左侧「知识星图」（画布绘制 10 个已开放节点，目录覆盖六章全部概念）。</span>`)
  );
  const terms = h('div');
  for (const [en, cn, ch, note] of TERM_INDEX) {
    const t = h(
      'button',
      {
        class: 'term',
        type: 'button',
        title: `${cn}（第 ${ch} 章）— ${note}`,
        'aria-label': `${en}，${cn}：${note}`,
      },
      `<span class="term__en">${en}</span><span class="term__cn">${cn}</span><span class="term__ch">第${ch}章</span>`
    );
    // 中文解释就地可见：悬停或键盘聚焦时展开，不必离开页面去查
    const detail = h('span', { class: 'term__note', text: note });
    const row = h('div', { class: 'term-row' });
    row.append(t, detail);
    t.addEventListener('click', () => {
      row.dataset.open = row.dataset.open === 'true' ? 'false' : 'true';
      onTerm({ en, cn, ch, note });
    });
    terms.append(row);
  }
  termGroup.append(terms);
  scroll.append(termGroup);

  const foot = h('div', { class: 'dock__foot' });
  const storyBtn = h('button', { class: 'btn btn--ghost', type: 'button', style: 'width:100%' }, '查看六章蓝图');
  storyBtn.addEventListener('click', () => onMode(NAV.find((n) => n.id === 'story')));
  foot.append(h('div', { style: 'padding:8px' }, ''), storyBtn, h('div', { style: 'padding:8px' }));
  scroll.append(foot);

  el.append(head, scroll);

  collapse.addEventListener('click', () => {
    const collapsed = el.dataset.collapsed === 'true';
    el.dataset.collapsed = collapsed ? 'false' : 'true';
    collapse.textContent = collapsed ? '折叠' : '展开';
    onToggleCollapse?.(!collapsed);
  });

  return {
    el,
    setMode(id) {
      for (const [key, node] of items) node.setAttribute('aria-current', key === id ? 'true' : 'false');
    },
  };
}

/* ==================================================================== *
 * 中央舞台的外框（Canvas 由 scene.js 注入）
 * ==================================================================== */
export function Stage({ onViewChange, onReset, onToggleStatus }) {
  const el = h('section', { class: 'stage', 'aria-label': 'AZ-CORE 01 三维舞台' });
  const canvasHost = h('div', { class: 'stage__canvas' });
  const badge = h('div', { class: 'stage__badge' }, `${SIMULATED_CONSTANT} · 非真实模型执行`);
  const vignette = h('div', { class: 'stage__vignette', 'aria-hidden': 'true' });

  const tl = h('div', { class: 'stage__tl' });
  const readoutA = h('div', { class: 'stage__readout' });
  tl.append(readoutA);

  const tr = h('div', { class: 'stage__tr' });
  const readoutB = h('div', { class: 'stage__readout' });
  const readoutC = h('div', { class: 'stage__readout' });
  tr.append(readoutB, readoutC);

  const bl = h('div', { class: 'stage__bl' });
  const hint = h('div', { class: 'stage__hint' }, `
    <span>拖动旋转</span><kbd>拖拽</kbd>
    <span>缩放</span><kbd>滚轮</kbd>
    <span>取消选中</span><kbd>ESC</kbd>`);
  const resetBtn = h('button', { class: 'btn btn--sm', type: 'button', 'aria-label': '重置三维视角到标准镜位' }, '重置视角');
  resetBtn.addEventListener('click', onReset);
  bl.append(hint, resetBtn);

  const br = h('div', { class: 'stage__br' });
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': '视图切换' });
  const bAssembly = h(
    'button',
    { type: 'button', 'aria-pressed': 'true', 'aria-label': '切换到三维核心视图', title: '三维核心视图（快捷键 S）' },
    '三维核心'
  );
  const bSystem = h(
    'button',
    { type: 'button', 'aria-pressed': 'false', 'aria-label': '切换到二维系统视图', title: '二维系统视图（快捷键 S）' },
    '二维系统视图'
  );
  bAssembly.addEventListener('click', () => onViewChange('assembly'));
  bSystem.addEventListener('click', () => onViewChange('system'));
  seg.append(bAssembly, bSystem);
  const statusBtn = h('button', { class: 'btn btn--sm', type: 'button', 'aria-label': '展开或收起底部事件区' }, '事件区 ▴');
  statusBtn.addEventListener('click', onToggleStatus);
  br.append(seg, statusBtn);

  const chrome = h('div', { class: 'stage__chrome' });
  chrome.append(tl, tr, bl, br);
  el.append(canvasHost, vignette, badge, chrome);

  /** 二维投影层内部的返回按钮：由 app 层注册，保证两处开关状态同步 */
  let projectionSwitch = null;

  return {
    el,
    canvasHost,
    /** 开场前段让画布淡入：核心从虚空里“亮起来”靠光照与不透明度共同完成，不用黑幕遮挡 */
    setCanvasOpacity(v) {
      canvasHost.style.opacity = v.toFixed(3);
    },
    setView(view) {
      const isSystem = view === 'system';
      bAssembly.setAttribute('aria-pressed', isSystem ? 'false' : 'true');
      bSystem.setAttribute('aria-pressed', isSystem ? 'true' : 'false');
      el.dataset.view = isSystem ? 'system' : 'assembly';
      projectionSwitch?.setMode(view);
    },
    /** 注册二维投影层内的视图开关（app 层注入），两处控件共用同一状态 */
    bindProjectionSwitch(api) {
      projectionSwitch = api;
    },
    updateReadout({ coreState, zoom, azimuth, polar, fps, ms, drawCalls, triangles, programs, post, renderer }) {
      readoutA.innerHTML = `
        <div><b>AZ-CORE 01</b> · ${coreState}</div>
        <div>距离 ${zoom.toFixed(2)}u · 方位 ${azimuth.toFixed(0)}° · 极角 ${polar.toFixed(0)}°</div>`;
      readoutB.innerHTML = `
        <div><b>帧率</b> ${fps.toFixed(0)} fps · ${ms.toFixed(1)} ms</div>
        <div>绘制 ${drawCalls} · 三角面 ${triangles > 0 ? triangles.toLocaleString('zh-CN') : '—'} · 着色器 ${programs}</div>`;
      readoutC.innerHTML = `
        <div>后期处理 ${post ? '泛光 + 调色' : '关闭（降级档）'}</div>
        <div>${renderer}</div>`;
    },
    setStatusLabel(open) {
      statusBtn.textContent = open ? '事件区 ▾' : '事件区 ▴';
    },
  };
}

/* ==================================================================== *
 * 右 Inspector：唯一选中状态驱动
 * ==================================================================== */
export function Inspector({ onSelect, onToggle }) {
  const el = h('aside', { class: 'inspector surface', 'aria-label': '结构检视面板' });
  const head = h('div', { class: 'panel-head' }, '<span class="panel-head__title">结构检视</span>');
  const toggle = h('button', { class: 'btn btn--sm', type: 'button', 'aria-label': '收起检视面板' }, '收起');
  toggle.addEventListener('click', onToggle);
  head.append(toggle);

  const scroll = h('div', { class: 'inspector__scroll' });
  el.append(head, scroll);

  const stateTone = {
    muted: 'tag--muted',
    signal: 'tag--signal',
    attention: 'tag--attention',
    success: 'tag--success',
    error: 'tag--error',
  };

  function partView(part) {
    const frag = document.createDocumentFragment();
    const hero = h('div', { class: 'inspector__hero' }, `
      <div class="inspector__eyebrow">
        <span>${part.index}</span><span aria-hidden="true">/</span><span>已选结构</span>
      </div>
      <h2 class="inspector__title">${part.cn}</h2>
      <div class="inspector__sub">${part.name} · ${part.sub}</div>
      <div class="chips">
        ${part.tags.map((t) => `<span class="tag tag--muted">${t}</span>`).join('')}
        <span class="tag ${stateTone[part.state.tone] || 'tag--muted'}">
          <i class="dot ${part.state.shape === 'round' ? 'dot--round' : ''}" aria-hidden="true"></i>${part.state.label}
        </span>
      </div>`);
    frag.append(hero);

    // 一句话解释 + 深入机制
    frag.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>一句话解释</span><span>先看这里</span></div>
        <p class="explain">${md(part.understand)}</p>`)
    );

    // 关键参数：直接读取同一份几何参数
    frag.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>真实参数</span><span>实测值</span></div>
        <div class="mini">
          ${part.metrics.map(([k, v]) => `<div class="mini__cell"><div class="mini__k">${k}</div><div class="mini__v">${v}</div></div>`).join('')}
        </div>`)
    );

    // 深入机制
    frag.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>深入机制</span><span>结构</span></div>
        <dl class="kv">${part.inspect.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`)
    );

    if (part.notes?.length) {
      const notes = h('div', { class: 'section' });
      notes.append(h('div', { class: 'section__label' }, '<span>边界与声明</span>'));
      for (const [k, v] of part.notes) {
        notes.append(h('div', { class: 'note', style: 'margin-bottom:6px' }, `<span class="note__key">${k}</span><span>${v}</span>`));
      }
      frag.append(notes);
    }

    // 相关结构（点击可切换，形成关联导航）
    const connect = h('div', { class: 'section' });
    connect.append(h('div', { class: 'section__label' }, '<span>相关结构</span><span>跳转</span>'));
    const chips = h('div', { class: 'chips' });
    for (const rid of part.related) {
      const target = PARTS[rid];
      if (!target) continue;
      const b = h('button', { class: 'btn btn--sm', type: 'button' }, `${target.cn} · ${target.name}`);
      b.addEventListener('click', () => onSelect(rid));
      chips.append(b);
    }
    connect.append(chips);
    const all = h('div', { class: 'chips', style: 'margin-top:8px' });
    for (const id of PART_ORDER) {
      if (id === part.id) continue;
      const t = PARTS[id];
      const b = h('button', { class: 'tag tag--muted', type: 'button', style: 'cursor:pointer' }, `${t.index} ${t.cn}`);
      b.addEventListener('click', () => onSelect(id));
      all.append(b);
    }
    connect.append(all);
    frag.append(connect);

    frag.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>试一试</span></div>
        <div class="bullets">
          <li>再次点击同一结构，或按 <kbd>ESC</kbd>，即可取消选中并恢复整体亮度。</li>
          <li>切到 <b>二维系统视图</b> 后，同一个选中状态会在投影图中同步高亮。</li>
        </div>`)
    );
    return frag;
  }

  function overviewView({ coreState }) {
    const frag = document.createDocumentFragment();
    frag.append(
      h('div', { class: 'inspector__hero' }, `
        <div class="inspector__eyebrow"><span>AZ-CORE 01</span><span aria-hidden="true">/</span><span>未选中结构</span></div>
        <h2 class="inspector__title">中央核心尚未选中</h2>
        <div class="inspector__sub">运行状态：${coreState}</div>
        <div class="chips">
          <span class="tag tag--signal"><i class="dot dot--round dot--fill" aria-hidden="true"></i>${coreState}</span>
          <span class="tag tag--muted">实时三维舞台</span>
          <span class="tag tag--attention">三轨道 + 几何核</span>
        </div>`)
    );
    frag.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>怎么读这个页面</span><span>共 9 个结构</span></div>
        <p class="explain">点击舞台上的<b>任意结构</b>即可聚焦检视：外壳、能量核、约束环、三组机械轨道、接口、能量通道与数据脉冲各自对应一份真实参数与边界说明。所有高亮都来自同一个选中状态，三维与二维视图不会出现两套说法。</p>`)
    );

    const list = h('div', { class: 'section' });
    list.append(h('div', { class: 'section__label' }, '<span>可检视结构</span><span>层级 L0 – L4</span>'));
    const wrap = h('div', { class: 'bullets' });
    for (const id of PART_ORDER) {
      const p = PARTS[id];
      const row = h('li');
      const b = h('button', { class: 'btn btn--sm btn--ghost', type: 'button', style: 'justify-content:flex-start;width:100%' },
        `<span class="mono">${p.index}</span>&nbsp; ${p.cn} · ${p.name}`);
      b.addEventListener('click', () => onSelect(id));
      row.append(b);
      row.style.gridTemplateColumns = '1fr';
      wrap.append(row);
    }
    list.append(wrap);
    frag.append(list);

    frag.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>诚实声明</span></div>
        <div class="note"><span class="note__key">模拟</span><span>本页所有内容均为本地教学模拟。不存在真实模型推理、联网检索或工具执行；${SIMULATED_CONSTANT} 标注常驻舞台。</span></div>`)
    );
    return frag;
  }

  function render(state) {
    const part = state.selection ? PARTS[state.selection] : null;
    scroll.innerHTML = '';
    scroll.append(part ? partView(part) : overviewView(state));
    scroll.scrollTop = 0;
  }

  /**
   * M0.2：渲染外部传入的视图片段（模块配置面板）。
   * Inspector 本身不持有模块状态，内容全部由 constructor store 派生。
   */
  function renderCustom(fragment) {
    scroll.innerHTML = '';
    scroll.append(fragment);
    scroll.scrollTop = 0;
    el.dataset.mode = 'module';
  }

  /** 在默认结构总览上方插入装配概览，让「当前装配了什么」始终先被看到 */
  function prependSummary(fragment) {
    if (!fragment) return;
    scroll.prepend(fragment);
    el.dataset.mode = 'overview';
  }

  return { el, render, renderCustom, prependSummary, setCollapsed: (c) => (toggle.textContent = c ? '展开' : '收起') };
}

/* ==================================================================== *
 * 底部：事件日志 + 真实运行诊断
 * ==================================================================== */
export function Status({ onClear, onToggle }) {
  const el = h('section', { class: 'status surface', 'aria-label': '系统事件与运行诊断' });

  const logCol = h('div', { class: 'status__log' });
  const logHead = h('div', { class: 'panel-head' }, `
    <span class="panel-head__title">系统事件日志</span>
    <span style="display:flex;gap:8px;align-items:center">
      <span class="tag tag--muted">仅本地</span>
      <button class="btn btn--sm" type="button" data-act="clear">清空</button>
      <button class="btn btn--sm" type="button" data-act="hide">收起</button>
    </span>`);
  const list = h('div', { class: 'log', role: 'log', 'aria-live': 'polite', 'aria-label': '系统事件日志' });
  logCol.append(logHead, list);

  const diag = h('div', { class: 'status__diag' });
  diag.append(
    h('div', { class: 'section__label', style: 'margin:0 0 8px' }, '<span>运行诊断</span><span>实测值</span>'),
    h('dl', { class: 'kv', id: 'diag-kv' })
  );
  const bar = h('div', { class: 'bar', style: 'margin-top:8px' }, '<i style="width:0%"></i>');
  const barNote = h('div', { class: 'mono', style: 'color:var(--text-3);margin-top:5px;font-size:10.5px' }, '等待渲染数据…');
  diag.append(bar, barNote);

  el.append(logCol, diag);

  logHead.querySelector('[data-act="clear"]').addEventListener('click', onClear);
  logHead.querySelector('[data-act="hide"]').addEventListener('click', onToggle);

  function append(entry) {
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    const row = h('div', { class: 'log__row', 'data-level': entry.level });
    row.append(
      h('span', { class: 'log__t', text: entry.time }),
      h('span', { class: 'log__k', text: entry.kind }),
      h('span', { class: 'log__m', text: entry.message })
    );
    list.append(row);
    while (list.childElementCount > 220) list.firstElementChild.remove();
    if (nearBottom) list.scrollTop = list.scrollHeight;
  }

  function renderAll(entries) {
    list.innerHTML = '';
    entries.forEach(append);
  }

  function updateDiag(info) {
    const kv = diag.querySelector('#diag-kv');
    kv.innerHTML = info
      .map(([k, v]) => `<dt>${k}</dt><dd class="mono">${v}</dd>`)
      .join('');
    if (info.fps !== undefined) {
      const pct = Math.max(0, Math.min(100, (info.fps / 60) * 100));
      bar.querySelector('i').style.width = `${pct.toFixed(0)}%`;
      bar.dataset.state = info.fps >= 50 ? 'ok' : info.fps >= 30 ? 'attention' : 'error';
      barNote.textContent = info.barNote || '';
    }
  }

  return { el, append, renderAll, updateDiag };
}

/* ==================================================================== *
 * 开场层：AZ / INITIALIZATION SEQUENCE
 * ==================================================================== */
export function Boot({ onSkip, onFirstFrame }) {
  const el = h('div', { class: 'boot', 'data-phase': 'run', role: 'region', 'aria-label': 'AZ / INITIALIZATION SEQUENCE 开场序列' });
  el.innerHTML = `
    <div class="boot__vignette" aria-hidden="true"></div>
    <div class="boot__bars" aria-hidden="true"></div>
    <div class="boot__frame" aria-hidden="true">
      <span class="boot__corner boot__corner--tl"></span><span class="boot__corner boot__corner--tr"></span>
      <span class="boot__corner boot__corner--bl"></span><span class="boot__corner boot__corner--br"></span>
    </div>
    <div class="boot__topline" data-on="false">
      <span>AZ / INITIALIZATION SEQUENCE · 启动序列</span><span>·</span><span>实时三维渲染，非视频素材</span>
    </div>
    <div class="boot__hud">
      <div class="boot__brandblock" data-on="false">
        <div class="boot__logo" aria-label="AGENT ZERO">A<b>/</b>0</div>
        <div class="boot__name">AGENT / ZERO</div>
        <div class="boot__slogan"><em>FROM LANGUAGE TO ACTION.</em> &nbsp;从语言，到行动。</div>
      </div>
    </div>
    <div class="boot__shot" aria-live="polite">
      <div class="boot__shot-idx">01</div>
      <div class="boot__shot-body">
        <div class="boot__shot-en">镜头 01 / THE VOID · 虚空</div>
        <div class="boot__shot-cn">虚空</div>
        <div class="boot__shot-desc">纯黑空间中的极小白光，几何面仅局部显现。</div>
      </div>
    </div>
    <div class="boot__skipwrap">
      <div class="boot__progress">
        <div class="boot__progress-rail"><i></i></div>
        <div class="boot__shots">
          <span data-i="0" data-active="true">01</span><span data-i="1">02</span><span data-i="2">03</span>
          <span data-i="3">04</span><span data-i="4">05</span>
        </div>
      </div>
      <button class="btn boot__skip" type="button" autofocus>跳过开场 &nbsp;ESC</button>
    </div>`;

  const idxEl = el.querySelector('.boot__shot-idx');
  const enEl = el.querySelector('.boot__shot-en');
  const cnEl = el.querySelector('.boot__shot-cn');
  const descEl = el.querySelector('.boot__shot-desc');
  const rail = el.querySelector('.boot__progress-rail > i');
  const shotSpans = [...el.querySelectorAll('.boot__shots span')];
  const brand = el.querySelector('.boot__brandblock');
  const topline = el.querySelector('.boot__topline');
  const skip = el.querySelector('.boot__skip');
  skip.addEventListener('click', onSkip);

  let lastIdx = -1;

  function update(sampleState, label) {
    rail.style.width = `${(sampleState.progress * 100).toFixed(2)}%`;
    topline.dataset.on = sampleState.progress > 0.04 ? 'true' : 'false';
    if (label.idx !== lastIdx) {
      lastIdx = label.idx;
      idxEl.textContent = label.idx;
      enEl.textContent = `镜头 ${label.idx} / ${label.en} · ${label.cn}`;
      cnEl.textContent = label.cn;
      descEl.textContent = label.desc;
      shotSpans.forEach((s) => s.setAttribute('data-active', s.dataset.i === String(Number(label.idx) - 1) ? 'true' : 'false'));
    }
    brand.dataset.on = sampleState.chrome > 0.35 ? 'true' : 'false';
  }

  function focusSkip() {
    try {
      skip.focus({ preventScroll: true });
    } catch {
      /* 忽略：部分浏览器在动画帧内不允许强制聚焦 */
    }
    onFirstFrame?.();
  }

  return {
    el,
    update,
    focusSkip,
    setDone() {
      el.dataset.phase = 'done';
    },
    setRunning() {
      el.dataset.phase = 'run';
      lastIdx = -1;
    },
  };
}

/** Canvas 不可用时的兜底面板：明确说明降级原因与可用操作 */
export function FallbackNotice({ reason }) {
  const map = {
    WEBGL_UNAVAILABLE: '当前环境未提供可用的 WebGL 上下文（浏览器三维渲染接口）。',
    RENDERER_CREATE_FAILED: 'WebGL 渲染器创建失败。',
    CONTEXT_LOST: 'WebGL 上下文在运行中丢失。',
  };
  return h('div', { class: 'note', style: 'margin:12px' }, `
    <span class="note__key">降级</span>
    <span>${map[reason] || '三维视图不可用。'}已切换到 <b>二维 / SVG 结构投影</b>：核心、三组轨道与 12 个接口定位点仍可点击检视，导航与全部文字信息不受影响。本页不会出现永久黑屏。</span>`);
}

/** 未开放入口的说明面板（引导叙事 / 知识星图 / 实验空间 / 装配台） */
export function LockedPanel({ nav, onBack }) {
  const el = h('div', { class: 'surface', style: 'height:100%;display:flex;flex-direction:column;overflow:hidden' });
  const head = h('div', { class: 'panel-head' }, `
    <span class="panel-head__title">${nav.name} ${nav.en} · ${nav.cn}</span>
    <span class="tag tag--attention">${nav.milestone} 未开放</span>`);
  const body = h('div', { style: 'flex:1;min-height:0;overflow:auto;padding:14px' });
  body.append(
    h('div', { class: 'note', style: 'margin-bottom:12px' }, `
      <span class="note__key">阶段说明</span>
      <span>${nav.detail}</span>`),
    h('div', { class: 'section__label' }, '<span>里程碑</span><span>PRD v0.7</span>'),
    h('div', { style: 'display:flex;flex-direction:column;gap:6px;margin-bottom:14px' },
      MILESTONES.map(
        ([id, title, scope, state]) => `
        <div class="mini__cell">
          <div class="mini__k">${id} · ${state}</div>
          <div class="mini__v">${title}</div>
          <div class="explain" style="font-size:12px;margin-top:3px">${scope}</div>
        </div>`
      ).join(''))
  );

  if (nav.id === 'story') {
    body.append(
      h('div', { class: 'section__label' }, '<span>六章蓝图</span><span>PRD §4</span>'),
      h('div', { style: 'display:flex;flex-direction:column;gap:6px;margin-bottom:14px' },
        CHAPTERS.map(
          (c) => `
        <div class="mini__cell">
          <div class="mini__k">第 ${c.no} 章 · ${c.cn}（${c.en}）</div>
          <div class="mini__v" style="font-size:11.5px">${c.terms}</div>
          <div class="explain" style="font-size:12px;margin-top:3px">贯穿问题：${c.q}</div>
        </div>`
        ).join(''))
    );
  }
  if (nav.id === 'atlas') {
    body.append(
      h('div', { class: 'section__label' }, '<span>必守技术边界</span><span>PRD §4</span>'),
      h('div', { style: 'display:flex;flex-direction:column;gap:6px' },
        BOUNDARIES.map(
          ([k, v]) => `
        <div class="mini__cell">
          <div class="mini__k">${k}</div>
          <div class="explain" style="font-size:12px;margin-top:3px">${v}</div>
        </div>`
        ).join(''))
    );
  }
  if (nav.id === 'lab' || nav.id === 'constructor') {
    const scope =
      nav.id === 'lab'
        ? [
            ['Token Lab', '查看文本如何被切分成 token，以及近似计数与真实分词的区别。'],
            ['Context Lab', '调整指令与上下文预算，观察同一模型的行为变化。'],
            ['Connection Lab', '分辨直接函数调用与 MCP Host / Client / Server 的连接路径。'],
            ['Knowledge Vault', '文档拆块、关键词检索、向量样本与 SKILL.md 按需加载。'],
            ['Execution Lab', '观察计划—调用—返回—核验—重试—报告的事件序列。'],
            ['Reliability Lab', '冲突核验、引用溯源、权限审批、工具失败与提示注入。'],
          ]
        : [
            ['选择 → 预览 → 装配 → 配置 → 确认', '点击自动装配的完整五步路径。'],
            ['引导拖拽', '仅吸附到兼容端口；不兼容有提示并回退，Esc 取消。'],
            ['模块逻辑状态', '可用 / 预览 / 已装配 / 未配置 / 就绪 / 已禁用 / 非法。'],
            ['配置同步', '三维核心、二维系统图与配置显示来自同一份逻辑状态。'],
          ];
    body.append(
      h('div', { class: 'section__label' }, '<span>将包含的能力</span><span>计划内容</span>'),
      h('div', { style: 'display:flex;flex-direction:column;gap:6px' },
        scope.map(
          ([k, v]) => `
        <div class="mini__cell">
          <div class="mini__k">${k}</div>
          <div class="explain" style="font-size:12px;margin-top:3px">${v}</div>
        </div>`
        ).join(''))
    );
  }

  const foot = h('div', { style: 'padding:12px;border-top:1px solid var(--border-faint)' });
  const back = h('button', { class: 'btn btn--primary', type: 'button', style: 'width:100%' }, '← 返回中央核心视图');
  back.addEventListener('click', () => onBack());
  foot.append(back);

  el.append(head, body, foot);
  return el;
}

/** 术语点击：记录为真实事件，不做假跳转 */
export function bindTermClick(term) {
  log('术语', `${term.en} · ${term.cn} — ${term.note || ''}`, 'signal');
}

export { h as createEl };

/**
 * src/features/atlas/graph/atlasGraph.js
 * ------------------------------------------------------------------
 * Atlas 星图的 SVG 渲染与交互层（只做表现，不持有业务真相）。
 *
 * 设计约束（M0.3_TASK §4.2 / §4.3 / §10）：
 *   · 坐标固定、可重现：不使用随机力导向布局，刷新不会重排；
 *   · 缩放有上下限幅，平移有边界，Reset View 恢复标准视角；
 *   · 键盘用户不必操作画布命中点：节点本身可聚焦，外部概念列表也由
 *     调用方提供（本模块只负责画布内的等价入口）；
 *   · 关系方向只在明确有向的边上画箭头，RELATED / CONTRASTS 不画。
 * ------------------------------------------------------------------
 */
import { GRAPH_VIEW, NODE_LAYOUT, getConcept, graphModel, relationMeta } from '../data/index.js';

const ZOOM_MIN = 0.55;
const ZOOM_MAX = 2.6;
const FOCUS_SCALE = 1.5;
const NODE_R = 34;

/**
 * 星图只绘制「已开放节点」：两端都必须有固定坐标。
 * 36 个概念中尚未撰写正文的节点只出现在目录与搜索里，不会被画成已完成节点。
 */
const MODEL = graphModel();

/** 关系无障碍标签里用到的中文名：概念缺失时退回 id，绝不抛错 */
function conceptCn(id) {
  return getConcept(id)?.cn || id;
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    el.setAttribute(k, String(v));
  }
  return el;
}

export function createAtlasGraph({ onSelectConcept, onOpenConcept, onSelectEdge, onViewChange, reducedMotion = false } = {}) {
  const root = document.createElement('div');
  root.className = 'atlas-graph';

  const svg = svgEl('svg', {
    class: 'atlas-svg',
    viewBox: `0 0 ${GRAPH_VIEW.width} ${GRAPH_VIEW.height}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'group',
    'aria-label': `知识星图画布：${MODEL.nodes.length} 个概念，可平移缩放；也可用概念目录探索`,
  });

  const defs = svgEl('defs');
  const marker = svgEl('marker', {
    id: 'atlas-arrow',
    viewBox: '0 0 8 8',
    refX: '7',
    refY: '4',
    markerWidth: '5',
    markerHeight: '5',
    orient: 'auto-start-reverse',
  });
  marker.append(svgEl('path', { d: 'M0,0 L8,4 L0,8 z', class: 'atlas-arrow-head' }));
  defs.append(marker);
  svg.append(defs);

  const viewport = svgEl('g', { class: 'atlas-viewport' });
  const edgeLayer = svgEl('g', { class: 'atlas-edges' });
  const nodeLayer = svgEl('g', { class: 'atlas-nodes' });
  viewport.append(edgeLayer, nodeLayer);
  svg.append(viewport);
  root.append(svg);

  const nodeRefs = new Map();
  const edgeRefs = new Map();

  /* ---------------- 边 ---------------- */
  for (const edge of MODEL.edges) {
    const from = NODE_LAYOUT[edge.sourceId];
    const to = NODE_LAYOUT[edge.targetId];
    if (!from || !to) continue;
    const meta = relationMeta(edge.type);
    const g = svgEl('g', {
      class: 'atlas-edge',
      'data-edge': edge.id,
      'data-type': edge.type,
      'data-directed': edge.directed ? 'true' : 'false',
      tabindex: '0',
      role: 'button',
      'aria-label': `${conceptCn(edge.sourceId)} 与 ${conceptCn(edge.targetId)} 的关系：${meta.cn}（${edge.type}）。${edge.description}`,
    });
    const line = svgEl('line', {
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      class: 'atlas-edge__line',
      'stroke-dasharray': meta.dash || null,
      'marker-end': edge.directed ? 'url(#atlas-arrow)' : null,
      'data-type': edge.type,
    });
    // 命中区：细线不好点，另加一条透明粗线用于悬停与选中
    const hit = svgEl('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: 'atlas-edge__hit' });
    g.append(line, hit);
    const activate = () => onSelectEdge?.(edge);
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      activate();
    });
    g.addEventListener('mouseenter', () => g.classList.add('is-hover'));
    g.addEventListener('mouseleave', () => g.classList.remove('is-hover'));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
    edgeLayer.append(g);
    edgeRefs.set(edge.id, { g, line });
  }

  /* ---------------- 节点 ---------------- */
  for (const concept of MODEL.nodes) {
    const id = concept.id;
    const { x, y } = NODE_LAYOUT[id];
    const hasLanding = concept.systemTarget !== 'none';
    const g = svgEl('g', {
      class: 'atlas-node',
      'data-concept': id,
      'data-chapter': concept.chapterId,
      'data-status': concept.contentStatus,
      'data-target': concept.systemTarget,
      transform: `translate(${x},${y})`,
      tabindex: '0',
      role: 'button',
      'aria-label': `${concept.cn}（${concept.name}）${concept.tagline}${hasLanding ? '，可在装配台中查看' : '，装配台暂无对应模块'}`,
    });
    g.append(svgEl('circle', { r: NODE_R + 40, class: 'atlas-node__halo' }));
    g.append(svgEl('circle', { r: NODE_R, class: 'atlas-node__disc' }));
    g.append(svgEl('circle', { r: NODE_R + 7, class: 'atlas-node__ring' }));
    const idx = svgEl('text', { class: 'atlas-node__idx', y: -NODE_R - 14, 'text-anchor': 'middle' });
    idx.textContent = concept.idx;
    const name = svgEl('text', { class: 'atlas-node__name', y: 2, 'text-anchor': 'middle' });
    name.textContent = concept.name;
    const cn = svgEl('text', { class: 'atlas-node__cn', y: 19, 'text-anchor': 'middle' });
    cn.textContent = concept.cn.split(/[（(]/)[0];
    g.append(idx, name, cn);
    const title = svgEl('title'); title.textContent = `第${concept.chapterNo}章 · ${concept.cn} / ${concept.name}`; g.append(title);
    if (hasLanding) {
      g.append(svgEl('rect', { class: 'atlas-node__mark', x: -4, y: -NODE_R - 6, width: 8, height: 8, rx: 1 }));
    }
    const activate = () => onSelectConcept?.(concept);
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      activate();
    });
    g.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      focusConcept(id);
      onOpenConcept?.(id);
    });
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        focusConcept(id);
      }
    });
    nodeLayer.append(g);
    nodeRefs.set(id, g);
  }

  /* ---------------- 缩放 / 平移 ---------------- */
  const transform = { k: 1, x: 0, y: 0 };
  let dragging = null;

  function applyTransform() {
    viewport.setAttribute('transform', `translate(${transform.x.toFixed(2)},${transform.y.toFixed(2)}) scale(${transform.k.toFixed(4)})`);
    root.dataset.density = transform.k < 1.3 ? 'overview' : 'detail';
    onViewChange?.({ ...transform });
  }

  function clampTransform() {
    transform.k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, transform.k));
    // 平移限幅：画布外不允许无限拖走，保证图形总有一部分可见
    const w = GRAPH_VIEW.width * transform.k;
    const h = GRAPH_VIEW.height * transform.k;
    const padX = GRAPH_VIEW.width * 0.42;
    const padY = GRAPH_VIEW.height * 0.42;
    transform.x = Math.min(padX, Math.max(GRAPH_VIEW.width - w - padX, transform.x));
    transform.y = Math.min(padY, Math.max(GRAPH_VIEW.height - h - padY, transform.y));
  }

  function setTransform(next) {
    Object.assign(transform, next);
    clampTransform();
    applyTransform();
  }

  function zoomBy(factor, originX = GRAPH_VIEW.width / 2, originY = GRAPH_VIEW.height / 2) {
    const k0 = transform.k;
    const k1 = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k0 * factor));
    if (k1 === k0) return;
    // 以指针位置为锚点缩放：图形不会在光标下乱跑
    const ratio = k1 / k0;
    setTransform({
      k: k1,
      x: originX - (originX - transform.x) * ratio,
      y: originY - (originY - transform.y) * ratio,
    });
  }

  /** 客户端坐标 → viewBox 坐标（缩放锚点与平移换算共用） */
  function toLocal(clientX, clientY) {
    const matrix = svg.getScreenCTM();
    if (matrix) {
      const point = svg.createSVGPoint();
      point.x = clientX; point.y = clientY;
      return point.matrixTransform(matrix.inverse());
    }
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: GRAPH_VIEW.width / 2, y: GRAPH_VIEW.height / 2 };
    return {
      x: ((clientX - rect.left) / rect.width) * GRAPH_VIEW.width,
      y: ((clientY - rect.top) / rect.height) * GRAPH_VIEW.height,
    };
  }

  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const p = toLocal(e.clientX, e.clientY);
      zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
    },
    { passive: false }
  );

  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target.closest('.atlas-node, .atlas-edge')) return;
    dragging = { id: e.pointerId, startX: e.clientX, startY: e.clientY, x0: transform.x, y0: transform.y, moved: false };
    // 合成事件 / 无活动指针时 setPointerCapture 会抛 NotFoundError：
    // 捕获失败只影响「拖出画布仍能收到事件」，不应让整个画布交互中断
    try {
      svg.setPointerCapture?.(e.pointerId);
    } catch {
      /* 忽略：后续 pointermove 仍然可用 */
    }
    root.dataset.grabbing = 'true';
  });

  svg.addEventListener('pointermove', (e) => {
    if (!dragging || dragging.id !== e.pointerId) return;
    const current = toLocal(e.clientX, e.clientY);
    const start = toLocal(dragging.startX, dragging.startY);
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) dragging.moved = true;
    setTransform({ x: dragging.x0 + dx, y: dragging.y0 + dy });
  });

  function endDrag(e) {
    if (!dragging || (e && dragging.id !== e.pointerId)) return;
    dragging = null;
    root.dataset.grabbing = 'false';
  }
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('pointerleave', endDrag);

  /* ---------------- 状态表现 ---------------- */
  let selectedId = null;
  let selectedEdgeId = null;
  let visibleNodes = new Set(MODEL.nodes.map(n => n.id));
  let visibleEdges = new Set(MODEL.edges.map(e => e.id));

  /** 选中与匹配的视觉：其余节点降亮，让「现在该看哪个」一眼可读 */
  function refresh() {
    const relatedIds = new Set();
    if (selectedId) {
      relatedIds.add(selectedId);
      for (const edge of MODEL.edges) {
        if (!visibleEdges.has(edge.id)) continue;
        if (edge.sourceId === selectedId) relatedIds.add(edge.targetId);
        if (edge.targetId === selectedId) relatedIds.add(edge.sourceId);
      }
    }
    for (const [id, g] of nodeRefs) {
      g.style.display = visibleNodes.has(id) ? '' : 'none';
      g.setAttribute('tabindex', visibleNodes.has(id) ? '0' : '-1');
      const isSelected = id === selectedId;
      const isRelated = !!selectedId && relatedIds.has(id) && !isSelected;
      g.classList.toggle('is-selected', isSelected);
      g.classList.toggle('is-related', isRelated);
      g.classList.toggle('is-dim', !!selectedId && !isSelected && !isRelated);
    }
    for (const edge of MODEL.edges) {
      const ref = edgeRefs.get(edge.id);
      if (!ref) continue;
      ref.g.style.display = visibleEdges.has(edge.id) ? '' : 'none';
      ref.g.setAttribute('tabindex', visibleEdges.has(edge.id) ? '0' : '-1');
      const touches = !!selectedId && (edge.sourceId === selectedId || edge.targetId === selectedId);
      ref.g.classList.toggle('is-active', touches || edge.id === selectedEdgeId);
      ref.g.classList.toggle('is-dim', !!selectedId && !touches);
      ref.g.classList.toggle('is-selected', edge.id === selectedEdgeId);
    }
  }

  function setSelection(conceptId) {
    selectedId = conceptId || null;
    if (selectedId) selectedEdgeId = null;
    refresh();
  }

  function setSelectedEdge(edgeId) {
    selectedEdgeId = edgeId || null;
    if (selectedEdgeId) selectedId = null;
    refresh();
  }

  /** 搜索结果：只做视觉高亮，不改动业务状态 */
  function setMatches(ids = []) {
    const set = new Set(ids);
    for (const [id, g] of nodeRefs) {
      g.classList.toggle('is-match', set.size > 0 && set.has(id));
      g.classList.toggle('is-miss', set.size > 0 && !set.has(id) && !g.classList.contains('is-selected'));
    }
  }

  function clearMatches() {
    for (const g of nodeRefs.values()) g.classList.remove('is-match', 'is-miss');
  }

  /** 聚焦：把节点移到画布中心，缩放使用固定档位，可重复得到同一视角 */
  function focusConcept(conceptId) {
    const p = NODE_LAYOUT[conceptId];
    if (!p) return;
    const k = reducedMotion ? 1 : FOCUS_SCALE;
    setTransform({ k, x: GRAPH_VIEW.width / 2 - p.x * k, y: GRAPH_VIEW.height / 2 - p.y * k });
    nodeRefs.get(conceptId)?.classList.add('is-focused');
    setTimeout(() => nodeRefs.get(conceptId)?.classList.remove('is-focused'), 700);
  }

  /** 复位：回到标准视角（k=1 且不平移） */
  function resetView() {
    setTransform({ k: 1, x: 0, y: 0 });
  }

  /** 适配视窗：按节点包围盒取一个可读的缩放，仍受上下限幅约束 */
  function fitView() {
    if (!visibleNodes.size) { resetView(); return; }
    const xs = [...visibleNodes].map(id => NODE_LAYOUT[id].x);
    const ys = [...visibleNodes].map(id => NODE_LAYOUT[id].y);
    const pad = NODE_R + 66;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(GRAPH_VIEW.width / (maxX - minX), GRAPH_VIEW.height / (maxY - minY))));
    setTransform({ k, x: GRAPH_VIEW.width / 2 - ((minX + maxX) / 2) * k, y: GRAPH_VIEW.height / 2 - ((minY + maxY) / 2) * k });
  }

  applyTransform();

  return {
    el: root,
    svg,
    setSelection,
    setSelectedEdge,
    setMatches,
    clearMatches,
    focusConcept,
    resetView,
    fitView,
    zoomBy,
    getViewState: () => ({ ...transform }),
    restoreViewState(state) {
      if (!state || typeof state !== 'object') return false;
      const k = Number(state.k);
      const x = Number(state.x);
      const y = Number(state.y);
      if (![k, x, y].every(Number.isFinite)) return false;
      setTransform({ k, x, y });
      return true;
    },
    setFilter(nodes, edges) {
      visibleNodes = new Set(nodes.map(n => n.id));
      visibleEdges = new Set(edges.map(e => e.id));
      if (!visibleNodes.has(selectedId)) selectedId = null;
      if (!visibleEdges.has(selectedEdgeId)) selectedEdgeId = null;
      refresh();
    },
    getTransform: () => ({ ...transform }),
    nodeElement: (id) => nodeRefs.get(id) || null,
    edgeElement: (id) => edgeRefs.get(id)?.g || null,
    /** 键盘用户的可访问入口：按顺序返回全部节点的焦点目标 */
    focusables: () => [...nodeRefs.values()],
    destroy() {
      svg.replaceChildren();
      nodeRefs.clear();
      edgeRefs.clear();
    },
  };
}

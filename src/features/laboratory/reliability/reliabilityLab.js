/**
 * src/features/laboratory/reliability/reliabilityLab.js
 * ------------------------------------------------------------------
 * LAB 06 · RELIABILITY LAB 的界面层（M1.3 D06 / §7）。
 *
 * 主区固定为四块，顺序即读者的推理顺序：
 *   1. 资料与不可信样本（明确标注「教学用模拟提示注入样本」）
 *   2. 请求判定（每次请求同时显示权限 / 沙箱 / 护栏三层结论）
 *   3. Tracing（可筛选的本地事件链）
 *   4. Evals（固定样例 + 判定理由 + 分数）
 * 左下角另有「权限 × 沙箱」2×2 联动表，用来证明开关真的影响结果。
 *
 * 页面上不会出现「已通过安全认证」「彻底防御注入」这类表述。
 * ------------------------------------------------------------------
 */
import { h, esc, md } from '../../constructor/components/dom.js';
import {
  GUARDRAIL_TOGGLES,
  POLICY_TOGGLES,
  RESOURCES,
  SANDBOX_MODES,
  evaluateRequest,
} from './policy.js';
import { GUARDRAIL_LIMITS, GUARDRAIL_LAYERS } from './guardrails.js';
import { INJECTION_SAMPLE } from './samples.js';
import { filterTrace, runReliabilityLab, TRACE_FILTERS } from './reliabilityLabLogic.js';
import { DEFAULT_POLICY } from './policy.js';

const CONCEPT_LINKS = Object.freeze(['permissions', 'sandbox', 'prompt_injection', 'guardrails', 'tracing', 'evals']);
const EVAL_TONE = (pass) => (pass ? 'success' : 'attention');

export function createReliabilityLab({
  learning,
  entryConceptId = 'permissions',
  onBackToHub,
  onOpenLab,
  onOpenConcept,
  onLog,
} = {}) {
  const el = h('div', { class: 'workspace workspace--lab-lab', 'data-open': 'true', 'data-lab': 'reliability' });

  let policy = { ...DEFAULT_POLICY, guardrails: { ...DEFAULT_POLICY.guardrails } };
  let includeInjection = true;
  let filterId = 'all';
  let run = runReliabilityLab({ policy, includeInjection });
  let completed = false;

  /* ----------------------------- 头部 ----------------------------- */
  const head = h('header', { class: 'ws-head' });
  const headMeta = h('div', { class: 'ws-head__meta', 'data-el': 'context' });
  head.append(
    h('div', { class: 'ws-head__id' }, `
      <span class="ws-head__tag">A/0</span>
      <span class="ws-head__title">LAB 06 · RELIABILITY LAB</span>
      <span class="ws-head__meta" data-el="subtitle">权限 · 沙箱 · 提示注入 · 护栏 · 追踪 · 评估</span>`),
    h('div', { class: 'ws-head__actions' }, '<span class="tag tag--attention">SIMULATION · 前端规则</span>')
  );
  const actions = head.querySelector('.ws-head__actions');
  const backLab = h('button', { class: 'btn btn--primary', type: 'button', 'data-act': 'back-lab' }, '← 返回实验空间');
  backLab.addEventListener('click', () => onOpenLab?.());
  const hub = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'hub' }, 'Back to Hub');
  hub.addEventListener('click', () => onBackToHub?.('hub'));
  const reset = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'reset' }, 'RESET · 复位配置');
  reset.addEventListener('click', () => {
    policy = { ...DEFAULT_POLICY, guardrails: { ...DEFAULT_POLICY.guardrails } };
    includeInjection = true;
    filterId = 'all';
    run = runReliabilityLab({ policy, includeInjection });
    render();
    onLog?.('实验', 'Lab 06 配置已复位为最小权限 + 仅公开目录 + 护栏全开', 'info');
  });
  actions.append(backLab, hub, reset);

  /* ----------------------------- 三栏 ----------------------------- */
  const params = h('aside', { class: 'lab-params surface', 'aria-label': '权限、沙箱与护栏配置' });
  const paramsBody = h('div', { class: 'lab-params__scroll' });
  params.append(h('div', { class: 'panel-head' }, '<span class="panel-head__title">配置</span>'), paramsBody);

  const main = h('section', { class: 'lab-canvas', 'aria-live': 'polite', 'aria-label': '样本、请求判定、追踪与评估' });
  const aside = h('aside', { class: 'lab-inspector surface', 'aria-label': '评估结果、完成状态与边界' });
  const asideBody = h('div', { class: 'lab-inspector__scroll' });
  aside.append(h('div', { class: 'panel-head' }, '<span class="panel-head__title">评估与边界</span>'), asideBody);

  el.append(head, h('div', { class: 'lab-body' }, params, main, aside));

  /* ================================================================== *
   * 参数区
   * ================================================================== */
  function toggleRow({ label, pressed, onToggle, note, id, disabled = false }) {
    const row = h('div', { class: 'rlb-toggle', 'data-toggle': id });
    const btn = h('button', {
      class: 'btn btn--sm',
      type: 'button',
      'data-act': `toggle-${id}`,
      'aria-pressed': String(pressed),
      disabled: disabled || undefined,
    }, pressed ? '已允许' : '已拒绝');
    btn.addEventListener('click', () => {
      if (disabled) return;
      onToggle(!pressed);
    });
    row.append(h('span', { class: 'rlb-toggle__label' }, esc(label)), btn);
    if (note) row.append(h('div', { class: 'tk-field__hint' }, esc(note)));
    return row;
  }

  function renderParams() {
    paramsBody.replaceChildren();

    const perm = h('div', { class: 'section', 'data-act': 'permissions' });
    perm.append(h('div', { class: 'section__label' }, '<span>Permissions · 权限</span><span>默认拒绝</span>'));
    for (const toggle of POLICY_TOGGLES) {
      perm.append(
        toggleRow({
          id: `perm-${toggle.key}`,
          label: toggle.cn,
          pressed: policy[toggle.key] === true,
          note: toggle.note,
          onToggle: (next) => update({ [toggle.key]: next }, `权限「${toggle.cn}」改为${next ? '允许' : '拒绝'}`),
        })
      );
    }
    paramsBody.append(perm);

    const sandbox = h('div', { class: 'section', 'data-act': 'sandbox' });
    sandbox.append(h('div', { class: 'section__label' }, '<span>Sandbox · 隔离范围</span><span>仅规则模拟</span>'));
    const row = h('div', { class: 'tk-seg tk-seg--wrap', role: 'group', 'aria-label': '沙箱白名单' });
    for (const mode of SANDBOX_MODES) {
      const b = h('button', { type: 'button', 'data-sandbox': mode.id, 'aria-pressed': String(policy.sandbox === mode.id) }, mode.cn);
      b.addEventListener('click', () => {
        if (policy.sandbox === mode.id) return;
        update({ sandbox: mode.id }, `沙箱白名单改为「${mode.cn}」`);
      });
      row.append(b);
    }
    sandbox.append(row, h('div', { class: 'tk-field__hint' }, SANDBOX_MODES.find((m) => m.id === policy.sandbox)?.note || ''));
    sandbox.append(
      h('div', { class: 'note note--isolation', style: 'margin-top:6px' }, `
        <span class="note__key">不构成真实隔离</span>
        <span>这里只有一条本地路径匹配规则：没有文件系统、没有网络、没有子进程。真实隔离要由操作系统、容器或运行时提供。</span>`)
    );
    paramsBody.append(sandbox);

    const guard = h('div', { class: 'section', 'data-act': 'guardrails' });
    guard.append(h('div', { class: 'section__label' }, '<span>Guardrails · 护栏</span><span>三处检查</span>'));
    for (const toggle of GUARDRAIL_TOGGLES) {
      guard.append(
        toggleRow({
          id: `guard-${toggle.key}`,
          label: toggle.cn,
          pressed: policy.guardrails[toggle.key] === true,
          note: toggle.note,
          onToggle: (next) => update({ guardrails: { ...policy.guardrails, [toggle.key]: next } }, `${toggle.cn}${next ? '开启' : '关闭'}`),
        })
      );
    }
    guard.append(
      h('div', { class: 'note note--info', style: 'margin-top:6px' }, `
        <span class="note__key">护栏 ≠ 权限</span>
        <span>工具护栏只阻断非法路径结构，敏感资源仅做标记；是否放行仍由权限与沙箱决定。</span>`)
    );
    paramsBody.append(guard);

    const sample = h('div', { class: 'section', 'data-act': 'sample-toggle' });
    sample.append(h('div', { class: 'section__label' }, '<span>不可信样本</span><span>明确标记</span>'));
    sample.append(
      toggleRow({
        id: 'injection',
        label: '加载教学用模拟注入样本',
        pressed: includeInjection,
        note: '样本为虚构文本，只作为数据处理；关闭后本次只跑正常流程。',
        onToggle: (next) => {
          includeInjection = next;
          update({}, `注入样本${next ? '加载' : '移除'}`);
        },
      })
    );
    paramsBody.append(sample);

    paramsBody.append(
      h('div', { class: 'note note--info', style: 'margin-top:10px' }, `
        <span class="note__key">数据</span>
        <span>公开资料 2 份（NTC-1008 / NTC-1009，沿用 M0.4 虚构语料）+ 1 份明确标记的模拟注入样本。无真实个人信息。</span>`)
    );
  }

  /* ================================================================== *
   * 主区
   * ================================================================== */
  function renderMain() {
    main.replaceChildren();
    main.append(
      h('div', { class: 'lab-hero' }, `
        <div class="lab-hero__idx">LAB 06 / 第 06 章 可靠性与边界</div>
        <h2 class="lab-hero__title">权限管「能不能做」，沙箱管「碰得到什么」，护栏管「像不像该做」</h2>
        <p class="lab-hero__lead">下面每一行判定都同时列出三层检查。被拒绝的请求只有拒绝记录，绝不会同时显示成功；不可信样本只作为数据被检查，不会改写配置或权限。</p>`)
    );
    main.append(renderSamples());
    main.append(renderRequests());
    main.append(renderMatrix());
    main.append(renderConclusion());
    main.append(renderTrace());
    main.append(renderEvals());
    return undefined;
  }

  function renderSamples() {
    const wrap = h('div', { class: 'section', 'data-act': 'samples' });
    wrap.append(h('div', { class: 'section__label' }, '<span>本次资料</span><span>1 份不可信样本</span>'));
    for (const doc of run.samples.publicDocs) {
      wrap.append(
        h('div', { class: 'rlb-doc', 'data-doc': doc.docId, 'data-untrusted': 'false' }, `
          <div class="rlb-doc__head">
            <span class="mono">${esc(doc.docId)}</span>
            <span>${esc(doc.title)}</span>
            <span class="tag tag--success">公开公告</span>
          </div>
          <div class="knl-dim">${esc(doc.publisher)} · ${esc(doc.publishedAt)} · 虚构数据</div>`)
      );
    }
    if (run.samples.injection) {
      const sample = run.samples.injection;
      wrap.append(
        h('div', { class: 'rlb-doc rlb-doc--untrusted', 'data-doc': sample.docId, 'data-untrusted': 'true' }, `
          <div class="rlb-doc__head">
            <span class="mono">${esc(sample.docId)}</span>
            <span>${esc(sample.title)}</span>
            <span class="tag tag--attention">教学用模拟提示注入样本</span>
          </div>
          <div class="knl-dim">${esc(sample.publisher)} · ${esc(sample.publishedAt)} · untrusted = true</div>
          <div class="rlb-quote">${esc(sample.paragraphs[1])}</div>
          <div class="knl-dim">它试图触发的动作：${sample.attemptedActions.map((action) => `${esc(action.resourceId)}（${esc(action.operation)}）`).join('、')}
          —— 这些动作全部要经过权限 / 沙箱 / 护栏检查，文档不能自己决定结果。</div>`)
      );
    }
    wrap.append(h('div', { class: 'tk-field__hint' }, run.samples.note));
    return wrap;
  }

  function renderRequests() {
    const wrap = h('div', { class: 'section', 'data-act': 'requests' });
    wrap.append(h('div', { class: 'section__label' }, `<span>请求判定</span><span>${run.requests.length} 次请求 · 三层检查</span>`));
    wrap.append(
      h('div', { class: 'note note--info' }, `
        <span class="note__key">怎么读</span>
        <span>每一行都列出权限 → 沙箱 → 护栏三层结论；任一层不通过即拒绝。护栏对敏感资源只**标记**、不代替授权，所以权限开关才会产生可见差异。</span>`)
    );

    for (const request of run.requests) {
      const allowed = request.decision === 'allowed';
      const card = h('div', { class: 'rlb-req', 'data-request': request.resourceId, 'data-decision': request.decision });
      card.append(
        h('div', { class: 'rlb-req__head' }, `
          <span class="mono">${esc(request.resourceId)}</span>
          <span class="tag tag--${allowed ? 'success' : 'attention'}">${allowed ? '允许' : '拒绝'}</span>
          ${request.inducedBy ? `<span class="tag tag--attention">由不可信样本诱导</span>` : '<span class="tag tag--muted">正常任务请求</span>'}`),
        h('div', { class: 'knl-dim' }, esc(request.primaryReason))
      );
      const checks = h('div', { class: 'rlb-checks' });
      for (const check of request.checks) {
        const layerCn = { permission: '权限', sandbox: '沙箱', guardrail: '护栏', validate: '校验' }[check.layer] || check.layer;
        checks.append(
          h('div', { class: 'rlb-check', 'data-layer': check.layer, 'data-pass': check.pass ? 'true' : 'false' }, `
            <span class="rlb-check__layer">${esc(layerCn)}</span>
            <span class="tag tag--${check.pass ? 'success' : 'attention'}">${check.pass ? (check.flagged ? '通过（已标记）' : '通过') : '阻断'}</span>
            <span class="knl-dim"><span class="mono">${esc(check.rule)}</span> · ${esc(check.reason)}</span>`)
        );
      }
      card.append(checks);
      wrap.append(card);
    }
    return wrap;
  }

  /** 2×2 联动表：权限 × 沙箱 → 是否放行（证明开关真的影响结果） */
  function renderMatrix() {
    const wrap = h('div', { class: 'section', 'data-act': 'matrix' });
    wrap.append(h('div', { class: 'section__label' }, '<span>权限 × 沙箱 联动</span><span>以「读取私有评议记录」为例</span>'));
    const table = h('div', { class: 'rlb-matrix', 'data-act': 'matrix-table' });
    table.append(h('div', { class: 'rlb-matrix__cell rlb-matrix__cell--head' }, '读取私有记录 \\ 沙箱'));
    for (const mode of SANDBOX_MODES) table.append(h('div', { class: 'rlb-matrix__cell rlb-matrix__head' }, mode.cn));
    for (const allowed of [false, true]) {
      table.append(h('div', { class: 'rlb-matrix__cell rlb-matrix__row-head' }, allowed ? '权限：允许' : '权限：拒绝'));
      for (const mode of SANDBOX_MODES) {
        const verdict = evaluateRequest({
          resourceId: 'private/review-records/PRV-01',
          policy: { ...policy, readPrivateRecords: allowed, sandbox: mode.id },
        });
        table.append(
          h('div', {
            class: 'rlb-matrix__cell',
            'data-perm': allowed ? 'allow' : 'deny',
            'data-sandbox': mode.id,
            'data-decision': verdict.decision,
          }, `<span class="tag tag--${verdict.decision === 'allowed' ? 'success' : 'attention'}">${verdict.decision === 'allowed' ? '放行' : '阻断'}</span>`)
        );
      }
    }
    wrap.append(table);
    wrap.append(h('div', { class: 'tk-field__hint' }, '同一行里权限放开但沙箱仍拦截，说明两层互补；两层都放开才真正读到私有记录——这正是「配置过宽」的风险来源。'));
    return wrap;
  }

  function renderConclusion() {
    const wrap = h('div', { class: 'section', 'data-act': 'conclusion' });
    wrap.append(h('div', { class: 'section__label' }, '<span>本次结论</span><span>来自公开来源</span>'));
    wrap.append(
      h('div', { class: 'knl-answer', 'data-status': run.conclusion.status }, `
        <div class="knl-answer__head">
          <span class="tag tag--attention">${esc(run.conclusion.statusCn)}</span>
          <span class="knl-answer__label">SIMULATED · 本地规则生成</span>
        </div>
        <p class="knl-answer__line">${md(run.conclusion.text)}</p>
        <div class="ctx-citations">${run.conclusion.citations
          .map((cite) => `<div class="ctx-citation mono" data-citation="${esc(cite.docId)}">[${esc(cite.docId)}] 公开公告</div>`)
          .join('')}</div>`)
    );
    if (run.injection.included) {
      wrap.append(
        h('div', { class: 'note note--isolation' }, `
          <span class="note__key">注入样本的处理</span>
          <span>输入护栏${run.injection.flagged ? `命中 ${run.injection.hits.length} 条规则（${run.injection.hits.map((hit) => esc(hit.cn)).join('、')}）` : '未命中任何规则'}
          · 诱导动作 ${run.injection.deniedActions} 条被拒绝、${run.injection.allowedActions} 条被放行
          · 系统配置变更：否 · 系统指令变更：否。</span>`)
      );
    }
    return wrap;
  }

  function renderTrace() {
    const wrap = h('div', { class: 'section', 'data-act': 'trace' });
    wrap.append(h('div', { class: 'section__label' }, `<span>Tracing</span><span>${run.events.length} 条 · 可筛选</span>`));
    const filters = h('div', { class: 'tk-seg tk-seg--wrap', role: 'group', 'aria-label': '事件筛选' });
    for (const filter of TRACE_FILTERS) {
      const b = h('button', { type: 'button', 'data-filter': filter.id, 'aria-pressed': String(filter.id === filterId) }, filter.cn);
      b.addEventListener('click', () => {
        filterId = filter.id;
        render();
      });
      filters.append(b);
    }
    wrap.append(filters);

    const visible = filterTrace(run.events, filterId);
    const list = h('ol', { class: 'rtl-events rtl-events--compact', 'data-act': 'trace-list' });
    for (const event of visible) {
      list.append(
        h('li', { class: 'rtl-event', 'data-trace': event.eventId, 'data-type': event.type, 'data-status': event.status }, `
          <div class="rtl-event__btn">
            <span class="rtl-event__seq mono">${String(event.seq).padStart(2, '0')}</span>
            <span class="rtl-event__type">${esc(event.typeCn)}</span>
            <span class="tag tag--${event.tone}">${esc(event.status === 'denied' ? '拒绝' : event.status === 'ok' ? '成功' : event.status === 'warning' ? '需注意' : '记录')}</span>
            <span class="rtl-event__title">${esc(event.title)}</span>
          </div>
          <div class="knl-dim rtl-event__io">${esc(event.detail)}${event.rule ? `<br />规则：<span class="mono">${esc(event.rule)}</span>` : ''}${event.sourceIds.length ? ` · 来源 ${esc(event.sourceIds.join('、'))}` : ''}</div>`)
      );
    }
    wrap.append(list);
    wrap.append(h('div', { class: 'tk-field__hint' }, '事件全部来自本地模拟：不是真实模型遥测，也不含任何真实系统调用记录。'));
    return wrap;
  }

  function renderEvals() {
    const wrap = h('div', { class: 'section', 'data-act': 'evals' });
    wrap.append(
      h('div', { class: 'section__label' }, `<span>Evals · 固定样例</span><span>${run.evals.passed}/${run.evals.total} 通过 · 分数 ${run.evals.score}</span>`)
    );
    wrap.append(
      h('div', { class: 'note note--info' }, `
        <span class="note__key">判定方式</span>
        <span>每条样例都写清「样例输入 → 预期规则 → 实际结果 → 判定理由」，理由里带事件 ID；分数 = 通过条数 / 适用条数，无随机成分。</span>`)
    );

    for (const result of run.evals.results) {
      wrap.append(
        h('div', { class: 'rlb-eval', 'data-eval': result.id, 'data-pass': result.pass ? 'true' : 'false' }, `
          <div class="rlb-eval__head">
            <span class="mono">${esc(result.id)}</span>
            <span>${esc(result.cn)}</span>
            <span class="tag tag--${EVAL_TONE(result.pass)}">${result.pass ? '通过' : '未通过'}</span>
          </div>
          <div class="rlb-eval__row"><span class="rlb-eval__k">样例输入</span><span>${esc(result.input)}</span></div>
          <div class="rlb-eval__row"><span class="rlb-eval__k">预期规则</span><span>${esc(result.expect)}</span></div>
          <div class="rlb-eval__row"><span class="rlb-eval__k">实际结果</span><span>${esc(result.actual)}</span></div>
          <div class="rlb-eval__row"><span class="rlb-eval__k">判定理由</span><span>${esc(result.reason)}${result.eventIds.length ? ` · 事件 ${esc(result.eventIds.join('、'))}` : ''}</span></div>`)
      );
    }
    wrap.append(
      h('div', { class: 'note note--isolation' }, `
        <span class="note__key">声明</span>
        <span>${esc(run.evals.note)} 通过这些演示<b>不代表</b>真实系统已通过安全认证或全面评测。</span>`)
    );
    return wrap;
  }

  /* ================================================================== *
   * Inspector
   * ================================================================== */
  function renderAside() {
    asideBody.replaceChildren();

    asideBody.append(
      h('div', { class: 'section', 'data-act': 'summary' }, `
        <div class="section__label"><span>本次运行概览</span><span>全部可核对</span></div>
        <div class="tk-metrics tk-metrics--stack">
          <div class="tk-metric"><span class="tk-metric__k">请求</span><b class="tk-metric__v">${run.requests.length}</b></div>
          <div class="tk-metric"><span class="tk-metric__k">拒绝</span><b class="tk-metric__v">${run.requests.filter((r) => r.decision === 'denied').length}</b></div>
          <div class="tk-metric"><span class="tk-metric__k">评估通过</span><b class="tk-metric__v">${run.evals.passed}/${run.evals.total}</b></div>
        </div>
        <div class="mono kn-progress">
          <div>沙箱：${esc(run.scope.sandbox.cn)}</div>
          <div>配置变更：${run.injection.configChanged ? '是' : '否'}</div>
          <div>系统指令变更：${run.injection.systemInstructionsChanged ? '是' : '否'}</div>
        </div>`)
    );

    /* 护栏边界 */
    const limits = h('div', { class: 'section', 'data-act': 'guardrail-limits' });
    limits.append(h('div', { class: 'section__label' }, '<span>护栏可能漏掉什么</span><span>如实说明</span>'));
    const ul = h('ul', { class: 'lab-reading' });
    for (const line of GUARDRAIL_LIMITS) ul.append(h('li', {}, esc(line)));
    limits.append(ul);
    asideBody.append(limits);

    /* 完成状态 */
    const done = learning?.isExperimentCompleted?.(entryConceptId) || completed;
    asideBody.append(
      h('div', { class: 'section', 'data-act': 'completion' }, `
        <div class="section__label"><span>实验记录</span><span>只记录真实操作</span></div>
        <div class="note">
          <span class="note__key">${done ? '已记录' : '未记录'}</span>
          <span>${done ? '你已修改配置并看到新的判定与评估结果，本地学习进度记了一次完成。' : '修改任意权限 / 沙箱 / 护栏配置并重新运行后才会记录；只浏览不记录。'}</span>
        </div>`)
    );

    /* 相关概念 */
    const concept = h('div', { class: 'section' });
    concept.append(h('div', { class: 'section__label' }, '<span>相关概念</span><span>回到知识页</span>'));
    const chips = h('div', { class: 'chips' });
    for (const id of CONCEPT_LINKS) {
      const b = h('button', { class: 'btn btn--sm', type: 'button', 'data-concept': id }, id);
      b.addEventListener('click', () => onOpenConcept?.(id, { from: 'lab', experimentId: 'exp-boundary-lab' }));
      chips.append(b);
    }
    concept.append(chips);
    asideBody.append(concept);

    asideBody.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>必守边界</span><span>不夸大</span></div>
        <div class="kv">
          <dt>模拟性质</dt><dd>${esc(run.scope.note)}</dd>
          <dt>不是渗透测试</dt><dd>样本是自造的演示文本，不是真实攻击载荷，也没有对任何真实系统发起测试</dd>
          <dt>不是安全认证</dt><dd>通过 4 条样例只说明「这 4 条规则下表现正常」，不构成任何合规结论</dd>
          <dt>护栏</dt><dd>${esc(GUARDRAIL_LAYERS.input.note)}</dd>
          <dt>拒绝即拒绝</dt><dd>被拒绝的请求不会同时显示成功；这一点由测试守护</dd>
        </div>`)
    );
  }

  /* ================================================================== *
   * 交互
   * ================================================================== */
  function update(patch, reason) {
    if (patch.guardrails) policy = { ...policy, guardrails: { ...policy.guardrails, ...patch.guardrails } };
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'guardrails') continue;
      policy[key] = value;
    }
    run = runReliabilityLab({ policy, includeInjection });
    if (!completed) {
      completed = true;
      const ok = learning?.markExperimentCompleted?.(entryConceptId);
      onLog?.(
        '实验',
        `Lab 06 配置变化：${reason} → 请求 ${run.requests.length} · 拒绝 ${run.requests.filter((r) => r.decision === 'denied').length} · 评估 ${run.evals.passed}/${run.evals.total}${ok ? ' · 已记录一次实验完成' : ''}`,
        'signal'
      );
    } else {
      onLog?.('实验', `Lab 06 配置变化：${reason} → 评估 ${run.evals.passed}/${run.evals.total}`, 'info');
    }
    render();
  }

  function render() {
    renderParams();
    renderMain();
    renderAside();
    headMeta.textContent = `沙箱 ${run.scope.sandbox.cn} · 评估 ${run.evals.passed}/${run.evals.total} · 请求 ${run.requests.length} · 拒绝 ${run.requests.filter((r) => r.decision === 'denied').length}`;
  }

  render();

  const unsubscribe = learning?.subscribe?.(() => renderAside());

  return {
    el,
    activate() {},
    dispose() {
      unsubscribe?.();
    },
    /* ---------------- 自检脚本接口 ---------------- */
    snapshot() {
      return {
        policy: { ...policy, guardrails: { ...policy.guardrails } },
        sandbox: policy.sandbox,
        includeInjection,
        requests: run.requests.map((r) => ({ resourceId: r.resourceId, decision: r.decision, primaryReason: r.primaryReason, inducedBy: r.inducedBy })),
        events: run.events.map((e) => ({
          eventId: e.eventId,
          type: e.type,
          status: e.status,
          decision: e.decision,
          resourceId: e.resourceId,
          rule: e.rule,
          sourceIds: [...e.sourceIds],
        })),
        evals: run.evals.results.map((r) => ({ id: r.id, pass: r.pass, actual: r.actual, reason: r.reason, eventIds: [...r.eventIds] })),
        score: run.evals.score,
        injection: { ...run.injection },
        conclusion: { status: run.conclusion.status, text: run.conclusion.text, citations: run.conclusion.citations.map((c) => c.docId) },
        filter: filterId,
        visibleTrace: filterTrace(run.events, filterId).map((e) => e.eventId),
        resources: RESOURCES.map((r) => r.id),
      };
    },
    configure(patch = {}) {
      const next = {};
      for (const [key, value] of Object.entries(patch)) {
        if (POLICY_TOGGLES.some((toggle) => toggle.key === key)) next[key] = value;
        if (key === 'sandbox') next.sandbox = value;
      }
      if (patch.guardrails) next.guardrails = patch.guardrails;
      if ('includeInjection' in patch) includeInjection = patch.includeInjection;
      if (Object.keys(next).length) update(next, `外部配置：${Object.keys(patch).join('、')}`);
      else {
        run = runReliabilityLab({ policy, includeInjection });
        render();
      }
    },
    setFilter(id) {
      filterId = id;
      render();
      return filterTrace(run.events, id).length;
    },
    currentRun: () => run,
    requestOf: (resourceId) => run.requests.find((r) => r.resourceId === resourceId) || null,
    evalResults: () => run.evals.results.map((r) => ({ ...r, eventIds: [...r.eventIds] })),
    score: () => run.evals.score,
    trace: () => run.events.map((e) => ({ ...e })),
    filterTrace: (id) => filterTrace(run.events, id),
    matrix: () =>
      SANDBOX_MODES.map((mode) => ({
        sandbox: mode.id,
        off: evaluateRequest({ resourceId: 'private/review-records/PRV-01', policy: { ...policy, readPrivateRecords: false, sandbox: mode.id } }).decision,
        on: evaluateRequest({ resourceId: 'private/review-records/PRV-01', policy: { ...policy, readPrivateRecords: true, sandbox: mode.id } }).decision,
      })),
  };
}

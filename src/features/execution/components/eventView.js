/**
 * src/features/execution/components/eventView.js
 * ------------------------------------------------------------------
 * 事件展示的共用片段：事件行、事件属性表、载荷（输入/输出）折叠块。
 *
 * 安全约定（M0.3_TASK §7.4）：所有来自数据层的文本一律通过 textContent
 * 写入，绝不作为 HTML 注入；JSON 只做只读展示，不执行、不求值。
 * ------------------------------------------------------------------
 */
import { h, esc } from '../../constructor/components/dom.js';
import {
  PHASE_META,
  STATUS_META,
  ACTOR_META,
  EVENT_TYPE_META,
  outcomeMeta,
  statusLabel,
  phaseLabel,
  actorLabel,
  eventTypeLabel,
} from '../../../simulation/events/schema.js';

/** 载荷的 JSON 文本：只读展示用 */
export function formatPayloadText(payload) {
  if (payload === null || payload === undefined) return '（无）';
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return '（无法序列化：载荷包含不可展示的值）';
  }
}

/** 把工具响应翻译成一句人话摘要（用于「可读摘要」行） */
export function payloadSummary(payload) {
  if (!payload || typeof payload !== 'object') return null;
  switch (payload.kind) {
    case 'search.request':
      return `请求参数：${payload.argumentsText || ''}`;
    case 'search.response': {
      const parts = [`候选 ${payload.total} 条`, `返回 ${payload.returned} 条`];
      if (payload.truncated) parts.push('已按结果上限截断');
      if (payload.returned === 0) parts.push('范围内没有匹配条目');
      return parts.join(' · ');
    }
    case 'search.error':
      return `错误码 ${payload.code}：${payload.message}`;
    case 'read.request':
      return `请求参数：${payload.argumentsText || ''}`;
    case 'read.response': {
      const parts = [payload.textScope === 'summary' ? '返回预先定义的摘要（不含正文）' : '返回完整正文'];
      parts.push(payload.metadataIncluded ? '含来源与日期元数据' : '已按要求关闭来源与日期元数据');
      if (payload.textTruncated) parts.push('文本过长已安全截断');
      return parts.join(' · ');
    }
    case 'read.blocked':
      return `阻断原因（${payload.blockCode}）：${payload.reason} · 该工具从未执行`;
    case 'read.error':
      return `错误码 ${payload.code}：${payload.message}`;
    case 'evidence.sample':
      return `样本等级：${payload.levelCn || payload.level || '—'}${payload.verified ? '' : ' · 未做真实性核验'}`;
    case 'config.availability':
      return payload.tools.map((t) => `${t.label} ${t.ready ? '就绪' : `不可用（${t.blockCode}）`}`).join(' · ');
    case 'task.plan':
      return `固定演示步骤 ${payload.steps.length} 步（非真实模型推理）`;
    case 'task.input':
      return `任务 ${payload.missionId}@${payload.missionVersion} · 语料版本 ${payload.corpusVersion}`;
    default:
      return null;
  }
}

/** 状态标签：英文状态名 + 中文解释，不靠颜色单独表意 */
export function statusChip(status) {
  const meta = STATUS_META[status] || STATUS_META.info;
  return h('span', { class: `tag tag--${meta.tone}`, 'data-status': status }, `${meta.en} · ${meta.cn}`);
}

/** 时间轴上的一行事件（按钮，可 Seek） */
export function eventRow(event, { current = false, onSelect } = {}) {
  const typeMeta = EVENT_TYPE_META[event.type] || { cn: event.type, tone: 'muted' };
  const statusMeta = STATUS_META[event.status] || STATUS_META.info;
  const row = h(
    'button',
    {
      class: 'ev-row',
      type: 'button',
      'data-event': event.id,
      'data-status': event.status,
      'data-tone': typeMeta.tone,
      'aria-current': current ? 'true' : 'false',
      'aria-label': `事件 ${event.sequence}：${typeMeta.cn} · ${statusMeta.cn} —— ${event.message}`,
    },
    `<span class="ev-row__seq">${String(event.sequence).padStart(2, '0')}</span>
     <span class="ev-row__body">
       <span class="ev-row__top">
         <span class="ev-row__type">${esc(typeMeta.cn)}</span>
         <span class="ev-row__code">${esc(event.type)}</span>
       </span>
       <span class="ev-row__msg">${esc(event.message)}</span>
     </span>
     <span class="tag tag--${statusMeta.tone} ev-row__status">${esc(statusMeta.cn)}</span>`
  );
  row.addEventListener('click', () => onSelect?.(event.sequence));
  return row;
}

/** 载荷折叠块：默认收起，键盘可展开，纯只读 */
export function payloadBlock(label, ref, payload, { open = false } = {}) {
  const wrap = h('details', { class: 'payload', 'data-ref': ref || '' });
  if (open) wrap.setAttribute('open', 'open');
  const summary = h('summary', { class: 'payload__summary' });
  const text = payloadSummary(payload);
  summary.append(
    h('span', { class: 'payload__label' }, label),
    h('span', { class: 'payload__ref mono' }, ref || '—'),
    h('span', { class: 'payload__hint' }, text || '展开查看结构化载荷')
  );
  const pre = h('pre', { class: 'payload__json' });
  pre.textContent = formatPayloadText(payload);
  wrap.append(summary, pre);
  return wrap;
}

/** 事件属性表：序号 / 阶段 / 类型 / 状态 / 参与者 / 工具 / 资料引用 / 分支与规则 */
export function eventMetaTable(event, run) {
  const dl = h('dl', { class: 'kv kv--event' });
  const rows = [
    ['序号', `#${String(event.sequence).padStart(2, '0')} / ${run.events.length}`],
    ['阶段', `${PHASE_META[event.phase]?.cn || event.phase}（${event.phase}）`],
    ['事件类型', `${eventTypeLabel(event.type)}（${event.type}）`],
    ['状态', `${statusLabel(event.status)}（${event.status}）`],
    ['参与者', actorLabel(event.actorId)],
    ['工具', event.toolId ? `${event.toolId}（${ACTOR_META[event.toolId]?.cn || ''}）` : '—'],
    ['输入载荷', event.inputRef || '—'],
    ['输出载荷', event.outputRef || '—'],
    ['资料引用', event.sourceIds?.length ? event.sourceIds.join('、') : '—'],
    ['片段引用', event.chunkIds?.length ? event.chunkIds.join('、') : '—'],
    ['分支', event.branchId || '—'],
    ['触发规则', event.ruleId || '—'],
    ['事件 ID', event.id],
  ];
  for (const [k, v] of rows) dl.append(h('dt', {}, k), h('dd', { class: 'mono' }, v));
  return dl;
}

/** 运行结局条：真相来自 run.outcome，不看任何动画状态 */
export function outcomeBar(run) {
  const meta = outcomeMeta(run.outcome);
  return h('div', { class: 'outcome-bar', 'data-outcome': run.outcome, 'data-tone': meta.tone }, `
    <span class="tag tag--${meta.tone}">${esc(meta.en)} · ${esc(meta.cn)}</span>
    <span class="outcome-bar__note">${esc(meta.note)}</span>`);
}

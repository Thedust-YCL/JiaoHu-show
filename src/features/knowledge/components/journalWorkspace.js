import { h, esc } from '../../constructor/components/dom.js';
import { CHAPTERS, getConcept, getChapter, getExperiment } from '../../../knowledge/index.js';
import { JOURNAL_TYPES, MAX_JOURNAL_EVENTS, journalTarget } from '../../atlas/state/journal.js';

export function createJournalWorkspace({ learning, journal, onVisit, onOpenStory, onOpenAtlas } = {}) {
  const el = h('div', { class: 'workspace workspace--journal', 'data-open': 'true' });
  const head = h('header', { class: 'ws-head' }, '<div class="ws-head__id"><span class="ws-head__tag">A/0</span><span class="ws-head__title">学习日志 <small>KNOWLEDGE JOURNAL</small></span></div>');
  const body = h('main', { class: 'journal-body' });
  const intro = h('section', { class: 'journal-intro' }, '<h2>沿着留下的线索，继续探索。</h2><p>查看过不等于掌握；实验只有完成关键操作才计入。记录保存在当前浏览器与设备中，保留最近 '+MAX_JOURNAL_EVENTS+' 条活动。</p>');
  const stats = h('div', { class: 'journal-stats', 'data-el': 'journal-stats' });
  const chapters = h('section', { class: 'journal-chapters', 'aria-label': '六章学习概览' });
  const filters = h('div', { class: 'learning-filters' });
  const chapter = h('select', { 'aria-label': '日志按章节筛选', 'data-filter': 'chapter' }, '<option value="">全部章节</option>');
  for (const c of CHAPTERS) chapter.append(h('option', { value: c.id }, `${c.no} · ${c.title.zh}`));
  const type = h('select', { 'aria-label': '日志按活动类型筛选', 'data-filter': 'type' }, '<option value="">全部活动</option>');
  for (const [id, name] of Object.entries(JOURNAL_TYPES)) type.append(h('option', { value: id }, name));
  const clearFilter = h('button', { class:'btn btn--sm', type:'button' }, '清除筛选');
  clearFilter.addEventListener('click', () => { chapter.value = ''; type.value = ''; render(); });
  filters.append(chapter, type, clearFilter);
  const notice = h('p', { class:'learning-notice', role:'status' });
  const records = h('section', { class:'journal-records', 'aria-label':'最近活动' });
  const tools = h('div', { class:'journal-tools' });
  const clear = h('button', {class:'btn btn--ghost', type:'button', 'data-act':'clear-journal'}, '清除活动记录');
  const reset = h('button', {class:'btn btn--ghost', type:'button', 'data-act':'reset-learning'}, '清除全部学习进度');
  const dialog = h('dialog', { class:'learning-dialog', 'aria-labelledby':'learning-confirm-title' });
  function confirmProgress(progress) {
    dialog.replaceChildren();
    dialog.append(h('h2', {id:'learning-confirm-title'}, progress ? '清除全部学习进度？' : '清除活动记录？'),
      h('p', {}, progress ? '将清除概念阅读状态、实验完成状态、章节总结和续学位置。活动记录、装配配置、实验记忆与研究运行记录保留。' : '将清除最近活动流水。已探索概念、已完成实验、章节进度、装配配置与研究运行记录保留。'));
    const cancel = h('button', { class:'btn', type:'button', autofocus:'' }, '取消');
    cancel.addEventListener('click', () => dialog.close());
    const accept = h('button', {class:'btn btn--primary', type:'button', 'data-act':'confirm-clear'}, '确认清除');
    accept.addEventListener('click', () => { progress ? learning.reset() : journal.clear(); dialog.close(); render(); });
    dialog.append(h('div', {class:'chips'}, cancel, accept));
    dialog.showModal();
  }
  clear.addEventListener('click', () => confirmProgress(false));
  reset.addEventListener('click', () => confirmProgress(true));
  tools.append(clear, reset, h('p', {}, '清除记录、清除进度与重置装配台是不同操作。此处不会清除装配配置或研究记录。'));
  body.append(intro, stats, chapters, h('h2', {class:'journal-section-title'}, '最近活动'), filters, notice, records, tools);
  el.append(head, body, dialog);
  function render() {
    const s = learning.summary();
    stats.innerHTML = `<span><b>${s.explored}<small> / ${s.total}</small></b>已探索概念</span><span><b>${s.completedLabs}<small> / 6</small></b>已完成实验</span><span><b>${CHAPTERS.filter(c=>learning.chapterSummary(c.id).completed).length}<small> / 6</small></b>已完成章节总结</span>`;
    chapters.replaceChildren();
    for (const c of CHAPTERS) {
      const progress = learning.chapterSummary(c.id);
      const b = h('button', {class:'journal-chapter',type:'button','data-chapter':c.id}, `<span class="mono">${c.no}</span><strong>${esc(c.title.zh)}</strong><span>${progress.explored}/${progress.total} 已探索 · ${progress.labCompleted ? '实验已完成' : '实验未完成'}</span><span class="tag tag--${progress.completed?'success':'muted'}">${progress.completed?'总结已完成':'总结未完成'}</span>`);
      b.addEventListener('click', () => onVisit?.({kind:'chapter',id:c.id}));
      chapters.append(b);
    }
    notice.textContent = [journal.notice(), learning.storageNotice()].filter(Boolean).join(' ');
    notice.hidden = !notice.textContent;
    records.replaceChildren();
    const entries = journal.events({chapterId:chapter.value || null, type:type.value || null});
    if (!entries.length) {
      const empty = h('div', {class:'journal-empty', 'data-el':'empty'}, `<h3>${journal.events().length ? '没有符合筛选的记录' : '你的第一条学习线索，从这里开始'}</h3><p>${journal.events().length ? '换一个章节或活动类型，或清除筛选查看全部。' : '从第一章了解模型如何生成回答，也可以跳过引导，直接探索知识星图。'}</p>`);
      const start = h('button',{class:'btn btn--primary',type:'button'},'按章学习'); start.addEventListener('click',()=>onOpenStory?.());
      const free = h('button',{class:'btn btn--ghost',type:'button'},'自由探索'); free.addEventListener('click',()=>onOpenAtlas?.());
      empty.append(h('div',{class:'chips'},start,free)); records.append(empty);
    }
    for (const event of entries) {
      const date = new Date(event.at);
      const title = getExperiment(event.experimentId)?.title || getConcept(event.targetConceptId || event.conceptId)?.cn || getChapter(event.chapterId)?.title.zh;
      const row = h('article',{class:'journal-row','data-type':event.type, 'data-chapter':event.chapterId}, `<time datetime="${date.toISOString()}">${esc(date.toLocaleString('zh-CN',{hour12:false}))}</time><div><span class="tag tag--muted">${JOURNAL_TYPES[event.type]}</span><h3>${esc(title)}</h3><small>${esc(getChapter(event.chapterId)?.title.zh)} · ${esc(event.experimentId || event.conceptId || event.chapterId)}</small></div>`);
      const revisit = h('button',{class:'btn btn--sm',type:'button','data-act':'revisit'},'回访 →');
      revisit.addEventListener('click',()=>onVisit?.(journalTarget(event))); row.append(revisit); records.append(row);
    }
  }
  for (const select of [chapter,type]) select.addEventListener('change',render);
  const offJournal = journal.subscribe(render); const offLearning = learning.subscribe(render);
  render();
  return {el, activate:render, dispose(){offJournal();offLearning();dialog.close();}};
}

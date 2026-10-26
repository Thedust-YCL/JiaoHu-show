/** 有界本地活动流水；只收稳定ID，不收用户原文。进度仍由learning维护。 */
import { getConcept, getChapter, getExperiment } from '../../../knowledge/index.js';

export const JOURNAL_STORAGE_KEY = 'agent-zero:journal:v1';
export const MAX_JOURNAL_EVENTS = 200;
export const JOURNAL_TYPES = Object.freeze({
  concept_viewed: '查看概念', concept_inspected: '深入阅读', relation_followed: '探索关联',
  lab_started: '进入实验', lab_completed: '完成实验', chapter_completed: '完成章节总结',
});

function normalizeEvent(type, data, at) {
  if (!Object.hasOwn(JOURNAL_TYPES, type) || !Number.isFinite(at) || at <= 0 || at > 8_640_000_000_000_000) return null;
  const concept = getConcept(data?.conceptId);
  const experiment = getExperiment(data?.experimentId);
  const chapter = getChapter(data?.chapterId);
  if (type.startsWith('lab_') && (!experiment || experiment.status !== 'available' || (concept && !experiment.conceptIds.includes(concept.id)))) return null;
  if ((type.startsWith('concept_') || type === 'relation_followed') && !concept) return null;
  if (type === 'chapter_completed' && !chapter) return null;
  const target = getConcept(data?.targetConceptId);
  return { type, at: Math.floor(at), chapterId: concept?.chapterId || experiment?.chapterId || chapter?.id,
    ...(concept ? { conceptId: concept.id } : {}), ...(experiment ? { experimentId: experiment.id } : {}),
    ...(target ? { targetConceptId: target.id } : {}) };
}

export function journalTarget(event) {
  if (event.experimentId) return { kind: 'lab', id: event.experimentId };
  if (event.targetConceptId || event.conceptId) return { kind: 'knowledge', id: event.targetConceptId || event.conceptId };
  return { kind: 'chapter', id: event.chapterId };
}

export function createJournalStore({ storage, now = () => Date.now() } = {}) {
  let store = storage;
  let message = null;
  let protectedRaw = false;
  let entries = [];
  const listeners = new Set();
  try { store ??= typeof localStorage !== 'undefined' ? localStorage : null; }
  catch { store = null; }
  try {
    const raw = store?.getItem(JOURNAL_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.schemaVersion !== 1 || !Array.isArray(data.events)) throw Error('未知格式');
      entries = data.events.map(e => normalizeEvent(e?.type, e, e?.at)).filter(Boolean).slice(-MAX_JOURNAL_EVENTS);
      if (entries.length !== Math.min(data.events.length, MAX_JOURNAL_EVENTS)) message = '部分活动记录无法识别，已跳过；学习进度保留。';
    }
  } catch {
    protectedRaw = true;
    message = '原有活动记录无法读取或来自更新版本，已原样保留；新增记录暂存于本次会话。';
  }
  if (!store) message = '浏览器未允许本地存储，活动仅在本次会话保留。';
  function save(reset = false) {
    if (!store || (protectedRaw && !reset)) return false;
    try { store.setItem(JOURNAL_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, events: entries })); return true; }
    catch { message = '无法保存活动记录，请检查浏览器存储权限或空间；当前记录仅在本次会话保留。'; return false; }
  }
  const emit = () => { for (const fn of [...listeners]) fn(); };
  return {
    record(type, data = {}) {
      const event = normalizeEvent(type, data, now());
      if (!event) return false;
      const previous = entries.at(-1);
      const same = previous && ['type', 'chapterId', 'conceptId', 'experimentId', 'targetConceptId'].every(k => previous[k] === event[k]);
      if (same && event.at - previous.at < 2000) return false;
      entries = [...entries, event].slice(-MAX_JOURNAL_EVENTS);
      save(); emit(); return true;
    },
    events({ chapterId = null, type = null } = {}) {
      return entries.filter(e => (!chapterId || e.chapterId === chapterId) && (!type || e.type === type)).toReversed().map(e => ({...e}));
    },
    clear() { entries = []; if (save(true)) { protectedRaw = false; message = null; } emit(); },
    notice: () => message,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

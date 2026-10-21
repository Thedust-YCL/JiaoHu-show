/**
 * tests/persistence.test.mjs
 * ------------------------------------------------------------------
 * M0.2 版本化持久化测试：序列化、恢复、损坏兜底、重置边界（A18–A20）。
 * ------------------------------------------------------------------
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { memoryStorage } from './helpers.mjs';
import { createConstructorStore } from '../src/features/constructor/state/store.js';
import { CONSTRUCTOR_STORAGE_KEY, parseConfig, serializeConfig } from '../src/features/constructor/state/persistence.js';

const INTRO_KEY = 'az0.intro.seen.v1';
const PREFS_KEY = 'az0.prefs.v1';

async function seededStore(seed = {}) {
  const storage = memoryStorage(seed);
  const store = createConstructorStore({ storage });
  return { storage, store };
}

/* ==================================================================== *
 * A18 刷新恢复
 * ==================================================================== */
test('刷新后能复原两种模块的安装、参数、禁用与授权状态', async () => {
  const { storage, store } = await seededStore();
  store.actions.commit('announcement_search', 'SEARCH_PORT');
  store.actions.configure('announcement_search', { searchScope: 'campus_events', maxResults: 10, readPermission: true });
  store.actions.commit('document_reader', 'READER_PORT');
  store.actions.configure('document_reader', { readMode: 'full_text', includeMetadata: false, readPermission: true });
  store.actions.setEnabled('document_reader', false);

  // 模拟刷新：用同一份存储重新建立 store
  const reopened = createConstructorStore({ storage });
  assert.equal(reopened.getState().modules.length, 2);
  const search = reopened.getInstalled('announcement_search');
  assert.deepEqual(search.settings, { searchScope: 'campus_events', maxResults: 10 });
  assert.equal(search.permissions.read, true);
  assert.equal(reopened.statusOf('announcement_search'), 'Ready');

  const reader = reopened.getInstalled('document_reader');
  assert.equal(reader.settings.readMode, 'full_text');
  assert.equal(reader.settings.includeMetadata, false);
  assert.equal(reopened.statusOf('document_reader'), 'Disabled');
});

test('Preview 与 Drag 属于瞬态，绝不写入本地存储', async () => {
  const { storage, store } = await seededStore();
  store.actions.commit('announcement_search', 'SEARCH_PORT');
  store.actions.preview('document_reader');
  store.actions.dragStart('document_reader');

  const raw = JSON.parse(storage.getItem(CONSTRUCTOR_STORAGE_KEY));
  assert.deepEqual(Object.keys(raw).sort(), ['modules', 'schemaVersion']);
  assert.equal(raw.schemaVersion, 1);
  assert.equal(raw.modules.length, 1);
  assert.equal(raw.modules[0].moduleId, 'announcement_search');
  const reopened = createConstructorStore({ storage });
  assert.equal(reopened.getState().ui.preview, null);
  assert.equal(reopened.getState().ui.drag, null);
});

test('落盘内容只包含权威字段，不夹带动画或渲染中间态', async () => {
  const { storage, store } = await seededStore();
  store.actions.commit('document_reader', 'READER_PORT');
  const entry = JSON.parse(storage.getItem(CONSTRUCTOR_STORAGE_KEY)).modules[0];
  assert.deepEqual(Object.keys(entry).sort(), ['enabled', 'moduleId', 'permissions', 'portId', 'settings']);
  assert.equal(entry.enabled, true);
  assert.equal(entry.portId, 'READER_PORT');
});

/* ==================================================================== *
 * A19 本地数据损坏
 * ==================================================================== */
test('损坏的 JSON 不白屏：回退为空白配置并给出可恢复提示', () => {
  const result = parseConfig('{ this is not json');
  assert.deepEqual(result.modules, []);
  assert.equal(result.notice.code, 'STORAGE_CORRUPT');
  assert.match(result.notice.fix, /重置构建器/);
});

test('结构不符的数据同样优雅降级', () => {
  assert.equal(parseConfig('[1,2,3]').notice.code, 'STORAGE_SHAPE');
  assert.equal(parseConfig('"just a string"').notice.code, 'STORAGE_SHAPE');
  assert.equal(parseConfig(null).notice, null, '空值属于首次访问，不应报警');
});

test('未知模块、端口不匹配与非法形状的单条记录被丢弃，其余记录正常恢复', () => {
  const result = parseConfig(
    JSON.stringify({
      schemaVersion: 1,
      modules: [
        { moduleId: 'unknown_tool', portId: 'SEARCH_PORT', enabled: true, settings: {} },
        { moduleId: 'announcement_search', portId: 'READER_PORT', enabled: true, settings: {} },
        'not-an-object',
        { moduleId: 'announcement_search', portId: 'SEARCH_PORT', enabled: true, permissions: { read: true }, settings: { searchScope: 'all_notices', maxResults: 5 } },
      ],
    })
  );
  assert.equal(result.modules.length, 1);
  assert.equal(result.modules[0].moduleId, 'announcement_search');
  assert.equal(result.dropped.length, 3);
  assert.equal(result.notice.code, 'STORAGE_PARTIAL');
});

test('字段值损坏时保留实例并判为 Invalid，而不是静默改写用户配置', () => {
  const storage = memoryStorage({
    [CONSTRUCTOR_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      modules: [{ moduleId: 'document_reader', portId: 'READER_PORT', enabled: true, permissions: { read: true }, settings: { readMode: 'weird_mode', includeMetadata: true } }],
    }),
  });
  const store = createConstructorStore({ storage });
  assert.equal(store.getState().modules.length, 1);
  assert.equal(store.statusOf('document_reader'), 'Invalid');
  assert.equal(store.getInstalled('document_reader').settings.readMode, 'weird_mode', '原始值保留，供界面解释错误');
  // 用户修复后即可回到 Ready
  store.actions.configure('document_reader', { readMode: 'summary' });
  assert.equal(store.statusOf('document_reader'), 'Ready');
});

test('schemaVersion 不一致时按当前规则逐条校验并提示', () => {
  const result = parseConfig(
    JSON.stringify({
      schemaVersion: 0,
      modules: [{ moduleId: 'announcement_search', portId: 'SEARCH_PORT', enabled: true, permissions: { read: true }, settings: { searchScope: 'all_notices', maxResults: 5 } }],
    })
  );
  assert.equal(result.modules.length, 1);
  assert.equal(result.notice.code, 'STORAGE_VERSION');
});

test('本地存储被拒绝读取时降级为空白配置且保留功能提示', () => {
  const storage = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {},
    removeItem() {},
  };
  const store = createConstructorStore({ storage });
  assert.equal(store.getState().modules.length, 0);
  assert.equal(store.getState().ui.notice.code, 'STORAGE_BLOCKED');
  // 功能仍然可用，只是无法跨刷新恢复
  store.actions.commit('announcement_search', 'SEARCH_PORT');
  assert.equal(store.getState().modules.length, 1);
});

/* ==================================================================== *
 * A20 重置边界
 * ==================================================================== */
test('重置构建器只清理构建器命名空间，不删除 M0.1 开场偏好', async () => {
  const { storage, store } = await seededStore({
    [INTRO_KEY]: JSON.stringify(true),
    [PREFS_KEY]: JSON.stringify({ dock: true, inspect: false, status: true, dockRail: false }),
  });
  store.actions.commit('announcement_search', 'SEARCH_PORT');
  store.actions.commit('document_reader', 'READER_PORT');
  assert.ok(storage.getItem(CONSTRUCTOR_STORAGE_KEY));

  store.actions.reset();

  assert.equal(storage.getItem(CONSTRUCTOR_STORAGE_KEY), null, '构建器键必须被清理');
  assert.equal(storage.getItem(INTRO_KEY), JSON.stringify(true), '开场首访标记必须保留');
  assert.equal(storage.getItem(PREFS_KEY), JSON.stringify({ dock: true, inspect: false, status: true, dockRail: false }), '界面偏好必须保留');
});

test('序列化是幂等的，且不共享引用', () => {
  const state = {
    modules: [{ moduleId: 'announcement_search', portId: 'SEARCH_PORT', enabled: true, permissions: { read: true }, settings: { searchScope: 'all_notices', maxResults: 5 } }],
  };
  const first = serializeConfig(state);
  const second = serializeConfig(first);
  assert.deepEqual(first, second);
  first.modules[0].settings.maxResults = 99;
  assert.equal(state.modules[0].settings.maxResults, 5, '序列化结果不得反向污染权威配置');
});

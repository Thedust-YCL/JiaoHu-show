/**
 * tests/constructor.test.mjs
 * ------------------------------------------------------------------
 * M0.2 装配领域逻辑的自动测试：端口兼容性、配置校验、状态转换与原子性。
 * 全部为纯逻辑测试，不启动浏览器、不需要 WebGL（M0.2_TASK §13）。
 * ------------------------------------------------------------------
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { MODULES, PORTS, defaultSettings } from '../src/features/constructor/model/modules.js';
import {
  applyPatch,
  deriveStatus,
  validateConnection,
  validateModuleConfig,
} from '../src/features/constructor/model/validation.js';
import { createConstructorStore } from '../src/features/constructor/state/store.js';
import { normalizeModules } from '../src/features/constructor/state/reducer.js';
import { memoryStorage } from './helpers.mjs';

/* ==================================================================== *
 * A01 / 端口兼容性（M0.2_TASK §3.2）
 * ==================================================================== */
test('端口兼容性：SEARCH_PORT 只接受 Announcement Search', () => {
  assert.equal(validateConnection('announcement_search', 'SEARCH_PORT').ok, true);
  const bad = validateConnection('document_reader', 'SEARCH_PORT');
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'INCOMPATIBLE_PORT');
  assert.match(bad.message, /文档读取/);
  assert.match(bad.fix, /读取接口/);
});

test('端口兼容性：READER_PORT 只接受 Document Reader', () => {
  assert.equal(validateConnection('document_reader', 'READER_PORT').ok, true);
  assert.equal(validateConnection('announcement_search', 'READER_PORT').code, 'INCOMPATIBLE_PORT');
});

test('端口兼容性：未知模块与未知接口都必须被拒绝', () => {
  assert.equal(validateConnection('unknown_tool', 'SEARCH_PORT').code, 'UNKNOWN_MODULE');
  assert.equal(validateConnection('announcement_search', 'NOPE_PORT').code, 'UNKNOWN_PORT');
});

test('端口注册表：两个端口各自锚定到稳定的 L3 接口序号', () => {
  const indexes = Object.values(PORTS).map((p) => p.anchorIndex);
  assert.deepEqual(indexes, [1, 11]);
  assert.notEqual(indexes[0], indexes[1]);
});

/* ==================================================================== *
 * A06 / A07 / A08 配置校验与状态派生
 * ==================================================================== */
test('默认配置带默认值，但未授权时只能是 Unconfigured', () => {
  const settings = defaultSettings('announcement_search');
  assert.equal(settings.searchScope, 'all_notices');
  assert.equal(settings.maxResults, 5);
  const check = validateModuleConfig('announcement_search', settings, { read: false });
  assert.equal(check.ok, false);
  assert.equal(check.errors.length, 1);
  assert.equal(check.errors[0].field, 'readPermission');
  assert.equal(check.errors[0].code, 'PERMISSION_REQUIRED');
  assert.equal(deriveStatus({ moduleId: 'announcement_search', portId: 'SEARCH_PORT', enabled: true, permissions: { read: false }, settings }), 'Unconfigured');
});

test('授权且参数合法时派生 Ready', () => {
  const settings = { searchScope: 'campus_events', maxResults: 10 };
  const check = validateModuleConfig('announcement_search', settings, { read: true });
  assert.equal(check.ok, true);
  assert.equal(deriveStatus({ moduleId: 'announcement_search', portId: 'SEARCH_PORT', enabled: true, permissions: { read: true }, settings }), 'Ready');
});

test('字段非法时给出字段级原因，并被派生为 Invalid', () => {
  const settings = { searchScope: 'not_a_scope', maxResults: 999 };
  const check = validateModuleConfig('announcement_search', settings, { read: true });
  assert.equal(check.ok, false);
  const fields = check.errors.map((e) => e.field).sort();
  assert.deepEqual(fields, ['maxResults', 'searchScope']);
  for (const error of check.errors) {
    assert.equal(error.code, 'INVALID_VALUE');
    assert.ok(error.fix.length > 0, '每条错误都必须带修复建议');
  }
  assert.equal(deriveStatus({ moduleId: 'announcement_search', portId: 'SEARCH_PORT', enabled: true, permissions: { read: true }, settings }), 'Invalid');
});

test('类型错误的布尔字段被识别为 INVALID_TYPE', () => {
  const settings = { readMode: 'summary', includeMetadata: 'yes' };
  const check = validateModuleConfig('document_reader', settings, { read: true });
  assert.equal(check.errors[0].code, 'INVALID_TYPE');
  assert.equal(check.errors[0].field, 'includeMetadata');
});

test('端口与模块不匹配的实例一律 Invalid（不可修复为 Ready）', () => {
  const installed = { moduleId: 'document_reader', portId: 'SEARCH_PORT', enabled: true, permissions: { read: true }, settings: { readMode: 'summary', includeMetadata: true } };
  assert.equal(deriveStatus(installed), 'Invalid');
});

/* ==================================================================== *
 * A02 / A03 / A05 / A08 / A10 完整转换路径
 * ==================================================================== */
test('点击装配完整路径：Preview → Commit → Configure → Ready', () => {
  const store = createConstructorStore({ storage: memoryStorage() });
  const { actions } = store;

  assert.equal(store.statusOf('announcement_search'), 'Available');
  assert.equal(actions.preview('announcement_search').ok, true);
  assert.equal(store.statusOf('announcement_search'), 'Preview');
  assert.equal(store.getState().modules.length, 0, 'Preview 不得写入权威配置');

  assert.equal(actions.commit().ok, true);
  assert.equal(store.getState().modules.length, 1);
  assert.equal(store.statusOf('announcement_search'), 'Unconfigured');

  assert.equal(actions.configure('announcement_search', { searchScope: 'campus_events', maxResults: 10, readPermission: true }).ok, true);
  assert.equal(store.statusOf('announcement_search'), 'Ready');
  const installed = store.getInstalled('announcement_search');
  assert.equal(installed.settings.maxResults, 10);
  assert.equal(installed.settings.searchScope, 'campus_events');
  assert.equal(installed.permissions.read, true);
});

test('预览被拒绝时不得留下残余模块或已占用接口', () => {
  const store = createConstructorStore({ storage: memoryStorage() });
  store.actions.commit('announcement_search', 'READER_PORT');
  assert.equal(store.getState().modules.length, 0);
  assert.equal(store.isPortFree('READER_PORT'), true);
  store.actions.preview('document_reader');
  store.actions.cancel();
  assert.equal(store.getState().ui.preview, null);
  assert.equal(store.getState().modules.length, 0);
});

test('重复装配同类工具只定位现有实例，不产生重复节点', () => {
  const store = createConstructorStore({ storage: memoryStorage() });
  store.actions.commit('announcement_search', 'SEARCH_PORT');
  store.actions.commit('announcement_search', 'SEARCH_PORT');
  store.actions.preview('announcement_search');
  store.actions.commit();
  assert.equal(store.getState().modules.filter((m) => m.moduleId === 'announcement_search').length, 1);
  assert.equal(store.getState().ui.selectedModuleId, 'announcement_search');
  assert.equal(store.getState().ui.notice.code, 'ALREADY_INSTALLED');
});

test('两种模块可以同时装配，互不覆盖', () => {
  const store = createConstructorStore({ storage: memoryStorage() });
  store.actions.commit('announcement_search', 'SEARCH_PORT');
  store.actions.commit('document_reader', 'READER_PORT');
  assert.equal(store.getState().modules.length, 2);
  assert.equal(store.occupantOf('SEARCH_PORT').moduleId, 'announcement_search');
  assert.equal(store.occupantOf('READER_PORT').moduleId, 'document_reader');
});

test('已被占用的接口拒绝再次装配，并指向占用者', () => {
  const store = createConstructorStore({ storage: memoryStorage() });
  store.actions.commit('announcement_search', 'SEARCH_PORT');
  assert.equal(store.isPortFree('SEARCH_PORT'), false);
  assert.equal(store.occupantOf('SEARCH_PORT').moduleId, 'announcement_search');
  // 同一模块再次装配：只定位现有实例，不产生第二个占用者
  store.actions.preview('announcement_search');
  assert.equal(store.getState().ui.notice.code, 'ALREADY_INSTALLED');
  assert.equal(store.getState().modules.length, 1);
  store.actions.remove('announcement_search');
  assert.equal(store.isPortFree('SEARCH_PORT'), true);
});

test('外部写入的重复实例会被去重（不产生叠加节点）', () => {
  const installed = { moduleId: 'announcement_search', portId: 'SEARCH_PORT', enabled: true, permissions: { read: true }, settings: defaultSettings('announcement_search') };
  const forced = normalizeModules([installed, { ...installed }]);
  assert.equal(forced.modules.length, 1);
  assert.equal(forced.dropped[0].reason, 'DUPLICATE_INSTANCE');
});

test('非法值写入被拒绝，已有合法配置不被破坏', () => {
  const store = createConstructorStore({ storage: memoryStorage() });
  store.actions.commit('announcement_search', 'SEARCH_PORT');
  store.actions.configure('announcement_search', { searchScope: 'all_notices', maxResults: 3, readPermission: true });
  const before = JSON.stringify(store.getInstalled('announcement_search'));
  const result = store.actions.configure('announcement_search', { maxResults: 999 });
  assert.equal(result.ok, false);
  assert.equal(store.getState().ui.notice.code, 'INVALID_CONFIG');
  assert.equal(store.getState().ui.notice.field, 'maxResults');
  assert.equal(JSON.stringify(store.getInstalled('announcement_search')), before, '失败写入不得改动已保存配置');
});

/* ==================================================================== *
 * A09 禁用 / 重新启用
 * ==================================================================== */
test('禁用继续在位，重新启用必须重新校验', () => {
  const store = createConstructorStore({ storage: memoryStorage() });
  store.actions.commit('document_reader', 'READER_PORT');
  store.actions.configure('document_reader', { readPermission: true, readMode: 'full_text', includeMetadata: false });
  assert.equal(store.statusOf('document_reader'), 'Ready');

  store.actions.setEnabled('document_reader', false);
  assert.equal(store.statusOf('document_reader'), 'Disabled');
  assert.equal(store.getState().modules.length, 1, '禁用不是移除');
  assert.equal(store.getInstalled('document_reader').settings.readMode, 'full_text', '参数必须保留');

  store.actions.setEnabled('document_reader', true);
  assert.equal(store.statusOf('document_reader'), 'Ready');

  // 权限被关闭后重新启用：不得强制回到 Ready
  store.actions.configure('document_reader', { readPermission: false });
  store.actions.setEnabled('document_reader', false);
  store.actions.setEnabled('document_reader', true);
  assert.equal(store.statusOf('document_reader'), 'Unconfigured');
});

/* ==================================================================== *
 * A10 移除
 * ==================================================================== */
test('移除释放接口并清理所有指向该实例的引用', () => {
  const store = createConstructorStore({ storage: memoryStorage() });
  store.actions.commit('announcement_search', 'SEARCH_PORT');
  assert.equal(store.getState().ui.selectedModuleId, 'announcement_search');
  store.actions.remove('announcement_search');
  const state = store.getState();
  assert.equal(state.modules.length, 0);
  assert.equal(state.ui.selectedModuleId, null, 'Inspector 不得仍指向已移除的实例');
  assert.equal(state.ui.preview, null);
  assert.equal(state.ui.drag, null);
  assert.equal(store.isPortFree('SEARCH_PORT'), true);
});

/* ==================================================================== *
 * A17 原子性与动画无关性
 * ==================================================================== */
test('同一次确认只提交一次装配（连点不产生第二个实例）', () => {
  const store = createConstructorStore({ storage: memoryStorage() });
  store.actions.preview('announcement_search');
  store.actions.commit();
  store.actions.commit();
  store.actions.commit();
  assert.equal(store.getState().modules.length, 1);
});

test('引导拖拽提交与点击确认走同一套校验与装配逻辑', () => {
  const store = createConstructorStore({ storage: memoryStorage() });
  store.actions.dragStart('document_reader');
  store.actions.dragTarget('SEARCH_PORT', false, '文档读取器不能连接到检索接口');
  store.actions.dragEnd(true, 'SEARCH_PORT');
  assert.equal(store.getState().modules.length, 0, '不合法释放不得提交');
  assert.equal(store.getState().ui.notice.code, 'INCOMPATIBLE_PORT');

  store.actions.dragStart('document_reader');
  store.actions.dragTarget('READER_PORT', true, '可连接到读取接口');
  store.actions.dragEnd(true, 'READER_PORT');
  assert.equal(store.getState().modules.length, 1);
  assert.equal(store.statusOf('document_reader'), 'Unconfigured');
});

test('拖拽取消不会改动配置', () => {
  const store = createConstructorStore({ storage: memoryStorage() });
  store.actions.commit('announcement_search', 'SEARCH_PORT');
  const before = store.getInstalled('announcement_search');
  store.actions.dragStart('document_reader');
  store.actions.dragEnd(false);
  assert.equal(store.getState().ui.drag, null);
  assert.equal(store.getInstalled('announcement_search'), before);
  assert.equal(store.getState().modules.length, 1);
});

/* ==================================================================== *
 * 重置
 * ==================================================================== */
test('重置构建器清空模块与接口占用，状态回到 Available', () => {
  const store = createConstructorStore({ storage: memoryStorage() });
  store.actions.commit('announcement_search', 'SEARCH_PORT');
  store.actions.commit('document_reader', 'READER_PORT');
  store.actions.reset();
  assert.equal(store.getState().modules.length, 0);
  assert.equal(store.statusOf('announcement_search'), 'Available');
  assert.equal(store.isPortFree('READER_PORT'), true);
  assert.equal(store.readPersisted().modules.length, 0);
});

/* ==================================================================== *
 * applyPatch 规范化
 * ==================================================================== */
test('applyPatch 把表单字符串规范化为数字，并保持字段判别', () => {
  const { settings, permissions } = applyPatch('announcement_search', { settings: defaultSettings('announcement_search'), permissions: { read: false } }, { maxResults: '10', readPermission: true });
  assert.equal(settings.maxResults, 10);
  assert.equal(typeof settings.maxResults, 'number');
  assert.equal(permissions.read, true);
  assert.equal(settings.searchScope, 'all_notices');
});

test('模块定义本身是冻结的，避免运行期被意外改写', () => {
  assert.equal(Object.isFrozen(MODULES), true);
  assert.equal(Object.isFrozen(PORTS), true);
});

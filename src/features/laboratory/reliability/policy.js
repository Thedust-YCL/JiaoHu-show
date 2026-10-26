/**
 * src/features/laboratory/reliability/policy.js
 * ------------------------------------------------------------------
 * Reliability Lab · 权限与沙箱规则（M1.3 D06 / §7.3–7.4，验收 A23 / A24）。
 *
 * 两个层次，故意分开表达：
 *   Permissions —— 「这个主体能不能对这个资源做这个操作」（授权规则）
 *   Sandbox     —— 「就算允许，执行环境只开放这些路径」（范围隔离）
 *
 * 这里的判定是**前端规则模拟**：没有任何真实文件系统、网络或子进程。
 * 页面必须写明「不构成真实系统隔离」，本文件不提供任何越权执行能力。
 * ------------------------------------------------------------------
 */

export const RESOURCES = Object.freeze([
  Object.freeze({
    id: 'public/notices/career-fair',
    cn: '公开公告 · 招聘会',
    path: 'public/notices/career-fair',
    sensitivity: 'public',
    operation: 'read',
  }),
  Object.freeze({
    id: 'public/notices/open-day',
    cn: '公开公告 · 开放日',
    path: 'public/notices/open-day',
    sensitivity: 'public',
    operation: 'read',
  }),
  Object.freeze({
    id: 'private/review-records/PRV-01',
    cn: '私有评议记录 PRV-01',
    path: 'private/review-records/PRV-01',
    sensitivity: 'private',
    operation: 'read',
  }),
  Object.freeze({
    id: 'private/student-roster',
    cn: '学生名单（私有）',
    path: 'private/student-roster',
    sensitivity: 'private',
    operation: 'read',
  }),
  Object.freeze({
    id: 'config/experiment-rules',
    cn: '实验规则配置',
    path: 'config/experiment-rules',
    sensitivity: 'config',
    operation: 'write',
  }),
  Object.freeze({
    id: 'external/mail',
    cn: '对外发送通道',
    path: 'external/mail',
    sensitivity: 'external',
    operation: 'send',
  }),
]);

export function resourceById(id) {
  return RESOURCES.find((resource) => resource.id === id) || null;
}

/** 沙箱白名单档位：不提供任意输入，避免把演示做成「填个路径就能越狱」 */
export const SANDBOX_MODES = Object.freeze([
  Object.freeze({
    id: 'public-only',
    cn: '仅公开目录',
    patterns: Object.freeze(['public/notices/*']),
    note: '只放行 public/notices 下的公开公告；私有目录、配置与对外通道都在圈外。',
  }),
  Object.freeze({
    id: 'public-and-config',
    cn: '公开目录 + 配置',
    patterns: Object.freeze(['public/notices/*', 'config/*']),
    note: '额外放行配置文件（含可写路径）：范围更大，误操作的后果也更大。',
  }),
  Object.freeze({
    id: 'off',
    cn: '关闭隔离',
    patterns: Object.freeze(['*']),
    note: '不做任何隔离：这正是要展示的「为什么不能只靠权限」的场景。',
  }),
]);

export function sandboxMode(id) {
  return SANDBOX_MODES.find((mode) => mode.id === id) || SANDBOX_MODES[0];
}

/** 默认策略：最小权限 + 仅公开目录 + 三处护栏全开 */
export const DEFAULT_POLICY = Object.freeze({
  readPublicNotices: true,
  readPrivateRecords: false,
  writeConfig: false,
  externalSend: false,
  sandbox: 'public-only',
  guardrails: Object.freeze({ input: true, tool: true, output: true }),
});

export const POLICY_TOGGLES = Object.freeze([
  Object.freeze({ key: 'readPublicNotices', cn: '读取公开公告', note: '任务的正常需要：关闭后连公开资料也读不到。' }),
  Object.freeze({ key: 'readPrivateRecords', cn: '读取私有记录', note: '默认拒绝：打开后私有评议记录与学生名单可被读取。' }),
  Object.freeze({ key: 'writeConfig', cn: '写入实验规则配置', note: '默认拒绝：打开后模拟器允许修改配置路径。' }),
  Object.freeze({ key: 'externalSend', cn: '对外发送内容', note: '默认拒绝：打开后存在把数据送到外部的通道。' }),
]);

export const GUARDRAIL_TOGGLES = Object.freeze([
  Object.freeze({ key: 'input', cn: '输入护栏', note: '扫描读入的不可信文本，标记可疑指令。' }),
  Object.freeze({ key: 'tool', cn: '工具调用护栏', note: '检查工具请求的目标路径与参数形态。' }),
  Object.freeze({ key: 'output', cn: '输出护栏', note: '检查结论是否夸大、是否泄露敏感字段、是否漏写不确定性。' }),
]);

function matchesPattern(path, pattern) {
  if (pattern === '*') return true;
  if (pattern.endsWith('/*')) return path.startsWith(pattern.slice(0, -1));
  return path === pattern;
}

/**
 * 评估一次资源访问请求：三层检查全部记录，任何一层不通过即拒绝。
 * 返回的 checks 会原样进入事件与 UI，便于解释「为什么被拒绝」。
 */
export function evaluateRequest({ resourceId, operation = 'read', policy = DEFAULT_POLICY }) {
  const resource = resourceById(resourceId);
  const checks = [];
  if (!resource) {
    return {
      allowed: false,
      decision: 'denied',
      primaryReason: '未知资源请求',
      checks: [{ layer: 'validate', pass: false, rule: 'resource/exists', reason: `资源 ${resourceId} 不在清单内` }],
      resource: null,
    };
  }

  /* ---------- 1. 权限层 ---------- */
  const op = operation || resource.operation;
  let permissionPass = false;
  let permissionRule = 'permissions/default-deny';
  let permissionReason = '';

  if (resource.sensitivity === 'public') {
    permissionPass = policy.readPublicNotices === true;
    permissionRule = 'permissions/read-public';
    permissionReason = permissionPass ? '公开公告读取被允许' : '公开公告读取被关闭：连正常任务也无法进行';
  } else if (resource.sensitivity === 'private') {
    permissionPass = policy.readPrivateRecords === true;
    permissionRule = 'permissions/read-private';
    permissionReason = permissionPass ? '私有记录读取被显式开启（风险增大）' : '私有记录读取默认拒绝';
  } else if (resource.sensitivity === 'config') {
    permissionPass = policy.writeConfig === true;
    permissionRule = 'permissions/write-config';
    permissionReason = permissionPass ? '配置写入被显式开启（风险增大）' : '实验规则配置默认不可写';
  } else if (resource.sensitivity === 'external') {
    permissionPass = policy.externalSend === true;
    permissionRule = 'permissions/external-send';
    permissionReason = permissionPass ? '对外发送通道被显式开启（最高风险）' : '对外发送通道默认关闭';
  }
  checks.push({ layer: 'permission', pass: permissionPass, rule: permissionRule, reason: permissionReason });

  /* ---------- 2. 沙箱层 ---------- */
  const mode = sandboxMode(policy.sandbox);
  const inSandbox = mode.patterns.some((pattern) => matchesPattern(resource.path, pattern));
  checks.push({
    layer: 'sandbox',
    pass: inSandbox,
    rule: `sandbox/${mode.id}`,
    reason: inSandbox ? `路径在沙箱白名单内（${mode.cn}）` : `路径不在沙箱白名单内（${mode.cn}）：执行环境直接拒绝`,
  });

  /* ---------- 3. 工具调用护栏 ----------
   * 注意这里的分工：护栏**只阻断结构性非法请求**（路径穿越 / 绝对路径），
   * 对「敏感资源」只做标记而不代替授权——否则权限开关就失去可见效果，
   * 也会把「护栏」误当成「权限」。
   */
  if (policy.guardrails?.tool) {
    const structural = /\.\./.test(resource.path) || /^(?:\/|[a-zA-Z]:\\)/.test(resource.path);
    const sensitive = resource.sensitivity !== 'public';
    checks.push({
      layer: 'guardrail',
      pass: !structural,
      flagged: sensitive,
      rule: structural ? 'guardrail/structural' : 'guardrail/tool-target',
      reason: structural
        ? `工具请求包含非法路径结构（${resource.path}）：护栏直接阻断`
        : sensitive
          ? `工具请求指向非公开资源（${resource.sensitivity}）：护栏标记为高风险，但是否放行由权限与沙箱决定`
          : '工具请求指向公开资源，未命中规则',
    });
  } else {
    checks.push({
      layer: 'guardrail',
      pass: true,
      flagged: false,
      rule: 'guardrail/tool-disabled',
      reason: '工具调用护栏已关闭：本次没有检查目标路径（这是风险点，不是「通过」）',
      skipped: true,
    });
  }

  const failing = checks.filter((check) => !check.pass);
  return {
    allowed: failing.length === 0,
    decision: failing.length === 0 ? 'allowed' : 'denied',
    primaryReason: failing.length === 0 ? '三层检查全部通过' : `${checks.find((c) => !c.pass).rule}：${checks.find((c) => !c.pass).reason}`,
    checks,
    resource,
    operation: op,
  };
}

/** 策略是否只能由 UI 修改：文档内容永远不经由这个函数（测试守护） */
export function applyPolicyPatch(policy, patch) {
  const next = {
    ...policy,
    ...Object.fromEntries(Object.entries(patch).filter(([key]) => key in DEFAULT_POLICY && key !== 'guardrails')),
    guardrails: { ...policy.guardrails, ...(patch.guardrails || {}) },
  };
  return Object.freeze(next);
}

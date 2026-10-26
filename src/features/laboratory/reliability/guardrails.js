/**
 * src/features/laboratory/reliability/guardrails.js
 * ------------------------------------------------------------------
 * Reliability Lab · 护栏检查（M1.3 D06 / §7.5，验收 A26）。
 *
 * 三处检查：输入（不可信文本）、工具调用（目标路径与参数）、输出（结论表述）。
 *
 * 必须如实表达的边界：
 *   · 规则只能覆盖它写到的模式：换语言、拆散措辞、编码混淆都可能绕过；
 *   · 因此界面同时展示「这条规则可能漏掉什么」，不把命中率说成安全保证。
 * ------------------------------------------------------------------
 */

export const GUARDRAIL_LAYERS = Object.freeze({
  input: { id: 'input', cn: '输入护栏', note: '读入的文本先过一遍：命中可疑指令就标记为不可信，但仍按数据处理。' },
  tool: { id: 'tool', cn: '工具调用护栏', note: '检查这次请求指向哪里：私有路径、路径穿越与对外通道都会被标记。' },
  output: { id: 'output', cn: '输出护栏', note: '检查结论有没有夸大、有没有来源、有没有如实写明不确定性。' },
});

/** 输入侧规则：只做字面匹配，规则本身就是「可能漏」的证据 */
export const INPUT_RULES = Object.freeze([
  Object.freeze({ id: 'ignore-instructions', cn: '要求忽略既有指令', pattern: /忽略(?:此前|之前|以上|上面|研究|所有)?的?(?:指令|规则|要求|约定)/ }),
  Object.freeze({ id: 'ignore-en', cn: '英文忽略指令', pattern: /ignore\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above)/i }),
  Object.freeze({ id: 'exfiltrate', cn: '要求外发或泄露', pattern: /(?:发送|转发|上传|泄露|抄送)(?:到|至|给)/ }),
  Object.freeze({ id: 'privilege', cn: '要求提权或绕过', pattern: /(?:提权|管理员权限|越权|绕过(?:权限|规则)|root\s*权限)/i }),
  Object.freeze({ id: 'private-target', cn: '指向私有资源', pattern: /(?:私有|评议记录|学生名单|private\/)/ }),
  Object.freeze({ id: 'role-override', cn: '试图改写系统设定', pattern: /(?:从现在起|system\s*prompt|系统指令|新的规则)/i }),
]);

export const TOOL_RULES = Object.freeze([
  Object.freeze({ id: 'path-traversal', cn: '路径穿越', test: (resource) => /\.\./.test(resource) }),
  Object.freeze({ id: 'absolute-path', cn: '绝对路径', test: (resource) => /^(?:\/|[a-zA-Z]:\\)/.test(resource) }),
  Object.freeze({ id: 'private-path', cn: '私有目录', test: (resource) => resource.startsWith('private/') }),
  Object.freeze({ id: 'config-write', cn: '配置写入', test: (resource) => resource.startsWith('config/') }),
  Object.freeze({ id: 'external-channel', cn: '对外通道', test: (resource) => resource.startsWith('external/') }),
]);

export const OUTPUT_RULES = Object.freeze([
  Object.freeze({ id: 'overclaim', cn: '夸大确定性', test: (text) => /(?:已确认|确有|完全验证|100%|一定正确)/.test(text) }),
  Object.freeze({ id: 'sensitive-leak', cn: '疑似敏感字段', test: (text) => /(?:1[3-9]\d{9}|[\w.+-]+@[\w-]+\.[\w.]+|\b\d{17}[\dXx]\b)/.test(text) }),
]);

function excerpt(text, index, length = 34) {
  const source = String(text || '');
  const start = Math.max(0, index - 10);
  return `${start > 0 ? '…' : ''}${source.slice(start, start + length)}${start + length < source.length ? '…' : ''}`;
}

/**
 * 输入检查：命中就标记为不可信。
 * @returns {{hit:boolean, hits:Array, text:string}}
 */
export function checkInput(text, { enabled = true } = {}) {
  const source = String(text || '');
  if (!enabled) {
    return { enabled: false, hit: false, hits: [], note: '输入护栏已关闭：没有做任何标记（这不是「干净」，而是「没检查」）。' };
  }
  const hits = [];
  for (const rule of INPUT_RULES) {
    const match = rule.pattern.exec(source);
    if (!match) continue;
    hits.push({ id: rule.id, cn: rule.cn, excerpt: excerpt(source, match.index) });
  }
  return {
    enabled: true,
    hit: hits.length > 0,
    hits,
    note: hits.length
      ? '命中的是**字面模式**：这条样本被拦住了，不代表同类攻击都能被拦住。'
      : '没有命中任何已知模式：可能是干净文本，也可能是换了措辞的绕过——单靠关键词无法区分。',
  };
}

/**
 * 工具调用检查。
 * @returns {{hit:boolean, hits:Array, note:string}}
 */
export function checkToolRequest({ resourceId, operation = 'read' }, { enabled = true } = {}) {
  if (!enabled) {
    return { enabled: false, hit: false, hits: [], note: '工具护栏已关闭：没有检查目标路径（风险直接暴露给权限层）。' };
  }
  const hits = [];
  for (const rule of TOOL_RULES) {
    if (rule.test(resourceId)) hits.push({ id: rule.id, cn: rule.cn, excerpt: resourceId });
  }
  if (operation === 'send') hits.push({ id: 'send-operation', cn: '发送类操作', excerpt: resourceId });
  return {
    enabled: true,
    hit: hits.length > 0,
    hits,
    note: hits.length
      ? '命中规则只说明「这次请求看起来敏感」，是否放行仍由权限与沙箱决定；护栏不是授权。'
      : '目标路径未命中已知规则；私有数据仍要靠权限规则保护。',
  };
}

/**
 * 输出检查：夸大、缺来源、漏写不确定性、疑似泄露。
 * @returns {{hit:boolean, hits:Array, note:string}}
 */
export function checkOutput({ text = '', citations = 0, status = 'supported' }, { enabled = true } = {}) {
  if (!enabled) {
    return { enabled: false, hit: false, hits: [], note: '输出护栏已关闭：结论可以直接输出，没有做任何检查。' };
  }
  const hits = [];
  for (const rule of OUTPUT_RULES) {
    if (rule.test(text)) hits.push({ id: rule.id, cn: rule.cn, excerpt: excerpt(text, String(text).search(rule.pattern) >= 0 ? String(text).search(rule.pattern) : 0) });
  }
  if (status === 'supported' && citations === 0) {
    hits.push({ id: 'missing-citation', cn: '给出结论但没有来源', excerpt: 'status=supported · citations=0' });
  }
  if (status !== 'supported' && !/(未决|资料不足|未验证|未完成|不确定)/.test(text)) {
    hits.push({ id: 'missing-uncertainty', cn: '未如实说明不确定性', excerpt: text.slice(0, 34) });
  }
  return {
    enabled: true,
    hit: hits.length > 0,
    hits,
    note: hits.length
      ? '输出侧命中：结论被改写为「需人工复核」，不会以确定语气发布。'
      : '输出侧未命中已知规则；这只说明这条结论没有触发现有规则。',
  };
}

/** 规则可能漏掉什么：UI 与正文都引用这份说明，避免把护栏说成安全保证 */
export const GUARDRAIL_LIMITS = Object.freeze([
  '换语言、拆词、同义改写都可能绕过字面规则。',
  '规则命中不等于安全：它只提高攻击成本。',
  '规则误报会让正常内容被拦，需要人工复核而不是直接关掉。',
  '高影响动作仍必须由权限、沙箱与人工确认兜底。',
]);

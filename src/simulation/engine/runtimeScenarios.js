// @ts-check
/** Scenario conditions are local fixtures, never probabilities or network faults. */
export const RUNTIME_SCENARIOS=Object.freeze([
  {id:'NORMAL_PATH',label:'资料齐全',condition:'使用本地创客分享会 NTC-1001，工具正常',sourceIds:['NTC-1001']},
  {id:'MISSING_EVIDENCE',label:'关键资料缺失',condition:'首次检索隐藏 NTC-1001；Agent Loop 可补充检索一次',sourceIds:['NTC-1001']},
  {id:'TOOL_FAILURE_ONCE',label:'工具失败一次',condition:'第一次实际搜索调用返回可恢复 SEARCH_TIMEOUT',sourceIds:['NTC-1001']},
  {id:'TOOL_FAILURE_EXHAUSTED',label:'工具持续失败',condition:'每次实际搜索调用返回可恢复 SEARCH_TIMEOUT',sourceIds:['NTC-1001']},
  {id:'CONFLICTING_SOURCES',label:'证据冲突',condition:'返回 NTC-1008 / NTC-1009，日期冲突且无更正链',sourceIds:['NTC-1008','NTC-1009']},
  {id:'PERMISSION_REQUIRED',label:'请求模拟审批',condition:'搜索公开资料前触发场景审批；不能覆盖配置拒绝',sourceIds:['NTC-1001']},
  {id:'PERMISSION_DENIED',label:'权限被拒绝',condition:'场景规则拒绝搜索；不执行或重试该工具',sourceIds:['NTC-1001']},
  {id:'STEP_LIMIT_REACHED',label:'步数耗尽',condition:'目标是反复复核尚未确认的资料，直到配置 maxSteps',sourceIds:['NTC-1001']},
  {id:'UNTRUSTED_INSTRUCTION',label:'不可信指令',condition:'读取资料后加载既有 Reliability Lab 注入样本，只作为数据',sourceIds:['NTC-1001']},
].map(item=>Object.freeze(item)));
export function runtimeScenario(id) {const s=RUNTIME_SCENARIOS.find(s=>s.id===id);if(!s)throw Error('未知本地模拟场景');return s;}
export const RUNTIME_ROLES=Object.freeze([
  {id:'researcher',label:'Researcher',duty:'检索并收集可见资料',modules:['announcement_search','document_reader','retrieval'],output:'候选来源与实际读取片段'},
  {id:'verifier',label:'Verifier',duty:'识别缺失、冲突和证据边界',modules:[],output:'核验状态与冲突清单'},
  {id:'synthesizer',label:'Synthesizer',duty:'依据核验结果整理结论',modules:[],output:'结论、引用与限制'},
].map(item=>Object.freeze(item)));
export const RUNTIME_STATUS=Object.freeze({idle:'预检未通过',ready:'就绪',running:'运行中',paused:'已暂停',waiting_approval:'等待模拟审批',completed:'已完成',failed:'失败',cancelled:'已取消'});

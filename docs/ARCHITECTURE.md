# 技术架构（发布候选草案）

原生 ES Modules、DOM 与 Three.js 在浏览器运行；Node.js、esbuild 和 TypeScript 仅用于开发、校验与静态构建。生产 `dist/` 包含相对路径 HTML、CSS、入口 JS 和本地代码块：五个独立实验按需加载；另生成同步内联代码的根目录离线单文件。路由以 URL fragment 表示；无服务器端 SPA fallback 需求。部署时必须完整上传所有代码块；站点和缓存行为仍待核实。

`src/knowledge/` 注册六章、概念、关系、来源和实验；Story、Atlas 与 Lab 消费同一知识接口。Constructor 的 Agent Configuration 是装配与 Inspector 的共同数据源，Preflight 验证依赖和权限。`src/simulation/engine/` 根据配置快照、资料版本、场景和 seed 产生本地 Runtime 事件与结果；展示时间及 ID 不应混同于业务语义确定性。证据通过本地 source/chunk 和事件追溯，资料不足时保留不确定性。

M2.1 配置及预检为 M2.2 Runtime 提供输入；M2.3 固定共同条件，分别运行两份快照并从事件计算对比指标，档案包含自己的快照和运行记录。Journal 和学习进度独立于构建器、研究历史和 Runtime 历史的 localStorage 命名空间；A/B 档案使用独立 IndexedDB。具体 schema、容量和损坏处理见各阶段交付和 [M3.2 门禁](M3_QUALITY_GATE.md)。

所有工具、权限、检索和 Guardrails 都是教学规则；没有真实 AI、Embedding、MCP 服务、远程搜索、云存储或服务端安全边界。外部参考链接仅供用户主动访问。浏览器存储受用户、浏览器配额和站点源限制，不承诺永久保存。

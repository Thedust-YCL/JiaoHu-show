/** M2.1 public data contract. settings is the existing module config payload. */
export type ModuleType = 'model'|'instructions'|'context'|'tools'|'mcp'|'retrieval'|'skills'|'memory'|'runtime'|'guardrails';
export type Json = null|boolean|number|string|Json[]|{[key:string]:Json};
export interface RuntimeSettings {
  executionMode:'workflow'|'agent-loop';
  maxSteps:number;
  maxRetries:number;
  stopWhenInsufficient:boolean;
  requireApprovalForRestrictedActions:boolean;
}
export interface AgentModuleInstance {
  instanceId:string;
  moduleId:string;
  moduleType:ModuleType|string;
  portId:string;
  enabled:boolean;
  order:number;
  settings:{[key:string]:Json};
  permissions:{read:boolean};
}
export interface ModuleConnection {
  id:string;
  sourceInstanceId:string;
  targetInstanceId:string;
  type:'provides-context'|'tool-access'|'applies-policy';
  enabled:boolean;
}
export interface AgentConfiguration {
  schemaVersion:2;
  configId:string;
  name:string;
  description?:string;
  createdAt:string;
  updatedAt:string;
  modules:AgentModuleInstance[];
  connections:ModuleConnection[];
  settings:RuntimeSettings;
  compatibility?:{migratedFrom:number};
}
export interface ConfigurationIssue {
  id:string;
  code:string;
  level:'error'|'warning'|'info';
  moduleId:string|null;
  field:string|null;
  title:string;
  description:string;
  suggestion:string;
}

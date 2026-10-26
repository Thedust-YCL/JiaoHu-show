import type {AgentConfiguration} from '../../features/constructor/model/types.js';
export interface RuntimeOptions {scenarioId?:string;seed?:string|number;collaboration?:'single'|'sequential';runId?:string;startedAt?:number|null;engineVersion?:string;}
export interface RuntimeWorkspaceOptions {
  getConfiguration?:()=>AgentConfiguration;
  storage?:Pick<Storage,'getItem'|'setItem'|'removeItem'>|null;
  onBackToConstructor?:()=>void;onBackToHub?:()=>void;onLegacyExecution?:()=>void;
  onOpenKnowledge?:(id:string,context:{from:string})=>void;
  onConfirm?:(title:string,message:string,action:()=>void)=>void;
  onMountCanvas?:(stage:HTMLElement)=>void;onReleaseCanvas?:()=>void;
  onFocusScene?:(focus:{moduleId:string;tone:string}|null)=>void;
  has3D?:boolean;reducedMotion?:boolean;
}
export interface RuntimeEventDetail {
  reason?:string;input?:unknown;output?:unknown;status?:string;toolId?:string|null;
  branchId?:string|null;errorCode?:string|null;sourceIds?:string[];
  fromRole?:string;artifactRefs?:string[];
}

import type {AgentConfiguration} from '../../constructor/model/types.js';
import type {createRuntime} from '../../../simulation/engine/runtime.js';
import type {createConstructorStore} from '../../constructor/state/store.js';
export type Side='A'|'B';
export type RunRecord=ReturnType<ReturnType<typeof createRuntime>['getRun']>;
export interface PairControls {taskId:string;datasetId:string;datasetVersion:string;missionVersion:number;scenarioId:string;seed:string|number;approvalPolicyId:string;collaboration:'single'|'sequential';engineVersion?:string}
export interface ComparisonSession {
  drafts?:Record<Side,AgentConfiguration>;side?:Side;tab?:string;events?:Record<Side,string|null>;scrolls?:Record<string,number>;
  title?:string;controls?:PairControls;editingSide?:Side;moduleId?:string;linked?:boolean;speed?:number;difference?:boolean;showEqual?:boolean;
  metricsOpen?:boolean;
  experiment?:ReturnType<typeof import('./experiment.js').runExperiment>;
}
export interface ComparisonWorkspaceOptions {
  store?:ReturnType<typeof createConstructorStore>;session?:ComparisonSession;
  onBack?:()=>void;onEdit?:(configuration:AgentConfiguration,confirmed:()=>void)=>void;onKnowledge?:(id:string)=>void;
  onConfirm?:(title:string,message:string,action:()=>void)=>void;
  onMountCanvas?:(stage:HTMLElement)=>void;onReleaseCanvas?:()=>void;
  onSnapshot?:(configuration:AgentConfiguration|null,projection?:ReturnType<typeof import('./projection.js').snapshotProjection>,side?:Side)=>void;
  onFocus?:(focus:{moduleId?:string;tone?:string;paused?:boolean}|null)=>void;
  has3D?:boolean;reducedMotion?:boolean;
}

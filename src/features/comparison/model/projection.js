// @ts-check
/** A read-only adapter for existing SystemGraph. This is a projection, not a new store. */
import {preflight} from '../../constructor/model/preflight.js';
import {deriveStatus} from '../../constructor/model/validation.js';
/** @param {import('../../constructor/model/types.js').AgentConfiguration} configuration @param {(id:string)=>void} onSelect */
export function snapshotProjection(configuration,onSelect=()=>{}){
  const validation=preflight(configuration);let selectedModuleId=null;
  const getInstalled=id=>configuration.modules.find(m=>m.moduleId===id)||null;
  function statusOf(id){const m=getInstalled(id);if(!m)return 'Available';const base=deriveStatus(m,configuration);if(['Disabled','Invalid'].includes(base))return base;return validation.issues.some(i=>i.moduleId===id&&i.level==='error')?'Invalid':base;}
  return {getState:()=>({...configuration,ui:{selectedModuleId}}),getInstalled,statusOf,preflight:()=>validation,actions:{select:id=>{selectedModuleId=id;onSelect(id);}}};
}

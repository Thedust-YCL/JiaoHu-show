/** Static hosting loads each lab on demand; the offline build embeds them. */
export function loadLabFactory(kind) {
  if (typeof __AZ_OFFLINE__ !== 'undefined' && __AZ_OFFLINE__) {
    switch (kind) {
      case 'token': return require('./token/tokenLab.js').createTokenLab;
      case 'context': return require('./context/contextLab.js').createContextLab;
      case 'knowledge': return require('./knowledge/knowledgeLab.js').createKnowledgeLab;
      case 'runtime': return require('./runtime/runtimeLab.js').createRuntimeLab;
      case 'reliability': return require('./reliability/reliabilityLab.js').createReliabilityLab;
      default: return null;
    }
  }
  switch (kind) {
    case 'token': return import('./token/tokenLab.js').then(m => m.createTokenLab);
    case 'context': return import('./context/contextLab.js').then(m => m.createContextLab);
    case 'knowledge': return import('./knowledge/knowledgeLab.js').then(m => m.createKnowledgeLab);
    case 'runtime': return import('./runtime/runtimeLab.js').then(m => m.createRuntimeLab);
    case 'reliability': return import('./reliability/reliabilityLab.js').then(m => m.createReliabilityLab);
    default: return null;
  }
}

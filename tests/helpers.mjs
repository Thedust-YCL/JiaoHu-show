/**
 * tests/helpers.mjs — 测试用内存存储实现
 * 不接触真实 localStorage，保证单元测试可在 Node 中确定性运行。
 */
export function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    keys: () => [...map.keys()],
    raw: map,
  };
}

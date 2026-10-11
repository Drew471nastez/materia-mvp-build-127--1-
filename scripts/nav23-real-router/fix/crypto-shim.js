/* node:crypto in the browser bundle (turbopack polyfills it; the harness's webpack build does not): a stand in hash, same shape. */
export function createHash() {
  let s = ""
  const h = { update(v) { s += String(v); return h }, digest() { let a = 5381; for (let i = 0; i < s.length; i++) a = ((a << 5) + a + s.charCodeAt(i)) | 0; return (a >>> 0).toString(16).padStart(64, "0") } }
  return h
}
export function randomUUID() { return globalThis.crypto.randomUUID() }
export default { createHash, randomUUID }

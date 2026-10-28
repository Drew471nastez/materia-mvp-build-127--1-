/**
 * Which version of an email's saved words a preview was drawn for: a short
 * hash of them (FNV-1a of their JSON, keys in a fixed order), the same in
 * the browser and on the server, so a preview kept for one version is never
 * shown for words saved since. No words saved is "default".
 */
export function previewVersion(words: unknown): string {
  if (words == null || (typeof words === "object" && Object.keys(words as object).length === 0)) return "default"
  const json = stable(words)
  let h = 0x811c9dc5
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`
  }
  return JSON.stringify(v ?? null)
}

/**
 * What a note on an order's timeline may hold, for the composer and the
 * server alike (lib/physical/orders-server addNote): plain text, line
 * breaks kept, at most NOTE_MAX characters and never more than the timeline
 * entry's detail column takes (4 KB, part 78).
 */
export const NOTE_MAX = 1500

export function cleanNote(value: unknown): string | null {
  if (typeof value !== "string") return null
  let v = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, NOTE_MAX)
  /* The detail column holds 4 KB; a note in a script of wide characters is cut to fit. */
  while (v && new TextEncoder().encode(JSON.stringify({ text: v })).length > 3800) v = v.slice(0, Math.floor(v.length * 0.9))
  return v || null
}


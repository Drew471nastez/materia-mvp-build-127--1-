/**
 * What a run asked to remember and to forget, kept once it is over
 * (./store.ts). Shared by Storelib AI's page assistant and the MCP
 * connection, so both write a note the same way: one line, never a secret,
 * once per scope, with who kept it.
 */
import { addMemory, byShortId, deleteMemory, type AiMemory, type MemoryDb, type MemorySource } from "./store"

export interface KeptNote {
  id: string
  content: string
  scope: "website" | "everywhere"
}

export interface RunMemory {
  /** Notes for every website of the creator's. */
  remembered?: string[]
  /** Notes for this website. */
  rememberedSite?: string[]
  /** Short ids of notes to delete, among those the run was shown. */
  forgotten?: string[]
}

export async function keepRunMemory(
  db: MemoryDb,
  who: { creatorId: string; installId: string },
  run: RunMemory,
  shown: AiMemory[],
  source: MemorySource = "assistant",
  sourceName?: string | null,
): Promise<{ kept: KeptNote[]; forgot: AiMemory[] }> {
  const kept: KeptNote[] = []
  const notes: [string, "website" | "everywhere"][] = [
    ...(run.rememberedSite ?? []).map((n) => [n, "website"] as [string, "website"]),
    ...(run.remembered ?? []).map((n) => [n, "everywhere"] as [string, "everywhere"]),
  ]
  for (const [note, scope] of notes.slice(0, 8)) {
    const r = await addMemory(db, who.creatorId, note, source, { installId: scope === "website" ? who.installId : null, sourceName })
    if (r.ok === true && !r.duplicate) kept.push({ id: r.memory.id, content: r.memory.content, scope })
    else if (r.ok === false) console.warn("[storelib ai] memory not kept", r.error)
  }
  const forgot: AiMemory[] = []
  for (const short of (run.forgotten ?? []).slice(0, 8)) {
    const note = byShortId(shown, short)
    /* Only a note the run was shown, and only in its own scope: never another website's. */
    if (!note || (note.installId !== null && note.installId !== who.installId)) continue
    if (await deleteMemory(db, who.creatorId, note.id, { installId: note.installId })) forgot.push(note)
  }
  return { kept, forgot }
}

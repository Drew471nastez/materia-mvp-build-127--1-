/**
 * AI Memory over MCP (./mcp.ts MEMORY_TOOLS), bound to one connection.
 *
 * The connection is a token for ONE website of ONE creator (./tokens.ts), and
 * it reaches the database with the service role, so the scope is held here by
 * hand: every read names the token's creator, a note is written only for the
 * token's website, and a forget deletes only a note of that website that the
 * agent could have read. A read only key reads and writes nothing.
 */
import { addMemory, byShortId, deleteMemory, describeMemory, memoriesForSite, type MemoryDb } from "@/lib/ai-memory/store"
import type { MemoryOps } from "./mcp"
import type { OpResult } from "./operations"
import { READ_ONLY_REFUSAL } from "./token-format"

export function memoryOps(db: MemoryDb, who: { creatorId: string; installId: string; name: string; canWrite?: boolean }): MemoryOps {
  const readOnly = who.canWrite === false
  const refuse = (): OpResult<string> => ({ ok: false, status: 403, error: READ_ONLY_REFUSAL })
  const notReady = (): OpResult<string> => ({ ok: false, status: 503, error: "AI Memory is not set up on this Storelib yet." })
  return {
    async read() {
      const m = await memoriesForSite(db, who.creatorId, who.installId)
      if (!m.ready) return notReady()
      return { ok: true, value: describeMemory(m, { ids: true }) }
    },
    async remember(args) {
      if (readOnly) return refuse()
      const note = typeof args.note === "string" ? args.note : ""
      const kept = await addMemory(db, who.creatorId, note, "agent", { installId: who.installId, sourceName: who.name })
      if (kept.ok === false) return { ok: false, status: kept.notReady ? 503 : 400, error: (kept as { error: string }).error }
      return { ok: true, value: kept.duplicate ? `Already in AI Memory: ${kept.memory.content}` : `Remembered for this website: ${kept.memory.content}` }
    },
    async forget(args) {
      if (readOnly) return refuse()
      const m = await memoriesForSite(db, who.creatorId, who.installId)
      if (!m.ready) return notReady()
      const note = byShortId(m.site, args.id)
      if (!note) return { ok: false, status: 404, error: "No note of this website has that id. Notes for every website are changed by the creator in Storelib." }
      const gone = await deleteMemory(db, who.creatorId, note.id, { installId: who.installId })
      return gone ? { ok: true, value: `Forgotten: ${note.content}` } : { ok: false, status: 500, error: "That note could not be deleted. Try again." }
    },
  }
}

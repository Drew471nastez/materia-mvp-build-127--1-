import "server-only"

/**
 * One webhook call from Calendly or Cal.com, after the route has found the
 * store's connection by its address (app/api/bookings/external/hook). The
 * signature is checked on the raw body first; nothing is parsed before it
 * holds. Then the event is written (./server applyChange) and the creator is
 * told after the answer (`later`, Next's after() in the route).
 */
import { calcomFresh, changeOf, verifyCalcom, verifyCalendly, type Verified } from "./providers"
import { announceExternal, applyChange, noteEvent, openConnection, type ConnectionRow, type Db, type ExternalAnnounceDeps } from "./server"

export interface HookResult {
  status: number
  body: Record<string, unknown>
}

export function verifyHook(conn: Pick<ConnectionRow, "provider">, signing: string, raw: string, headers: Headers, nowMs: number): Verified {
  return conn.provider === "calendly" ? verifyCalendly(headers.get("calendly-webhook-signature"), raw, signing, nowMs) : verifyCalcom(headers.get("x-cal-signature-256"), raw, signing)
}

export async function takeExternalEvent(
  db: Db,
  conn: ConnectionRow,
  input: { raw: string; headers: Headers },
  opts: { origin: string; later?: (fn: () => Promise<unknown>) => void; nowMs?: number; deps?: ExternalAnnounceDeps },
): Promise<HookResult> {
  const nowMs = opts.nowMs ?? Date.now()
  const sealed = openConnection(conn.secret_ciphertext)
  if (!sealed) return { status: 401, body: { error: "This connection has no secret. Connect it again." } }
  const verified = verifyHook(conn, sealed.signing, input.raw, input.headers, nowMs)
  if (verified.ok === false) return { status: 401, body: { error: `Signature ${verified.reason}.` } }

  let body: unknown
  try {
    body = JSON.parse(input.raw)
  } catch {
    return { status: 400, body: { error: "Send JSON." } }
  }
  if (conn.provider === "calcom" && !calcomFresh(body, nowMs)) return { status: 401, body: { error: "Signature stale." } }

  const change = changeOf(conn.provider, body)
  const now = new Date(nowMs).toISOString()
  let applied
  try {
    applied = await applyChange(db, conn, change, now)
  } catch (e) {
    /* Not written: a 503 so the provider sends it again. */
    console.warn("[bookings] external event not saved:", conn.provider, e instanceof Error ? e.message.slice(0, 160) : "error")
    return { status: 503, body: { error: "Not saved. Send it again." } }
  }
  await noteEvent(db, conn, now).catch(() => undefined)
  const done = applied
  if (done.tell) {
    /* The real senders (the bell and Mailgun, lib/bookings/announce-server), loaded only when there is something to tell. */
    const tell = async () => {
      const deps = opts.deps ?? ((await import("@/lib/bookings/announce-server")).liveDeps(db as never) as unknown as ExternalAnnounceDeps)
      return announceExternal({ ...deps, origin: opts.origin }, done)
    }
    if (opts.later) opts.later(tell)
    else await tell()
  }
  return { status: 200, body: { ok: true, change: change.kind, ...(change.kind === "ignored" ? { reason: change.reason } : {}), duplicate: change.kind !== "ignored" && change.kind !== "moved_away" && !done.tell } }
}

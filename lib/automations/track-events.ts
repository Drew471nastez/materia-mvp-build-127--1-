/**
 * What an open or a click writes, for the tracking routes
 * (app/api/automations/t/o and t/c). The first open and the first click are
 * kept, each only where it is still empty, so a mail app that loads the
 * pixel ten times counts once. A click is also an open: many mail apps block
 * the pixel. Nothing about the person is read or written, only the send's
 * token.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isToken = (v: unknown): v is string => typeof v === "string" && UUID.test(v)

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export async function recordOpen(db: Db, token: string, now = new Date().toISOString()): Promise<void> {
  if (!isToken(token)) return
  await db.from("email_flow_sends").update({ opened_at: now, updated_at: now }).eq("token", token).is("opened_at", null)
}

export async function recordClick(db: Db, token: string, now = new Date().toISOString()): Promise<void> {
  if (!isToken(token)) return
  await db.from("email_flow_sends").update({ clicked_at: now, updated_at: now }).eq("token", token).is("clicked_at", null)
  await db.from("email_flow_sends").update({ opened_at: now, updated_at: now }).eq("token", token).is("opened_at", null)
}

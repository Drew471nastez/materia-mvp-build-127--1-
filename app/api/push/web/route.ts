import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { readCurrentUser } from "@/lib/auth/current-user"
import { vapidKeys } from "@/lib/push/web-vapid"
import {
  endpointPattern,
  forgetOnAccount,
  keepOnAccount,
  keptOn,
  saveFailure,
  tokenOf,
  validSubscription,
} from "@/lib/push/web-subscriptions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  NOTIFICATIONS ON THIS BROWSER (Settings, Privacy)
 * ===========================================================================
 *   GET     the public key a browser subscribes with, or 503 when this server
 *           has no way to sign pushes (lib/push/web-vapid). With
 *           ?endpoint= it also says whether that browser is saved for the
 *           signed in person, so the switch shows what is true on load.
 *   POST    { subscription } saves this browser for the signed in person
 *   DELETE  { endpoint } forgets it
 *
 * A browser's subscription is kept in push_tokens beside the phones' tokens,
 * as platform "web" with the subscription's JSON as its token, so the one
 * sender (lib/push/sender.ts) reaches phones and browsers alike. On a
 * database that still refuses "web" it is kept on the account instead
 * (lib/push/web-subscriptions.ts).
 */

const NO_STORE = { "Cache-Control": "no-store" }

type Who =
  | { kind: "user"; id: string; appMetadata: Record<string, unknown> | undefined }
  | { kind: "nobody" }
  | { kind: "unknown" }

async function signedIn(): Promise<Who> {
  const supabase = await createClient()
  const current = await readCurrentUser(supabase)
  if (current.state === "indeterminate") return { kind: "unknown" }
  if (!current.user) return { kind: "nobody" }
  return { kind: "user", id: current.user.id, appMetadata: current.user.app_metadata as Record<string, unknown> | undefined }
}

const unreachable = () =>
  NextResponse.json({ error: "Could not reach Storelib. Check your connection and try again." }, { status: 503, headers: NO_STORE })

export async function GET(req: Request) {
  const keys = vapidKeys()
  if (!keys) {
    return NextResponse.json(
      { error: "Browser notifications are not set up on this server yet.", code: "not_configured" },
      { status: 503, headers: NO_STORE },
    )
  }
  const endpoint = new URL(req.url).searchParams.get("endpoint")
  if (!endpoint) return NextResponse.json({ publicKey: keys.publicKey }, { headers: NO_STORE })

  const who = await signedIn()
  if (who.kind !== "user") return NextResponse.json({ publicKey: keys.publicKey, saved: null }, { headers: NO_STORE })
  const { data, error } = await createAdminClient()
    .from("push_tokens")
    .select("id")
    .eq("user_id", who.id)
    .eq("platform", "web")
    .like("token", endpointPattern(endpoint))
    .limit(1)
  const inTable = !error && (data?.length ?? 0) > 0
  const onAccount = keptOn(who.appMetadata).some((s) => s.endpoint === endpoint)
  return NextResponse.json({ publicKey: keys.publicKey, saved: inTable || onAccount }, { headers: NO_STORE })
}

export async function POST(req: Request) {
  const who = await signedIn()
  if (who.kind === "unknown") return unreachable()
  if (who.kind === "nobody") return NextResponse.json({ error: "Your session ended. Sign in again to turn this on." }, { status: 401, headers: NO_STORE })
  const body = (await req.json().catch(() => null)) as { subscription?: unknown } | null
  const sub = body?.subscription
  if (!validSubscription(sub)) return NextResponse.json({ error: "This browser did not give a subscription. Reload the page and try again." }, { status: 400, headers: NO_STORE })

  const admin = createAdminClient()
  const token = tokenOf(sub)
  /*
    One row per browser. A browser's subscription belongs to whoever turned
    it on last on it, so a row for the same endpoint goes first, whoever it
    was saved for (an older key pair, or another account signed in on this
    browser before). Then a plain insert: no conflict target to depend on.
  */
  const clear = () => admin.from("push_tokens").delete().eq("platform", "web").like("token", endpointPattern(sub.endpoint))
  const insert = () => admin.from("push_tokens").insert({ user_id: who.id, token, platform: "web", updated_at: new Date().toISOString() })

  await clear()
  let { error } = await insert()
  if (saveFailure(error) === "duplicate") {
    /* Two presses at once: the other one's row is this browser too. */
    await clear()
    ;({ error } = await insert())
  }

  const failure = saveFailure(error)
  if (failure === "platform_refused" || failure === "no_table") {
    console.warn(
      `[push/web] push_tokens ${failure === "no_table" ? "is not in the database" : "refuses platform web"} (${error?.code ?? "unknown"}); kept on the account. Run supabase/sql/run-now/22_browser_push_and_time_zone.sql`,
    )
    if (await keepOnAccount(admin, who.id, sub)) return NextResponse.json({ ok: true, kept: "account" }, { headers: NO_STORE })
    console.error("[push/web] not kept on the account either")
    return NextResponse.json({ error: "Storelib could not save this browser. Try again in a moment.", code: "server" }, { status: 500, headers: NO_STORE })
  }
  if (failure !== "none") {
    console.error(`[push/web] not saved (${error?.code ?? "unknown"}): ${error?.message ?? ""}`)
    return NextResponse.json({ error: "Storelib could not save this browser. Try again in a moment.", code: "server" }, { status: 500, headers: NO_STORE })
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}

export async function DELETE(req: Request) {
  const who = await signedIn()
  if (who.kind === "unknown") return unreachable()
  if (who.kind === "nobody") return NextResponse.json({ error: "Your session ended. Sign in again to change this." }, { status: 401, headers: NO_STORE })
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null
  if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "Missing endpoint" }, { status: 400, headers: NO_STORE })
  const admin = createAdminClient()
  const { error } = await admin
    .from("push_tokens")
    .delete()
    .eq("user_id", who.id)
    .eq("platform", "web")
    .like("token", endpointPattern(body.endpoint))
  if (keptOn(who.appMetadata).some((s) => s.endpoint === body.endpoint)) await forgetOnAccount(admin, who.id, [body.endpoint])
  if (error && saveFailure(error) !== "no_table") {
    return NextResponse.json({ error: "Could not turn notifications off. Try again in a moment." }, { status: 500, headers: NO_STORE })
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}

import { NextResponse, type NextRequest } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { deleteAllUserData } from "@/app/api/auth/delete-account/route"
import { scoreSignup, handleSignature, BLOCK_SCORE } from "@/lib/security/spam-signals"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  GET  /api/admin/spam-purge   → what WOULD be removed, and why
 *  POST /api/admin/spam-purge   → actually remove it
 * ===========================================================================
 *
 * The clean-up half of the link-farm response. Detection stops the next batch;
 * this clears the three hundred and sixty accounts that got in before the gate
 * existed.
 *
 * ---------------------------------------------------------------------------
 * IT IS A DRY RUN UNTIL SOMEBODY ECHOES THE COUNT BACK
 * ---------------------------------------------------------------------------
 * Removing accounts is irreversible and it cascades into auth.users. So GET is
 * the default verb and it changes nothing: it returns the exact list, each with
 * its score, the reasons and the structural signature, so an operator can read
 * the whole batch before agreeing to any of it.
 *
 * POST then requires `confirm` to equal the number of accounts the caller
 * expects. If the set has moved since the dry run — somebody signed up,
 * somebody published a product — the count will not match and the request is
 * refused rather than quietly acting on a different set than the one that was
 * reviewed. Same reasoning as typing a repository name to delete it.
 *
 * ---------------------------------------------------------------------------
 * THE FOUR THINGS THAT PROTECT AN ACCOUNT
 * ---------------------------------------------------------------------------
 * A wrong removal cannot be undone, and 360 rows are near-certain to contain at
 * least one real person who picked an unlucky handle. So the score is necessary
 * and nowhere near sufficient. An account is spared if it has EVER:
 *
 *   · published a product,
 *   · placed or received an order,
 *   · sent a message,
 *   · or been marked 'clear' by an operator.
 *
 * Each is evidence of a human being. A link farm produces none of them — that
 * is what being here for the backlink means — so these filters cost nothing
 * against real spam, and they are the only thing standing between a mistuned
 * lexicon and somebody's account.
 */

type Candidate = {
  id: string
  username: string | null
  display_name: string | null
  created_at: string | null
  score: number
  reasons: string[]
  signature: string
}

const chunk = <T,>(xs: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

/**
 * Ids showing any sign of a human being.
 *
 * Collected in bulk: 360 accounts with four checks each is 1440 round trips if
 * done one account at a time.
 */
async function idsWithRealActivity(admin: ReturnType<typeof createAdminClient>, ids: string[]) {
  const spare = new Set<string>()
  if (!ids.length) return spare

  for (const part of chunk(ids, 200)) {
    // Published anything, via creators.
    const { data: creators } = await admin.from("creators").select("id, user_id").in("user_id", part)
    const creatorIds = (creators ?? []).map((c: { id: string }) => c.id)
    if (creatorIds.length) {
      const { data: products } = await admin
        .from("products")
        .select("creator_id")
        .in("creator_id", creatorIds)
        .eq("status", "published")
      const publishing = new Set((products ?? []).map((p: { creator_id: string }) => p.creator_id))
      for (const c of creators ?? []) {
        const row = c as { id: string; user_id: string }
        if (publishing.has(row.id)) spare.add(row.user_id)
      }
    }

    // Ever sent a message.
    const { data: senders } = await admin.from("messages").select("sender_id").in("sender_id", part)
    for (const m of senders ?? []) spare.add((m as { sender_id: string }).sender_id)

    /**
     * Ever bought or sold.
     *
     * A FAILED check must never read as "no orders" — that inverts the safety
     * property of this whole function — so an error spares the entire chunk
     * rather than letting it through. Over-sparing leaves spam in place, which
     * containment has already defanged; under-sparing removes a customer.
     */
    for (const col of ["buyer_id", "seller_id"] as const) {
      try {
        const { data, error } = await admin.from("orders").select(col).in(col, part)
        if (error) {
          for (const id of part) spare.add(id)
          continue
        }
        for (const row of data ?? []) spare.add((row as Record<string, string>)[col])
      } catch {
        for (const id of part) spare.add(id)
      }
    }
  }
  return spare
}

async function collectCandidates(): Promise<{ candidates: Candidate[]; scanned: number; spared: number }> {
  const admin = createAdminClient()

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, username, display_name, created_at, spam_state")
    .not("username", "is", null)
    .limit(5000)

  const rows = (profiles ?? []) as Array<Record<string, unknown>>

  // Score first, so the activity queries run only against accounts that are
  // already candidates rather than against the whole user table.
  const scored = rows
    .map((p) => ({
      p,
      verdict: scoreSignup({
        handle: p.username as string | null,
        displayName: p.display_name as string | null,
      }),
    }))
    .filter(({ p, verdict }) => {
      // An operator's 'clear' is final and outranks any score.
      if (p.spam_state === "clear") return false
      // 'confirmed' is an operator saying yes even where the lexicon is unsure.
      if (p.spam_state === "confirmed") return true
      return verdict.score >= BLOCK_SCORE
    })

  const spare = await idsWithRealActivity(
    admin,
    scored.map(({ p }) => p.id as string),
  )

  const candidates: Candidate[] = scored
    .filter(({ p }) => !spare.has(p.id as string))
    .map(({ p, verdict }) => ({
      id: p.id as string,
      username: (p.username as string) ?? null,
      display_name: (p.display_name as string) ?? null,
      created_at: (p.created_at as string) ?? null,
      score: verdict.score,
      reasons: verdict.signals.map((s) => s.detail),
      signature: handleSignature(p.username as string),
    }))
    // Grouped by shape, so a generated batch reads as a batch in the response.
    .sort((a, b) => a.signature.localeCompare(b.signature) || (a.username ?? "").localeCompare(b.username ?? ""))

  return { candidates, scanned: rows.length, spared: scored.length - candidates.length }
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { candidates, scanned, spared } = await collectCandidates()
  return NextResponse.json({
    dryRun: true,
    scanned,
    spared,
    count: candidates.length,
    candidates,
    // The caller echoes this back as `confirm`. A mismatch means the set moved.
    confirmToken: candidates.length,
  })
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { candidates } = await collectCandidates()

  if (body?.confirm !== candidates.length) {
    return NextResponse.json(
      {
        error: "confirm_mismatch",
        message:
          `Expected confirm=${candidates.length}. The set of accounts changed since the preview, ` +
          `so nothing was touched. Re-run the preview and confirm again.`,
        count: candidates.length,
      },
      { status: 409 },
    )
  }

  if (!candidates.length) {
    return NextResponse.json({ removed: 0, failed: [], message: "Nothing to remove." })
  }

  const admin = createAdminClient()
  const failed: Array<{ id: string; username: string | null; error: string }> = []
  let removed = 0

  /**
   * Sequential on purpose. deleteAllUserData walks storage buckets and a dozen
   * tables per account; firing 360 of those at once is how a service-role key
   * gets rate-limited halfway through and leaves half-cleared accounts behind.
   */
  for (const c of candidates) {
    try {
      await deleteAllUserData(admin, c.id)
      removed++
    } catch (e: unknown) {
      failed.push({ id: c.id, username: c.username, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({ removed, failed, message: `Removed ${removed} of ${candidates.length}.` })
}

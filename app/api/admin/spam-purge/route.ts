import { NextResponse, type NextRequest } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { adminFailure } from "@/lib/admin/gate"
import { recordAdminAction } from "@/lib/admin/audit"
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
    /**
     * Ever bought.
     *
     * A FAILED check must never read as "no orders" — that inverts the safety
     * property of this whole function — so an error spares the entire chunk
     * rather than letting it through. Over-sparing leaves spam in place, which
     * containment has already defanged; under-sparing removes a customer.
     */
    try {
      const { data, error } = await admin.from("orders").select("buyer_id").in("buyer_id", part)
      if (error) {
        for (const id of part) spare.add(id)
        continue
      }
      for (const row of data ?? []) spare.add((row as { buyer_id: string }).buyer_id)
    } catch {
      for (const id of part) spare.add(id)
      continue
    }

    /* The rest of the checks hold to the same rule: an error spares the chunk. */
    const { data: creators, error: creatorsError } = await admin.from("creators").select("id, user_id").in("user_id", part)
    if (creatorsError) {
      for (const id of part) spare.add(id)
      continue
    }
    const ownerOf = new Map((creators ?? []).map((c: { id: string; user_id: string }) => [c.id, c.user_id]))
    const creatorIds = [...ownerOf.keys()]

    if (creatorIds.length) {
      // Published anything, or ever sold anything.
      const { data: products, error: productsError } = await admin
        .from("products")
        .select("id, creator_id, status")
        .in("creator_id", creatorIds)
      if (productsError) {
        for (const id of part) spare.add(id)
        continue
      }
      const productOwner = new Map<string, string>()
      for (const p of (products ?? []) as Array<{ id: string; creator_id: string; status: string | null }>) {
        productOwner.set(p.id, p.creator_id)
        if (p.status === "published") spare.add(ownerOf.get(p.creator_id)!)
      }

      /*
        SOLD: orders carry no seller column. This asked orders for
        `seller_id`, which never existed, so the query failed on every chunk
        and the error branch spared everybody: the purge could never remove
        anyone. A sale is an order for one of their products.
      */
      for (const productIds of chunk([...productOwner.keys()], 150)) {
        const { data: sold, error: soldError } = await admin.from("orders").select("product_id").in("product_id", productIds)
        if (soldError) {
          for (const id of part) spare.add(id)
          break
        }
        for (const o of (sold ?? []) as Array<{ product_id: string }>) {
          const owner = ownerOf.get(productOwner.get(o.product_id) ?? "")
          if (owner) spare.add(owner)
        }
      }
    }

    // Ever sent a message.
    const { data: senders, error: sendersError } = await admin.from("messages").select("sender_id").in("sender_id", part)
    if (sendersError) {
      for (const id of part) spare.add(id)
      continue
    }
    for (const m of senders ?? []) spare.add((m as { sender_id: string }).sender_id)
  }
  return spare
}

async function collectCandidates(): Promise<{ candidates: Candidate[]; scanned: number; spared: number }> {
  const admin = createAdminClient()

  let { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, username, display_name, created_at, spam_state")
    .not("username", "is", null)
    .limit(5000)
  /* profiles.spam_state arrives with a SQL part not yet run everywhere: read
     without it (nobody is marked clear or confirmed yet) rather than fail. */
  if (profilesError?.code === "42703") {
    ;({ data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, username, display_name, created_at")
      .not("username", "is", null)
      .limit(5000))
  }

  /* A profiles read that failed is not "nobody to remove": it is a question that was not answered. */
  if (profilesError) throw new Error(`profiles read failed: ${profilesError.code ?? ""}`)
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
  let found: Awaited<ReturnType<typeof collectCandidates>>
  try {
    found = await collectCandidates()
  } catch (e) {
    return adminFailure("spam-purge preview", e, "The accounts could not be read. Nothing was changed.")
  }
  const { candidates, scanned, spared } = found
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
  let candidates: Candidate[]
  try {
    candidates = (await collectCandidates()).candidates
  } catch (e) {
    return adminFailure("spam-purge", e, "The accounts could not be read. Nothing was removed.")
  }

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
      await recordAdminAction(admin, { action: "spam_purge", targetType: "account", targetId: c.id, targetLabel: c.username, detail: { score: c.score, signature: c.signature } })
    } catch (e: unknown) {
      console.error("[spam-purge] removal failed:", e instanceof Error ? e.message : "unknown")
      failed.push({ id: c.id, username: c.username, error: "Could not be removed. The server log has the details." })
    }
  }

  return NextResponse.json({ removed, failed, message: `Removed ${removed} of ${candidates.length}.` })
}

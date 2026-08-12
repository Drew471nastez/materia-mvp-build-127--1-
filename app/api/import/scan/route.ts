import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { mapItem } from "@/lib/import/mapping"
import { MAX_ITEMS, VintedError, loadWardrobe } from "@/lib/import/vinted"

/**
 * POST /api/import/scan — read a profile and say what is there. Writes nothing.
 *
 * SEPARATE FROM THE IMPORT ON PURPOSE. Reading a wardrobe is a handful of
 * requests and takes a second; importing it downloads and re-encodes every
 * photograph and takes a minute. Putting them in one call means the operator
 * finds out what they are about to create only after it has been created, and
 * an import of the wrong profile — a mistyped id lands on a real stranger's
 * shop — is thirty listings to delete by hand.
 *
 * So this is the door you knock on first. It returns the mapped rows exactly as
 * the import would write them, including which fields could not be decided, and
 * which items are already in the database from a previous run.
 *
 * SERVER-ONLY, and it has to be: lib/import/vinted.ts opens a session against
 * Vinted and the browser could not do it anyway (their CORS forbids it), but
 * the reason it lives here is that the outbound request should come from us and
 * be bounded by us, not be a thing a page can be talked into making.
 */

export const runtime = "nodejs"
/** The scan is a few sequential round trips to another site; the default
 *  10s is not enough for a ten-page wardrobe. */
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    // A signed-in seller, because the listings this previews would be created
    // under their shop. There is no anonymous use of this.
    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth?.user?.id
    if (!userId) return NextResponse.json({ error: "auth_required" }, { status: 401 })

    const body = await request.json().catch(() => null)
    const url = typeof body?.url === "string" ? body.url : ""
    const department = typeof body?.department === "string" ? body.department : null

    const { profile, items, truncated, skipped } = await loadWardrobe(url)

    // UK numbering is a property of the PROFILE, not of any item — see the
    // shoe-size note in mapping.ts. Read once here and passed down, so no
    // per-item code has to know about domains.
    const ukNumbering = profile.host.endsWith(".co.uk") || profile.host.endsWith(".ie")

    const mapped = items.map((it) => ({
      sourceId: it.id,
      sourceUrl: it.url,
      photoCount: it.photos.length,
      preview: it.photos[0]?.url ?? null,
      ...mapItem(it, { ukNumbering, department }),
    }))

    // WHAT IS ALREADY HERE, read from the database rather than remembered.
    // A second run on the same profile has to be able to say "5 found, 5
    // already imported" instead of looking like it did nothing — and the only
    // place that fact can live is the products table, because a serverless
    // instance does not remember the previous request and is not the instance
    // that served it.
    let alreadyImported: string[] = []
    const admin = createAdminClient()
    const { data: existing, error: existErr } = await admin
      .from("products")
      .select("source_item_id")
      .eq("source_platform", "vinted")
      .in(
        "source_item_id",
        mapped.map((m) => m.sourceId),
      )
    if (existErr) {
      // The source columns only exist after RUN_IMPORT_SOURCE.sql. Without it
      // the scan still works — it simply cannot say what was imported before,
      // which the page reports rather than hiding.
      console.error("[import/scan] source lookup failed:", existErr.message)
    } else {
      alreadyImported = (existing ?? []).map((r: any) => String(r.source_item_id))
    }

    return NextResponse.json({
      profile: {
        memberId: profile.memberId,
        login: profile.login,
        countryCode: profile.countryCode,
        host: profile.host,
        profileUrl: profile.profileUrl,
        itemCount: profile.itemCount,
      },
      items: mapped,
      truncated,
      skipped,
      maxItems: MAX_ITEMS,
      alreadyImported,
      sourceColumnsReady: !existErr,
    })
  } catch (e: any) {
    if (e instanceof VintedError) {
      return NextResponse.json({ error: e.code, message: e.message }, { status: 400 })
    }
    console.error("[import/scan] failed:", e?.message || e)
    return NextResponse.json({ error: "failed", message: "Scanarea a eșuat." }, { status: 500 })
  }
}

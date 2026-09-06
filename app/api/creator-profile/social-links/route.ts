import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * ===========================================================================
 *  SOCIAL LINKS ONLY — A DELIBERATELY NARROW WRITE
 * ===========================================================================
 *
 * The creator's social links live inside the store builder's shop config, in
 * `headerSettings.socialLinks`. That same config also holds their theme, their
 * sections and every other choice they have made in the builder.
 *
 * So this endpoint MERGES. It reads the current config, replaces exactly one
 * key, and writes it back. Sending the whole config from the profile modal
 * would mean a creator who edits their bio could silently roll back work they
 * did in the builder — the modal does not know about sections and must never be
 * in a position to overwrite them.
 *
 * Both draft and published are updated: the published one is what the public
 * page renders, the draft is what the builder opens next. Updating only one
 * makes the builder appear to lose the change, or the page appear not to take
 * it.
 *
 * OWNERSHIP IS PROVEN, NOT PASSED. The caller sends a creatorId; that is a
 * claim, not an authorisation. The row is re-read and its user_id compared
 * against the verified session before anything is written.
 */

const PLATFORMS = ["instagram", "tiktok", "youtube", "twitter", "spotify"] as const

type Link = { enabled: boolean; url: string }

/** Accept only the shape we render, and only http(s) links. */
function sanitise(input: unknown): Record<string, Link> | null {
  if (!input || typeof input !== "object") return null
  const src = input as Record<string, { enabled?: unknown; url?: unknown }>
  const out: Record<string, Link> = {}
  for (const key of PLATFORMS) {
    const raw = src[key]
    const url = typeof raw?.url === "string" ? raw.url.trim() : ""
    let safe = ""
    if (url) {
      try {
        const parsed = new URL(url)
        // A javascript: or data: url in an href is a script that runs on click.
        if (parsed.protocol === "http:" || parsed.protocol === "https:") safe = parsed.toString()
      } catch {
        safe = ""
      }
    }
    out[key] = { enabled: !!raw?.enabled && safe !== "", url: safe }
  }
  return out
}

export async function PATCH(request: Request) {
  let body: { creatorId?: string; socialLinks?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const creatorId = typeof body.creatorId === "string" ? body.creatorId : ""
  const socialLinks = sanitise(body.socialLinks)
  if (!creatorId || !socialLinks) {
    return NextResponse.json({ error: "Missing creatorId or socialLinks" }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: creator, error: creatorError } = await admin
    .from("creators")
    .select("id, user_id")
    .eq("id", creatorId)
    .maybeSingle()
  if (creatorError) return NextResponse.json({ error: "Lookup failed" }, { status: 500 })
  // Same answer for "no such creator" and "not yours", so this cannot be used to
  // discover which creator ids exist.
  if (!creator || creator.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { data: row, error: rowError } = await admin
    .from("store_builder_configs")
    .select("id, draft_config, published_config")
    .eq("creator_id", creatorId)
    .eq("page_type", "shop")
    .maybeSingle()
  if (rowError) return NextResponse.json({ error: "Config lookup failed" }, { status: 500 })
  if (!row) {
    // Nothing to merge into. The creator has never opened the builder, so their
    // page renders defaults; saying so is better than inventing a config here.
    return NextResponse.json({ error: "No store configuration yet" }, { status: 409 })
  }

  const merge = (config: unknown) => {
    const base = (config && typeof config === "object" ? config : {}) as Record<string, unknown>
    const header = (base.headerSettings && typeof base.headerSettings === "object"
      ? base.headerSettings
      : {}) as Record<string, unknown>
    return {
      ...base,
      headerSettings: { ...header, socialLinks, showSocialMedia: true },
    }
  }

  const { error: updateError } = await admin
    .from("store_builder_configs")
    .update({
      draft_config: merge(row.draft_config),
      published_config: merge(row.published_config),
    })
    .eq("id", row.id)

  if (updateError) return NextResponse.json({ error: "Save failed" }, { status: 500 })
  return NextResponse.json({ ok: true, socialLinks })
}

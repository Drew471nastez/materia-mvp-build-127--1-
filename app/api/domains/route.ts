import { NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import crypto from "crypto"

import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { domainOwner, type Owner } from "@/lib/custom-domains/owner"
import {
  HOSTNAME_PROBLEM_TEXT,
  cleanHostname,
  hostnameProblem,
  isDomainPurpose,
  recordsFor,
  servingHost,
  type DomainPurpose,
} from "@/lib/custom-domains/hostname"
import {
  CURRENT_COLUMNS,
  LEGACY_COLUMNS,
  TARGET_COLUMNS,
  creatorDomainsTag,
  ensurePrimary,
  isMissingColumn,
  listCreatorDomains,
  makePrimary,
  primaryHostOf,
  purposeOf,
  saveRecords,
  syncOnepageDomain,
  toView,
  type DomainRow,
  type Schema,
} from "@/lib/custom-domains/store"
import { disableStripePaymentDomains } from "@/lib/custom-domains/stripe-pmd"
import { HOST_RESERVED_SUFFIXES } from "@/lib/custom-domains/targets"
import { addDomainHosts, recommendedRecords, removeDomainHosts, vercelConfigured } from "@/lib/custom-domains/vercel"
import { creatorSitePlan } from "@/lib/sites/plan-server"
import { siteGate } from "@/lib/sites/plan"
import { websiteHandleOf } from "@/lib/website-builder/site-address-data"
import { getMainDomain } from "@/lib/url-helpers"
import { COMMUNITY_TARGET, communityDomainTag, communityIdOf } from "@/lib/custom-domains/community"
import { ownedCommunities, ownedCommunity, type OwnedCommunity } from "@/lib/custom-domains/community-server"

/**
 * ===========================================================================
 *  A CREATOR'S DOMAINS: LIST, CONNECT, MAKE PRIMARY, REMOVE
 * ===========================================================================
 * Settings › Domains and the website builder's Domains both talk to this.
 *
 *   GET      the creator's domains, each with the records it needs, and the
 *            primary host of each purpose
 *   POST     { domain, purpose: "website" | "creator_page", replace? }
 *            { domain, purpose: "community", communityId }
 *   PATCH    { domainId, action: "make_primary" }
 *            { domainId, action: "set_purpose", purpose }
 *            { domainId, action: "set_purpose", purpose: "community", communityId }
 *   DELETE   { domainId }
 *
 * A COMMUNITY'S DOMAIN (round 31). Only a community this creator owns
 * (communities.creator_id, read with the service role after the session
 * named the creator; ownedCommunity), one domain per community (checked
 * here and held by a unique index, part 185). Moving a domain off a
 * community clears what it pointed at. Until part 185 has run, community
 * is not offered and asking for it is refused.
 *
 * The session decides whose domains these are (domainOwner, which reads the
 * user with auth.getUser() and their creator_id from it); every write goes
 * through the service role after that, because the table is closed to
 * browser writes (supabase/migrations/20261001_custom_domain_purposes.sql).
 * The Vercel token stays in lib/custom-domains/vercel.ts, on the server.
 */

/** Connecting is rare; a script trying names is not. Per person and per address. */
const ADD_LIMITS = [
  { limit: 6, seconds: 600 },
  { limit: 20, seconds: 86400 },
] as const

/** Enough for a website on a couple of domains and a creator page on a couple more. */
const MAX_PER_PURPOSE = 5

/** How long a removed domain keeps sending its visitors on, and stays on the Vercel project. */
const GRACE_DAYS = 30

function views(rows: DomainRow[], schema: Schema, more: { targets?: boolean; communities?: OwnedCommunity[] } = {}) {
  const communityOn = schema === "current" && more.targets === true
  return {
    domains: rows.map((r) => toView(r, schema)),
    primary: {
      website: primaryHostOf(rows, "website", schema),
      creator_page: primaryHostOf(rows, "creator_page", schema),
    },
    schema,
    /* Creator page domains need the purpose column to be told apart from website ones; a community's, the target columns too. */
    purposes: schema === "current" ? (communityOn ? ["website", "creator_page", "community"] : ["website", "creator_page"]) : ["website"],
    /* The communities this creator owns, which a domain can connect to (round 31). */
    communities: communityOn ? (more.communities ?? []) : [],
    registered: vercelConfigured(),
  }
}

/** The list as GET answers it, the creator's communities with it. */
async function listed(admin: Owner["admin"], creatorId: string) {
  const { rows, schema, targets } = await listCreatorDomains(admin, creatorId)
  const communities = targets ? await ownedCommunities(admin, creatorId) : []
  return views(rows, schema, { targets, communities })
}

/** A community's pages read its domain through a cache; this empties it. */
function communityChanged(...ids: (string | null | undefined)[]) {
  for (const id of ids) if (id) revalidateTag(communityDomainTag(id), "max")
}

const COMMUNITY_NEEDS_UPDATE = "Connecting a domain to a community needs a database update that has not run yet. A website domain works now."

/** Where a removed domain sends its visitors while it is still attached. */
async function fallbackFor(purpose: DomainPurpose, creatorId: string, username: string | null, communitySlug?: string | null): Promise<string> {
  const main = getMainDomain()
  if (purpose === "community") return communitySlug ? `https://${main}/community/${communitySlug}` : `https://${main}`
  if (purpose === "creator_page") return username ? `https://${main}/${username}` : `https://${main}`
  const handle = (await websiteHandleOf(creatorId).catch(() => null)) ?? username
  return handle ? `https://${handle}.${main}` : `https://${main}`
}

/** Canonicals, share links and order emails' store link read the primary domain through a cache; this empties it. Expired, not "max", which handed the next reader the old domain once. */
function changed(creatorId: string) {
  revalidateTag(creatorDomainsTag(creatorId), { expire: 0 })
}

// GET - List the creator's domains
export async function GET() {
  try {
    const owner = await domainOwner()
    if (owner instanceof NextResponse) return owner
    const { rows, schema, error, targets } = await listCreatorDomains(owner.admin, owner.creatorId)
    if (error && error !== "missing_table") {
      console.error("Error fetching domains:", error)
      return NextResponse.json({ error: "Failed to fetch domains" }, { status: 500 })
    }
    const communities = targets ? await ownedCommunities(owner.admin, owner.creatorId) : []
    /* Whether POST would let this creator connect one, by the same gate, so the
       builder's Publish panel can offer Add domain or the upgrade before a press is refused. */
    const gate = siteGate(await creatorSitePlan(owner.creatorId), "customDomain")
    return NextResponse.json({ ...views(rows, schema, { targets, communities }), canConnect: gate === null })
  } catch (error) {
    console.error("Domains GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Connect a domain to the website or the creator page
export async function POST(request: Request) {
  try {
    const owner = await domainOwner()
    if (owner instanceof NextResponse) return owner
    const { admin, creatorId, userId } = owner

    const body = (await request.json().catch(() => ({}))) as { domain?: unknown; purpose?: unknown; replace?: unknown; communityId?: unknown }
    const cleanDomain = cleanHostname(body.domain)
    const problem = hostnameProblem(cleanDomain, getMainDomain(), HOST_RESERVED_SUFFIXES)
    if (problem) {
      return NextResponse.json({ error: HOSTNAME_PROBLEM_TEXT[problem], problem }, { status: 400 })
    }
    const purpose: DomainPurpose = isDomainPurpose(body.purpose) ? body.purpose : "website"
    const replace = body.replace === true && purpose !== "community"

    const limited = await rateLimit({
      bucket: "domain-add",
      subjects: [`user:${userId}`, addressSubject(request)],
      windows: ADD_LIMITS,
      message: "That is a lot of domains in a short time. Try again in a few minutes.",
    })
    if (limited) return limited

    const gate = siteGate(await creatorSitePlan(creatorId), "customDomain")
    if (gate) return NextResponse.json({ error: gate, upgrade: true }, { status: 403 })

    const { rows, schema, error: listError, targets } = await listCreatorDomains(admin, creatorId)
    if (listError === "missing_table") {
      return NextResponse.json({ error: "Domains are not switched on for this workspace yet." }, { status: 503 })
    }
    /* A community's domain: one this creator owns, and only one domain for it. */
    let community: OwnedCommunity | null = null
    if (purpose === "community") {
      if (schema === "legacy" || !targets) return NextResponse.json({ error: COMMUNITY_NEEDS_UPDATE }, { status: 409 })
      community = await ownedCommunity(admin, creatorId, body.communityId)
      if (!community) return NextResponse.json({ error: "Community not found" }, { status: 404 })
      const communityId = community.id
      const holder = rows.find((r) => communityIdOf(r) === communityId)
      if (holder) return NextResponse.json({ error: `${community.name} already has a domain, ${holder.domain}. Remove it first.` }, { status: 409 })
    }
    if (schema === "legacy" && purpose === "creator_page") {
      return NextResponse.json(
        { error: "Connecting a domain to your creator page needs a database update that has not run yet. A website domain works now." },
        { status: 409 },
      )
    }

    // Is it somebody's already? Anybody's, including a row of our own.
    const { data: existing } = await admin.from("custom_domains").select("id, creator_id").eq("domain", cleanDomain).maybeSingle()
    if (existing) {
      if ((existing as { creator_id: string }).creator_id === creatorId) {
        return NextResponse.json({ error: "You already connected this domain." }, { status: 400 })
      }
      return NextResponse.json({ error: "This domain is connected to another Storelib account." }, { status: 409 })
    }
    /*
      A domain another creator removed is still on the Vercel project for its
      grace period, answering with a redirect, and its DNS still points here.
      Taking it in that window would take their traffic with it.
    */
    const { data: remembered } = await admin
      .from("domain_redirects")
      .select("creator_id, keep_until")
      .eq("domain", cleanDomain)
      .gt("keep_until", new Date().toISOString())
      .maybeSingle()
    if (remembered && (remembered as { creator_id: string }).creator_id !== creatorId) {
      const until = new Date((remembered as { keep_until: string }).keep_until)
      return NextResponse.json(
        { error: `This domain was connected to another account until recently. It can be connected again after ${until.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.` },
        { status: 409 },
      )
    }

    /* A community's domain is its own; the limit and the primary are about the website and the creator page. */
    const samePurpose = community ? [] : rows.filter((r) => schema === "legacy" || purposeOf(r) === purpose)
    /* On an old database a creator has one domain, and a new one replaces it, as it always did. */
    const replacing = replace || (schema === "legacy" && samePurpose.length > 0)
    if (!replacing && samePurpose.length >= MAX_PER_PURPOSE) {
      return NextResponse.json({ error: `You can connect up to ${MAX_PER_PURPOSE} domains here. Remove one first.` }, { status: 400 })
    }

    const registered = await addDomainHosts(cleanDomain)
    if (!registered.ok) {
      return NextResponse.json({ error: registered.error || "Could not register the domain." }, { status: 502 })
    }

    const verificationToken = `storelib-verify-${crypto.randomBytes(16).toString("hex")}`
    const firstRecords = recordsFor(cleanDomain, { challenges: registered.challenges })
    const legacyRow = { creator_id: creatorId, domain: cleanDomain, status: "pending", verification_token: verificationToken }
    let inserted = await admin
      .from("custom_domains")
      .insert(
        schema === "current"
          ? {
              ...legacyRow,
              purpose,
              is_primary: replacing || !samePurpose.some((r) => r.is_primary === true),
              dns_records: firstRecords,
              ...(community ? { is_primary: false, target_type: COMMUNITY_TARGET, target_id: community.id } : {}),
            }
          : legacyRow,
      )
      .select(schema === "current" ? (targets ? TARGET_COLUMNS : CURRENT_COLUMNS) : LEGACY_COLUMNS)
      .single()
    /* Never a website domain in place of a community's: without the columns it is refused above. */
    if (inserted.error && isMissingColumn(inserted.error) && !community) {
      inserted = await admin.from("custom_domains").insert(legacyRow).select(LEGACY_COLUMNS).single()
    }
    if (inserted.error || !inserted.data) {
      console.error("Error adding domain:", inserted.error)
      await removeDomainHosts(cleanDomain)
      if (inserted.error?.code === "23505") {
        if (community) return NextResponse.json({ error: "This domain, or a domain for this community, is already connected." }, { status: 409 })
        return NextResponse.json({ error: "This domain is connected to another Storelib account." }, { status: 409 })
      }
      return NextResponse.json({ error: "Failed to add domain" }, { status: 500 })
    }
    const newRow = inserted.data as unknown as DomainRow

    // Our own redirect memory for this name, from a time it was removed, is over.
    await admin.from("domain_redirects").delete().eq("domain", cleanDomain).eq("creator_id", creatorId)

    // Replacing: the old ones send their visitors to this one for the grace period.
    if (replacing) {
      const keepUntil = new Date()
      keepUntil.setDate(keepUntil.getDate() + GRACE_DAYS)
      for (const old of samePurpose) {
        await admin.from("domain_redirects").upsert(
          {
            domain: old.domain,
            creator_id: creatorId,
            redirect_to: `https://${servingHost(cleanDomain)}`,
            http_code: 301,
            reason: "changed",
            keep_until: keepUntil.toISOString(),
          },
          { onConflict: "domain" },
        )
        await admin.from("custom_domains").delete().eq("id", old.id).eq("creator_id", creatorId)
        // Left on Vercel on purpose, so the redirect answers; app/api/domains/cleanup detaches it later.
      }
    }

    // The records Vercel recommends for this project, which can differ from the defaults.
    const recommended = await recommendedRecords(cleanDomain)
    const records = recordsFor(cleanDomain, {
      ipv4: recommended.ipv4,
      cname: recommended.cname,
      challenges: recommended.challenges.length ? recommended.challenges : registered.challenges,
    })
    await saveRecords(admin, newRow.id, records)

    changed(creatorId)
    communityChanged(community?.id)
    if (purpose === "creator_page") await syncOnepageDomain(admin, creatorId, userId)

    return NextResponse.json({ domain: { ...toView(newRow, schema), records } })
  } catch (error) {
    console.error("Domains POST error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH - Make a domain the primary one of its purpose, or change what it connects to
export async function PATCH(request: Request) {
  try {
    const owner = await domainOwner()
    if (owner instanceof NextResponse) return owner
    const { admin, creatorId, userId } = owner
    const body = (await request.json().catch(() => ({}))) as { domainId?: unknown; action?: unknown; purpose?: unknown; communityId?: unknown }
    if (typeof body.domainId !== "string" || (body.action !== "make_primary" && body.action !== "set_purpose")) {
      return NextResponse.json({ error: "Nothing to change" }, { status: 400 })
    }
    if (body.action === "set_purpose" && !isDomainPurpose(body.purpose)) {
      return NextResponse.json({ error: "Nothing to change" }, { status: 400 })
    }

    const { rows, schema, targets } = await listCreatorDomains(admin, creatorId)
    const row = rows.find((r) => r.id === body.domainId)
    if (!row) return NextResponse.json({ error: "Domain not found" }, { status: 404 })
    const communityOn = schema === "current" && targets === true

    /*
      What a domain connects to is asked after it is added (Settings ›
      Domains adds it to the website first). It moves with its primary flag
      worked out again on both sides: primary where it lands only when that
      purpose has none, and the purpose it left gets its next one.
    */
    if (body.action === "set_purpose" && isDomainPurpose(body.purpose)) {
      const to = body.purpose
      if (to === "community" && !communityOn) return NextResponse.json({ error: COMMUNITY_NEEDS_UPDATE }, { status: 409 })
      if (schema === "legacy") {
        if (to === "creator_page") {
          return NextResponse.json(
            { error: "Connecting a domain to your creator page needs a database update that has not run yet. A website domain works now." },
            { status: 409 },
          )
        }
        return NextResponse.json(views(rows, schema))
      }
      const from = purposeOf(row)
      if (to === "community" || from === "community") return moveCommunityDomain(owner, row, rows, to, body.communityId)
      if (from === to) return NextResponse.json(await listed(admin, creatorId))
      const there = rows.filter((r) => r.id !== row.id && purposeOf(r) === to)
      if (there.length >= MAX_PER_PURPOSE) {
        return NextResponse.json({ error: `You can connect up to ${MAX_PER_PURPOSE} domains there. Remove one first.` }, { status: 400 })
      }
      const moved = await admin
        .from("custom_domains")
        .update({ purpose: to, is_primary: !there.some((r) => r.is_primary === true) })
        .eq("id", row.id)
        .eq("creator_id", creatorId)
      if (moved.error) {
        console.error("Changing a domain's purpose failed:", moved.error)
        return NextResponse.json({ error: "Could not change what it connects to" }, { status: 500 })
      }
      await ensurePrimary(admin, creatorId, from)
      changed(creatorId)
      if (from === "creator_page" || to === "creator_page") await syncOnepageDomain(admin, creatorId, userId)
      return NextResponse.json(await listed(admin, creatorId))
    }

    if (schema === "legacy") return NextResponse.json(views(rows, schema))
    if (purposeOf(row) === "community") return NextResponse.json({ error: "A community has one domain." }, { status: 400 })

    const done = await makePrimary(admin, creatorId, row)
    if (!done.ok) {
      console.error("Make primary failed:", done.error)
      return NextResponse.json({ error: "Could not make it the primary domain" }, { status: 500 })
    }
    changed(creatorId)
    if (purposeOf(row) === "creator_page") await syncOnepageDomain(admin, creatorId, userId)
    return NextResponse.json(await listed(admin, creatorId))
  } catch (error) {
    console.error("Domains PATCH error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - Remove a domain
// A domain that was live stays attached to Vercel for a grace period, sending
// its visitors on, so links already shared do not hit DEPLOYMENT_NOT_FOUND.
// One that never connected has nobody to send on and is detached at once.
export async function DELETE(request: Request) {
  try {
    const owner = await domainOwner()
    if (owner instanceof NextResponse) return owner
    const { admin, creatorId, userId, username } = owner

    const { domainId } = (await request.json().catch(() => ({}))) as { domainId?: unknown }
    if (typeof domainId !== "string" || !domainId) {
      return NextResponse.json({ error: "Domain ID is required" }, { status: 400 })
    }

    const { rows } = await listCreatorDomains(admin, creatorId)
    const domainRecord = rows.find((r) => r.id === domainId)
    if (!domainRecord) return NextResponse.json({ error: "Domain not found" }, { status: 404 })
    const purpose = purposeOf(domainRecord)
    const communityId = communityIdOf(domainRecord)
    /* Where a community's visitors go after: its storelib.com address, while it is still this creator's. */
    const communityLeft = communityId ? await ownedCommunity(admin, creatorId, communityId) : null

    await disableStripePaymentDomains(admin, domainRecord.domain)

    const { error } = await admin.from("custom_domains").delete().eq("id", domainId).eq("creator_id", creatorId)
    if (error) {
      console.error("Error removing domain:", error)
      return NextResponse.json({ error: "Failed to remove domain" }, { status: 500 })
    }

    await ensurePrimary(admin, creatorId, purpose)
    const after = await listCreatorDomains(admin, creatorId)

    const wasLive = Boolean(domainRecord.verified_at) || domainRecord.status === "active" || domainRecord.status === "ssl_provisioning"
    if (wasLive) {
      // Its visitors go to the domain that is primary now, or to the storelib.com address.
      const next = after.rows.find((r) => after.schema === "legacy" || (purposeOf(r) === purpose && r.is_primary === true))
      const redirectTo = next ? `https://${servingHost(next.domain)}` : await fallbackFor(purpose, creatorId, username, communityLeft?.slug)
      const keepUntil = new Date()
      keepUntil.setDate(keepUntil.getDate() + GRACE_DAYS)
      await admin.from("domain_redirects").upsert(
        {
          domain: domainRecord.domain,
          creator_id: creatorId,
          redirect_to: redirectTo,
          http_code: 301,
          reason: next ? "changed" : "removed",
          keep_until: keepUntil.toISOString(),
        },
        { onConflict: "domain" },
      )
    } else {
      await removeDomainHosts(domainRecord.domain)
    }

    changed(creatorId)
    communityChanged(communityId)
    if (purpose === "creator_page") await syncOnepageDomain(admin, creatorId, userId)
    const communities = after.targets ? await ownedCommunities(admin, creatorId) : []
    return NextResponse.json({ success: true, ...views(after.rows, after.schema, { targets: after.targets, communities }) })
  } catch (error) {
    console.error("Domains DELETE error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * A domain moved onto a community, between communities, or off one
 * (PATCH set_purpose, round 31). Onto one: the community must be this
 * creator's and have no other domain; the row keeps is_primary false and
 * names the community. Off one: it lands as a website or creator page
 * domain, primary there only when that purpose has none, and no longer
 * names the community. Both sides' caches are emptied.
 */
async function moveCommunityDomain(owner: Owner, row: DomainRow, rows: DomainRow[], to: DomainPurpose, communityIdAsked: unknown): Promise<NextResponse> {
  const { admin, creatorId, userId } = owner
  const from = purposeOf(row)
  const was = communityIdOf(row)
  if (to === "community") {
    const community = await ownedCommunity(admin, creatorId, communityIdAsked)
    if (!community) return NextResponse.json({ error: "Community not found" }, { status: 404 })
    if (was === community.id) return NextResponse.json(await listed(admin, creatorId))
    const holder = rows.find((r) => r.id !== row.id && communityIdOf(r) === community.id)
    if (holder) return NextResponse.json({ error: `${community.name} already has a domain, ${holder.domain}. Remove it first.` }, { status: 409 })
    const moved = await admin
      .from("custom_domains")
      .update({ purpose: "community", is_primary: false, target_type: COMMUNITY_TARGET, target_id: community.id })
      .eq("id", row.id)
      .eq("creator_id", creatorId)
    if (moved.error) {
      if (moved.error.code === "23505") return NextResponse.json({ error: `${community.name} already has a domain. Remove it first.` }, { status: 409 })
      console.error("Connecting a domain to a community failed:", moved.error)
      return NextResponse.json({ error: "Could not change what it connects to" }, { status: 500 })
    }
    if (from !== "community") await ensurePrimary(admin, creatorId, from)
    changed(creatorId)
    communityChanged(was, community.id)
    if (from === "creator_page") await syncOnepageDomain(admin, creatorId, userId)
    return NextResponse.json(await listed(admin, creatorId))
  }
  const there = rows.filter((r) => r.id !== row.id && purposeOf(r) === to)
  if (there.length >= MAX_PER_PURPOSE) {
    return NextResponse.json({ error: `You can connect up to ${MAX_PER_PURPOSE} domains there. Remove one first.` }, { status: 400 })
  }
  const moved = await admin
    .from("custom_domains")
    .update({ purpose: to, is_primary: !there.some((r) => r.is_primary === true), target_type: null, target_id: null })
    .eq("id", row.id)
    .eq("creator_id", creatorId)
  if (moved.error) {
    console.error("Moving a domain off a community failed:", moved.error)
    return NextResponse.json({ error: "Could not change what it connects to" }, { status: 500 })
  }
  changed(creatorId)
  communityChanged(was)
  if (to === "creator_page") await syncOnepageDomain(admin, creatorId, userId)
  return NextResponse.json(await listed(admin, creatorId))
}

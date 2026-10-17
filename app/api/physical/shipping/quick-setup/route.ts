import { NextResponse } from "next/server"
import { physicalCaller, physicalJson, readBody, type Db } from "@/lib/physical/auth"
import { readinessChanged } from "@/lib/physical/readiness-server"
import { ensureDefaultProfile, loadLocations, loadProfiles, loadSettings, readRate, readZonePlaces, saveSettings, text, zoneClash } from "@/lib/physical/config-server"
import { COUNTRY_CODES, countryName } from "@/lib/checkout/countries"
import { quickSetupZones, unitSystemFor, type SetupZone } from "@/lib/physical/quick-setup"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  "USE THIS SETUP": A FIRST WAY TO SHIP, MADE IN ONE PRESS
 * ===========================================================================
 * Settings › Shipping and delivery › Quick setup (lib/physical/quick-setup.ts)
 * shows a zone for the store's country and one for the rest of the EU or
 * the world, with a price field each. This makes what the merchant pressed,
 * through the same checks as adding zones and rates one by one
 * (readZonePlaces, zoneClash, readRate):
 *
 *   { country, home: { priceCents, minDays, maxDays, freeOverCents? },
 *     abroad: { priceCents, minDays, maxDays } | null,
 *     shipFrom?: { addressLine1, addressLine2, city, region, postalCode } }
 *
 *   explicit    nothing is made without a price the merchant typed: a
 *               missing or empty priceCents is refused, never read as 0
 *   whole       every part is checked before anything is written; the
 *               zones go in as one insert and the rates as another, and a
 *               failed rate insert takes its zones back out, so a store is
 *               never left with a zone that has no rate
 *   once        a part already there (the same places, with a rate) is not
 *               made again, so a second press, or two at once, leaves one
 *               setup: a race is settled after the insert by keeping the
 *               older of two identical zones
 *   extras      the default location's address is filled only when it has
 *               none; units follow the country. Neither can undo the setup.
 */

type Part = { key: "home" | "abroad"; zone: SetupZone; input: Record<string, unknown> }
type ExistingZone = { id: string; name: string; countries: string[]; regions: string[]; restOfWorld: boolean; createdAt: string; rates: number }

const samePlaces = (z: { countries: string[]; regions: string[]; restOfWorld: boolean }, want: SetupZone) =>
  want.restOfWorld ? z.restOfWorld : !z.restOfWorld && z.regions.length === 0 && z.countries.length === want.countries.length && want.countries.every((c) => z.countries.includes(c))

/** A price the merchant typed: a number, or digits as text. Missing, empty or null is not one. */
function typedPrice(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v)
  return typeof v === "string" && /^\d+$/.test(v.trim())
}

async function zonesOf(db: Db, creatorId: string, profileId: string): Promise<ExistingZone[]> {
  const [{ data: zones }, { data: rates }] = await Promise.all([
    db.from("shipping_zones").select("id, name, countries, regions, rest_of_world, created_at").eq("creator_id", creatorId).eq("profile_id", profileId).limit(500),
    db.from("shipping_rates").select("id, zone_id").eq("creator_id", creatorId).limit(2000),
  ])
  const count = new Map<string, number>()
  for (const r of (rates ?? []) as { zone_id: string }[]) count.set(r.zone_id, (count.get(r.zone_id) ?? 0) + 1)
  return ((zones ?? []) as Record<string, any>[]).map((z) => ({ id: z.id, name: z.name, countries: z.countries ?? [], regions: z.regions ?? [], restOfWorld: !!z.rest_of_world, createdAt: String(z.created_at ?? ""), rates: count.get(z.id) ?? 0 }))
}

export async function POST(request: Request) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const country = typeof body.country === "string" ? body.country.trim().toUpperCase() : ""
  if (!COUNTRY_CODES.has(country)) return physicalJson({ error: "Choose the country you ship from." }, 400)

  const plan = quickSetupZones(country)
  const homeIn = body.home && typeof body.home === "object" ? (body.home as Record<string, unknown>) : null
  const abroadIn = body.abroad && typeof body.abroad === "object" ? (body.abroad as Record<string, unknown>) : null
  if (!homeIn) return physicalJson({ error: `Enter the price for shipping inside ${countryName(country)}.` }, 400)
  const parts: Part[] = [{ key: "home", zone: plan.home, input: homeIn }, ...(abroadIn ? [{ key: "abroad" as const, zone: plan.abroad, input: abroadIn }] : [])]

  /* ── every part checked before anything is written ── */
  const rates = new Map<Part["key"], Record<string, unknown>>()
  for (const p of parts) {
    const where = p.key === "home" ? `inside ${countryName(country)}` : plan.abroad.kind === "eu" ? "to the rest of the EU" : "to the rest of the world"
    if (!typedPrice(p.input.priceCents)) return physicalJson({ error: `Enter the price for shipping ${where}. Type 0 to make it free.` }, 400)
    const read = readRate({ kind: "flat", name: "Standard", priceCents: p.input.priceCents, minDays: p.input.minDays, maxDays: p.input.maxDays, freeOverCents: p.key === "home" ? p.input.freeOverCents : null, active: true })
    if (read.ok === false) return physicalJson({ error: `Shipping ${where}: ${read.error}` }, 400)
    rates.set(p.key, read.row)
  }

  const profileId = await ensureDefaultProfile(c.db, c.creatorId)
  if (!profileId) return physicalJson({ error: "Shipping could not be set up. Try again." }, 500)
  const existing = await zonesOf(c.db, c.creatorId, profileId)

  /* Each part: already there with a rate (skip), there without one (give it the rate), or new. */
  const reuse: { zoneId: string; key: Part["key"] }[] = []
  const fresh: { key: Part["key"]; zone: SetupZone }[] = []
  for (const p of parts) {
    const same = existing.filter((z) => samePlaces(z, p.zone)).sort((a, b) => b.rates - a.rates)[0]
    if (same?.rates) continue
    if (same) {
      reuse.push({ zoneId: same.id, key: p.key })
      continue
    }
    let zone = p.zone
    if (!zone.restOfWorld) {
      /* The rest of the EU leaves out a country the merchant already gave its own zone; the store's own country can't be left out. */
      const taken = new Set(existing.filter((z) => !z.restOfWorld).flatMap((z) => z.countries))
      if (p.key === "abroad") zone = { ...zone, countries: zone.countries.filter((cc) => !taken.has(cc)) }
      if (zone.countries.length === 0) continue
      const places = readZonePlaces({ countries: zone.countries, regions: [] })
      if (places.ok === false) return physicalJson({ error: places.error }, 400)
      const clash = zoneClash(existing, places.countries, [])
      if (clash) return physicalJson({ error: `${clash} Or set up shipping yourself below.` }, 400)
    }
    fresh.push({ key: p.key, zone })
  }

  const done = async (made: number) => {
    readinessChanged(c)
    const [profiles, settings, locations] = await Promise.all([loadProfiles(c.db, c.creatorId), loadSettings(c.db, c.creatorId), loadLocations(c.db, c.creatorId)])
    return physicalJson({ profiles, settings, locations, made })
  }

  /* ── the zones, in one insert ── */
  let made: { id: string; key: Part["key"] }[] = []
  if (fresh.length) {
    const { data, error } = await c.db
      .from("shipping_zones")
      .insert(fresh.map((f) => ({ profile_id: profileId, creator_id: c.creatorId, name: text(f.zone.name, 80) ?? "Zone", countries: f.zone.countries, regions: [], rest_of_world: f.zone.restOfWorld })))
      .select("id, rest_of_world, countries")
    /* The one Rest of world zone a profile may have was made by a press a moment ago: that press made the setup. */
    if (error?.code === "23505") return done(0)
    if (error || !data) return physicalJson({ error: "Shipping could not be set up. Nothing was saved. Try again." }, 500)
    const rows = data as { id: string; rest_of_world: boolean; countries: string[] }[]
    made = fresh.map((f) => {
      const row = rows.find((r) => (f.zone.restOfWorld ? r.rest_of_world : !r.rest_of_world && r.countries.length === f.zone.countries.length && f.zone.countries.every((cc) => r.countries.includes(cc))))
      return { id: row?.id ?? "", key: f.key }
    })
    if (made.some((m) => !m.id)) {
      await c.db.from("shipping_zones").delete().eq("creator_id", c.creatorId).in("id", rows.map((r) => r.id))
      return physicalJson({ error: "Shipping could not be set up. Nothing was saved. Try again." }, 500)
    }
  }

  /* ── the rates, in one insert; on failure the new zones go too ── */
  const targets = [...reuse, ...made.map((m) => ({ zoneId: m.id, key: m.key }))]
  if (targets.length) {
    const { data: inserted, error } = await c.db.from("shipping_rates").insert(targets.map((t) => ({ ...rates.get(t.key), zone_id: t.zoneId, creator_id: c.creatorId, position: 0 }))).select("id, zone_id, created_at")
    if (error) {
      if (made.length) await c.db.from("shipping_zones").delete().eq("creator_id", c.creatorId).in("id", made.map((m) => m.id))
      return physicalJson({ error: "Shipping could not be set up. Nothing was saved. Try again." }, 500)
    }
    /*
      Two presses at once, the other way round: this press read the zones the
      other had just made, before their rates, and gave them a rate too. Each
      zone this setup rated had none a moment ago, so any other rate in it came
      from that other press: the older stays, this one goes, and a buyer never
      sees "Standard" twice.
    */
    const mine = (inserted ?? []) as { id: string; zone_id: string; created_at: string }[]
    if (mine.length) {
      const { data: now } = await c.db.from("shipping_rates").select("id, zone_id, created_at").eq("creator_id", c.creatorId).in("zone_id", mine.map((r) => r.zone_id))
      const all = (now ?? []) as { id: string; zone_id: string; created_at: string }[]
      const before = (a: { id: string; created_at: string }, b: { id: string; created_at: string }) => (a.created_at === b.created_at ? a.id < b.id : a.created_at < b.created_at)
      const extra = mine.filter((r) => all.some((o) => o.zone_id === r.zone_id && o.id !== r.id && before(o, r)))
      if (extra.length) await c.db.from("shipping_rates").delete().eq("creator_id", c.creatorId).in("id", extra.map((r) => r.id))
    }
  }

  /* ── two presses at once: the older of two identical zones stays, the newer goes with its rate ── */
  if (made.length) {
    const now = await zonesOf(c.db, c.creatorId, profileId)
    const older = (a: ExistingZone, b: ExistingZone) => (a.createdAt === b.createdAt ? a.id < b.id : a.createdAt < b.createdAt)
    const extra = made.filter((m) => {
      const mine = now.find((z) => z.id === m.id)
      return !!mine && now.some((z) => z.id !== mine.id && samePlaces(z, { name: mine.name, countries: mine.countries, restOfWorld: mine.restOfWorld }) && z.regions.length === mine.regions.length && older(z, mine))
    })
    if (extra.length) await c.db.from("shipping_zones").delete().eq("creator_id", c.creatorId).in("id", extra.map((m) => m.id))
  }

  /* ── extras: never undo the setup ── */
  const units = unitSystemFor(country)
  const settings = await loadSettings(c.db, c.creatorId)
  if (settings.unitSystem !== units) await saveSettings(c.db, c.creatorId, { unitSystem: units }).catch(() => undefined)
  const from = body.shipFrom && typeof body.shipFrom === "object" ? (body.shipFrom as Record<string, unknown>) : null
  const line1 = text(from?.addressLine1, 200)
  const city = text(from?.city, 120)
  if (from && line1 && city && settings.defaultLocationId) {
    /* Only a location of the store's own with no address yet: a typed address is never replaced. */
    await c.db
      .from("inventory_locations")
      .update({ address_line1: line1, address_line2: text(from.addressLine2, 200), city, region: text(from.region, 120), postal_code: text(from.postalCode, 20), country, updated_at: new Date().toISOString() })
      .eq("id", settings.defaultLocationId)
      .eq("creator_id", c.creatorId)
      .is("address_line1", null)
      .in("kind", ["home", "warehouse", "retail", "custom"])
  }
  return done(targets.length)
}

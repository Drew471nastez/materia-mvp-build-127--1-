import { NextResponse } from "next/server"
import { COUNTRY_CODES } from "@/lib/checkout/countries"
import { physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { loadTaxRates, text } from "@/lib/physical/config-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** A tax rate the merchant charges in a country (or one region of it), in percent with up to two decimals. */
export async function POST(request: Request) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const country = typeof body?.country === "string" ? body.country.toUpperCase() : ""
  if (!COUNTRY_CODES.has(country)) return physicalJson({ error: "Choose a country." }, 400)
  const percent = Number(body?.percent)
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return physicalJson({ error: "Enter a rate between 0 and 100 percent." }, 400)
  const region = text(body?.region, 120)
  const rows = await loadTaxRates(c.db, c.creatorId)
  if (rows.some((r) => r.country === country && (r.region ?? "").toLowerCase() === (region ?? "").toLowerCase())) return physicalJson({ error: "There is already a rate for that place." }, 400)
  const { error } = await c.db.from("commerce_tax_rates").insert({ creator_id: c.creatorId, country, region, name: text(body?.name, 60) ?? "Tax", rate_bps: Math.round(percent * 100) })
  if (error) return physicalJson({ error: "The rate could not be saved." }, 500)
  return physicalJson({ taxRates: await loadTaxRates(c.db, c.creatorId) })
}

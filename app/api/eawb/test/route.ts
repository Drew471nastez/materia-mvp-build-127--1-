import { NextResponse } from "next/server"
import { verifyConnection, type EawbOutcomeCode } from "@/lib/eawb"

/**
 * GET /api/eawb/test
 *
 * Diagnostic endpoint that verifies the server can authenticate against eAWB
 * (Innoship) using the read-only ClientLocations GET — it does NOT create a
 * shipment. Returns a secret-free summary; the API key is never included.
 *
 * NOTE: this is a connectivity check for setup/debugging. Protect or remove it
 * before wiring real shipping flows into the UI.
 */

// Reads a server secret + calls an external API on every request — never static.
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Map each outcome to an appropriate HTTP status for the caller.
const STATUS_BY_CODE: Record<EawbOutcomeCode, number> = {
  ok: 200,
  missing_key: 500, // our server is misconfigured
  auth: 502, // upstream rejected our credentials
  http_error: 502, // upstream returned a non-2xx
  parse_error: 502, // upstream returned an unparseable body
  network_error: 502, // we could not reach upstream
}

export async function GET() {
  const result = await verifyConnection()
  const status = STATUS_BY_CODE[result.code] ?? 500

  return NextResponse.json(
    {
      ok: result.ok,
      code: result.code,
      message: result.message,
      upstreamStatus: result.upstreamStatus,
      locationCount: result.locationCount,
    },
    { status },
  )
}

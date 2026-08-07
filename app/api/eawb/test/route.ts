import { NextResponse } from "next/server"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { verifyConnection, type EawbOutcomeCode } from "@/lib/eawb"

/**
 * GET /api/eawb/test
 *
 * Diagnostic endpoint that verifies the server can authenticate against eAWB
 * (Innoship) using the read-only ClientLocations GET — it does NOT create a
 * shipment. Returns a secret-free summary; the API key is never included.
 *
 * ADMIN ONLY, and it did not used to be.
 *
 * Its own note said to protect it before wiring real shipping flows in, and
 * that moment arrived. Unauthenticated, anyone who knew the path could make
 * OUR server call the courier API with OUR credentials, as often as they
 * liked — a free probe of whether the integration is configured, and a way to
 * spend our upstream rate limit from the outside. It never leaked the key, but
 * "it only leaks a little" is not a threat model.
 *
 * 404 rather than 401 when the session is absent: an endpoint that does not
 * exist is better than one advertising itself as merely locked.
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
  validation: 422, // WE refused the payload; nothing was sent upstream
  insufficient_funds: 402, // upstream accepted it; the prepaid wallet is empty
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
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

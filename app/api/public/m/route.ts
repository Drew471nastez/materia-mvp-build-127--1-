/**
 * Storelib's own speed measurements (lib/perf/beacon-client.ts), at an
 * address no ad blocker list matches: BEACON_PATH in lib/perf/config.ts says
 * why. The same handler as /api/perf/beacon, which still answers for pages
 * loaded before the move; what passes and what is kept is written there.
 */
export { POST } from "@/app/api/perf/beacon/route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

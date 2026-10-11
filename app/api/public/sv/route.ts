/**
 * A published website's own Web Vitals (components/website-builder/
 * site-vitals.tsx, and lib/perf/site-vitals-inline.ts on an imported
 * theme's page), at an address no ad blocker list matches (SITE_BEACON_PATH
 * in lib/perf/config.ts). The same handler as /api/public/vitals, which
 * still answers for pages loaded before the move.
 */
export { POST } from "@/app/api/public/vitals/route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

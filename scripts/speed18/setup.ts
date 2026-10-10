/**
 * First thing the bench loads: the environment a route expects, and the
 * fake Supabase on `fetch`, before any module makes a client.
 */
import { fakeFetch, setRtt } from "./fake-postgrest"

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-fixture-key"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-fixture-key"
process.env.SUPABASE_URL = "https://fixture.supabase.co"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
process.env.NEXT_PUBLIC_SITE_URL = "https://storelib.com"
;(globalThis as { fetch: typeof fetch }).fetch = fakeFetch as typeof fetch
setRtt(Number(process.env.RTT ?? 20))

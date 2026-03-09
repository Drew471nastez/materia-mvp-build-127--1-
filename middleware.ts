import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Paths that never require authentication.
// Exact matches and prefix matches are both checked.
const PUBLIC_PATHS = [
  "/welcome",
  "/auth",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/request",
  "/signup/verify",
  "/signup/success",
  // Marketing / public pages
  "/pricing",
  "/features",
  "/explore",
  "/blog",
  "/help",
  "/privacy",
  "/terms",
  "/about",
  "/contact",
  // Creator store & product pages served publicly
  "/p/",
  "/l/",
  "/u/",
  "/c/",
  "/store/",
  // Well-known / deep-link verification files
  "/.well-known/",
]

// Pages that only make sense when logged OUT.
// Logged-in visitors are redirected to their home screen.
const AUTH_ONLY_PATHS = ["/login", "/signup"]

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`),
  )
}

function isAuthOnly(pathname: string) {
  return AUTH_ONLY_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) =>
          cookies.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          ),
      },
    },
  )

  // Use getUser() — validates the JWT server-side, refreshes if needed.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // ── Public paths ──────────────────────────────────────────────────────────
  if (isPublic(pathname)) return response

  // ── Root path "/" ─────────────────────────────────────────────────────────
  // Redirect to the correct home for authenticated users; otherwise /welcome.
  // Native cold-start: NativeStartupRouter handles client-side routing for
  // the case where the cookie isn't set yet (session is in Capacitor Preferences).
  if (pathname === "/") {
    if (!user) {
      return NextResponse.redirect(new URL("/welcome", request.url))
    }
    // Determine creator vs buyer destination.
    const dest = await resolveHome(supabase, user.id)
    return NextResponse.redirect(new URL(dest, request.url))
  }

  // ── Auth-only pages (login, signup) ───────────────────────────────────────
  // Redirect already-authenticated users to their home screen.
  if (isAuthOnly(pathname)) {
    if (!user) return response // not logged in → show the page
    const dest = await resolveHome(supabase, user.id)
    return NextResponse.redirect(new URL(dest, request.url))
  }

  // ── All other routes ──────────────────────────────────────────────────────
  // /app and /library are NOT blocked here — NativeAuthGate handles the
  // per-route auth check on the client so native Capacitor sessions (stored
  // in Preferences rather than cookies) can still reach those pages.
  return response
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveHome(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<string> {
  try {
    const { data: creator } = await supabase
      .from("creators")
      .select("onboarding_completed")
      .eq("user_id", userId)
      .maybeSingle()

    if (creator?.onboarding_completed) return "/app"

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_creator, welcome_completed")
      .eq("id", userId)
      .maybeSingle()

    if (profile?.welcome_completed) {
      return profile.is_creator ? "/app" : "/library"
    }
  } catch { /* ignore — fall through to default */ }

  return "/signup/success"
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}

"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { readSessionBounded } from "@/lib/auth/session-read"
import { syncSessionHref } from "@/lib/auth/native-session"
import { viewerSyncMove, VIEWER_SYNC_KEY } from "@/lib/auth/viewer-sync"

/**
 * ===========================================================================
 *  A PAGE DRAWN FOR "SIGNED OUT" WHEN THE BROWSER IS SIGNED IN, PUT RIGHT
 * ===========================================================================
 * The header asks the browser who is signed in; the page under it was asked
 * on the server, from the cookie. When the two disagree the header shows the
 * person's photo over a receipt or a product page still saying Sign in, which
 * is the owner's "it doesn't fully log me in, it still shows me to sign in".
 * It happens when:
 *
 *   THE APP     the session lives in the phone's store and the cookie the
 *               server reads was lost (WKWebView drops them): the page is
 *               drawn signed out and the header signs in a moment later.
 *   ANOTHER TAB signs in or out, or this tab does so without moving (a
 *               session renewed, a sign out from a menu).
 *   THE BACK    button brings a page back from the browser's memory, drawn
 *               for whoever was signed in before.
 *
 * This sits on the pages that draw for the viewer (the receipt, a product)
 * and holds the server's answer. When the browser's own differs it asks the
 * server again, once (lib/auth/viewer-sync.ts decides): in the app through
 * /auth/sync-session, which writes the cookie first; on the web a refresh of
 * the page's data, with no reload. A blip that cannot tell is not a
 * difference, and it never moves twice in a row for the same answer.
 */
export function ViewerSync({ serverSignedIn }: { serverSignedIn: boolean }) {
  const router = useRouter()

  useEffect(() => {
    let supabase: ReturnType<typeof createClient>
    try {
      supabase = createClient()
    } catch {
      /* No Supabase configured (a stand in page): nothing to compare with. */
      return
    }
    let cancelled = false

    const reconcile = async () => {
      const read = await readSessionBounded(supabase, 4_000)
      if (cancelled) return
      const move = viewerSyncMove({
        serverSignedIn,
        read: { signedIn: !!read.session, unsure: read.timedOut || read.failed },
        native: isNativePlatform(),
        lastMove: lastMove(),
        path: `${window.location.pathname}${window.location.search}`,
      })
      if (move.kind === "none") return
      remember(move.key)
      if (move.kind === "sync" && read.session) window.location.assign(syncSessionHref(read.session, move.path))
      else router.refresh()
    }

    void reconcile()

    /* Signed in or out later in this tab, or in another one (Supabase tells every tab of the same browser). */
    const { data } = supabase.auth.onAuthStateChange((event: string, session: unknown) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return
      if (!!session === serverSignedIn) return
      void reconcile()
    })

    /* Back from the browser's memory: the page is the one drawn before. */
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) void reconcile()
    }
    window.addEventListener("pageshow", onShow)

    return () => {
      cancelled = true
      data?.subscription?.unsubscribe()
      window.removeEventListener("pageshow", onShow)
    }
  }, [serverSignedIn, router])

  return null
}

function lastMove(): string | null {
  try {
    return sessionStorage.getItem(VIEWER_SYNC_KEY)
  } catch {
    return null
  }
}

function remember(key: string) {
  try {
    sessionStorage.setItem(VIEWER_SYNC_KEY, key)
  } catch {
    /* No storage: the move is still made once per page, since the server's answer changes with it. */
  }
}

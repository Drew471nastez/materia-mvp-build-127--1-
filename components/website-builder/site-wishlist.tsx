"use client"

/**
 * ===========================================================================
 *  THE HEART, ON EVERY PRODUCT, AND THE COUNT IN THE HEADER
 * ===========================================================================
 * One list per website, read by everything on the page that shows it: the
 * header's heart and its count, the heart on each product card (drawn by a
 * .storelib section, wired by StorelibSection), the product page's button,
 * and the Wishlist page.
 *
 * WHERE IT LIVES depends on who is looking (lib/site-accounts/wishlist-list):
 *
 *   a guest        local storage under the creator's id, copied into a cookie
 *                  on this host so the Wishlist page can be drawn full
 *   signed in      the account's list in Postgres, through
 *                  /api/site-account/wishlist, with a copy in local storage
 *                  so hearts draw at once on the next page
 *
 * SIGNING IN MOVES THE GUEST LIST INTO THE ACCOUNT. The first page after a
 * sign in finds a guest list and a signed-in hint together, sends the guest
 * list to be merged (idempotent on the server, so a retry adds nothing
 * twice), and empties it once the account has it.
 *
 * STARTS EMPTY, like the cart, so the server and the first render agree.
 * `ready` turns true once the browser's copy has been read; counts wait for
 * it. IN THE EDITOR it is memory only: a creator trying the heart in their
 * canvas should not leave a list behind in their own browser.
 */
import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  accountStorageKey,
  cleanList,
  cookieValue,
  GUEST_COOKIE,
  guestStorageKey,
  parseStored,
  serializeList,
  toggled,
} from "@/lib/site-accounts/wishlist-list"

interface SiteWishlistValue {
  ids: string[]
  ready: boolean
  count: number
  /** The account's list rather than this browser's. */
  signedIn: boolean
  has: (id: string) => boolean
  toggle: (id: string, on?: boolean) => void
  /** Whether this list reaches storage at all. False inside the editor. */
  live: boolean
}

const EMPTY: SiteWishlistValue = {
  ids: [],
  ready: false,
  count: 0,
  signedIn: false,
  has: () => false,
  toggle: () => {},
  live: false,
}

const SiteWishlistContext = createContext<SiteWishlistValue>(EMPTY)

export function useSiteWishlist(): SiteWishlistValue {
  return useContext(SiteWishlistContext)
}

const HINT = "sl_signed_in"

function readCookie(name: string): string | null {
  try {
    const hit = document.cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`))
    return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null
  } catch {
    return null
  }
}

function secureSuffix(): string {
  return window.location.protocol === "https:" ? "; Secure" : ""
}

/** The cookie copy of the guest list, for the Wishlist page's server render. */
function writeGuestCookie(list: string[]) {
  try {
    const value = cookieValue(list)
    document.cookie = value
      ? `${GUEST_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${secureSuffix()}`
      : `${GUEST_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secureSuffix()}`
  } catch {
    /* The list still works on this page. */
  }
}

function forgetHint() {
  try {
    document.cookie = `${HINT}=; Path=/; Max-Age=0; SameSite=Lax${secureSuffix()}`
  } catch {
    /* Read again next page. */
  }
}

function load(key: string): string[] {
  try {
    return parseStored(window.localStorage.getItem(key))
  } catch {
    return []
  }
}

function save(key: string, list: string[]) {
  try {
    if (list.length === 0) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, serializeList(list))
  } catch {
    /* Private mode or a full quota: this page still has it. */
  }
}

async function call(body?: Record<string, unknown>): Promise<{ signedIn: boolean; available?: boolean; ids: string[] } | null> {
  try {
    const res = await fetch("/api/site-account/wishlist", body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" }
      : { credentials: "same-origin", cache: "no-store" })
    if (res.status === 401) return { signedIn: false, ids: [] }
    if (!res.ok) return null
    const data = (await res.json()) as { signedIn?: boolean; available?: boolean; ids?: unknown }
    return { signedIn: data.signedIn === true, available: data.available !== false, ids: cleanList(data.ids) }
  } catch {
    return null
  }
}

export function SiteWishlistProvider({ shopId, children }: { shopId?: string; children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  /* The mode as the latest write knows it, for callbacks made before a re-render. */
  const mode = useRef<"guest" | "account">("guest")

  const guestKey = shopId ? guestStorageKey(shopId) : null
  const accountKey = shopId ? accountStorageKey(shopId) : null

  const showGuest = useCallback((list: string[]) => {
    mode.current = "guest"
    setSignedIn(false)
    setIds(list)
  }, [])

  useEffect(() => {
    /* First reads are non-urgent so lazy sections keep their server HTML (see site-cart). */
    if (!guestKey || !accountKey) { startTransition(() => setReady(true)); return }
    let cancelled = false
    const guest = load(guestKey)
    /* The cookie copy follows local storage, which is the list. */
    writeGuestCookie(guest)

    if (readCookie(HINT) !== "1") {
      /* Signed out: nobody's account list stays in this browser. */
      save(accountKey, [])
      startTransition(() => {
        if (guest.length > 0) showGuest(guest)
        setReady(true)
      })
      return
    }

    /* Signed in. Draw what this browser last knew, then ask. */
    mode.current = "account"
    const known = load(accountKey)
    startTransition(() => {
      setSignedIn(true)
      setIds(known)
      setReady(true)
    })
    void (async () => {
      const answer = guest.length > 0 ? await call({ action: "merge", ids: guest }) : await call()
      if (cancelled) return
      if (!answer) return /* Offline: keep what is drawn and try on the next page. */
      if (!answer.signedIn) {
        forgetHint()
        save(accountKey, [])
        showGuest(guest)
        return
      }
      if (answer.available === false) {
        /* The account list cannot be reached yet: the browser's list stands in. */
        showGuest(guest)
        return
      }
      if (guest.length > 0) {
        save(guestKey, [])
        writeGuestCookie([])
      }
      save(accountKey, answer.ids)
      setIds(answer.ids)
    })()
    return () => { cancelled = true }
  }, [guestKey, accountKey, showGuest])

  /* The same website open in another tab. */
  useEffect(() => {
    if (!guestKey || !accountKey) return
    const onStorage = (e: StorageEvent) => {
      if (e.key === guestKey && mode.current === "guest") setIds(parseStored(e.newValue))
      if (e.key === accountKey && mode.current === "account") setIds(parseStored(e.newValue))
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [guestKey, accountKey])

  /* The list as the latest change left it, so a toggle never works from a stale render. */
  const idsRef = useRef<string[]>([])
  useEffect(() => { idsRef.current = ids }, [ids])

  const toggle = useCallback((id: string, on?: boolean) => {
    const current = idsRef.current
    const want = on ?? !current.includes(id.toLowerCase())
    const next = toggled(current, id, want)
    idsRef.current = next
    setIds(next)
    if (!guestKey || !accountKey) return
    if (mode.current === "guest") {
      save(guestKey, next)
      writeGuestCookie(next)
      return
    }
    save(accountKey, next)
    void call({ action: want ? "add" : "remove", productId: id }).then((answer) => {
      if (!answer) {
        /* Did not reach the server: put it back the way it was. */
        idsRef.current = current
        setIds(current)
        save(accountKey, current)
        return
      }
      if (!answer.signedIn) {
        /* The session ended: this change is kept in the browser's own list instead. */
        forgetHint()
        save(accountKey, [])
        const guest = toggled(load(guestKey), id, want)
        save(guestKey, guest)
        writeGuestCookie(guest)
        idsRef.current = guest
        showGuest(guest)
        return
      }
      if (answer.available !== false) {
        save(accountKey, answer.ids)
        idsRef.current = answer.ids
        setIds(answer.ids)
      }
    })
  }, [guestKey, accountKey, showGuest])

  const value = useMemo<SiteWishlistValue>(() => {
    const set = new Set(ids)
    return {
      ids,
      ready,
      count: ids.length,
      signedIn,
      has: (id: string) => set.has(String(id).toLowerCase()),
      toggle,
      live: !!shopId,
    }
  }, [ids, ready, signedIn, toggle, shopId])

  return <SiteWishlistContext.Provider value={value}>{children}</SiteWishlistContext.Provider>
}

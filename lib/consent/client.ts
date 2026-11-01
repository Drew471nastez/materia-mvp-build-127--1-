/**
 * Consent in the browser: read the record, write it, hear when it changes.
 *
 * Every tracker asks `hasConsent("analytics")` at the moment it would store
 * something, not once at load, so a visitor who says no in the banner stops
 * being tracked on the same page, and one who says yes starts.
 */
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  OPTIONAL,
  OPTIONAL_COOKIES,
  allows,
  cookieValue,
  parse,
  serialize,
  type Consent,
  type ConsentCategory,
} from "./consent"

/** Fired on window with the new record, in this tab. Other tabs hear the storage event. */
export const CONSENT_EVENT = "storelib:consent-changed"
/** Fired on window to open the preferences, from a footer link or anywhere else. */
export const OPEN_PREFERENCES_EVENT = "storelib:open-cookie-preferences"
/** A copy in localStorage, only so other tabs are told; the cookie is the record. */
const MIRROR_KEY = "storelib_consent"

export function readConsent(): Consent | null {
  if (typeof document === "undefined") return null
  return parse(cookieValue(document.cookie, CONSENT_COOKIE), Date.now())
}

export function hasConsent(category: ConsentCategory): boolean {
  return allows(readConsent(), category)
}

function expire(name: string) {
  const secure = location.protocol === "https:" ? "; secure" : ""
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax${secure}`
}

export function writeConsent(c: Consent) {
  if (typeof document === "undefined") return
  const secure = location.protocol === "https:" ? "; secure" : ""
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(serialize(c))}; path=/; max-age=${CONSENT_MAX_AGE}; samesite=lax${secure}`
  /* Saying no takes back what saying yes had stored. */
  for (const category of OPTIONAL) {
    if (c[category]) continue
    for (const name of OPTIONAL_COOKIES[category]) expire(name)
    if (category === "analytics") {
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i)
          if (k && k.startsWith("materia_attr_")) localStorage.removeItem(k)
        }
        /* And this tab's note of the AI visit counts it sent (lib/attribution/ai-visit-browser). */
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
          const k = sessionStorage.key(i)
          if (k && k.startsWith("materia_attr_")) sessionStorage.removeItem(k)
        }
      } catch {
        /* storage blocked: nothing was stored there either */
      }
    }
  }
  try {
    localStorage.setItem(MIRROR_KEY, serialize(c))
  } catch {
    /* the cookie is the record */
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: c }))
}

/** Calls back with the record whenever it changes, here or in another tab. */
export function onConsentChange(fn: (c: Consent | null) => void): () => void {
  const local = () => fn(readConsent())
  const other = (e: StorageEvent) => {
    if (e.key === MIRROR_KEY) fn(readConsent())
  }
  window.addEventListener(CONSENT_EVENT, local)
  window.addEventListener("storage", other)
  return () => {
    window.removeEventListener(CONSENT_EVENT, local)
    window.removeEventListener("storage", other)
  }
}

export function openCookiePreferences() {
  window.dispatchEvent(new CustomEvent(OPEN_PREFERENCES_EVENT))
}

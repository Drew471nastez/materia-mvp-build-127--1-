"use client"

/**
 * The creator page's languages (lib/markets/creator-page-language.ts): a
 * small selector at the foot of the page, each language in its own words.
 * No floating "View this site in ...?" card on the creator page: Show
 * visitors their own language picks silently on the server. Choosing is
 * remembered (sl_lang) and opens the page with ?lang=, its one address per
 * language; the store's own language has none.
 */
import { useId } from "react"

export function CreatorLanguage({ code, defaultLanguage, languages }: { code: string; defaultLanguage: string; languages: { code: string; name: string }[] }) {
  const id = useId()
  if (languages.length < 2) return null
  const go = (next: string) => {
    if (next === code) return
    try {
      document.cookie = `sl_lang=${encodeURIComponent(next.toLowerCase())}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`
    } catch {
      /* the address still carries it */
    }
    const url = new URL(window.location.href)
    if (next.toLowerCase() === defaultLanguage.toLowerCase()) url.searchParams.delete("lang")
    else url.searchParams.set("lang", next.toLowerCase())
    window.location.assign(`${url.pathname}${url.search}${url.hash}`)
  }
  return (
    <div data-creator-language="" className="flex justify-center px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-2">
      <div className="relative inline-flex items-center text-[#4b5563]">
        <label htmlFor={id} className="sr-only">
          Language
        </label>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute left-2.5 h-4 w-4 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="10" cy="10" r="7.25" />
          <path d="M2.75 10h14.5M10 2.75c2 2.2 2.9 4.6 2.9 7.25S12 15.05 10 17.25M10 2.75C8 4.95 7.1 7.35 7.1 10s.9 5.05 2.9 7.25" />
        </svg>
        <select
          id={id}
          value={code}
          onChange={(e) => go(e.target.value)}
          className="h-9 max-w-[70vw] cursor-pointer appearance-none truncate rounded-full border border-[#e5e7eb] bg-white pl-8 pr-8 text-[13px] text-[#1a1a2e] outline-none transition-colors hover:border-[#d1d5db] focus-visible:border-[#9ca3af]"
        >
          {languages.map((l) => (
            <option key={l.code} value={l.code} lang={l.code}>
              {l.name}
            </option>
          ))}
        </select>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="m5.5 8 4.5 4.5L14.5 8" />
        </svg>
      </div>
    </div>
  )
}

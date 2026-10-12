"use client"

/**
 * The language suggestion card on a React page: a builder theme's pages
 * (from the language switch under the footer) and the creator page. The
 * card itself is one script for every kind of page (lib/markets/
 * suggest-script.ts); this puts it on the page once and asks it once.
 */
import { useEffect } from "react"
import { LANGUAGE_SUGGEST_JS, type LanguageSuggestConf } from "@/lib/markets/suggest-script"

type SuggestWindow = Window & { __slLangSuggest?: (c: LanguageSuggestConf) => void }

export function LanguageSuggest({ conf }: { conf: LanguageSuggestConf }) {
  const key = `${conf.current}|${conf.defaultLanguage}|${conf.languages.join(",")}|${conf.address}`
  useEffect(() => {
    if (conf.languages.length < 2) return
    const w = window as SuggestWindow
    if (typeof w.__slLangSuggest !== "function") {
      const s = document.createElement("script")
      s.textContent = LANGUAGE_SUGGEST_JS
      document.head.appendChild(s)
      s.remove()
    }
    w.__slLangSuggest?.(conf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}

/**
 * ===========================================================================
 *  SHOW VISITORS THEIR OWN LANGUAGE (Settings › Markets and languages)
 * ===========================================================================
 * When a store turns it on, a visitor's first page of its website (or its
 * creator page) is matched against the languages the store published:
 *
 *   SENT THERE ONCE   the first language the browser asks for (Accept-
 *                     Language, in the visitor's order) that the website has
 *                     exactly: "fr-CA" opens /fr, "zh-TW" opens /zh-hant.
 *                     Only from a page in the website's own language, only
 *                     once (sl_lang remembers it, and every choice after it
 *                     is the visitor's), never a crawler, a script, a form,
 *                     the cart, checkout or account. Search engines keep
 *                     every language at its own address with hreflang.
 *
 *   OFFERED           a near match only ("pt-PT" when the website has
 *                     Brazilian Portuguese), or nothing the browser asks for
 *                     but the country they are in speaks one of them (the
 *                     geo header): a small card offers it, in that
 *                     language, once a visit, closed with one press, never
 *                     a redirect. The browser's language is a strong sign
 *                     of what someone reads; where they happen to be is a
 *                     weak one (travellers, expats, roaming), so it only
 *                     ever suggests.
 *
 * The language selector is on every page either way. Pure: the proxy, the
 * creator page and the tests read it the same way.
 */

/** Each country's own languages, most spoken first. Only the country fallback reads it: the browser's own languages always come first. */
export const COUNTRY_LANGUAGES: Record<string, string[]> = {
  US: ["en"], GB: ["en"], IE: ["en"], AU: ["en"], NZ: ["en"], CA: ["en", "fr"], ZA: ["en"], NG: ["en"], KE: ["en"], GH: ["en"],
  FR: ["fr"], BE: ["nl", "fr"], LU: ["fr", "de"], MC: ["fr"], CH: ["de", "fr", "it"], SN: ["fr"], CI: ["fr"], CM: ["fr"], MA: ["ar", "fr"], DZ: ["ar", "fr"], TN: ["ar", "fr"],
  DE: ["de"], AT: ["de"], LI: ["de"],
  ES: ["es"], MX: ["es"], AR: ["es"], CO: ["es"], CL: ["es"], PE: ["es"], VE: ["es"], EC: ["es"], GT: ["es"], CU: ["es"], BO: ["es"], DO: ["es"], HN: ["es"], PY: ["es"], SV: ["es"], NI: ["es"], CR: ["es"], PA: ["es"], UY: ["es"], PR: ["es", "en"],
  PT: ["pt-PT", "pt"], BR: ["pt-BR", "pt"], AO: ["pt"], MZ: ["pt"],
  IT: ["it"], SM: ["it"], VA: ["it"], NL: ["nl"], RO: ["ro"], MD: ["ro"], PL: ["pl"], CZ: ["cs"], SK: ["sk"], HU: ["hu"], BG: ["bg"], GR: ["el"], CY: ["el", "tr"],
  HR: ["hr"], SI: ["sl"], RS: ["sr"], BA: ["bs", "hr", "sr"], ME: ["sr"], SE: ["sv"], DK: ["da"], NO: ["nb"], FI: ["fi", "sv"], IS: ["is"], EE: ["et"], LV: ["lv"], LT: ["lt"],
  UA: ["uk"], RU: ["ru"], BY: ["ru"], KZ: ["ru"], TR: ["tr"],
  SA: ["ar"], AE: ["ar"], EG: ["ar"], IQ: ["ar"], JO: ["ar"], KW: ["ar"], LB: ["ar"], QA: ["ar"], OM: ["ar"], BH: ["ar"], LY: ["ar"], YE: ["ar"], SY: ["ar"],
  IL: ["he"], IR: ["fa"], IN: ["hi", "en"], PK: ["ur", "en"], BD: ["bn"], TH: ["th"], VN: ["vi"], ID: ["id"], MY: ["ms"], PH: ["fil", "en"], SG: ["en", "zh-Hans"],
  JP: ["ja"], KR: ["ko"], CN: ["zh-Hans"], TW: ["zh-Hant"], HK: ["zh-Hant"], MO: ["zh-Hant"],
}

type Parts = { base: string; script: string | null; region: string | null; written: { script: boolean; region: boolean } }

function parts(tag: string): Parts | null {
  const t = tag.trim().replace(/_/g, "-")
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(t)) return null
  const bits = t.split("-")
  const writtenScript = bits.slice(1).some((b) => /^[A-Za-z]{4}$/.test(b))
  const writtenRegion = bits.slice(1).some((b) => /^(?:[A-Za-z]{2}|\d{3})$/.test(b))
  try {
    /* The script and region a tag means even when it does not say them: zh-TW is Traditional, pt is Brazil's. */
    const L = (Intl as unknown as { Locale: new (t: string) => { maximize(): { language: string; script?: string; region?: string } } }).Locale
    const max = new L(t).maximize()
    return { base: max.language.toLowerCase(), script: max.script ?? null, region: max.region ?? null, written: { script: writtenScript, region: writtenRegion } }
  } catch {
    return { base: bits[0].toLowerCase(), script: null, region: null, written: { script: writtenScript, region: writtenRegion } }
  }
}

/** How a website's language answers a language someone reads: the same one, a near one (same language, another script or region), or not at all. */
export function languageFit(site: string, asked: string): "exact" | "near" | null {
  const s = parts(site)
  const a = parts(asked)
  if (!s || !a || s.base !== a.base) return null
  /* What the website's tag names, it has to match; what it leaves open, anything does ("fr" is every French). */
  if (s.written.script && s.script !== a.script) return "near"
  if (s.written.region && s.region !== a.region) return "near"
  /* A tag that names neither still differs in script where the language is written two ways (zh means Simplified). */
  if (!s.written.script && !s.written.region && s.script && a.script && s.script !== a.script) return "near"
  return "exact"
}

/** The browser's languages, most wanted first (Accept-Language), at most twelve. */
export function askedLanguages(acceptLanguage: string | null | undefined): string[] {
  if (!acceptLanguage) return []
  return acceptLanguage
    .split(",")
    .slice(0, 24)
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";")
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.trim().slice(2) ?? "1")
      return { tag: tag.trim(), q: Number.isFinite(q) ? q : 0, i }
    })
    .filter((a) => a.q > 0 && a.tag !== "*" && /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/.test(a.tag))
    .sort((a, b) => b.q - a.q || a.i - b.i)
    .slice(0, 12)
    .map((a) => a.tag)
}

export interface VisitorLanguage {
  /** Send them there: the first language they read that the website has exactly. */
  exact: string | null
  /** Offer it: a near match, or one their country speaks. */
  closest: string | null
}

/**
 * The website's language for this visitor, among `languages` (the
 * website's own and its published ones). The first language the browser
 * asks for that fits any of them decides: exactly, it is `exact` (which may
 * be the website's own: then nothing happens); nearly, it is `closest`.
 * Nothing the browser asks for fits: the country's languages, as `closest`.
 */
export function visitorLanguageFor(input: { acceptLanguage?: string | null; country?: string | null; languages: readonly string[] }): VisitorLanguage {
  const langs = input.languages.filter(Boolean)
  if (langs.length < 2) return { exact: null, closest: null }
  for (const asked of askedLanguages(input.acceptLanguage)) {
    const exact = langs.find((l) => languageFit(l, asked) === "exact")
    if (exact) return { exact, closest: null }
    const near = langs.find((l) => languageFit(l, asked) === "near")
    if (near) return { exact: null, closest: near }
  }
  const country = typeof input.country === "string" ? input.country.toUpperCase() : ""
  for (const spoken of COUNTRY_LANGUAGES[country] ?? []) {
    const hit = langs.find((l) => languageFit(l, spoken) === "exact") ?? langs.find((l) => languageFit(l, spoken) === "near")
    if (hit) return { exact: null, closest: hit }
  }
  return { exact: null, closest: null }
}

/** A crawler, a link preview or a headless browser: never sent anywhere, never offered anything. */
export const LANGUAGE_CRAWLER = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|lighthouse|headless|google-inspectiontool|bingpreview|whatsapp|telegram|discord|slack/i

/**
 * "View this site in {name}?" and "Close", in the language offered, so the
 * person who reads it can. The website's other languages fall back to
 * English words with the language's own name.
 */
export const SUGGEST_WORDS: Record<string, { ask: string; close: string }> = {
  en: { ask: "View this site in {name}?", close: "Close" },
  es: { ask: "¿Ver este sitio en {name}?", close: "Cerrar" },
  fr: { ask: "Voir ce site en {name} ?", close: "Fermer" },
  de: { ask: "Diese Seite auf {name} ansehen?", close: "Schließen" },
  it: { ask: "Vedere questo sito in {name}?", close: "Chiudi" },
  pt: { ask: "Ver este site em {name}?", close: "Fechar" },
  nl: { ask: "Deze site in het {name} bekijken?", close: "Sluiten" },
  ro: { ask: "Vezi site-ul în {name}?", close: "Închide" },
  pl: { ask: "Wyświetlić stronę w języku: {name}?", close: "Zamknij" },
  sv: { ask: "Visa webbplatsen på {name}?", close: "Stäng" },
  da: { ask: "Vis siden på {name}?", close: "Luk" },
  nb: { ask: "Vis nettstedet på {name}?", close: "Lukk" },
  fi: { ask: "Näytä sivusto kielellä {name}?", close: "Sulje" },
  cs: { ask: "Zobrazit web v jazyce {name}?", close: "Zavřít" },
  sk: { ask: "Zobraziť web v jazyku {name}?", close: "Zavrieť" },
  hu: { ask: "Megnézed az oldalt {name} nyelven?", close: "Bezárás" },
  el: { ask: "Προβολή του ιστότοπου στα {name};", close: "Κλείσιμο" },
  tr: { ask: "Siteyi {name} görüntüle?", close: "Kapat" },
  ru: { ask: "Открыть сайт на языке: {name}?", close: "Закрыть" },
  uk: { ask: "Відкрити сайт мовою: {name}?", close: "Закрити" },
  bg: { ask: "Да се покаже ли сайтът на {name}?", close: "Затвори" },
  hr: { ask: "Prikazati stranicu na jeziku: {name}?", close: "Zatvori" },
  ja: { ask: "このサイトを{name}で表示しますか？", close: "閉じる" },
  ko: { ask: "이 사이트를 {name}(으)로 볼까요?", close: "닫기" },
  "zh-Hans": { ask: "以{name}查看此网站？", close: "关闭" },
  "zh-Hant": { ask: "以{name}檢視此網站？", close: "關閉" },
  ar: { ask: "عرض هذا الموقع باللغة {name}؟", close: "إغلاق" },
  he: { ask: "להציג את האתר בשפה: {name}?", close: "סגירה" },
  hi: { ask: "यह साइट {name} में देखें?", close: "बंद करें" },
  id: { ask: "Lihat situs ini dalam {name}?", close: "Tutup" },
  vi: { ask: "Xem trang này bằng {name}?", close: "Đóng" },
  th: { ask: "ดูเว็บไซต์นี้เป็นภาษา{name}?", close: "ปิด" },
}

/** The words for a language: its own, its base language's ("pt-BR" reads "pt"), or English. */
export function suggestWords(code: string): { ask: string; close: string } {
  if (SUGGEST_WORDS[code]) return SUGGEST_WORDS[code]
  const lower = code.toLowerCase()
  if (lower.startsWith("zh")) return SUGGEST_WORDS[/hant|tw|hk|mo/.test(lower) ? "zh-Hant" : "zh-Hans"]
  return SUGGEST_WORDS[lower.split("-")[0]] ?? SUGGEST_WORDS.en
}

export type VisitorLanguageDecision = { kind: "redirect"; language: string; to: string } | { kind: "suggest"; language: string } | null

/**
 * What the proxy does with a request to a website (proxy.ts
 * visitorLanguageStart), decided here so every case can be run in a test:
 * send the visitor to their language once, offer it, or nothing.
 */
export function visitorLanguageDecision(r: {
  method: string
  /** Sec-Fetch-Dest, when the browser sent it. */
  dest: string | null
  accept: string | null
  userAgent: string | null
  pathname: string
  /** A preview, a path that is never sent anywhere (the cart, checkout, account, files), or a file. */
  skip: boolean
  /** sl_lang: the visitor chose (or was sent) before. */
  chosen: string | null
  /** sl_suggest: something was offered this visit already. */
  offered: string | null
  on: boolean
  defaultLanguage: string
  /** The published languages other than the website's own. */
  others: readonly string[]
  acceptLanguage: string | null
  country: string | null
}): VisitorLanguageDecision {
  if (!r.on || r.others.length === 0 || r.method !== "GET" || r.chosen || r.offered || r.skip) return null
  if ((r.dest && r.dest !== "document") || !(r.accept ?? "").includes("text/html")) return null
  if (LANGUAGE_CRAWLER.test(r.userAgent ?? "") || /\.[a-z0-9]{1,8}$/i.test(r.pathname)) return null
  const def = r.defaultLanguage || "en"
  const first = r.pathname.split("/")[1]?.toLowerCase() ?? ""
  const current = r.others.find((l) => l.toLowerCase() === first) ?? def
  const pick = visitorLanguageFor({ acceptLanguage: r.acceptLanguage, country: r.country, languages: [def, ...r.others] })
  if (pick.exact) {
    if (pick.exact.toLowerCase() === current.toLowerCase()) return null
    /* Only from the website's own language: an address already in another language was chosen, so it is only offered. */
    if (current !== def || pick.exact === def) return { kind: "suggest", language: pick.exact }
    return { kind: "redirect", language: pick.exact, to: `/${pick.exact.toLowerCase()}${r.pathname === "/" ? "" : r.pathname}` }
  }
  if (pick.closest && pick.closest.toLowerCase() !== current.toLowerCase()) return { kind: "suggest", language: pick.closest }
  return null
}

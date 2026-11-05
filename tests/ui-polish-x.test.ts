/**
 * ===========================================================================
 *  ROUND X3: LIGHT OR DARK IN WEBSITE SETTINGS, A QUIETER LANGUAGE CHIP,
 *  COPY UNDER YOUR OWN MESSAGE, TRANSLATIONS ONE LANGUAGE AT A TIME
 * ===========================================================================
 * The owner asked for four things:
 *   - a light and dark switch in Website Settings that follows the same choice
 *     as the rest of Storelib, smooth, every panel right in both;
 *   - the builder's language and currency chip and the sidebar's row quieter;
 *   - Copy under the creator's own messages in Storelib AI, like the answers;
 *   - a product's translations as a short list that opens one language.
 *
 * What a browser measures (contrast in every subject, the chip against its
 * neighbours, Copy's place and the clipboard, the card at 390 and 1280) is in
 * scripts/check-ui-polish-x.mjs. Here: the behaviour that runs without one,
 * and the wiring.
 *
 * Run with:  npm run test:push
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import * as React from "react"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* A browser's few pieces the appearance store and the clipboard touch, in memory. */
function fakeBrowser() {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  }
  const attrs = new Set<string>()
  const html = {
    hasAttribute: (n: string) => attrs.has(n),
    setAttribute: (n: string) => void attrs.add(n),
    removeAttribute: (n: string) => void attrs.delete(n),
    style: {} as Record<string, string>,
    classList: { add() {}, remove() {}, contains: () => false },
  }
  const sent: { url: string; body: string }[] = []
  const clip: string[] = []
  const g = globalThis as unknown as Record<string, unknown>
  g.window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { pathname: "/website-builder/editor/install-1" },
    /* Reduced motion: the look is put on at once, with no View Transition to wait for. */
    matchMedia: () => ({ matches: true }),
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout,
  }
  g.document = { documentElement: html, visibilityState: "visible" }
  g.fetch = async (url: string, init?: { body?: string }) => {
    sent.push({ url, body: String(init?.body ?? "") })
    return { ok: true, json: async () => ({}) }
  }
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async (t: string) => void clip.push(t) } } })
  return { storage, sent, clip }
}

async function main() {
  const browser = fakeBrowser()

  console.log("\nWebsite Settings follows the person's light or dark choice")
  {
    const parts = await import("@/components/website-builder/website-settings/parts")
    const { chooseAppearance } = await import("@/lib/appearance/client")
    const { APPEARANCE_KEY } = await import("@/lib/appearance/site-appearance")
    check("the shared key, the one Explore, the account and the communities read", APPEARANCE_KEY === "storelib:appearance")
    chooseAppearance("light")
    check("choosing light writes the shared choice in this browser", browser.storage.getItem(APPEARANCE_KEY) === "light")
    check("  and for the account", browser.sent.some((s) => s.url === "/api/account/appearance" && JSON.parse(s.body).appearance === "light"), browser.sent)
    chooseAppearance("dark")
    check("  and back to dark", browser.storage.getItem(APPEARANCE_KEY) === "dark")
    check("  the builder's own page is never given the buyer pages' dark attribute", !(globalThis as unknown as { document: { documentElement: { hasAttribute: (n: string) => boolean } } }).document.documentElement.hasAttribute("data-sl-dark"))

    const dark = renderToStaticMarkup(React.createElement(parts.LookButton, { look: "dark" }))
    const light = renderToStaticMarkup(React.createElement(parts.LookButton, { look: "light" }))
    check("the switch is a toggle button that says which look is on", /aria-pressed="true"/.test(dark) && /aria-pressed="false"/.test(light) && /aria-label="Dark mode"/.test(dark), { dark, light })
    const src = read("components/website-builder/website-settings/parts.tsx")
    check("  pressing it is the shared chooseAppearance, with itself as the live layer of the fade", /onClick=\{\(e\) => chooseAppearance\(dark \? "light" : "dark", e\.currentTarget\)\}/.test(src))
    check("  a person who never chose keeps the dark page they had", /return useAppearanceChoice\(\) \?\? "dark"/.test(src))
    const settings = read("components/website-builder/project-settings.tsx")
    check("the screen carries its look, for the light sheet, and hands it to every part", /data-ws-look=\{look\}/.test(settings) && /<SettingsLookContext\.Provider value=\{look\}>/.test(settings) && /<LookButton look=\{look\} \/>/.test(settings))
    check("  beside Back to editor, the screen's one other control", settings.indexOf("<LookButton") > settings.indexOf('tt("Back to editor")') && settings.indexOf("<LookButton") < settings.indexOf("<nav"))

    const on = renderToStaticMarkup(React.createElement(parts.SettingsLookContext.Provider, { value: "light" }, React.createElement(parts.Toggle, { checked: true, onChange: () => {}, label: "x" })))
    const onDark = renderToStaticMarkup(React.createElement(parts.Toggle, { checked: true, onChange: () => {}, label: "x" }))
    check("a switch is drawn for the look it is in (the light one is near black when on)", /bg-\[#111113\]/.test(on) && !/bg-\[#f2f2f3\]/.test(on) && /bg-\[#f2f2f3\]/.test(onDark))
    const scoped = renderToStaticMarkup(React.createElement(parts.SettingsLookContext.Provider, { value: "light" }, React.createElement(parts.DarkScope, null, "x")))
    check("the image picker and the text editor lose their dark drawing in the light", !/class="dark"/.test(scoped) && /class="dark"/.test(renderToStaticMarkup(React.createElement(parts.DarkScope, null, "x"))))
    const panels = ["general", "seo", "pages", "policies"].map((p) => read(`components/website-builder/website-settings/${p}.tsx`))
    check("  no panel forces the dark drawing any more", panels.every((p) => !/className="dark[ "]/.test(p)))
    check("the selects and the DNS records take the look", /<PreviewLocaleSelects model=\{ctx\.preview\} tone=\{look\} \/>/.test(read("components/website-builder/website-settings/general.tsx")) && /tone=\{look\}/.test(read("components/website-builder/website-settings/domains.tsx")))

    let current = true
    try {
      execFileSync(process.execPath, ["scripts/gen-website-settings-light.mjs", "--check"], { stdio: "pipe" })
    } catch {
      current = false
    }
    check("app/website-settings-light.css is current with the panels (node scripts/gen-website-settings-light.mjs)", current)
    const sheet = read("app/website-settings-light.css")
    check("  every rule is under the light look (and the dark one only names its colour scheme)", sheet.split("\n").filter((l) => /\{ [a-z-]+:/.test(l)).every((l) => /\[data-ws-look="light"\]/.test(l) || l === '[data-ws-look="dark"] { color-scheme: dark; }'))
    check("  white words become /app's ink, the dark page /app's #f8f9fa, a card white", /\.text-white:is\(\[data-ws-look="light"\][^{]*\{ color: #1a1a2e; \}/.test(sheet) && /\.bg-\\\[\\#0f0f0f\\\]:is[^{]*\{ background-color: #f8f9fa; \}/.test(sheet) && /\.bg-white\\\/\\\[0\\\.03\\\]:is[^{]*\{ background-color: #ffffff; \}/.test(sheet))
    check("  white words on a red button stay white", /\.text-white:is[^{]*:not\([^)]*bg-red-500/.test(sheet))
    /* Changed on purpose (r52): Storelib's root layout is app/(storelib)/layout.tsx, one folder down from the sheets. */
    check("  loaded with the app, after the dark sheet", /import "\.\.\/theme-dark\.css"\nimport "\.\.\/website-settings-light\.css"/.test(read("app/(storelib)/layout.tsx")))
  }

  console.log("\nThe language and currency selector")
  {
    const sw = await import("@/components/website-builder/preview-locale-switch")
    const model = {
      languages: ["en", "it"],
      published: ["en", "it"],
      defaultLanguage: "en",
      locale: "it",
      setLocale: () => {},
      base: "USD",
      markets: [{ id: "ro", name: "Romania", currency: "RON" }],
      marketId: "ro",
      setMarket: () => {},
    }
    const chip = renderToStaticMarkup(React.createElement(sw.PreviewLocaleButton, { model }))
    check("the top bar's chip: 32px and round like its neighbours, 11px words", /h-8/.test(sw.LOCALE_CHIP_CLASS) && /rounded-full/.test(sw.LOCALE_CHIP_CLASS) && /text-\[11px\]/.test(sw.LOCALE_CHIP_CLASS))
    check("  no fill and no edge at rest, a faint fill under a pointer", /text-white\/60 hover:bg-white\/\[0\.06\]/.test(chip) && !/\bborder\b/.test(sw.LOCALE_CHIP_CLASS) && !/class="[^"]*\bbg-white\/\[0\.12\]/.test(chip), chip)
    check("  still says what it shows: IT and RON, and its full name to a screen reader", />IT<span class="ml-1">RON<\/span>/.test(chip) && /aria-label="Preview language and currency: [^"]+, RON"/.test(chip) && /aria-expanded="false"/.test(chip), chip)
    const none = renderToStaticMarkup(React.createElement(sw.PreviewLocaleButton, { model: { ...model, languages: ["en"], markets: [] } }))
    check("  nothing for a website with one language and one currency", none === "")
    const bar = renderToStaticMarkup(React.createElement(sw.SidebarLanguageBar, { model, editing: { locale: "it", name: "Italian" } }))
    check("the sidebar's row: no white card, no shadow, no chips inside it", /data-wb-locale-trigger/.test(bar) && !/shadow-\[/.test(sw.SIDEBAR_LOCALE_TRIGGER_CLASS) && !/bg-white/.test(sw.SIDEBAR_LOCALE_TRIGGER_CLASS) && !/rounded-\[5px\] bg-\[#f3f4f6\]/.test(bar), bar)
    check("  the line about where text saves opens by its height, so nothing under it jumps", /data-wb-translating/.test(bar) && /<Reveal open=\{!!editing\}>/.test(read("components/website-builder/preview-locale-switch.tsx")))
    const src = read("components/website-builder/preview-locale-switch.tsx")
    check("both lists fade in and out as the page switcher's does, and stay out of reach while closed", (src.match(/className="wb-pages-menu /g) ?? []).length === 2 && (src.match(/data-state=\{open \? "open" : "closed"\}/g) ?? []).length === 2 && (src.match(/<div inert=\{!open\}>/g) ?? []).length === 2)
  }

  console.log("\nCopy under the creator's own message")
  {
    const ask = await import("@/components/website-builder/ask-activity")
    const prompt = "make it better,  keep the colours\nexactly as they are "
    check("the words reach the clipboard exactly as sent", (await ask.writeClipboard(prompt)) && browser.clip[browser.clip.length - 1] === prompt, browser.clip)
    const html = renderToStaticMarkup(React.createElement(ask.PromptCopy, { text: prompt, phone: false }))
    check("a button named for what it does, reachable by keyboard", /<button type="button" data-ask-prompt-copy=""/.test(html) && /aria-label="Copy your message"/.test(html), html)
    check("  hidden until the message is under a mouse or the button has focus; always there on a touch screen", /pointer-fine:opacity-0/.test(html) && /pointer-fine:group-hover\/prompt:opacity-100/.test(html) && /pointer-fine:focus-within:opacity-100/.test(html))
    check("  the answer's own 28px round button; 36px with a 44px press area on a phone", /h-7 w-7/.test(html) && /h-9 w-9 after:absolute after:-inset-1/.test(renderToStaticMarkup(React.createElement(ask.PromptCopy, { text: prompt, phone: true }))))
    check("  nothing for an empty message", renderToStaticMarkup(React.createElement(ask.PromptCopy, { text: "", phone: false })) === "")
    const src = read("components/website-builder/ask-activity.tsx")
    check("  says Copied, as under an answer", /copied === "copied" \? tt\("Copied"\) : tt\("Could not copy"\)/.test(src) && /role="status"/.test(src))
    const chat = read("components/website-builder/theme-chat.tsx")
    check("the chat puts it under every message, with the message's own words", /<div className="group\/prompt">/.test(chat) && /<PromptCopy text=\{exchange\.prompt\} phone=\{phone\} \/>/.test(chat))
  }

  console.log("\nA product's translations, one language at a time")
  {
    const card = await import("@/app/(storelib)/app/products/new/product-translations-card")
    const fields = [{ field: "title" as const }, { field: "description" as const }, { field: "seo_title" as const }, { field: "seo_description" as const }]
    const done = { value: "x", status: "done" as const, ai: false }
    check("all four written: Translated", card.progressLabel(card.languageProgress(fields, { title: done, description: done, seo_title: done, seo_description: done })).text === "Translated")
    check("two of four: 2 of 4 translated", card.progressLabel(card.languageProgress(fields, { title: done, description: done })).text === "2 of 4 translated")
    check("none: Not translated", card.progressLabel(card.languageProgress(fields, {})).text === "Not translated")
    const old = card.progressLabel(card.languageProgress(fields, { title: { value: "x", status: "outdated", ai: false }, description: done, seo_title: done, seo_description: done }))
    check("one the original changed under: Outdated, first, in amber", old.text === "Outdated" && old.tone === "warn")
    check("a title left to the glossary is not counted against it", card.languageProgress(fields, { description: done, seo_title: done, seo_description: done }, true).total === 3)
    const src = read("app/(storelib)/app/products/new/product-translations-card.tsx")
    const list = src.slice(src.indexOf("<div className={SWITCH_GROUP}>"), src.indexOf("<SheetDialog"))
    check("the card is a list: a row per language, and no field in it", /data-product-translation-language=\{l\.code\}/.test(list) && !/<Input|<textarea|<RichTextEditor/.test(list))
    check("  the list folds away while every language shows the original", /view\.showOriginal\s*\?\s*null/.test(list))
    const sheet = src.slice(src.indexOf("<SheetDialog"))
    check("a row opens that language alone: a dialog on a computer, the shared sheet on a phone", /onClick=\{\(e\) => openLanguage\(l\.code, e\.currentTarget\)\}/.test(list) && /<SheetDialog\s+open=\{!!open\}/.test(src) && /phone=\{phone\}/.test(sheet))
    check("  its fields, Outdated and Automatic, the glossary's note and Translate automatically are all there", /<Input|<textarea/.test(sheet) && /tt\("Outdated"\)/.test(sheet) && /tt\("Automatic"\)/.test(sheet) && /data-product-keep-name=""/.test(sheet) && /data-product-translate-auto=""/.test(sheet))
    check("  each change still saves on its own, to the language it was typed in", /call<\{ status: Status \}>\("PUT", \{ id: productId, locale: lang, field, value \}\)/.test(src) && /type\(editing, f\.field/.test(sheet))
  }

  console.log("\nWords")
  {
    const mine = [
      "components/website-builder/website-settings/parts.tsx",
      "components/website-builder/project-settings.tsx",
      "components/website-builder/preview-locale-switch.tsx",
      "components/website-builder/ask-activity.tsx",
      "app/(storelib)/app/products/new/product-translations-card.tsx",
      "scripts/gen-website-settings-light.mjs",
      "scripts/check-ui-polish-x.mjs",
      "scripts/render-ui-polish-x-probe.tsx",
    ]
    /* "transform" is also the CSS property these files move things with: it is banned in the words a person reads. */
    const banned = /—|\bunlock|\belevate|\bseamless|\bpowerful|\beffortless|\bsupercharge/i
    const hits = mine.filter((f) => banned.test(read(f)))
    check("no em dash and none of the banned words in what this round wrote", hits.length === 0, hits)
    const words = mine.flatMap((f) => [...read(f).matchAll(/\btt\("([^"]+)"/g)].map((m) => m[1]))
    check("  none in a sentence a person reads", words.length > 20 && !words.some((w) => /transform|unlock|elevate|seamless|powerful|effortless|supercharge|—/i.test(w)), words.filter((w) => /transform/i.test(w)))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

/**
 * The parts scripts/check-ui-polish-x.mjs measures, each drawn by its real
 * component, picked by the address's hash:
 *
 *   #settings=<section>  Website Settings (components/website-builder/
 *                        project-settings.tsx) open on one subject; the look
 *                        is the person's choice in localStorage, as in the app
 *   #topbar              the builder's dark bar: the size and full screen
 *                        buttons (their classes as the editor writes them)
 *                        and the real language and currency chip
 *   #sidebar             the sidebar's real language row
 *   #chat                a creator's message and its real Copy (the bubble's
 *                        markup as theme-chat.tsx writes it)
 *   #translations        a product's real Translations card
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { Maximize2, Monitor } from "lucide-react"

import { ProjectSettings, type SettingsSection } from "@/components/website-builder/project-settings"
import { PreviewLocaleButton, SidebarLanguageBar, type PreviewLocaleModel } from "@/components/website-builder/preview-locale-switch"
import { PromptCopy } from "@/components/website-builder/ask-activity"
import { ProductTranslationsCard } from "@/app/(storelib)/app/products/new/product-translations-card"

const hash = window.location.hash.slice(1)
const [part, arg] = hash.split("=")

function useLocaleModel(): PreviewLocaleModel {
  const [locale, setLocale] = React.useState<string | null>("it")
  const [marketId, setMarket] = React.useState<string | null>("ro")
  return {
    languages: ["en", "it", "fr"],
    published: ["en", "it"],
    defaultLanguage: "en",
    locale,
    setLocale,
    base: "USD",
    markets: [
      { id: "ro", name: "Romania", currency: "RON" },
      { id: "eu", name: "Europe", currency: "EUR" },
    ],
    marketId,
    setMarket,
  }
}

/* The editor's own classes for the two round buttons beside the chip (app/(storelib)/website-builder/editor/[installId]/page.tsx). */
const ROUND = "hidden sm:flex h-8 w-8 aspect-square shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[var(--wb-chrome-fg)] transition-[background-color,color] duration-150 hover:bg-white/[0.1]"

function TopBar() {
  const model = useLocaleModel()
  return (
    <div className="wb-editor">
      <header data-probe-bar="" className="flex h-14 items-center justify-center gap-1.5 bg-[var(--wb-chrome-bg)] px-4 text-[var(--wb-chrome-fg)]">
        <button type="button" className={ROUND} data-probe-neighbour="size" aria-label="Desktop">
          <Monitor className="h-[15px] w-[15px]" strokeWidth={1.75} />
        </button>
        <button type="button" className={ROUND} data-probe-neighbour="full" aria-label="Full screen">
          <Maximize2 className="h-[14px] w-[14px]" strokeWidth={1.75} />
        </button>
        <PreviewLocaleButton model={model} />
      </header>
    </div>
  )
}

function Sidebar() {
  const model = useLocaleModel()
  return (
    <div className="w-[320px] border-r border-[#e5e7eb] bg-white" data-probe-sidebar="">
      <SidebarLanguageBar model={model} editing={model.locale && model.locale !== "en" ? { locale: model.locale, name: "Italian" } : null} />
      <div data-probe-after="" className="px-3 py-3 text-[13px] text-[#6b7280]">
        Sections
      </div>
    </div>
  )
}

export const PROMPT = "organize this section into blocks,  make it better\nand keep the colours  exactly as they are"

function Chat({ phone }: { phone: boolean }) {
  /* As theme-chat.tsx draws a creator's message (the <li>'s own markup, from the bubble down). */
  return (
    <ol className="w-[420px] max-w-full space-y-5 bg-white px-4 py-6" data-probe-chat="">
      <li className="space-y-2.5">
        <div className="group/prompt">
          <div className="flex justify-end">
            <p data-ask-prompt="" className="max-w-[85%] whitespace-pre-wrap rounded-[18px] bg-[#f1f2f4] px-3.5 py-2 text-[13.5px] leading-[1.5] text-[#1a1a2e]">
              {PROMPT}
            </p>
          </div>
          <PromptCopy text={PROMPT} phone={phone} />
        </div>
        <p className="text-[13.5px] text-[#1a1a2e]">Added Storefront Hero to the page.</p>
      </li>
    </ol>
  )
}

function Settings({ section }: { section: SettingsSection }) {
  return (
    <ProjectSettings
      open
      onClose={() => {}}
      installId="install-1"
      name="Linen & Co"
      onRenamed={() => {}}
      websiteUrl="https://linen.storelib.com"
      websiteUrlDisplay="linen.storelib.com"
      live
      publishedAt="2026-10-01T10:00:00Z"
      initialSection={section}
      settings={{ seo_title: "Linen & Co", seo_description: "Washed linen aprons and table cloths, made in Lisbon." }}
      pages={[
        { key: "home", name: "Home", path: "/" },
        { key: "about", name: "About", path: "/about", custom: true },
      ]}
      productCount={12}
    />
  )
}

function App() {
  if (part === "settings") return <Settings section={(arg || "general") as SettingsSection} />
  if (part === "topbar") return <TopBar />
  if (part === "sidebar") return <Sidebar />
  if (part === "chat") return <Chat phone={arg === "phone"} />
  if (part === "translations")
    return (
      <div className="mx-auto max-w-[760px] bg-[#f8f9fa] px-4 py-6">
        <ProductTranslationsCard
          productId="p1"
          cardClass="scroll-mt-4 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white app-card-x py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:space-y-5 sm:py-6"
          titleClass="text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]"
        />
      </div>
    )
  return null
}

createRoot(document.getElementById("app")!).render(<App />)

/**
 * The probe page for scripts/check-ai-site-chrome-r56.mjs: one page of a
 * generated website mounted in the browser exactly as the live site's page
 * mounts it (app/(site)/w/[username]/render-site.tsx): the sections drawn on
 * the server by renderWithSources (handed in as window.__PROBE__), then
 * StorelibSourcesProvider and ThemePage, every native React section through
 * SectionRenderer and every .storelib section through StorelibSection with
 * its real hooks, in a live storefront with two languages and two
 * currencies, so the language and currency selectors are drawn. Nothing here
 * stands in for the code under test; only next/navigation and next/link are
 * replaced (the check's esbuild aliases), as tests/_eval/browser.ts does.
 */
import { createRoot } from "react-dom/client"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider, type RenderedSection } from "@/components/website-builder/sections/storelib-sources"
import { preloadSectionRenderers } from "@/components/website-builder/sections/registry"
import type { Storefront } from "@/components/website-builder/theme/storefront-context"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

type Probe = { theme: Record<string, unknown>; sections: SectionInstance[]; prerendered: Record<string, RenderedSection>; template: string; pages: string[] }
type ProbeWindow = Window & { __PROBE__: Probe; __ready?: boolean; __error?: string }

const w = window as unknown as ProbeWindow
const probe = w.__PROBE__

const storefront: Storefront = {
  creatorId: "11111111-1111-4111-8111-111111111111",
  pages: probe.pages,
  language: {
    code: "en",
    defaultLanguage: "en",
    languages: [
      { code: "en", name: "English" },
      { code: "fr", name: "Français" },
      { code: "de", name: "Deutsch" },
    ],
    currency: {
      options: [
        { id: "home", label: "USD $", country: "US" },
        { id: "eu", label: "EUR €", country: "FR" },
        { id: "uk", label: "GBP £", country: "GB" },
      ],
      current: "home",
      note: null,
    },
  } as never,
}

preloadSectionRenderers()
  .catch(() => undefined)
  .then(() => {
    createRoot(document.getElementById("app")!).render(
      <StorelibSourcesProvider prerendered={probe.prerendered} page={{ template: probe.template }}>
        <ThemePage theme={probe.theme as unknown as ThemeSettingsValues} sections={probe.sections} storefront={storefront} />
      </StorelibSourcesProvider>,
    )
    setTimeout(() => {
      w.__ready = true
    }, 50)
  })
  .catch((e) => {
    w.__error = String(e)
  })

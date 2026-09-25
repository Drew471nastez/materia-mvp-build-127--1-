/**
 * The browser half of scripts/check-site-accounts.mjs: hydrates the page the
 * server drew (scripts/prerender-site-accounts.tsx) with the same props, the
 * way a published page is hydrated, so the hearts, the header's count and
 * the contact form are the real client code.
 */
import { createElement } from "react"
import { hydrateRoot } from "react-dom/client"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"

type Probe = {
  template: string
  prerendered: Record<string, { html: string; css: string }>
  props: Record<string, unknown>
}

const probe = (window as unknown as { __PROBE__: Probe }).__PROBE__
hydrateRoot(
  document.getElementById("app")!,
  createElement(StorelibSourcesProvider, { prerendered: probe.prerendered, page: { template: probe.template } } as never, createElement(ThemePage, probe.props as never)),
)
;(window as unknown as { __HYDRATED__: boolean }).__HYDRATED__ = true

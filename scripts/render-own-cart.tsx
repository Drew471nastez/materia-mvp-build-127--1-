/**
 * The probe page for scripts/check-own-cart.mjs: a section of the creator's
 * own (scripts/fixtures/own-cart.storelib), drawn by the real renderer on the
 * server with two real-shaped products (scripts/render-own-cart-html.ts), put
 * inside the real cart provider, with the real hooks
 * (components/website-builder/sections/site-chrome-hooks.tsx). Nothing here
 * is a stand-in for the code under test.
 */
import { useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { SiteCartProvider } from "@/components/website-builder/site-cart"
import { StorefrontHooks } from "@/components/website-builder/sections/site-chrome-hooks"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

/* Drawn on the server by the real renderer (scripts/check-own-cart.mjs, render step), as the live site prerenders. */
const out = (window as unknown as { __SECTION__: { ok: boolean; html: string; css: string } }).__SECTION__
const section: SectionInstance = { id: "own-cart-1", type: "own_cart", settings: {}, blocks: [] } as unknown as SectionInstance
const theme = {} as ThemeSettingsValues
;(window as unknown as { __render: unknown }).__render = out.ok ? "ok" : out

function Page() {
  const [root, setRoot] = useState<HTMLElement | null>(null)
  const trigger = useRef<((e: React.MouseEvent<HTMLElement>) => boolean) | null>(null)
  const html = out.ok ? out.html : ""
  return (
    <>
      {out.ok && out.css ? <style>{out.css}</style> : null}
      <div ref={setRoot} data-probe-section="" onClickCapture={(e) => trigger.current?.(e)} dangerouslySetInnerHTML={{ __html: html }} />
      <StorefrontHooks section={section} theme={theme} html={html} scriptRoot={root} inCanvas={false} trigger={trigger} />
    </>
  )
}

createRoot(document.getElementById("app")!).render(
  <SiteCartProvider shopId="shop-1">
    <Page />
  </SiteCartProvider>,
)

/**
 * The product page mounted in a browser under the Storelib header, for scripts/check-product-dark-round31.mjs: the
 * real page (scripts/render-product-page-ssr31.tsx mountProduct), the real light buyer header (the one production
 * draws, PlatformHeaderClient with buyerHeaderLight) and the real painter that puts the person's look on <html> on
 * every move (components/platform/site-appearance). window.__mount(which) draws one case.
 */
import React from "react"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"
import { SiteAppearance } from "@/components/platform/site-appearance"
import { mountProduct } from "./render-product-page-ssr31"

;(window as unknown as { __mount: (which: string) => Promise<void> }).__mount = (which: string) =>
  mountProduct(
    which,
    document.getElementById("app")!,
    (page) => (
      <LocaleProvider>
        <SiteAppearance />
        <PlatformHeaderClient buyerHeaderLight />
        <main>{page}</main>
      </LocaleProvider>
    ),
  )

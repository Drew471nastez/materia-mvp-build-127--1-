/**
 * ===========================================================================
 *  NO ONEPAGE AT THIS ADDRESS
 * ===========================================================================
 * What storelib.me/{name} answers when nobody has that page, or its owner
 * has not published it, and what any other address on storelib.me answers
 * (the proxy sends those to /l/-, which lands here). A 404, never indexed
 * (Next writes the noindex tag on a not found page, and the proxy adds the
 * header).
 *
 * Small on purpose: this is somebody's link in bio that did not work, so it
 * says so in one line, and offers the one useful thing, making one. No
 * platform header or footer: on storelib.me the layout draws neither.
 * Absolute links, because on storelib.me a relative `/` is not Storelib.
 */
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { NOT_FOUND_METADATA } from "@/lib/seo/not-found-metadata"

/* One robots tag on a 404, and it says noindex: lib/seo/not-found-metadata.ts. */
export const metadata = NOT_FOUND_METADATA

export default function OnePageNotFound() {
  return (
    <main
      className="flex min-h-svh flex-col items-center justify-center bg-[#f8f9fa] px-6 py-16 text-center"
      data-onepage-missing=""
    >
      <StorelibLogo size={36} className="mb-7" />
      <h1 className="text-[22px] font-semibold tracking-tight text-[#1a1a2e] sm:text-[24px]">This page is not here</h1>
      <p className="mt-2 max-w-[320px] text-[15px] leading-relaxed text-[#6b7280]">
        Nobody has a OnePage at this address, or it is not published yet. Check the spelling of the link.
      </p>
      <a
        href="https://storelib.com/signup"
        className="mt-7 inline-flex h-11 items-center rounded-xl bg-[#1a1a2e] px-6 text-[14px] font-semibold text-white transition-colors hover:bg-[#2d2d4e]"
      >
        Make your own OnePage
      </a>
      <a href="https://storelib.com" className="mt-4 text-[13px] text-[#6b7280] underline-offset-4 hover:underline">
        storelib.com
      </a>
    </main>
  )
}

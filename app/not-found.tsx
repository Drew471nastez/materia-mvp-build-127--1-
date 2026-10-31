import type { Metadata } from "next"
import { NOT_FOUND_METADATA } from "@/lib/seo/not-found-metadata"
import Link from "next/link"
import { Suspense } from "react"

import { NotFoundBody } from "@/components/platform/not-found-body"
import { SiteNotFound } from "@/components/website-builder/site-not-found"
/* Fetched when a 404 is drawn: this tree rides in every page's payload, websites included (components/platform/platform-header-lazy.tsx). */
import { PlatformHeaderClient } from "@/components/platform/platform-header-lazy"
import { NotFoundActions } from "@/components/platform/not-found-actions"
import { getMainDomain } from "@/lib/url-helpers"

/**
 * Two answers, one route. See components/platform/not-found-body.tsx: on
 * storelib.com this is Storelib's 404, and on a creator's own address it is
 * the 404 page the creator arranged in the builder, inside their own header
 * and footer (components/website-builder/site-not-found.tsx), with the plain
 * page below when the site's own cannot be drawn. Neither mentions Storelib
 * or offers to take the visitor off the site they were on.
 */
/* One robots tag on a 404, and it says noindex: lib/seo/not-found-metadata.ts. */
export const metadata: Metadata = NOT_FOUND_METADATA

export default function NotFound() {
  return <NotFoundBody platform={<PlatformNotFound />} site={<SiteNotFound fallback={<PlainSiteNotFound />} />} />
}

/**
 * NEVER STORELIB'S HEADER ON SOMEBODY'S SITE, NOT EVEN FOR A FRAME. The
 * server draws the platform's answer (it cannot know the host without
 * turning every missing page dynamic), and the browser swaps in the site's
 * as it hydrates. Until then, on any host that is not Storelib's own, the
 * platform's answer is drawn but not shown.
 */
function HideOnSites() {
  const main = getMainDomain().toLowerCase()
  const hosts = JSON.stringify([main, `www.${main}`, "localhost", "127.0.0.1"])
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: `if(${hosts}.indexOf(location.hostname.toLowerCase())<0)document.documentElement.setAttribute("data-site-404","")` }} />
      <style>{`html[data-site-404] [data-platform-404]{visibility:hidden}`}</style>
    </>
  )
}

/** A page that is not there, on somebody's own website, when their own 404 page cannot be drawn. */
function PlainSiteNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3.5 px-6 py-24 text-center">
      <h1 className="text-[26px] font-semibold tracking-tight text-[#1a1a2e] sm:text-[30px]">That page is not here</h1>
      <p className="max-w-sm text-[15px] leading-relaxed text-[#6b7280]">
        The link may be old, or the page may have moved.
      </p>
      {/* `/` is the front page of whatever address the visitor is already at. */}
      <Link
        href="/"
        className="mt-3 inline-flex h-11 items-center rounded-xl bg-[#1a1a2e] px-6 text-[14px] font-semibold text-white transition-colors hover:bg-[#2d2d4e]"
      >
        Back to the home page
      </Link>
    </main>
  )
}

function PlatformNotFound() {
  /**
   * STORELIB'S OWN 404, FOR ANY PART OF STORELIB. Under the same header every
   * Storelib page has (the root layout draws none, so it is drawn here), and
   * with the two ways on that fit wherever the link came from: back, and home.
   * There used to be one button, Explore Storelib, which only fits a shopper.
   */
  return (
    <div className="flex min-h-svh flex-col bg-white" data-platform-404="">
      <HideOnSites />
      <Suspense fallback={<div className="h-[65px] md:h-[72px]" aria-hidden />}>
        <PlatformHeaderClient />
      </Suspense>
      <main className="flex flex-1 items-center justify-center px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-md text-center">
          <p className="mb-3 text-[13px] font-semibold tracking-wide text-[#9ca3af]">404</p>
          <h1 className="mb-3 text-[26px] font-bold tracking-tight text-[#1a1a2e] sm:text-[30px]">This page isn&apos;t here</h1>
          <p className="mx-auto mb-8 max-w-sm text-[15px] leading-relaxed text-[#6b7280]">
            The link may be old, or the page may have moved. Check the address, or go back to where you were.
          </p>
          <NotFoundActions />
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-[#f3f4f6] pt-6">
            <Link href="/help" className="text-[13px] text-[#6b7280] transition-colors hover:text-[#1a1a2e]">
              Help Center
            </Link>
            <Link href="/privacy" className="text-[13px] text-[#6b7280] transition-colors hover:text-[#1a1a2e]">
              Privacy
            </Link>
            <Link href="/terms" className="text-[13px] text-[#6b7280] transition-colors hover:text-[#1a1a2e]">
              Terms
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

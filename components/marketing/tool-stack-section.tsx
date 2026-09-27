"use client"

import { useState, useRef, useEffect } from "react"
import { AnimateOnScroll } from "./bento-grid"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { StorelibLogo } from "@/components/brand/storelib-logo"

const COMPARE_IMAGE =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Visits%20(12).webp"

/* ── SVG Icon Components ── */

function LinktreeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 417 512.238" className="w-[23px] h-[23px]">
      <path fill="#43E660" fillRule="nonzero" d="M171.274 344.942h74.09v167.296h-74.09V344.942zM0 173.468h126.068l-89.622-85.44 49.591-50.985 85.439 87.829V0h74.086v124.872L331 37.243l49.552 50.785-89.58 85.24H417v70.502H290.252l90.183 87.629L331 381.192 208.519 258.11 86.037 381.192l-49.591-49.591 90.218-87.631H0v-70.502z"/>
    </svg>
  )
}

function ShopifyIcon() {
  return (
    <svg viewBox="-18 0 292 292" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid" className="w-[23px] h-[23px]">
      <path d="M223.774 57.34c-.201-1.46-1.48-2.268-2.537-2.357-1.055-.089-23.383-1.743-23.383-1.743s-15.507-15.395-17.209-17.099c-1.703-1.703-5.029-1.191-6.32-.811-.19.056-3.388 1.043-8.678 2.68-5.18-14.906-14.322-28.604-30.405-28.604-.443 0-.9.019-1.358.044C130.878 3.407 125.212.78 120.318.78 82.854.78 64.955 47.614 59.342 71.414L44.785 75.925c-8.126 2.549-8.383 2.805-9.449 10.462C34.531 92.194 13.269 256.623 13.269 256.623l165.678 31.042 89.771-19.42s-31.514-213.056-31.712-214.517l-.032-.388zM158.058 37.236c-4.16 1.288-8.891 2.752-14.018 4.318.005-.987.009-1.96.009-3.022 0-9.264-1.286-16.723-3.349-22.637 8.287 1.04 13.806 10.469 17.358 21.34zm-27.637-19.483c2.303 5.773 3.802 14.058 3.802 25.238 0 .572-.005 1.095-.009 1.625-8.934 2.824-18.84 5.89-28.77 8.966 5.575-21.518 16.026-31.91 25.162-35.644l-.185-.185zm-11.131-7.536c1.617 0 3.246.548 4.805 1.622-12.007 5.65-25.143 19.88-30.578 48.297-7.762 2.46-15.526 4.874-22.704 7.098C76.937 46.16 92.38 10.828 119.29 10.217z" fill="#95BF46"/>
      <path d="M221.237 54.983c-1.055-.089-23.383-1.743-23.383-1.743s-15.507-15.395-17.209-17.099c-.637-.635-1.496-.96-2.394-1.1l-12.527 256.233 89.762-19.418s-31.514-213.056-31.712-214.517c-.2-1.46-1.48-2.268-2.537-2.356" fill="#5E8E3E"/>
      <path d="M135.242 104.585l-10.069 32.926s-9.698-5.176-21.586-5.176c-17.428 0-18.305 10.938-18.305 13.694 0 15.038 39.2 20.8 39.2 56.024 0 27.713-17.577 45.558-41.278 45.558-28.44 0-42.984-17.7-42.984-17.7l7.615-25.16s14.95 12.835 27.565 12.835c8.243 0 11.596-6.49 11.596-11.232 0-19.616-32.16-20.491-32.16-52.724 0-27.129 19.472-53.382 58.778-53.382 13.145 0 19.627 4.338 19.627 4.338" fill="#FFF"/>
    </svg>
  )
}

function CheckoutIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="#000000" viewBox="0 0 24 24" className="w-[23px] h-[23px]">
      <path d="M9.63 14.28 15 16.76c.66.31 1.13.82 1.39 1.42.64 1.5-.24 3.03-1.61 3.58-1.38.55-2.84.2-3.51-1.36l-2.33-5.47c-.18-.42.27-.84.7-.64Zm.32-1.61 5.54-2.09c1.84-.7 3.85.62 3.82 2.53v.08c-.04 1.86-1.99 3.11-3.79 2.46l-5.56-2.04a.498.498 0 0 1 0-.94Zm-.31-.73 5.44-2.31c1.81-.77 2.27-3.08.85-4.41-.02-.02-.04-.03-.06-.05-1.39-1.29-3.69-.84-4.48.86l-2.44 5.25c-.19.42.25.85.68.66Zm-1.4-.91 1.98-5.43c.25-.67.2-1.36-.05-1.95-.64-1.5-2.38-1.98-3.76-1.43S4.26 4.03 4.93 5.59l2.35 5.47c.18.42.81.41.97-.03Z"/>
    </svg>
  )
}

function FileHostingIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-[23px] h-[23px]">
      <circle cx="16" cy="16" r="14" fill="#0F287F"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M11 8L6 11L11 14L6 17L11 20L16 17L21 20L26 17L21 14L26 11L21 8L16 11L11 8ZM16 11L21 14L16 17L11 14L16 11Z" fill="#DAF8FE"/>
      <path d="M11 22L16 19L21 22L16 25L11 22Z" fill="#DAF8FE"/>
    </svg>
  )
}

function EmailIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 574 259" fill="none" className="w-8 h-auto">
      <g clipPath="url(#kit-clip0)">
        <path d="M157.146 107.772C227.739 121.435 249.65 186.786 250.228 252.515C250.241 253.994 249.047 255.2 247.568 255.2H158.705C157.239 255.2 156.045 254.017 156.037 252.548C155.77 201.554 147.508 156.553 96.98 154.61C95.473 154.553 94.217 155.76 94.217 157.27V252.541C94.217 254.009 93.025 255.2 91.557 255.2H2.676C1.207 255.2.016 254.012.016 252.541V9.788C.016 8.319 1.207 7.128 2.676 7.128H91.557C93.025 7.128 94.217 8.319 94.217 9.788V100.723C94.217 102.072 95.309 103.165 96.659 103.165C97.729 103.165 98.679 102.468 98.99 101.443C121.885 26.454 164.644 7.599 234.076 7.136C235.55 7.125 236.757 8.322 236.757 9.795V100.505C236.757 101.973 235.566 103.165 234.097 103.165H157.591C156.307 103.165 155.265 104.206 155.265 105.491C155.265 106.604 156.055 107.563 157.146 107.772ZM400.471 164.618V105.825C400.471 104.356 401.662 103.165 403.131 103.165H468.536C469.823 103.165 470.867 102.121 470.867 100.834C470.867 99.718 470.072 98.762 468.977 98.547C417.803 88.397 394.18 58.938 393.364 9.79C393.341 8.329 394.514 7.128 395.972 7.128H492.012C493.481 7.128 494.672 8.319 494.672 9.788V51.191C494.672 52.66 495.863 53.851 497.332 53.851H552.4C553.869 53.851 555.06 55.043 555.06 56.511V100.505C555.06 101.973 553.869 103.165 552.4 103.165H497.332C495.863 103.165 494.672 104.356 494.672 105.825V153.248C494.672 170.002 504.944 175.527 518.604 175.527C540.01 175.527 561.126 165.882 569.595 161.51C571.367 160.596 573.473 161.883 573.473 163.874V237.7C573.473 239.671 572.385 241.484 570.639 242.403C562.279 246.801 536.43 258.995 506.86 258.995C446.047 259 400.471 234.209 400.471 164.618ZM275.452 252.541V105.82C275.452 104.351 276.643 103.16 278.112 103.16H366.993C368.461 103.16 369.653 104.351 369.653 105.82V252.541C369.653 254.009 368.461 255.2 366.993 255.2H278.112C276.643 255.2 275.452 254.012 275.452 252.541ZM270.419 45.219C270.419 70.192 288.055 90.438 321.937 90.438C355.819 90.438 373.455 70.192 373.455 45.219C373.455 20.246 355.817 0 321.937 0C288.055 0 270.419 20.246 270.419 45.219Z" fill="#1E1E1E"/>
      </g>
      <defs>
        <clipPath id="kit-clip0"><rect width="573.457" height="259" fill="white"/></clipPath>
      </defs>
    </svg>
  )
}

function MarketplaceIcon() {
  return (
    <svg fill="#000000" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="w-[23px] h-[23px]">
      <path d="M2.181,1.757,1.122,5.994A4,4,0,0,0,1.855,9.45a3.838,3.838,0,0,0,.3.3V22a1,1,0,0,0,1,1H14.3a1,1,0,0,0,0-2H4.151V10.9A3.955,3.955,0,0,0,8.063,9.589c.03.035.051.076.082.11A4.04,4.04,0,0,0,11.11,11h.083a4.038,4.038,0,0,0,2.964-1.3c.031-.034.052-.076.082-.111A3.954,3.954,0,0,0,18.151,10.9V13a1,1,0,0,0,2,0V9.752a3.838,3.838,0,0,0,.3-.3,4,4,0,0,0,.733-3.456L20.121,1.757A1,1,0,0,0,19.151,1h-16A1,1,0,0,0,2.181,1.757ZM18.37,3l.87,3.479A2.028,2.028,0,0,1,17.272,9,2.041,2.041,0,0,1,15.25,7.14L14.905,3ZM9.4,3H12.9l.317,3.8A2.031,2.031,0,0,1,11.193,9H11.11A2.028,2.028,0,0,1,9.088,6.807ZM7.4,3l-.012.134-.292,3.5v0l-.041.5A2.041,2.041,0,0,1,5.031,9,2.029,2.029,0,0,1,3.062,6.479L3.932,3ZM22.925,18.42c-.38,1.964-3.425,3.663-3.425,3.663s-3.045-1.7-3.425-3.663c-.376-1.939.729-2.948,1.87-2.948a1.728,1.728,0,0,1,1.555.778,1.728,1.728,0,0,1,1.555-.778C22.2,15.472,23.3,16.481,22.925,18.42Z"/>
    </svg>
  )
}

/* ── Feature list data ── */

type Feature = { icon: React.ReactNode; title: string; instead: string; price: string }

const VISIBLE_FEATURES: Feature[] = [
  {
    icon: <LinktreeIcon />,
    title: "Link-in-bio",
    instead: "Linktree Pro — $15/mo",
    price: "$15",
  },
  {
    icon: <ShopifyIcon />,
    title: "Digital product storefront",
    instead: "Shopify — $39/mo",
    price: "$39",
  },
  {
    icon: <CheckoutIcon />,
    title: "Checkout & payments",
    instead: "Lemon Squeezy fees",
    price: "Fees",
  },
  {
    icon: <FileHostingIcon />,
    title: "File hosting & delivery",
    instead: "Google Drive / Dropbox — $12/mo",
    price: "$12",
  },
  {
    icon: <EmailIcon />,
    title: "Email collection",
    instead: "ConvertKit — $19/mo",
    price: "$19",
  },
]

const COLLAPSED_FEATURES: Feature[] = [
  {
    icon: "📊",
    title: "Sales analytics",
    instead: "separate analytics tools — $10/mo",
    price: "$10",
  },
  {
    icon: <MarketplaceIcon />,
    title: "Marketplace",
    instead: "paying for ads to get traffic",
    price: "$25",
  },
]

function FeatureRow({ f }: { f: Feature }) {
  return (
    <div className="flex items-center gap-3 sm:gap-4 py-4 sm:py-[18px]">
      <span className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-white border border-neutral-200 rounded-lg text-[20px] sm:text-[22px]">{f.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] sm:text-base font-semibold text-neutral-900 leading-snug">{f.title}</p>
        <p className="text-[12px] sm:text-[13px] text-neutral-400 leading-snug mt-0.5">Instead of: {f.instead}</p>
      </div>
      <span className="text-[15px] sm:text-base font-bold text-neutral-800 shrink-0 tabular-nums">{f.price}</span>
    </div>
  )
}

export function ToolStackSection() {
  const [expanded, setExpanded] = useState(false)
  const collapsibleRef = useRef<HTMLDivElement>(null)
  const [collapsibleHeight, setCollapsibleHeight] = useState(0)

  useEffect(() => {
    if (collapsibleRef.current) {
      setCollapsibleHeight(collapsibleRef.current.scrollHeight)
    }
  }, [])

  return (
    <section className="pt-[50px] pb-20 sm:pt-[72px] sm:pb-28 bg-white">
      <div className="max-w-[1200px] mx-auto px-0 sm:px-6">
        <AnimateOnScroll variant="zoom-in">
          {/* Outer rounded card wrapper — light gray bg, full width on mobile */}
          <div className="bg-neutral-50 border-y sm:border border-neutral-200/70 rounded-none sm:rounded-[32px] px-5 sm:px-10 md:pl-20 md:pr-16 pt-4 pb-12 sm:pt-6 sm:pb-16">
            {/* Headline */}
            <div className="text-center max-w-[640px] mx-auto mb-9 sm:mb-[50px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                /*
                  `?width=&quality=` on a /storage/v1/object/ URL does nothing
                  at all — that endpoint serves the stored file and ignores
                  every parameter. The two entries in the srcSet were the same
                  original twice, so this asked for one picture and downloaded
                  it twice over. It is 281px wide at most; the optimizer is
                  asked for that.
                */
                src={optimizedImageUrl(COMPARE_IMAGE, 281, 75)}
                alt="Compare tools"
                width={277}
                height={56}
                className="mb-4 mx-auto max-w-[263px] sm:max-w-[281px] w-auto h-auto rounded-lg object-contain"
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                sizes="(max-width: 640px) 198px, 254px"
              />
              <h2 className="text-[clamp(28px,4vw,44px)] font-bold leading-[1.15] tracking-tight mb-3.5">
                Replace your entire tool stack
              </h2>
              <p className="text-base sm:text-lg text-neutral-500 leading-relaxed">
                Stop paying for 6 different tools. Storelib brings it all in one.
              </p>
            </div>

            {/* Inner white card with feature list */}
            <div className="max-w-[578px] mx-auto bg-white rounded-[20px] shadow-[0_2px_24px_rgba(0,0,0,0.06)] p-5 sm:p-7">
              {/* Always-visible features */}
              <div className="relative flex flex-col">
                {VISIBLE_FEATURES.map((f, i) => (
                  <div key={f.title}>
                    <FeatureRow f={f} />
                    {i < VISIBLE_FEATURES.length - 1 && (
                      <div className="h-px bg-neutral-100 ml-11 sm:ml-12" />
                    )}
                  </div>
                ))}
                {/* White bottom fade when collapsed — fades into the toggle button */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none transition-opacity duration-500"
                  style={{
                    background: "linear-gradient(to bottom, transparent, white)",
                    opacity: expanded ? 0 : 1,
                  }}
                />
              </div>

              {/* Collapsible features — smooth height animation */}
              <div
                className="overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
                style={{ maxHeight: expanded ? `${collapsibleHeight}px` : "0px", opacity: expanded ? 1 : 0 }}
              >
                <div ref={collapsibleRef}>
                  {COLLAPSED_FEATURES.map((f, i) => (
                    <div key={f.title}>
                      <div className="h-px bg-neutral-100 ml-11 sm:ml-12" />
                      <FeatureRow f={f} />
                      {i < COLLAPSED_FEATURES.length - 1 && (
                        <div className="h-px bg-neutral-100 ml-11 sm:ml-12" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Show all / Show less toggle */}
              <div className="flex justify-center mt-1 mb-2">
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-[13px] font-semibold text-neutral-400 hover:text-neutral-500 transition-colors duration-200 flex items-center gap-1"
                >
                  {expanded ? "Show less" : "Show all"}
                  <svg
                    width="12" height="12" viewBox="0 0 12 12" fill="none"
                    className={`transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
                  >
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              {/* Full divider before totals */}
              <div className="h-px bg-neutral-200 mt-2 mb-4" />

              {/* "What you'd pay otherwise" row */}
              <div className="flex items-center gap-3 sm:gap-4 py-3">
                <span className="w-8 flex items-center justify-center shrink-0">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                    <circle cx="11" cy="11" r="11" fill="#FEE2E2" />
                    <path d="M7.5 7.5L14.5 14.5M14.5 7.5L7.5 14.5" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
                <p className="flex-1 text-[15px] sm:text-base font-semibold text-neutral-900">
                  What you&apos;d pay otherwise
                </p>
                <span className="text-[17px] sm:text-lg font-bold text-red-500 shrink-0">$91+/mo</span>
              </div>

              {/* Storelib row */}
              <div className="flex items-center gap-3 sm:gap-4 py-3">
                <span className="w-8 flex items-center justify-center shrink-0">
                  <StorelibLogo size={31} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] sm:text-base font-semibold text-neutral-900">
                    Storelib
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-[17px] sm:text-lg font-bold text-neutral-900">Free to start</span>
                  <p className="text-[12px] text-neutral-400 mt-0.5">or $29/mo</p>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="text-center mt-10 sm:mt-12">
              <a
                href="/signup"
                className="inline-flex items-center justify-center gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-base font-semibold rounded-lg h-[52px] sm:h-[56px] px-10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/20"
              >
                Start for free <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}

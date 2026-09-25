"use client"

/**
 * ===========================================================================
 *  WHERE YOUR NAME IS, IN ONE PLACE
 * ===========================================================================
 * "What is Store URL? You can change your domain in the website settings. And
 * what is the OnePage URL if the username changes dynamically?" General had
 * three inputs for the one username (Store URL, the OnePage handle, and a
 * third on Stores), none saying what the others were.
 *
 * Now the username is one field, and this list under it says what it is the
 * address of, as Shopify and Gumroad do: the creator page and the OnePage are
 * at the username; the website is too, unless it was given a name of its own
 * in its Domains, and then that name is what shows. Each row copies, opens,
 * and goes to where that page is edited. The published website also opens
 * straight on its own Domains, SEO and General settings, so the things that
 * only belong to the website are one press from here.
 */
import { useState } from "react"
import Link from "next/link"
import { Check, Copy, ExternalLink } from "lucide-react"
import { copyText } from "@/lib/platform/copy-text"
import { openExternal } from "@/lib/native-bridge"
import { getLinksShareUrl, getLinksUrlDisplay, getStoreShareUrl, getStoreUrlDisplay, getWebsiteUrl, getWebsiteUrlDisplay } from "@/lib/url-helpers"
import { cn } from "@/lib/utils"

export type SettingsWebsite = { installId: string | null; name: string | null; handle: string | null }

const ICON_BUTTON =
  "inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#6b7280] outline-none transition-colors duration-100 hover:bg-[#f3f4f6] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 max-sm:h-10 max-sm:w-10"
const TEXT_LINK =
  "inline-flex h-8 shrink-0 items-center rounded-lg px-2 text-[13px] font-medium text-[#1a1a2e] underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 max-sm:h-10"

function Row({
  label,
  display,
  url,
  note,
  children,
}: {
  label: string
  display: string
  url: string | null
  note?: string
  children?: React.ReactNode
}) {
  const [copied, setCopied] = useState(false)
  return (
    <div data-address-row={label} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-[#1a1a2e]">{label}</p>
        <p className={cn("truncate text-[13px]", url ? "text-[#4b5563]" : "text-[#9ca3af]")} title={display}>
          {display}
        </p>
        {note ? <p className="mt-0.5 text-[12px] text-[#9ca3af]">{note}</p> : null}
      </div>
      <div className="-mr-1.5 flex items-center gap-0.5">
        {url ? (
          <>
            <button
              type="button"
              aria-label={`Copy the ${label.toLowerCase()} address`}
              title={copied ? "Copied" : "Copy"}
              onClick={async () => {
                if (await copyText(url)) {
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 1400)
                }
              }}
              className={ICON_BUTTON}
            >
              {copied ? <Check className="h-4 w-4 text-[#15803d]" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            </button>
            <button type="button" aria-label={`Open the ${label.toLowerCase()}`} title="Open" onClick={() => openExternal(url)} className={ICON_BUTTON}>
              <ExternalLink className="h-4 w-4" aria-hidden />
            </button>
          </>
        ) : null}
        {children}
      </div>
    </div>
  )
}

export function AddressList({ username, website }: { username: string; website: SettingsWebsite | null }) {
  const name = username.trim().toLowerCase()
  const siteName = (website?.handle || name).toLowerCase()
  const published = !!website?.installId
  const editor = website?.installId ? `/website-builder/editor/${website.installId}` : null
  return (
    <div data-address-list="" className="divide-y divide-[#f0f1f3] rounded-xl border border-[#eceef1] px-3.5 py-3 sm:px-4">
      <Row label="Creator page" display={name ? getStoreUrlDisplay(name) : "Choose a username"} url={name ? getStoreShareUrl(name) : null}>
        <Link href="/creator-page" className={TEXT_LINK}>
          Edit
        </Link>
      </Row>
      <Row label="OnePage" display={name ? getLinksUrlDisplay(name) : "Choose a username"} url={name ? getLinksShareUrl(name) : null}>
        <Link href="/app/onepage" className={TEXT_LINK}>
          Edit
        </Link>
      </Row>
      <Row
        label="Website"
        display={published ? getWebsiteUrlDisplay(siteName) : "Not published yet"}
        url={published ? getWebsiteUrl(siteName) : null}
        note={
          published
            ? website?.handle && website.handle.toLowerCase() !== name
              ? `Its own address, set in the website's Domains${website.name ? `. Published: ${website.name}` : ""}.`
              : website?.name
                ? `Published: ${website.name}. A custom domain is set in its Domains.`
                : "A custom domain is set in its Domains."
            : "It will be at your username until you give it a name or a domain of its own."
        }
      >
        {editor ? (
          <>
            <Link href={`${editor}?settings=domains`} className={TEXT_LINK}>
              Domains
            </Link>
            <Link href={`${editor}?settings=seo`} className={cn(TEXT_LINK, "max-sm:hidden")}>
              SEO
            </Link>
            <Link href={`${editor}?settings=general`} className={TEXT_LINK}>
              Settings
            </Link>
          </>
        ) : (
          <Link href="/app/website-builder" className={TEXT_LINK}>
            Set up
          </Link>
        )}
      </Row>
    </div>
  )
}

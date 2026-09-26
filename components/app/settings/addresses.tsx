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
 * at the username; the website is too, unless it was given a name or a
 * domain of its own, and then that is what shows.
 *
 * A ROW IS A NAME, AN ADDRESS AND THREE CONTROLS. On a phone the Website row
 * carried a sentence ("Published: ... A custom domain is set in its
 * Domains.") and four controls, which left its text a third of the row: the
 * sentence ran seven lines a word or two wide and the address was cut to
 * "andrewr...". The OnePage's address was cut too, by its own three icons.
 * So no row explains itself any more, every row has the same three controls
 * (Copy, Open, Edit), and the Website's Edit is a short menu for the places
 * that belong only to it: the editor, its Domains, SEO and Settings. On a
 * phone the controls sit on the name's line and the address has the whole
 * width of the line under it; on a computer they sit at the row's end, as
 * before. scripts/check-settings-addresses measures both.
 */
import { useMemo, useState } from "react"
import Link from "next/link"
import { Check, ChevronDown, Copy, ExternalLink } from "lucide-react"
import { copyText } from "@/lib/platform/copy-text"
import { openExternal } from "@/lib/native-bridge"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { getLinksShareUrl, getLinksUrlDisplay, getStoreShareUrl, getStoreUrlDisplay, getWebsiteUrl, getWebsiteUrlDisplay } from "@/lib/url-helpers"
import { cn } from "@/lib/utils"

export type SettingsWebsite = { installId: string | null; name: string | null; handle: string | null }

/*
  44px square on a phone and 32px on a computer. On a phone the controls
  share the name's line, so -my-3 lets a 44px target sit on a 20px line
  without making the row taller: the extra reaches into the row's own
  padding and the address line's right end, where nothing else is pressed.
*/
const ICON_BUTTON =
  "inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#6b7280] outline-none transition-colors duration-100 hover:bg-[#f3f4f6] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:h-8 sm:w-8"
/* One width for Edit, Edit with its menu, and Set up, so the icons beside them line up down the list; never wrapped, it grows instead. */
const TEXT_BUTTON =
  "inline-flex h-11 min-w-[60px] shrink-0 cursor-pointer items-center gap-0.5 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium text-[#1a1a2e] outline-none transition-colors duration-100 hover:bg-[#f3f4f6] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:h-8 sm:min-w-14 sm:px-2"

function Row({
  label,
  display,
  url,
  children,
}: {
  label: string
  display: string
  url: string | null
  children: React.ReactNode
}) {
  const [copied, setCopied] = useState(false)
  return (
    <div
      data-address-row={label}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 py-3 last:pb-0 sm:py-2.5"
    >
      <p className="col-start-1 row-start-1 truncate text-[13px] font-medium leading-5 text-[#1a1a2e]">{label}</p>
      {/* The address: the whole line on a phone, cut at its end only when it cannot fit. */}
      <p
        data-address-display=""
        title={display}
        className={cn(
          "col-span-2 row-start-2 truncate text-[13px] leading-5 sm:col-span-1",
          url ? "text-[#4b5563]" : "text-[#9ca3af]",
        )}
      >
        {display}
      </p>
      <div className="col-start-2 row-start-1 -my-3 -mr-2.5 flex items-center sm:row-span-2 sm:my-0 sm:-mr-1.5 sm:gap-0.5">
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

/**
 * The website's address: its own domain once one is connected and live
 * (the Domains list read on load, as the share pill reads it), otherwise the
 * name it answers to under storelib.com.
 */
export function websiteAddress(siteName: string, domain: string | null): { display: string; url: string } {
  return domain ? { display: domain, url: `https://${domain}` } : { display: getWebsiteUrlDisplay(siteName), url: getWebsiteUrl(siteName) }
}

export function AddressList({
  username,
  website,
  websiteDomain = null,
}: {
  username: string
  website: SettingsWebsite | null
  /** The website's connected domain, or null. */
  websiteDomain?: string | null
}) {
  const name = username.trim().toLowerCase()
  const siteName = (website?.handle || name).toLowerCase()
  const editor = website?.installId ? `/website-builder/editor/${website.installId}` : null
  const site = editor ? websiteAddress(siteName, websiteDomain) : null
  /* Built once per site, so the menu is not rebuilt on every keystroke in the username field. */
  const siteMenu = useMemo<ActionMenuItem[]>(
    () =>
      editor
        ? [
            { label: "Edit website", href: editor },
            { label: "Domains", href: `${editor}?settings=domains`, separatorBefore: true },
            { label: "SEO", href: `${editor}?settings=seo` },
            { label: "Settings", href: `${editor}?settings=general` },
          ]
        : [],
    [editor],
  )
  return (
    <div data-address-list="" className="divide-y divide-[#f0f1f3] border-t border-[#f0f1f3]">
      <Row label="Creator page" display={name ? getStoreUrlDisplay(name) : "Choose a username"} url={name ? getStoreShareUrl(name) : null}>
        <Link href="/creator-page" className={TEXT_BUTTON}>
          Edit
        </Link>
      </Row>
      <Row label="OnePage" display={name ? getLinksUrlDisplay(name) : "Choose a username"} url={name ? getLinksShareUrl(name) : null}>
        <Link href="/app/onepage" className={TEXT_BUTTON}>
          Edit
        </Link>
      </Row>
      <Row label="Website" display={site ? site.display : "Not published yet"} url={site ? site.url : null}>
        {editor ? (
          <ResponsiveActionMenu
            title="Website"
            menuWidth="w-48"
            items={siteMenu}
            trigger={
              <button type="button" data-address-menu="" aria-label="Edit the website" className={TEXT_BUTTON}>
                Edit
                <ChevronDown className="h-3.5 w-3.5 text-[#6b7280]" aria-hidden />
              </button>
            }
          />
        ) : (
          <Link href="/app/website-builder" className={TEXT_BUTTON}>
            Set up
          </Link>
        )}
      </Row>
    </div>
  )
}

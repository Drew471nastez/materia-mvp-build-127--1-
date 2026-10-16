"use client"

/**
 * ===========================================================================
 *  YOUR WEBSITE AND SOCIAL PAGES (round 33)
 * ===========================================================================
 * The owner: "make adding easy: pick a network with brand icons, accept a
 * full URL or @username and normalize; show them as icons on the About
 * page." Before, a link was a label and an address typed by hand, and it
 * was shown nowhere.
 *
 * Pick the network from a grid of its marks (the ones already used go
 * quiet), then type what you have: "@clay", "clay", "instagram.com/clay" and
 * the full address all become https://www.instagram.com/clay
 * (lib/communities/social-links.ts normalizeSocialLink). A line that cannot
 * be an address for that network says why under it, and is left off the
 * page until it is fixed; Save waits for it.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import type { CommunityLink } from "@/lib/communities/types"
import { MAX_LINKS } from "@/lib/communities/limits"
import { SOCIAL_NETWORKS, displayOfLink, networkHint, networkName, networkOfUrl, normalizeSocialLink, type SocialNetwork } from "@/lib/communities/social-links"
import { SocialIcon } from "@/components/community/public/social-icons"
import { RemoveButton, field } from "../parts"

interface Row {
  id: number
  network: SocialNetwork
  text: string
}

let nextId = 1

export function rowsOfLinks(links: CommunityLink[]): Row[] {
  return links.map((l) => {
    const network = networkOfUrl(l.url)
    return { id: nextId++, network, text: network === "website" ? displayOfLink(network, l.url) : displayOfLink(network, l.url) }
  })
}

function linksOfRows(rows: Row[]): { links: CommunityLink[]; invalid: number } {
  const links: CommunityLink[] = []
  let invalid = 0
  for (const r of rows) {
    if (!r.text.trim()) continue
    const n = normalizeSocialLink(r.network, r.text)
    if (!n.ok) {
      invalid++
      continue
    }
    links.push({ label: r.network === "website" ? new URL(n.url).hostname.replace(/^www\./, "") : networkName(r.network), url: n.url })
  }
  return { links, invalid }
}

export function LinksEditor({ links, onChange }: { links: CommunityLink[]; onChange: (links: CommunityLink[], invalid: number) => void }) {
  const [rows, setRows] = React.useState<Row[]>(() => rowsOfLinks(links))
  const [touched, setTouched] = React.useState<Set<number>>(() => new Set())
  const fresh = React.useRef<number | null>(null)
  const inputs = React.useRef(new Map<number, HTMLInputElement>())
  /* A reset from outside (Cancel): the rows follow the links they were made from. */
  const sent = React.useRef(JSON.stringify(links))
  React.useEffect(() => {
    const now = JSON.stringify(links)
    if (now === sent.current) return
    sent.current = now
    setRows(rowsOfLinks(links))
    setTouched(new Set())
  }, [links])
  const update = (next: Row[]) => {
    setRows(next)
    const out = linksOfRows(next)
    sent.current = JSON.stringify(out.links)
    onChange(out.links, out.invalid)
  }
  React.useEffect(() => {
    if (fresh.current === null) return
    inputs.current.get(fresh.current)?.focus()
    fresh.current = null
  }, [rows])
  const used = new Set(rows.map((r) => r.network))
  const full = rows.length >= MAX_LINKS
  const add = (network: SocialNetwork) => {
    if (full) return
    const id = nextId++
    fresh.current = id
    update([...rows, { id, network, text: "" }])
  }

  return (
    <div className="space-y-4" data-links-editor="">
      {rows.length ? (
        <ul className="space-y-2.5" data-links-rows={rows.length}>
          {rows.map((r) => {
            const check = r.text.trim() ? normalizeSocialLink(r.network, r.text) : null
            const error = check && !check.ok && touched.has(r.id) ? check.error : null
            return (
              <li key={r.id} data-link-row={r.network}>
                <div className="flex items-center gap-2">
                  <label className={cn("flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg border bg-white pl-3 pr-2 shadow-[0_1px_0_rgba(17,24,39,0.04)] transition-[border-color,box-shadow] focus-within:border-[#1a1a2e]/50 focus-within:shadow-[0_0_0_3px_rgba(26,26,46,0.07)] sm:h-10", error ? "border-[#f0b4ae]" : "border-[#e1e3e7]")}>
                    <SocialIcon network={r.network} className="h-[18px] w-[18px] shrink-0 text-[#1a1a2e]" />
                    <span className="sr-only">{networkName(r.network)}</span>
                    <input
                      ref={(el) => {
                        if (el) inputs.current.set(r.id, el)
                        else inputs.current.delete(r.id)
                      }}
                      value={r.text}
                      onChange={(e) => update(rows.map((x) => (x.id === r.id ? { ...x, text: e.target.value.slice(0, 1000) } : x)))}
                      onBlur={() => setTouched((t) => new Set(t).add(r.id))}
                      placeholder={networkHint(r.network)}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      inputMode="url"
                      className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] sm:text-[14px]"
                      data-link-input={r.network}
                    />
                  </label>
                  <RemoveButton label={tt("Remove {name}", { name: networkName(r.network) })} onClick={() => update(rows.filter((x) => x.id !== r.id))} />
                </div>
                {error ? (
                  <p className="mt-1 pl-1 text-[12.5px] text-[#b42318]" data-link-error="">
                    {error}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}

      <div>
        <p className="mb-2 text-[13px] font-medium text-[#4b5563]">{rows.length ? tt("Add another") : tt("Pick where people can find you")}</p>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 lg:grid-cols-4" role="group" aria-label={tt("Add a link")} data-link-networks="">
          {SOCIAL_NETWORKS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => add(n)}
              disabled={full}
              data-link-network={n}
              data-link-used={used.has(n) ? "" : undefined}
              className={cn(
                "flex h-[60px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-[#eceef1] bg-white px-1 text-[11.5px] font-medium outline-none transition-[background-color,border-color,color] duration-150 hover:border-[#d9dce1] hover:bg-[#f8f9fa] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 active:bg-[#f1f2f4] disabled:cursor-not-allowed disabled:opacity-50 [-webkit-tap-highlight-color:transparent]",
                used.has(n) ? "text-[#9ca3af]" : "text-[#1a1a2e]",
              )}
            >
              <SocialIcon network={n} className="h-[18px] w-[18px]" />
              <span className="max-w-full truncate">{n === "website" ? tt("Website") : networkName(n)}</span>
            </button>
          ))}
        </div>
        {full ? <p className="mt-2 text-[12.5px] text-[#6b7280]">{tt("Up to {maxLinks} links.", { maxLinks: MAX_LINKS })}</p> : null}
      </div>
    </div>
  )
}

"use client"

/**
 * ===========================================================================
 *  MEMBER LINKS (round 26)
 * ===========================================================================
 * The owner: "up to 4 links: shortcuts to external websites, Storelib
 * products, courses, resources, services. Add, edit name, edit destination,
 * reorder, hide/show, delete, optional icon, click tracking, validation and
 * safe URL handling. Visible only to community members."
 *
 * One row a link: its icon (a small grid of marks opens under the row), its
 * name, its address, then Up, Down, Hide and Remove, and how many times
 * members opened it when that is counted. The address is checked as it is
 * typed (lib/communities/member-links.ts memberLinkUrl) and said under the
 * row once the field is left; Save waits for it. A hidden link stays saved
 * and comes back with Show. None of this is drawn in the preview: the page
 * there is the public one, which never has them.
 */
import * as React from "react"
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { MEMBER_LINKS_MAX, MEMBER_LINK_ICONS, MEMBER_LINK_LABEL_MAX, memberLinkUrl, newMemberLinkId, type MemberLink, type MemberLinkIcon as IconName, type MemberLinkUrlError } from "@/lib/communities/member-links"
import { MemberLinkIcon } from "@/components/community/member-link-icon"
import { RemoveButton, buttonSecondary, field } from "../parts"

const ICON_NAME: Record<IconName, () => string> = {
  link: () => tt("Link"),
  globe: () => tt("Website"),
  "shopping-bag": () => tt("Shop"),
  "book-open": () => tt("Guide"),
  "graduation-cap": () => tt("Course"),
  calendar: () => tt("Calendar"),
  video: () => tt("Video"),
  "file-text": () => tt("Document"),
  "message-circle": () => tt("Chat"),
  headphones: () => tt("Audio"),
  gift: () => tt("Gift"),
  star: () => tt("Star"),
}

const small = "inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-[#4b5563] outline-none transition-colors duration-100 hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent sm:h-8 sm:min-w-8 [-webkit-tap-highlight-color:transparent]"

export function MemberLinksEditor({ links, onChange, clicks, ready }: { links: MemberLink[]; onChange: (links: MemberLink[]) => void; clicks?: Record<string, number> | null; ready: boolean }) {
  const [touched, setTouched] = React.useState<Set<string>>(() => new Set())
  const [picking, setPicking] = React.useState<string | null>(null)
  const fresh = React.useRef<string | null>(null)
  const names = React.useRef(new Map<string, HTMLInputElement>())
  React.useEffect(() => {
    if (!fresh.current) return
    names.current.get(fresh.current)?.focus()
    fresh.current = null
  }, [links])

  if (!ready) {
    return (
      <p className="rounded-xl bg-[#f8f9fa] px-3.5 py-3 text-[13px] leading-5 text-[#6b7280]" data-member-links-waiting="">
        {tt("Member links are waiting for a Storelib update. Everything else on this page saves as usual.")}
      </p>
    )
  }

  const put = (id: string, patch: Partial<MemberLink>) => onChange(links.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const move = (i: number, by: -1 | 1) => {
    const j = i + by
    if (j < 0 || j >= links.length) return
    const next = links.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const add = () => {
    if (links.length >= MEMBER_LINKS_MAX) return
    const id = newMemberLinkId()
    fresh.current = id
    onChange([...links, { id, label: "", url: "", icon: null, hidden: false }])
  }

  return (
    <div className="space-y-3" data-member-links-editor="">
      {links.length ? (
        <ol className="space-y-2.5" data-member-links-rows={links.length}>
          {links.map((l, i) => {
            const shown = touched.has(l.id)
            const url = l.url.trim() ? memberLinkUrl(l.url) : null
            const urlError = shown ? (!l.url.trim() ? tt("Add an address.") : url && !url.ok ? addressError(url.code) : null) : null
            const nameError = shown && !l.label.trim() ? tt("Give the link a name.") : null
            const count = clicks?.[l.id]
            return (
              <li key={l.id} className={cn("rounded-xl border bg-white p-2.5 sm:p-3", l.hidden ? "border-dashed border-[#d9dce1]" : "border-[#e5e7eb]")} data-member-link-row={l.id} data-member-link-hidden={l.hidden ? "" : undefined}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPicking((p) => (p === l.id ? null : l.id))}
                    aria-expanded={picking === l.id}
                    aria-label={tt("Icon: {name}", { name: l.icon ? ICON_NAME[l.icon]() : tt("None") })}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[#e1e3e7] bg-white text-[#1a1a2e] outline-none transition-colors duration-100 hover:border-[#c9ccd2] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:h-10 sm:w-10"
                    data-member-link-icon-button=""
                  >
                    <MemberLinkIcon name={l.icon} className={cn("h-[18px] w-[18px]", !l.icon && "text-[#9ca3af]")} />
                  </button>
                  <label className="sr-only" htmlFor={`ml-name-${l.id}`}>
                    {tt("Link {n} name", { n: i + 1 })}
                  </label>
                  <input
                    id={`ml-name-${l.id}`}
                    ref={(el) => {
                      if (el) names.current.set(l.id, el)
                      else names.current.delete(l.id)
                    }}
                    value={l.label}
                    onChange={(e) => put(l.id, { label: e.target.value.slice(0, MEMBER_LINK_LABEL_MAX) })}
                    onBlur={() => setTouched((t) => new Set(t).add(l.id))}
                    placeholder={tt("Name, like Start here")}
                    className={cn(field, "h-11 min-w-0 flex-1 sm:h-10", nameError && "border-[#f0b4ae]")}
                    autoComplete="off"
                    data-member-link-name=""
                  />
                </div>
                {picking === l.id ? (
                  <div className="mt-2 grid grid-cols-7 gap-1 rounded-lg bg-[#f8f9fa] p-1.5" role="radiogroup" aria-label={tt("Icon")} data-member-link-icons="">
                    <IconChoice on={l.icon === null} label={tt("None")} onPick={() => (put(l.id, { icon: null }), setPicking(null))}>
                      <span aria-hidden className="text-[11px] font-medium text-[#6b7280]">{tt("None")}</span>
                    </IconChoice>
                    {MEMBER_LINK_ICONS.map((name) => (
                      <IconChoice key={name} on={l.icon === name} label={ICON_NAME[name]()} onPick={() => (put(l.id, { icon: name }), setPicking(null))}>
                        <MemberLinkIcon name={name} className="h-[17px] w-[17px]" />
                      </IconChoice>
                    ))}
                  </div>
                ) : null}
                <label className="sr-only" htmlFor={`ml-url-${l.id}`}>
                  {tt("Link {n} address", { n: i + 1 })}
                </label>
                <input
                  id={`ml-url-${l.id}`}
                  value={l.url}
                  onChange={(e) => put(l.id, { url: e.target.value.slice(0, 2000) })}
                  onBlur={() => setTouched((t) => new Set(t).add(l.id))}
                  placeholder={tt("https://… or a Storelib page, like /learn")}
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={cn(field, "mt-2 h-11 sm:h-10", urlError && "border-[#f0b4ae]")}
                  data-member-link-url=""
                />
                {nameError || urlError ? (
                  <p className="mt-1.5 pl-0.5 text-[12.5px] leading-snug text-[#b42318]" data-member-link-error="">
                    {nameError ?? urlError}
                  </p>
                ) : null}
                <div className="mt-1.5 flex items-center gap-0.5">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={small} aria-label={tt("Move {name} up", { name: l.label || tt("link {n}", { n: i + 1 }) })} data-member-link-up="">
                    <ArrowUp aria-hidden className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === links.length - 1} className={small} aria-label={tt("Move {name} down", { name: l.label || tt("link {n}", { n: i + 1 }) })} data-member-link-down="">
                    <ArrowDown aria-hidden className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => put(l.id, { hidden: !l.hidden })} aria-pressed={l.hidden} className={small} data-member-link-toggle="">
                    {l.hidden ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
                    {l.hidden ? tt("Hidden") : tt("Shown")}
                  </button>
                  <span className="min-w-0 flex-1 truncate pl-1 text-right text-[12.5px] tabular-nums text-[#9ca3af]" data-member-link-clicks={count ?? ""}>
                    {typeof count === "number" ? tt("{n, plural, one {# click} other {# clicks}}", { n: count }) : ""}
                  </span>
                  <RemoveButton label={tt("Remove {name}", { name: l.label || tt("link {n}", { n: i + 1 }) })} onClick={() => onChange(links.filter((x) => x.id !== l.id))} />
                </div>
              </li>
            )
          })}
        </ol>
      ) : null}
      <div className="flex items-center gap-3">
        <button type="button" onClick={add} disabled={links.length >= MEMBER_LINKS_MAX} className={cn(buttonSecondary, "disabled:cursor-not-allowed disabled:opacity-50")} data-member-link-add="">
          <Plus aria-hidden className="h-4 w-4" />
          {tt("Add a link")}
        </button>
        <span className="text-[12.5px] tabular-nums text-[#9ca3af]">
          {tt("{n} of {max}", { n: links.length, max: MEMBER_LINKS_MAX })}
        </span>
      </div>
    </div>
  )
}

function IconChoice({ on, label, onPick, children }: { on: boolean; label: string; onPick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={onPick}
      className={cn("grid h-10 min-w-0 place-items-center rounded-md text-[#1a1a2e] outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:h-9", on ? "bg-white shadow-[0_0_0_1.5px_#1a1a2e]" : "hover:bg-white")}
    >
      {children}
    </button>
  )
}

/** The address check's reasons, in the creator's language (lib/communities/member-links.ts words them in English for the server). */
function addressError(code: MemberLinkUrlError): string {
  switch (code) {
    case "empty":
      return tt("Add an address.")
    case "spaces":
      return tt("An address has no spaces.")
    case "relative":
      return tt("Start with https:// or with one / for a page on Storelib.")
    case "scheme":
      return tt("Only web addresses (https://) can be links.")
    case "host":
      return tt("That address has no website in it.")
    case "password":
      return tt("An address with a password in it cannot be a link.")
    case "long":
      return tt("That address is too long.")
    case "format":
      return tt("Use a full address, like https://example.com, or a page on Storelib, like /learn.")
    case "invalid":
      return tt("That is not an address.")
  }
}

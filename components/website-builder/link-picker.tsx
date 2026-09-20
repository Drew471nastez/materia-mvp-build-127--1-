"use client"

import * as React from "react"
import { Check, ChevronDown, ExternalLink, FileText, Link2, Package, Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { FieldPopover, FIELD_TRIGGER } from "@/components/website-builder/field-popover"

/**
 * ===========================================================================
 *  CHOOSING WHERE A LINK GOES
 * ===========================================================================
 * A link field was a bare text box, so pointing a button at your own shop
 * meant knowing that the answer is the string "/shop", and pointing one at a
 * product meant knowing it is "/products/" and then the slug — which is not
 * written down anywhere the person filling the field can see. The result is
 * either a guess or a "#".
 *
 * The site's own pages and its products are listed here,
 * because the editor already has all three: it loads them for the page
 * browser. Anything else is still typeable, and an address that is not one of
 * these is shown as what it is rather than silently not matching.
 */

export interface LinkTarget {
  /** What goes in the field. */
  href: string
  label: string
  kind: "page" | "product"
}

export function LinkPicker({
  value,
  onChange,
  targets,
  placeholder,
}: {
  value: string
  onChange: (href: string) => void
  targets: LinkTarget[]
  placeholder?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  /** The custom box starts holding whatever is there, so it can be edited. */
  const [custom, setCustom] = React.useState(value)
  React.useEffect(() => setCustom(value), [value])

  const known = React.useMemo(() => targets.find((t) => t.href === value) ?? null, [targets, value])

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return targets
    return targets.filter((t) => t.label.toLowerCase().includes(q) || t.href.toLowerCase().includes(q))
  }, [targets, query])

  const groups: { kind: LinkTarget["kind"]; label: string; icon: React.ReactNode }[] = [
    { kind: "page", label: "Pages", icon: <FileText className="h-3.5 w-3.5" strokeWidth={1.75} /> },
    { kind: "product", label: "Products", icon: <Package className="h-3.5 w-3.5" strokeWidth={1.75} /> },
  ]

  const pick = (href: string) => {
    onChange(href)
    setOpen(false)
    setQuery("")
  }

  const external = /^(https?:|mailto:|tel:)/i.test(value)

  return (
    <FieldPopover
      title="Link"
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery("")
      }}
      trigger={
        <button type="button" className={FIELD_TRIGGER} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="shrink-0 text-muted-foreground">
            {external ? <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Link2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
          </span>
          <span className={cn("min-w-0 flex-1 truncate", value ? "text-foreground" : "text-muted-foreground")}>
            {known ? known.label : value || placeholder || "Nothing linked"}
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-[rotate] duration-150", open && "rotate-180")} />
        </button>
      }
    >
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pages and products"
          className="h-6 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div data-sheet-scroll className="wb-slim-scroll max-h-[240px] overflow-y-auto overscroll-contain p-1.5">
        {groups.map((group) => {
          const rows = matches.filter((t) => t.kind === group.kind)
          if (rows.length === 0) return null
          return (
            <div key={group.kind} className="mb-2 last:mb-0">
              <p className="mb-1 flex items-center gap-1.5 px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.icon}
                {group.label}
              </p>
              {rows.map((t) => (
                <button
                  key={`${t.kind}:${t.href}`}
                  type="button"
                  onClick={() => pick(t.href)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted",
                    value === t.href && "bg-muted",
                  )}
                >
                  {/**
                    * THE NAME, NOT THE ADDRESS.
                    *
                    * Every row printed its own href beside it, so choosing a
                    * product meant reading past
                    * "/products/geanta-guess-reptila-2g7yyk" to find the
                    * name, and a long slug squeezed the name down to "F." or
                    * "Gea…". Nobody picks a link by its slug: they pick the
                    * page, and the address is what this control is FOR
                    * producing. It is still there for anyone who wants it,
                    * as the row's title.
                    */}
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground" title={t.href}>
                    {t.label}
                  </span>
                  {value === t.href && <Check className="h-3.5 w-3.5 shrink-0 text-foreground/70" strokeWidth={2.2} />}
                </button>
              ))}
            </div>
          )
        })}

        {matches.length === 0 && (
          <p className="px-2 py-5 text-center text-[13px] text-muted-foreground">
            Nothing here matches. Use the box below for any other address.
          </p>
        )}
      </div>

      {/* Anything at all: another site, an email, a phone number. Applied on
          Enter or on blur rather than per keystroke, so a half-typed address
          is never briefly the answer. */}
      <div className="border-t border-border p-2">
        <label className="mb-1 block px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Or any address
        </label>
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return
            e.preventDefault()
            pick(custom.trim())
          }}
          onBlur={() => {
            const next = custom.trim()
            if (next !== value) onChange(next)
          }}
          placeholder="https://example.com, /about, mailto:hi@…"
          className="h-8 w-full rounded-lg border border-border bg-background px-2 text-[13px] outline-none transition-colors focus:border-neutral-400"
        />
      </div>
    </FieldPopover>
  )
}

/**
 * The site's own pages and products, supplied once by the editor
 * and read by every link field.
 *
 * A context rather than a prop threaded through eight call sites and two
 * levels of renderer: the list is the same for every field on the page, it
 * changes only when the editor loads it, and a field that forgets to pass it
 * on would silently be a plain text box again — which is the bug this
 * replaces. The default is empty, so a FieldEditor used outside the editor
 * still renders, with the custom-address box and nothing to pick from.
 */
const LinkTargetsContext = React.createContext<LinkTarget[]>([])

export function LinkTargetsProvider({ targets, children }: { targets: LinkTarget[]; children: React.ReactNode }) {
  return <LinkTargetsContext.Provider value={targets}>{children}</LinkTargetsContext.Provider>
}

export function useLinkTargets(): LinkTarget[] {
  return React.useContext(LinkTargetsContext)
}

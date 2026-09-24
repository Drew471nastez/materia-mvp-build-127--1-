"use client"

import * as React from "react"
import { Check, ChevronDown, ExternalLink, FileText, Link2, Mail, Package, Phone } from "lucide-react"

import { cn } from "@/lib/utils"
import { FieldPopover, usePhoneLayout } from "@/components/website-builder/field-popover"
import { linkKind, normalizeLinkAddress } from "@/lib/website-builder/link-address"

/**
 * ===========================================================================
 *  WHERE A LINK GOES: TYPE IT, OR PICK IT
 * ===========================================================================
 * The field IS the address. Type or paste one and that is the link: it is
 * tidied when you press Enter or leave the field (https:// added, an email
 * made a mailto:), and refused with a reason if it cannot be a link at all,
 * `javascript:` included. See lib/website-builder/link-address.ts.
 *
 * The chevron, or putting the cursor in the field, opens the site's own pages
 * and products, because pointing a button at your own shop should not mean
 * knowing the answer is "/products". Typing narrows that list; arrows move
 * through it, Enter picks, Escape closes. There is no "custom address" row in
 * it: the field above it already is one.
 *
 * A picked page is stored exactly as it always was, as its path. At rest the
 * field shows the page's NAME ("Shop") rather than the path, and the path
 * comes back the moment you put the cursor in it to edit.
 *
 * ON A PHONE the cursor does not open the list: the keyboard would come up
 * over it (the "I cannot select anything" report). The chevron opens it
 * without the keyboard, in the flow of the sheet, and typing opens it too.
 */

export interface LinkTarget {
  /** What goes in the field. */
  href: string
  label: string
  kind: "page" | "product"
}

const GROUPS: { kind: LinkTarget["kind"]; label: string }[] = [
  { kind: "page", label: "Pages" },
  { kind: "product", label: "Products" },
]

function KindMark({ href, known }: { href: string; known: LinkTarget | null }) {
  const cls = "h-3.5 w-3.5"
  if (known) return known.kind === "product" ? <Package className={cls} strokeWidth={1.75} /> : <FileText className={cls} strokeWidth={1.75} />
  const kind = linkKind(href)
  if (kind === "web") return <ExternalLink className={cls} strokeWidth={1.75} />
  if (kind === "email") return <Mail className={cls} strokeWidth={1.75} />
  if (kind === "phone") return <Phone className={cls} strokeWidth={1.75} />
  return <Link2 className={cls} strokeWidth={1.75} />
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
  const phone = usePhoneLayout()
  const listId = React.useId()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  const [open, setOpen] = React.useState(false)
  const [focused, setFocused] = React.useState(false)
  /** What is in the box while the cursor is in it. */
  const [draft, setDraft] = React.useState(value)
  /** Typed since the cursor arrived. Until then the list is the whole list. */
  const [typed, setTyped] = React.useState(false)
  const [active, setActive] = React.useState(-1)
  const [error, setError] = React.useState<string | null>(null)

  const known = React.useMemo(() => targets.find((t) => t.href === value) ?? null, [targets, value])

  const rows = React.useMemo(() => {
    const q = typed ? draft.trim().toLowerCase() : ""
    const matched = q ? targets.filter((t) => t.label.toLowerCase().includes(q) || t.href.toLowerCase().includes(q)) : targets
    /* In the order they are drawn, so the arrows walk the list as it reads. */
    return GROUPS.flatMap((g) => matched.filter((t) => t.kind === g.kind))
  }, [targets, typed, draft])

  const showList = open && rows.length > 0

  /**
   * A LINKED PAGE IS SELECTED WHOLE when the cursor arrives, so typing
   * replaces it: what was on screen was "Shop", and a caret dropped into the
   * "/products" that replaces it would have typing land in the middle of a
   * path nobody was looking at. An address is left as a normal text box, with
   * the caret where it was put, because editing part of one is the point.
   * Selected after the render that swaps the name for the path, since
   * setting a field's value moves its caret to the end.
   */
  const selectAll = React.useRef(false)
  React.useLayoutEffect(() => {
    if (!focused || !selectAll.current) return
    selectAll.current = false
    inputRef.current?.select()
  }, [focused])

  const close = React.useCallback(() => {
    setOpen(false)
    setActive(-1)
  }, [])

  /** A picked page or product. Stored as its path, exactly as before. */
  const pick = (t: LinkTarget) => {
    setError(null)
    setDraft(t.href)
    setTyped(false)
    close()
    if (t.href !== value) onChange(t.href)
    /* At a thumb, done means the keyboard goes; at a keyboard, the cursor stays. */
    if (phone) inputRef.current?.blur()
  }

  /** Whatever was typed, tidied and checked. A refusal keeps the old link. */
  const commit = () => {
    if (!typed) return
    const text = draft.trim()
    const named = text ? targets.find((t) => t.label.toLowerCase() === text.toLowerCase()) : undefined
    if (named) return pick(named)
    const r = normalizeLinkAddress(text)
    if (r.ok === false) {
      setError(r.reason)
      setDraft(value)
      setTyped(false)
      return
    }
    setError(null)
    setDraft(r.href)
    setTyped(false)
    if (r.href !== value) onChange(r.href)
  }

  /* The active row, kept in view inside the list and nowhere else. */
  React.useEffect(() => {
    if (active < 0) return
    const list = listRef.current
    const row = list?.querySelector<HTMLElement>(`[data-row="${active}"]`)
    if (!list || !row) return
    const top = row.offsetTop
    const bottom = top + row.offsetHeight
    if (top < list.scrollTop) list.scrollTop = top - 4
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 4
  }, [active])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        setActive(e.key === "ArrowDown" ? 0 : rows.length - 1)
        return
      }
      if (rows.length === 0) return
      setActive((i) => (e.key === "ArrowDown" ? (i + 1) % rows.length : i <= 0 ? rows.length - 1 : i - 1))
      return
    }
    if (e.key === "Enter") {
      e.preventDefault()
      if (showList && active >= 0 && rows[active]) pick(rows[active])
      /* Words that are not an address, with the list showing what they match: the first match. */
      else if (showList && typed && rows.length > 0 && !normalizeLinkAddress(draft).ok) pick(rows[0])
      else {
        commit()
        close()
      }
      return
    }
    if (e.key === "Escape" && !open && typed) {
      /* The list is already shut (FieldPopover took the first Escape): this one puts the link back. */
      e.preventDefault()
      setDraft(value)
      setTyped(false)
      setError(null)
    }
  }

  /** What the box shows: the address while editing, the page's name at rest. */
  const shown = focused ? draft : known ? known.label : value

  return (
    <div data-link-picker="">
      <FieldPopover
        open={showList}
        onOpenChange={(next) => {
          if (!next) close()
        }}
        trigger={
          <div
            className={cn(
              "flex h-9 w-full items-center rounded-lg border bg-background text-sm transition-colors",
              error ? "border-red-400" : "border-border hover:border-neutral-400",
              "focus-within:border-neutral-400 focus-within:ring-2 focus-within:ring-neutral-900/10",
            )}
          >
            <span className="flex h-full shrink-0 items-center pl-2.5 pr-2 text-muted-foreground" aria-hidden>
              <KindMark href={focused ? draft : value} known={focused ? null : known} />
            </span>
            <input
              ref={inputRef}
              type="text"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              role="combobox"
              aria-expanded={showList}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
              aria-invalid={error ? true : undefined}
              title={known && !focused ? known.href : undefined}
              value={shown}
              placeholder={placeholder || "Type an address or pick a page"}
              onMouseDown={(e) => {
                /* A press would drop a caret into the name that is about to
                   become a path. Focus it here instead, and select it whole. */
                if (focused || !known) return
                e.preventDefault()
                selectAll.current = true
                e.currentTarget.focus({ preventScroll: true })
              }}
              onFocus={() => {
                if (known) selectAll.current = true
                setFocused(true)
                setDraft(value)
                setTyped(false)
                if (!phone) setOpen(true)
              }}
              onBlur={(e) => {
                /* Moving to the chevron or the list is not leaving. */
                if (e.relatedTarget instanceof Node && e.currentTarget.closest("[data-link-picker]")?.contains(e.relatedTarget)) return
                setFocused(false)
                commit()
                close()
              }}
              onChange={(e) => {
                setDraft(e.target.value)
                setTyped(true)
                setError(null)
                setActive(-1)
                setOpen(true)
              }}
              onKeyDown={onKeyDown}
              className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label="Pages and products"
              aria-expanded={showList}
              /* Keeps the cursor where it is; a press here is not a blur. */
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (showList) return close()
                setTyped(false)
                setActive(-1)
                setOpen(true)
                /* At a keyboard the cursor goes to the field, selected, so
                   typing searches; at a thumb nothing takes the keyboard. */
                if (!phone && !focused) {
                  selectAll.current = true
                  inputRef.current?.focus({ preventScroll: true })
                }
              }}
              className="flex h-full shrink-0 items-center rounded-r-lg px-2.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-[rotate] duration-150", showList && "rotate-180")} />
            </button>
          </div>
        }
      >
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Pages and products"
          data-sheet-scroll
          className="wb-slim-scroll max-h-[240px] overflow-y-auto overscroll-contain p-1.5"
        >
          {GROUPS.map((group) => {
            const inGroup = rows.filter((t) => t.kind === group.kind)
            if (inGroup.length === 0) return null
            return (
              <div key={group.kind} role="group" aria-label={group.label} className="mb-1.5 last:mb-0">
                <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p>
                {inGroup.map((t) => {
                  const i = rows.indexOf(t)
                  const current = value === t.href
                  return (
                    <div
                      key={`${t.kind}:${t.href}`}
                      id={`${listId}-${i}`}
                      data-row={i}
                      role="option"
                      aria-selected={i === active}
                      /* Keeps the cursor in the field, so picking is not first a blur that saves what was typed. */
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseMove={() => {
                        if (active !== i) setActive(i)
                      }}
                      onClick={() => pick(t)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                        i === active ? "bg-muted" : current ? "bg-muted/60" : "",
                      )}
                    >
                      {/**
                        * THE NAME, NOT THE ADDRESS. Nobody picks a link by its
                        * slug; the address is still there as the row's title.
                        */}
                      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground" title={t.href}>
                        {t.label}
                      </span>
                      {current && <Check className="h-3.5 w-3.5 shrink-0 text-foreground/70" strokeWidth={2.2} aria-label="Linked now" />}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </FieldPopover>
      {error && (
        <p role="alert" className="mt-1.5 text-[12px] leading-snug text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * The site's own pages and products, supplied once by the editor
 * and read by every link field.
 *
 * A context rather than a prop threaded through eight call sites and two
 * levels of renderer: the list is the same for every field on the page, it
 * changes only when the editor loads it, and a field that forgets to pass it
 * on would silently be a plain text box again. The default is empty, so a
 * FieldEditor used outside the editor still renders, as the address box with
 * nothing to pick from.
 */
const LinkTargetsContext = React.createContext<LinkTarget[]>([])

export function LinkTargetsProvider({ targets, children }: { targets: LinkTarget[]; children: React.ReactNode }) {
  return <LinkTargetsContext.Provider value={targets}>{children}</LinkTargetsContext.Provider>
}

export function useLinkTargets(): LinkTarget[] {
  return React.useContext(LinkTargetsContext)
}

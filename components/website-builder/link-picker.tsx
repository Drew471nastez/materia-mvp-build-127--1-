"use client"

import * as React from "react"
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  House,
  Link2,
  Mail,
  Package,
  Phone,
  ScrollText,
  Search,
  Store,
  UserRound,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { OverlayRail } from "@/components/storefront/overlay-scroll"
import { FieldPopover, usePhoneLayout } from "@/components/website-builder/field-popover"
import { linkKind, normalizeLinkAddress } from "@/lib/website-builder/link-address"
import {
  linkCategoryOf,
  linkMenu,
  picksDirectly,
  resultCount,
  searchLinkTargets,
  type LinkCategoryKey,
  type LinkMenuEntry,
} from "@/lib/website-builder/link-menu"

/**
 * ===========================================================================
 *  WHERE A LINK GOES: TYPE IT, OR PICK IT
 * ===========================================================================
 * The field IS the address. Type or paste one and that is the link: it is
 * tidied when you press Enter or leave the field (https:// added, an email
 * made a mailto:), and refused with a reason if it cannot be a link at all,
 * `javascript:` included. See lib/website-builder/link-address.ts.
 *
 * The chevron, or putting the cursor in the field, opens the site's own
 * places the way Shopify's link picker does: a short first list of kinds
 * (Home, Shop, Products, Pages, Customer accounts, Policies, Search, each
 * with its mark, see lib/website-builder/link-menu.ts), where Home, Shop and
 * Search pick straight away and the others open onto their own list, with
 * Back at the top and how many there are on the right. Typing looks through
 * everything at once. Arrows move, Enter picks or opens, Escape goes back a
 * list and then closes. There is no "custom address" row in it: the field
 * above it already is one.
 *
 * At a computer the list hangs from the field, under it or over it, and
 * follows it as the sidebar scrolls (FieldPopover's `float`); nothing in the
 * sidebar moves when it opens.
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
  /** A product's picture, drawn small beside its name. */
  image?: string
}

/** Each kind of place's mark, in the first list and beside every row of its own. */
const CATEGORY_ICON: Record<LinkCategoryKey, LucideIcon> = {
  home: House,
  shop: Store,
  products: Package,
  pages: FileText,
  accounts: UserRound,
  policies: ScrollText,
  search: Search,
}

function KindMark({ href, known }: { href: string; known: LinkTarget | null }) {
  const cls = "h-3.5 w-3.5"
  if (known) {
    const Icon = CATEGORY_ICON[linkCategoryOf(known)]
    return <Icon className={cls} strokeWidth={1.75} />
  }
  const kind = linkKind(href)
  if (kind === "web") return <ExternalLink className={cls} strokeWidth={1.75} />
  if (kind === "email") return <Mail className={cls} strokeWidth={1.75} />
  if (kind === "phone") return <Phone className={cls} strokeWidth={1.75} />
  return <Link2 className={cls} strokeWidth={1.75} />
}

/** A row's 24px mark: a product's picture when it has one, or its kind's icon on a soft square. */
function RowMark({ icon: Icon, image }: { icon: LucideIcon; image?: string }) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a 24px thumbnail from the creator's own storage, not worth the optimiser
      <img src={image} alt="" loading="lazy" decoding="async" className="h-6 w-6 shrink-0 rounded-md bg-muted object-cover" />
    )
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
    </span>
  )
}

/** One row of whichever list is showing, in the order the arrows walk them. */
type Row =
  | { type: "back"; count: number }
  | { type: "open"; entry: LinkMenuEntry }
  | { type: "pick"; target: LinkTarget; icon: LucideIcon }

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
  /** Typed since the cursor arrived. Until then the list is the first list. */
  const [typed, setTyped] = React.useState(false)
  /** The kind of place whose own list is open, or the first list. */
  const [level, setLevel] = React.useState<LinkCategoryKey | null>(null)
  /** Which way the last move went, so a list slides in from that side. Nothing as it opens. */
  const [dir, setDir] = React.useState<"in" | "out" | null>(null)
  const [active, setActive] = React.useState(-1)
  const [error, setError] = React.useState<string | null>(null)

  const known = React.useMemo(() => targets.find((t) => t.href === value) ?? null, [targets, value])
  const menu = React.useMemo(() => linkMenu(targets), [targets])
  const query = typed ? draft.trim() : ""
  const searching = query.length > 0
  const entry = !searching && level ? (menu.find((e) => e.category.key === level) ?? null) : null

  const rows = React.useMemo<Row[]>(() => {
    if (searching) {
      return searchLinkTargets(targets, query).map((target) => ({ type: "pick", target, icon: CATEGORY_ICON[linkCategoryOf(target)] }))
    }
    if (entry) {
      const icon = CATEGORY_ICON[entry.category.key]
      return [{ type: "back", count: entry.targets.length }, ...entry.targets.map((target) => ({ type: "pick" as const, target, icon }))]
    }
    return menu.map((e) =>
      picksDirectly(e) ? { type: "pick", target: e.targets[0], icon: CATEGORY_ICON[e.category.key] } : { type: "open", entry: e },
    )
  }, [searching, targets, query, entry, menu])

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
    setLevel(null)
    setDir(null)
  }, [])

  /** Into a kind's own list, or back out of it. From the keyboard, the first row of where it lands is active. */
  const goTo = (next: LinkCategoryKey | null, fromKeyboard: boolean) => {
    setLevel(next)
    setDir(next ? "in" : "out")
    if (!fromKeyboard) return setActive(-1)
    if (next) return setActive(1)
    /* Back out: onto the kind just left, so Enter goes straight back in. */
    setActive(Math.max(0, menu.findIndex((e) => e.category.key === level)))
  }
  /** Escape inside a kind's list is Back; at the first list it closes (FieldPopover). */
  const onEscape = React.useCallback(() => {
    if (!level || searching) return false
    setActive(Math.max(0, menu.findIndex((e) => e.category.key === level)))
    setLevel(null)
    setDir("out")
    return true
  }, [level, searching, menu])

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

  const choose = (row: Row, fromKeyboard: boolean) => {
    if (row.type === "pick") pick(row.target)
    else if (row.type === "open") goTo(row.entry.category.key, fromKeyboard)
    else goTo(null, fromKeyboard)
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
    if (!list || !row || !list.contains(row)) return
    const top = row.offsetTop
    const bottom = top + row.offsetHeight
    if (top < list.scrollTop) list.scrollTop = top - 4
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 4
  }, [active])

  /* A new list starts at its top. */
  React.useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0
  }, [level, searching])

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
      if (showList && active >= 0 && rows[active]) choose(rows[active], true)
      /* Words that are not an address, with the list showing what they match: the first match. */
      else if (showList && searching && rows[0]?.type === "pick" && !normalizeLinkAddress(draft).ok) pick(rows[0].target)
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

  const rowH = phone ? "h-11" : "h-9"
  const optionClass = (i: number) =>
    cn(
      "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 text-left transition-colors duration-75",
      rowH,
      i === active ? "bg-muted" : "",
    )

  const pickRow = (row: Extract<Row, { type: "pick" }>, i: number) => {
    const t = row.target
    const current = value === t.href
    return (
      <div
        key={`${t.kind}:${t.href}`}
        id={`${listId}-${i}`}
        data-row={i}
        role="option"
        aria-selected={i === active}
        onMouseMove={() => {
          if (active !== i) setActive(i)
        }}
        onClick={() => pick(t)}
        className={optionClass(i)}
      >
        <RowMark icon={row.icon} image={t.kind === "product" ? t.image : undefined} />
        {/**
          * THE NAME, NOT THE ADDRESS. Nobody picks a link by its
          * slug; the address is still there as the row's title.
          */}
        <span className={cn("min-w-0 flex-1 truncate text-foreground", phone ? "text-[15px]" : "text-[13px]")} title={t.href}>
          {t.label}
        </span>
        {current && <Check className="h-3.5 w-3.5 shrink-0 text-foreground/70" strokeWidth={2.2} aria-label="Linked now" />}
      </div>
    )
  }

  const back = rows[0]?.type === "back" ? rows[0] : null

  return (
    <div data-link-picker="">
      <FieldPopover
        float
        open={showList}
        onOpenChange={(next) => {
          if (!next) close()
        }}
        onEscape={onEscape}
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
                setLevel(null)
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
                setLevel(null)
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
                setLevel(null)
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
        {/**
          * ONE LISTBOX, TWO PARTS: Back, which stays put, and the rows under
          * it, which scroll. A press anywhere in it keeps the cursor in the
          * field, so choosing is never first a blur that saves what was typed.
          */}
        <div
          id={listId}
          role="listbox"
          aria-label={entry ? entry.category.label : "Pages and products"}
          onMouseDown={(e) => e.preventDefault()}
          className="flex min-h-0 flex-col"
        >
          {back && (
            <div
              id={`${listId}-0`}
              data-row={0}
              role="option"
              aria-selected={active === 0}
              onMouseMove={() => {
                if (active !== 0) setActive(0)
              }}
              onClick={() => choose(back, false)}
              className="shrink-0 border-b border-border p-1.5"
            >
              <div className={cn(optionClass(0), "gap-1.5 pl-1.5")}>
                <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                <span className={cn("min-w-0 flex-1 truncate font-medium text-foreground", phone ? "text-[15px]" : "text-[13px]")}>Back</span>
                <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{resultCount(back.count)}</span>
              </div>
            </div>
          )}
          <div className={cn("relative flex min-h-0 flex-col", phone && "max-h-[min(352px,50dvh)]")}>
            <div
              ref={listRef}
              data-float-scroll=""
              data-sheet-scroll=""
              className="cp-overlay-scroll min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-1.5"
            >
              {/* Keyed by the list it is, so a new list comes in with a short fade instead of rows changing in place. */}
              <div key={searching ? "search" : (level ?? "top")} data-dir={searching ? undefined : (dir ?? undefined)} className="wb-link-level">
                {rows.map((row, i) => {
                  if (row.type === "back") return null
                  if (row.type === "pick") return pickRow(row, i)
                  const Icon = CATEGORY_ICON[row.entry.category.key]
                  return (
                    <div
                      key={`open:${row.entry.category.key}`}
                      id={`${listId}-${i}`}
                      data-row={i}
                      role="option"
                      aria-selected={i === active}
                      aria-haspopup="listbox"
                      onMouseMove={() => {
                        if (active !== i) setActive(i)
                      }}
                      onClick={() => choose(row, false)}
                      className={optionClass(i)}
                    >
                      <RowMark icon={Icon} />
                      <span className={cn("min-w-0 flex-1 truncate text-foreground", phone ? "text-[15px]" : "text-[13px]")}>{row.entry.category.label}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
                    </div>
                  )
                })}
              </div>
            </div>
            <OverlayRail scrollerRef={listRef} />
          </div>
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

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
  Rows3,
  ScrollText,
  Search,
  ShoppingBag,
  Store,
  UserRound,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { switchKnob, switchTrack } from "@/components/ui/switch-style"
import { opensNewTab, withNewTab, withoutNewTab } from "@/lib/website-builder/new-tab"
import { OverlayRail } from "@/components/storefront/overlay-scroll"
import { FieldPopover, usePhoneLayout } from "@/components/website-builder/field-popover"
import { linkKind, normalizeLinkAddress } from "@/lib/website-builder/link-address"
import {
  drillsIntoSections,
  linkCategoryOf,
  linkMenu,
  picksDirectly,
  resultCount,
  searchLinkTargets,
  sectionTargetFor,
  type LinkCategoryKey,
  type LinkMenuEntry,
} from "@/lib/website-builder/link-menu"
import { normalizePath, splitSectionHref, type AnchorCandidate } from "@/lib/website-builder/section-anchors"

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
 * SECTIONS. "Sections on this page" lists the open page's sections by the
 * words a visitor reads (their heading, else their name), and the chevron
 * on Home's row or a page's row opens that page's sections. A picked
 * section is stored as `/<page>#section-<instance id>`, which survives a
 * renamed heading, and shown by its name with the section mark. A hash
 * typed by hand (`#pricing`) is shown the same way when it names a section
 * (lib/website-builder/section-anchors.ts), and left as typed when not.
 *
 * ON A PHONE the cursor does not open the list: the keyboard would come up
 * over it (the "I cannot select anything" report). The chevron opens it
 * without the keyboard, in the flow of the sheet, and typing opens it too.
 */

export interface LinkTarget {
  /** What goes in the field. */
  href: string
  label: string
  kind: "page" | "product" | "collection" | "section" | "checkout"
  /** A product's picture, drawn small beside its name. */
  image?: string
  /**
   * A section's facts, for matching a stored hash to it
   * (lib/website-builder/section-anchors.ts): its page's address, or null on
   * a template page, and what the section reads as.
   */
  section?: AnchorCandidate & { page: string | null }
  /** The page a section of ANOTHER page is on, shown before its name. */
  context?: string
}

/**
 * Where section links come from, beside the targets: the address of the
 * page open in the builder (null for a product page, a template for many
 * addresses), and a way to read another page's sections when somebody
 * opens one in the list. The editor supplies it; without it the picker has
 * the open page's sections only.
 */
export interface SectionLinkSource {
  currentPath: string | null
  load?: (pagePath: string) => Promise<LinkTarget[]>
}

const SectionLinkContext = React.createContext<SectionLinkSource>({ currentPath: null })

/** Each kind of place's mark, in the first list and beside every row of its own. */
const CATEGORY_ICON: Record<LinkCategoryKey, LucideIcon> = {
  sections: Rows3,
  home: House,
  shop: Store,
  products: Package,
  checkout: ShoppingBag,
  collections: LayoutGrid,
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

/**
 * THE FIELD, AND WHETHER IT OPENS IN A NEW TAB. The choice travels with the
 * address as a mark at its end (lib/website-builder/new-tab.ts), so every
 * link field and every section that prints a link gets it without a setting
 * of its own. The field works on the address alone; the switch under it
 * puts the mark on and takes it off. Shown once there is a link.
 */
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
  const bare = withoutNewTab(value ?? "")
  const newTab = opensNewTab(value)
  const switchId = React.useId()
  return (
    <div>
      <LinkAddressField value={bare} onChange={(href) => onChange(withNewTab(href, newTab))} targets={targets} placeholder={placeholder} />
      {bare ? (
        <label htmlFor={switchId} data-link-new-tab="" className="mt-2 flex cursor-pointer items-center justify-between gap-3 text-[12.5px] text-muted-foreground">
          Open in a new tab
          <button
            id={switchId}
            type="button"
            role="switch"
            aria-checked={newTab}
            onClick={() => onChange(withNewTab(bare, !newTab))}
            className={cn(switchTrack(newTab), "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#111113]/30 focus-visible:ring-offset-2")}
          >
            <span className={switchKnob(newTab)} />
          </button>
        </label>
      ) : null}
    </div>
  )
}

function LinkAddressField({
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

  /**
   * A PAGE'S OWN SECTIONS, opened from its row. `drill` is the page, and
   * `drillList` its sections: null while another page's are being read.
   */
  const source = React.useContext(SectionLinkContext)
  const [drill, setDrill] = React.useState<LinkTarget | null>(null)
  const [drillList, setDrillList] = React.useState<LinkTarget[] | null>(null)
  const drillRef = React.useRef<LinkTarget | null>(null)
  /** Another page's sections, read so a link to one of them shows its name. */
  const [remote, setRemote] = React.useState<LinkTarget[]>([])
  const here = source.currentPath === null ? null : normalizePath(source.currentPath)

  const known = React.useMemo(
    () =>
      targets.find((t) => t.href === value) ??
      /* A section, by whatever its link says: `#section-<id>`, `/#pricing`, `#ghostwriting`. */
      sectionTargetFor(value, remote.length ? [...targets, ...remote] : targets, source.currentPath),
    [targets, value, remote, source.currentPath],
  )

  /* A link to a section of another page: read that page's sections once, to name it. */
  React.useEffect(() => {
    if (known || !source.load) return
    const split = splitSectionHref(value)
    if (!split || split.path === null || split.path === here) return
    let live = true
    source.load(split.path).then(
      (list) => { if (live) setRemote(list) },
      () => {},
    )
    return () => { live = false }
  }, [value, known, source, here])

  const menu = React.useMemo(() => linkMenu(targets), [targets])
  const query = typed ? draft.trim() : ""
  const searching = query.length > 0
  const entry = !searching && level ? (menu.find((e) => e.category.key === level) ?? null) : null
  /** The rows that open a page's sections: home and the creator's pages, when the editor can read them. */
  const canDrill = (t: LinkTarget) => drillsIntoSections(t) && (!!source.load || (here !== null && normalizePath(t.href) === here))

  const rows = React.useMemo<Row[]>(() => {
    if (searching) {
      return searchLinkTargets(targets, query).map((target) => ({ type: "pick", target, icon: CATEGORY_ICON[linkCategoryOf(target)] }))
    }
    if (drill) {
      const list = drillList ?? []
      return [
        /* No count while another page's sections are on their way. */
        { type: "back", count: drillList === null ? -1 : list.length },
        { type: "pick", target: drill, icon: CATEGORY_ICON[linkCategoryOf(drill)] },
        ...list.map((target) => ({ type: "pick" as const, target, icon: CATEGORY_ICON.sections })),
      ]
    }
    if (entry) {
      const icon = CATEGORY_ICON[entry.category.key]
      return [{ type: "back", count: entry.targets.length }, ...entry.targets.map((target) => ({ type: "pick" as const, target, icon }))]
    }
    return menu.map((e) =>
      picksDirectly(e) ? { type: "pick", target: e.targets[0], icon: CATEGORY_ICON[e.category.key] } : { type: "open", entry: e },
    )
  }, [searching, targets, query, entry, menu, drill, drillList])

  const showList = open && rows.length > 0
  /*
   * ON A PHONE THE LIST IS A SHEET (field-popover.tsx), so it stays open with
   * nothing matching: an address being typed is still something to use. At
   * a computer the panel hangs from the field and shuts when nothing matches.
   */
  const sheet = phone
  const panelOpen = sheet ? open : showList
  /** What was typed, when it is an address that can be used as it is. */
  const typedAddress = typed && draft.trim() ? normalizeLinkAddress(draft.trim()) : null
  const canUseTyped = !!typedAddress && typedAddress.ok === true

  /*
   * A LIST OF ANOTHER LENGTH GROWS AND SHRINKS TO IT, it does not snap. Going
   * into Collections (two rows) from the first list (nine) cut the panel's
   * height in one frame, "too direct and glitchy". The listbox's height is
   * read before and after the new list is drawn and the change is played on
   * it, over the same curve the rows slide on. Not while typing: a search
   * that re-lists on every key would wobble.
   */
  const boxRef = React.useRef<HTMLDivElement>(null)
  const lastHeight = React.useRef<number | null>(null)
  const listKey = searching ? "search" : drill ? `sections:${drill.href}:${drillList === null ? "loading" : drillList.length}` : (level ?? "top")
  React.useLayoutEffect(() => {
    const el = boxRef.current
    if (!panelOpen || !el) {
      lastHeight.current = null
      return
    }
    const now = el.getBoundingClientRect().height
    const was = lastHeight.current
    lastHeight.current = now
    if (was === null || Math.abs(was - now) < 2) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    el.animate([{ height: `${was}px` }, { height: `${now}px` }], { duration: 240, easing: "cubic-bezier(0.32, 0.72, 0, 1)" })
  }, [listKey, panelOpen])

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
    drillRef.current = null
    setDrill(null)
    setDrillList(null)
  }, [])

  /**
   * Into a page's sections. The open page's are already here; another
   * page's are read (the draft, as the builder shows it), and the list says
   * so while they are on their way rather than showing an empty one.
   */
  const openSections = (page: LinkTarget, fromKeyboard: boolean) => {
    drillRef.current = page
    setDrill(page)
    setDir("in")
    setActive(fromKeyboard ? 1 : -1)
    const path = normalizePath(page.href)
    if (path === here) {
      setDrillList(targets.filter((t) => t.kind === "section"))
      return
    }
    if (!source.load) return setDrillList([])
    setDrillList(null)
    source.load(path).then(
      (list) => { if (drillRef.current === page) setDrillList(list) },
      () => { if (drillRef.current === page) setDrillList([]) },
    )
  }
  /** Back out of a page's sections, onto the row that opened them. */
  const leaveSections = (fromKeyboard: boolean) => {
    const page = drillRef.current
    drillRef.current = null
    setDrill(null)
    setDrillList(null)
    setDir("out")
    if (!fromKeyboard || !page) return setActive(-1)
    const back = level ? (menu.find((e) => e.category.key === level)?.targets.indexOf(page) ?? -1) + 1 : menu.findIndex((e) => e.targets[0] === page)
    setActive(Math.max(0, back))
  }

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
    if (drillRef.current && !searching) {
      drillRef.current = null
      setDrill(null)
      setDrillList(null)
      setDir("out")
      setActive(-1)
      return true
    }
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
    /* A section of another page: keep its page's list, so the field can name it. */
    if (t.kind === "section" && drillList && drillList.includes(t)) setRemote(drillList)
    close()
    if (t.href !== value) onChange(t.href)
    /* At a thumb, done means the keyboard goes; at a keyboard, the cursor stays. */
    if (phone) inputRef.current?.blur()
  }

  const choose = (row: Row, fromKeyboard: boolean) => {
    if (row.type === "pick") pick(row.target)
    else if (row.type === "open") goTo(row.entry.category.key, fromKeyboard)
    else if (drill) leaveSections(fromKeyboard)
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
      /* What was typed stays in the box to be finished, and the saved link stays as it was. It used to be wiped back to the old link, which read as the field refusing to take www. */
      setError(r.reason)
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
  }, [level, searching, drill])

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
    /* Right opens a page's sections and Left comes back, while a row is active (otherwise they move the caret). */
    if (e.key === "ArrowRight" && showList && !searching && active >= 0) {
      const row = rows[active]
      if (row?.type === "pick" && !drill && canDrill(row.target)) {
        e.preventDefault()
        openSections(row.target, true)
      }
      return
    }
    if (e.key === "ArrowLeft" && showList && drill && active >= 0) {
      e.preventDefault()
      leaveSections(true)
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

  /**
   * What the box shows: the address while editing, the page's name at rest.
   * A section is its name ("Pricing"), and a section of another page says
   * which page first ("About · Pricing"), never `#section-…`.
   */
  const knownLabel = known ? (known.context ? `${known.context} · ${known.label}` : known.label) : ""
  /* An address that was refused stays on show, with its reason, until it is finished or put back. */
  const unfinished = typed && !!error
  const shown = focused || unfinished ? draft : known ? knownLabel : value

  const rowH = phone ? "h-11" : "h-9"
  const optionClass = (i: number) =>
    cn(
      "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 text-left transition-colors duration-75",
      rowH,
      i === active ? "bg-muted" : "",
    )

  const pickRow = (row: Extract<Row, { type: "pick" }>, i: number) => {
    const t = row.target
    const current = value === t.href || (known !== null && known === t)
    /* Not inside a page's sections: that page's own row there picks it. */
    const drills = !drill && !searching && canDrill(t)
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
        <RowMark icon={row.icon} image={t.kind === "product" || t.kind === "collection" || t.kind === "checkout" ? t.image : undefined} />
        {/**
          * THE NAME, NOT THE ADDRESS. Nobody picks a link by its
          * slug; the address is still there as the row's title.
          */}
        <span className={cn("min-w-0 flex-1 truncate text-foreground", phone ? "text-[15px]" : "text-[13px]")} title={t.href}>
          {t.label}
        </span>
        {current && <Check className="h-3.5 w-3.5 shrink-0 text-foreground/70" strokeWidth={2.2} aria-label="Linked now" />}
        {drills && (
          /**
           * THE PAGE'S SECTIONS, beside the page. The row picks the page;
           * the chevron opens its sections, the way a row with a list of
           * its own does in the first list.
           */
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Sections on ${t.label}`}
            title="Sections"
            onClick={(e) => {
              e.stopPropagation()
              openSections(t, false)
            }}
            className={cn(
              "-mr-1 flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
              phone ? "h-9 w-9" : "h-7 w-7",
            )}
          >
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        )}
      </div>
    )
  }

  const back = rows[0]?.type === "back" ? rows[0] : null

  return (
    <div data-link-picker="">
      <FieldPopover
        float
        open={panelOpen}
        onOpenChange={(next) => {
          if (next) return
          /* The sheet swiped away with an address typed in it: that address is the answer, as a blur is at a computer. */
          if (sheet) commit()
          close()
        }}
        onEscape={onEscape}
        sheetLabel="Choose where this link goes"
        sheetHeader={
          sheet ? (
            <div className="shrink-0 px-3 pb-2 pt-1">
              <div className="flex h-11 items-center rounded-xl border border-border bg-background focus-within:border-neutral-400 focus-within:ring-2 focus-within:ring-neutral-900/10">
                <Search className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  data-link-sheet-search=""
                  aria-label="Search pages and products, or paste an address"
                  placeholder="Search, or paste an address"
                  value={typed ? draft : ""}
                  onChange={(e) => {
                    setDraft(e.target.value)
                    setTyped(true)
                    setError(null)
                    setLevel(null)
                    setActive(-1)
                  }}
                  onKeyDown={onKeyDown}
                  className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[16px] text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
              {canUseTyped && (
                <button
                  type="button"
                  data-link-use-typed=""
                  onClick={() => {
                    commit()
                    close()
                  }}
                  className="mt-2 flex h-11 w-full items-center gap-2.5 rounded-xl bg-neutral-100 px-3 text-left text-[15px] text-foreground transition-colors active:bg-neutral-200"
                >
                  <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    Use <span className="font-medium">{typedAddress && typedAddress.ok ? typedAddress.href : ""}</span>
                  </span>
                </button>
              )}
            </div>
          ) : undefined
        }
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
              /* On a phone the field is a door to the sheet: typing happens in the sheet's own box, above the keyboard. */
              readOnly={sheet}
              onClick={() => {
                if (!sheet) return
                setDraft(value)
                setTyped(false)
                setLevel(null)
                setActive(-1)
                setOpen(true)
              }}
              onMouseDown={(e) => {
                /* A press would drop a caret into the name that is about to
                   become a path. Focus it here instead, and select it whole. */
                if (focused || !known) return
                e.preventDefault()
                selectAll.current = true
                e.currentTarget.focus({ preventScroll: true })
              }}
              onFocus={(e) => {
                if (sheet) {
                  e.currentTarget.blur()
                  return
                }
                setFocused(true)
                /* Back to an address that was refused: carry on typing it. */
                if (unfinished) {
                  setLevel(null)
                  if (!phone) setOpen(true)
                  return
                }
                if (known) selectAll.current = true
                setDraft(value)
                setTyped(false)
                setLevel(null)
                if (!phone) setOpen(true)
              }}
              onBlur={(e) => {
                if (sheet) return
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
          aria-label={drill ? `Sections on ${drill.label}` : entry ? entry.category.label : "Pages and products"}
          onMouseDown={(e) => e.preventDefault()}
          ref={boxRef}
          className="flex min-h-0 flex-col overflow-hidden"
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
                {back.count >= 0 && <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{resultCount(back.count)}</span>}
              </div>
            </div>
          )}
          <div className={cn("relative flex min-h-0 flex-col", phone && "max-h-[min(460px,58dvh)]")}>
            <div
              ref={listRef}
              data-float-scroll=""
              data-sheet-scroll=""
              className="cp-overlay-scroll min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-1.5"
            >
              {/* Keyed by the list it is, so a new list comes in with a short fade instead of rows changing in place. */}
              <div key={searching ? "search" : drill ? `sections:${drill.href}` : (level ?? "top")} data-dir={searching ? undefined : (dir ?? undefined)} className="wb-link-level">
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
                {drill && !searching && (drillList === null || drillList.length === 0) && (
                  <p className={cn("px-2 text-muted-foreground", phone ? "py-3 text-[14px]" : "py-2 text-[12px]")}>
                    {drillList === null ? "Loading sections" : "No sections on this page yet"}
                  </p>
                )}
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

export function LinkTargetsProvider({
  targets,
  sections,
  children,
}: {
  targets: LinkTarget[]
  /** The open page's address and a reader for other pages' sections. Kept when absent, so a nested provider inherits it. */
  sections?: SectionLinkSource
  children: React.ReactNode
}) {
  const inherited = React.useContext(SectionLinkContext)
  return (
    <SectionLinkContext.Provider value={sections ?? inherited}>
      <LinkTargetsContext.Provider value={targets}>{children}</LinkTargetsContext.Provider>
    </SectionLinkContext.Provider>
  )
}

export function useLinkTargets(): LinkTarget[] {
  return React.useContext(LinkTargetsContext)
}

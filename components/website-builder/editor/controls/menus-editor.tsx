"use client"

/**
 * ===========================================================================
 *  THE SITE'S MENUS
 * ===========================================================================
 * Shaped like Shopify's Navigation: a list of menus, Main menu first, and a
 * menu opens onto its links (link-list-editor.tsx). A menu is a named list of
 * links, and a link may have links under it: the header shows the second
 * level as a dropdown, a footer column shows it as a list.
 *
 * THE MAIN MENU IS THE HEADER'S MENU (lib/website-builder/main-menu.ts).
 * It is always on the list. On a site saved before menus took over, it shows
 * the header's own links until it is first edited; that edit writes the menu
 * out from those links and points the header at it, so from then on the
 * header and the Main menu are one list.
 *
 * A section that shows a menu (`link_list`) names one by its handle, so the
 * handle is fixed when the menu is made and renaming it later changes only
 * what people read. It is made from the name and never shown.
 *
 * Two levels are edited here; a third that arrived in an imported theme is
 * kept as it was. Every address goes through the link picker, which is the
 * same one every link setting uses and which refuses `javascript:`.
 */
import * as React from "react"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"

import { MENU_HANDLE, MENU_LIMITS, cleanMenus, type Menu, type MenuLink } from "@/lib/storelib-theme/values"
import { MAIN_MENU, MAIN_MENU_TITLE, mainMenuView, headerReadsMenu } from "@/lib/website-builder/main-menu"
import { nestMenuLink, placeMenuLink } from "@/lib/website-builder/nav-links"
import { cn } from "@/lib/utils"
import { useEditorFieldEnv } from "./context"
import { LinkListEditor, NEW_LINK_LABEL, type LinkItem } from "./link-list-editor"
import { INPUT, NOTE, TEXT_BUTTON } from "./styles"
import { msg, tt } from "@/lib/i18n/text"

/* A thumb's height on a phone, inside the phone sheet and outside it (Website Settings). */
const FIELD = cn(INPUT, "max-sm:h-11")
const ACTION = cn(TEXT_BUTTON, "max-sm:h-11")
const HAIRLINE = "border-t border-border dark:border-white/[0.07]"

/** "Footer links" → "footer-links", made unique against the menus there are. */
export function handleFor(title: string, taken: Set<string>): string {
  const base = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "menu"
  let handle = MENU_HANDLE.test(base) ? base : "menu"
  let n = 2
  while (taken.has(handle)) handle = `${base.slice(0, 36)}-${n++}`
  return handle
}

/** The menus stores make most, offered under the new menu's name. One a store already has is left out. */
export const MENU_SUGGESTIONS = [msg("Footer"), msg("Shop"), msg("Help"), msg("Legal"), msg("Social")] as const

/** A link's place in the menu as the list editor names it: "2", or "2/0" for a sub-link. */
const pathOf = (id: string): number[] => id.split("/").map(Number)

function menuItems(links: MenuLink[]): LinkItem[] {
  return links.map((l, i) => ({
    id: String(i),
    label: l.title,
    url: l.url,
    children: (l.links ?? []).map((c, j) => ({ id: `${i}/${j}`, label: c.title, url: c.url })),
  }))
}

/** The links with the list at `path` replaced by `fn` of it. */
function withLinksAt(links: MenuLink[], path: number[], fn: (list: MenuLink[]) => MenuLink[]): MenuLink[] {
  if (path.length === 0) return fn(links)
  const [head, ...rest] = path
  return links.map((l, i) => (i === head ? { ...l, links: withLinksAt(l.links ?? [], rest, fn) } : l))
}

/** One link changed, wherever it sits. A third level from an import rides along untouched. */
function withLink(links: MenuLink[], id: string, fn: (link: MenuLink) => MenuLink): MenuLink[] {
  const path = pathOf(id)
  const last = path.pop() as number
  return withLinksAt(links, path, (list) => list.map((l, i) => (i === last ? fn(l) : l)))
}

export function MenuLinksEditor({ links, onLinks }: { links: MenuLink[]; onLinks: (next: MenuLink[]) => void }) {
  return (
    <LinkListEditor
      items={menuItems(links)}
      nested
      maxLinks={MENU_LIMITS.links}
      maxSubLinks={MENU_LIMITS.links}
      maxLabel={MENU_LIMITS.titleLength}
      onLabel={(id, title) => onLinks(withLink(links, id, (l) => ({ ...l, title })))}
      onUrl={(id, url) => onLinks(withLink(links, id, (l) => ({ ...l, url })))}
      onRemove={(id) => {
        const path = pathOf(id)
        const last = path.pop() as number
        onLinks(withLinksAt(links, path, (list) => list.filter((_, i) => i !== last)))
      }}
      onAdd={(parent) =>
        onLinks(withLinksAt(links, parent === null ? [] : pathOf(parent), (list) => [...list, { title: NEW_LINK_LABEL, url: "/" }]))
      }
      onMove={(parent, from, to) =>
        onLinks(withLinksAt(links, parent === null ? [] : pathOf(parent), (list) => {
          const next = [...list]
          const [moved] = next.splice(from, 1)
          next.splice(to, 0, moved)
          return next
        }))
      }
      onNest={(id, dir) => {
        const next = nestMenuLink(links, id, dir)
        if (next !== links) onLinks(next)
      }}
      onPlace={(id, parentId, index) => {
        const next = placeMenuLink(links, id, parentId, index)
        if (next !== links) onLinks(next)
      }}
    />
  )
}

type HeaderLike = { settings: Record<string, unknown>; blocks?: { id: string; type: string; settings: Record<string, unknown> }[] } | null

export function MenusEditor({
  value,
  onChange,
  header: headerProp,
  onLinkHeader,
  openHandle,
  plain = false,
}: {
  value: unknown
  onChange: (menus: Record<string, Menu>) => void
  /** The site's header, for the Main menu. Read from the editor's context when not given. */
  header?: HeaderLike
  /** Points the header at the Main menu, the first time the Main menu is written. */
  onLinkHeader?: () => void
  /** Open straight onto this menu. */
  openHandle?: string | null
  /** Inside a settings card (Website Settings): rows and hairlines, no box of its own, so it is not a card in a card. */
  plain?: boolean
}) {
  const env = useEditorFieldEnv()
  const header = headerProp !== undefined ? headerProp : env?.header ?? null
  const linkHeader = onLinkHeader ?? env?.linkHeaderToMain
  /* What was saved, read the same way a section will read it, plus any link
     still being typed: an empty title is kept here until it has words. */
  const menus = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, Menu>
  const clean = cleanMenus(menus)
  const others = Object.keys(menus).filter((h) => h !== MAIN_MENU && clean[h])
  const main = mainMenuView(menus, header)
  const headerHandle = header ? headerReadsMenu(header) || MAIN_MENU : null
  const [open, setOpen] = React.useState<string | null>(openHandle ?? null)
  const BOX = plain ? "" : "rounded-lg border border-border bg-white dark:bg-white/[0.03]"
  const [confirming, setConfirming] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  const [name, setName] = React.useState("")
  const nameInput = React.useRef<HTMLInputElement>(null)
  /* Which way the last move went: into a menu slides in from the right, back to the list from the left. */
  const [dir, setDir] = React.useState<"in" | "out" | null>(null)
  const go = (handle: string | null) => {
    setDir(handle ? "in" : "out")
    setOpen(handle)
  }

  /* Asked to open at one menu: the header's Edit, a section's menu picker. */
  const request = env?.menuRequest
  React.useEffect(() => {
    if (request?.handle) setOpen(request.handle)
  }, [request?.handle, request?.n])
  React.useEffect(() => {
    if (openHandle) setOpen(openHandle)
  }, [openHandle])
  React.useEffect(() => setConfirming(false), [open])

  const menuOf = (handle: string): Menu => (handle === MAIN_MENU ? { ...main.menu, ...(menus[MAIN_MENU] ? { title: menus[MAIN_MENU].title } : {}) } : menus[handle])
  const put = (handle: string, menu: Menu) => {
    onChange({ ...menus, [handle]: menu })
    /* The first write of the Main menu is where the header moves over to it. */
    if (handle === MAIN_MENU && header && !headerReadsMenu(header)) linkHeader?.()
  }
  const add = () => {
    const title = name.trim()
    if (!title || Object.keys(clean).length >= MENU_LIMITS.menus) return
    const handle = handleFor(title, new Set([...Object.keys(menus), MAIN_MENU]))
    /* A new menu opens with its first link waiting, the way Shopify's does: the next thing anyone does with a menu is add a link to it. */
    onChange({ ...menus, [handle]: { title, links: [{ title: NEW_LINK_LABEL, url: "/" }] } })
    setName("")
    setAdding(false)
    setDir("in")
    setOpen(handle)
  }
  const remove = (handle: string) => {
    const next = { ...menus }
    delete next[handle]
    onChange(next)
    go(null)
  }

  if (open && (open === MAIN_MENU || menus[open])) {
    const menu = menuOf(open)
    const isMain = open === MAIN_MENU
    return (
      <div
        className={cn("space-y-4", dir === "in" && "animate-in fade-in-0 slide-in-from-right-2 duration-200 motion-reduce:animate-none")}
        data-menus-editor=""
        data-menu-open={open}
      >
        <button
          type="button"
          onClick={() => go(null)}
          className="-ml-1 inline-flex h-7 items-center gap-0.5 rounded-md pl-0.5 pr-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15 max-sm:h-10 max-sm:text-[13px]"
          data-menu-back=""
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
          {tt("All menus")}
        </button>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{tt("Name")}</span>
          <input
            className={FIELD}
            value={menu.title}
            maxLength={MENU_LIMITS.titleLength}
            placeholder={isMain ? MAIN_MENU_TITLE : undefined}
            onChange={(e) => put(open, { ...menu, title: e.target.value })}
          />
          {isMain && headerHandle === MAIN_MENU && <span className={cn(NOTE, "mt-1.5 block")}>{tt("Your header shows this menu.")}</span>}
        </label>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{tt("Links")}</span>
          <div className={cn(BOX, !plain && "px-1")} data-menu-links="">
            <MenuLinksEditor links={menu.links ?? []} onLinks={(links) => put(open, { ...menu, links })} />
          </div>
        </div>
        {!isMain && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-3 dark:border-white/[0.07]">
            {confirming ? (
              <>
                <span className="mr-auto text-[12px] text-muted-foreground max-sm:text-[13px]">{tt("Sections showing it will show none.")}</span>
                <button type="button" className={ACTION} onClick={() => setConfirming(false)}>{tt("Keep")}</button>
                <button type="button" className={cn(ACTION, "text-[#b91c1c] hover:bg-red-50 hover:text-[#991b1b] dark:text-red-300 dark:hover:bg-red-500/10")} onClick={() => remove(open)}>{tt("Delete")}</button>
              </>
            ) : (
              <button type="button" className={cn(ACTION, "-ml-1.5 text-muted-foreground hover:bg-red-50 hover:text-[#b91c1c] dark:hover:bg-red-500/10 dark:hover:text-red-300")} onClick={() => setConfirming(true)}>
                {tt("Delete menu")}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  const rows = [MAIN_MENU, ...others]
  const have = new Set(rows.map((h) => (menuOf(h).title || "").trim().toLowerCase()))
  const suggestions = MENU_SUGGESTIONS.map((s) => tt(s)).filter((s) => !have.has(s.toLowerCase()))
  const roomForMore = Object.keys(clean).filter((h) => h !== MAIN_MENU).length + 1 < MENU_LIMITS.menus
  return (
    <div className={cn("space-y-2", dir === "out" && "animate-in fade-in-0 slide-in-from-left-2 duration-200 motion-reduce:animate-none")} data-menus-editor="">
      <div className={cn("overflow-hidden", BOX)} data-menu-list="">
        {rows.map((handle, i) => {
          const menu = menuOf(handle)
          const links = menu.links ?? []
          const preview = links.length ? links.map((l) => l.title).filter(Boolean).join(", ") : tt("No links yet")
          return (
            <button
              key={handle}
              type="button"
              data-menu-row={handle}
              onClick={() => go(handle)}
              className={cn(
                "group/menu flex min-h-[52px] w-full items-center gap-2 py-2",
                plain ? "px-0" : "px-3",
                "text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none max-sm:min-h-[60px]",
                i > 0 && HAIRLINE,
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium text-foreground max-sm:text-[15px]">
                    {menu.title || (handle === MAIN_MENU ? MAIN_MENU_TITLE : handle)}
                  </span>
                  {headerHandle === handle && (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[10.5px] font-medium text-muted-foreground dark:bg-white/[0.08]">{tt("Header")}</span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground max-sm:text-[13px]">{preview}</span>
              </span>
              <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover/menu:text-foreground" />
            </button>
          )
        })}
      </div>
      {roomForMore ? (
        adding ? (
          /* Not a <form>: Website Settings is one already, and a form in a form sent Enter to the wrong one. */
          <div className="animate-in fade-in-0 duration-150 motion-reduce:animate-none" data-menu-new="">
          <div className="flex items-center gap-2">
            <input
              ref={nameInput}
              aria-label={tt("New menu name")}
              className={FIELD}
              placeholder={tt("New menu")}
              autoFocus
              value={name}
              maxLength={MENU_LIMITS.titleLength}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  add()
                }
                if (e.key === "Escape") {
                  e.preventDefault()
                  setAdding(false)
                  setName("")
                }
              }}
              onBlur={() => {
                /* Left empty: nothing was being made. */
                if (!name.trim()) setAdding(false)
              }}
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={add}
              disabled={!name.trim()}
              className="h-8 max-sm:h-11 shrink-0 rounded-md bg-[#1a1a2e] px-3 text-[13px] max-sm:text-[15px] font-medium text-white transition-colors hover:bg-[#2d2d4e] disabled:opacity-40 dark:bg-white dark:text-[#0f0f0f] dark:hover:bg-white/90"
            >
              {tt("Add")}
            </button>
          </div>
          {/*
            THE MENUS PEOPLE MAKE MOST, one press to name it. Only the ones
            this store does not have yet, and only while nothing is typed.
          */}
          {suggestions.length > 0 && !name.trim() && (
            <div className="mt-2 flex flex-wrap gap-1.5" data-menu-suggestions="">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  data-menu-suggestion={s}
                  /* Down, not click: the box keeps focus, so it does not close as empty. */
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setName(s)
                    nameInput.current?.focus()
                  }}
                  className="h-7 rounded-md border border-border bg-background px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-neutral-300 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15 max-sm:h-10 max-sm:px-3 max-sm:text-[14px] [-webkit-tap-highlight-color:transparent] dark:border-white/[0.1]"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          </div>
        ) : (
          <button
            type="button"
            data-menu-add=""
            onClick={() => setAdding(true)}
            className="flex h-9 w-full items-center gap-2 rounded-md px-1 text-left text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15 max-sm:h-11 max-sm:text-[15px]"
          >
            <span aria-hidden className="flex h-4 w-4 items-center justify-center rounded-full border border-border">
              <Plus className="h-2.5 w-2.5" strokeWidth={2.5} />
            </span>
            {tt("Add menu")}
          </button>
        )
      ) : (
        <p className={NOTE}>{tt("A store holds {menus} menus.", { menus: MENU_LIMITS.menus })}</p>
      )}
    </div>
  )
}

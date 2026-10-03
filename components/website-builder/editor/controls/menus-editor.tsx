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
import { nestMenuLink } from "@/lib/website-builder/nav-links"
import { cn } from "@/lib/utils"
import { useEditorFieldEnv } from "./context"
import { LinkListEditor, NEW_LINK_LABEL, type LinkItem } from "./link-list-editor"
import { INPUT, NOTE, TEXT_BUTTON } from "./styles"

/* A thumb's height on a phone, inside the phone sheet and outside it (Website Settings). */
const FIELD = cn(INPUT, "max-sm:h-11")
const ACTION = cn(TEXT_BUTTON, "max-sm:h-11")
const HAIRLINE = "border-t border-border dark:border-white/[0.07]"
const ROW = "flex h-9 w-full items-center gap-2 text-left max-sm:h-11"

/** "Footer links" → "footer-links", made unique against the menus there are. */
export function handleFor(title: string, taken: Set<string>): string {
  const base = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "menu"
  let handle = MENU_HANDLE.test(base) ? base : "menu"
  let n = 2
  while (taken.has(handle)) handle = `${base.slice(0, 36)}-${n++}`
  return handle
}

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
}: {
  value: unknown
  onChange: (menus: Record<string, Menu>) => void
  /** The site's header, for the Main menu. Read from the editor's context when not given. */
  header?: HeaderLike
  /** Points the header at the Main menu, the first time the Main menu is written. */
  onLinkHeader?: () => void
  /** Open straight onto this menu. */
  openHandle?: string | null
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
  const [confirming, setConfirming] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  const [name, setName] = React.useState("")

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
    onChange({ ...menus, [handle]: { title, links: [] } })
    setName("")
    setAdding(false)
    setOpen(handle)
  }
  const remove = (handle: string) => {
    const next = { ...menus }
    delete next[handle]
    onChange(next)
    setOpen(null)
  }

  if (open && (open === MAIN_MENU || menus[open])) {
    const menu = menuOf(open)
    const isMain = open === MAIN_MENU
    return (
      <div className="space-y-3" data-menus-editor="" data-menu-open={open}>
        <button
          type="button"
          onClick={() => setOpen(null)}
          className={cn(ACTION, "-ml-1.5 gap-1")}
          data-menu-back=""
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
          Menus
        </button>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Name</span>
          <input
            className={FIELD}
            value={menu.title}
            maxLength={MENU_LIMITS.titleLength}
            placeholder={isMain ? MAIN_MENU_TITLE : undefined}
            onChange={(e) => put(open, { ...menu, title: e.target.value })}
          />
        </label>
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Links</span>
          <MenuLinksEditor links={menu.links ?? []} onLinks={(links) => put(open, { ...menu, links })} />
        </div>
        {!isMain && (
          <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 pt-1">
            {confirming ? (
              <>
                <span className="text-[12px] text-muted-foreground max-sm:text-[13px]">Sections showing it will show none.</span>
                <button type="button" className={ACTION} onClick={() => setConfirming(false)}>Keep</button>
                <button type="button" className={cn(ACTION, "-mr-1.5 text-[#b91c1c] hover:bg-red-50 hover:text-[#991b1b] dark:text-red-300 dark:hover:bg-red-500/10")} onClick={() => remove(open)}>Delete</button>
              </>
            ) : (
              <button type="button" className={cn(ACTION, "-mr-1.5 hover:bg-red-50 hover:text-[#b91c1c] dark:hover:bg-red-500/10 dark:hover:text-red-300")} onClick={() => setConfirming(true)}>
                Delete menu
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  const rows = [MAIN_MENU, ...others]
  const roomForMore = Object.keys(clean).filter((h) => h !== MAIN_MENU).length + 1 < MENU_LIMITS.menus
  return (
    <div data-menus-editor="">
      <div data-menu-list="">
        {rows.map((handle, i) => {
          const menu = menuOf(handle)
          const count = (menu.links ?? []).length
          return (
            <button
              key={handle}
              type="button"
              data-menu-row={handle}
              onClick={() => setOpen(handle)}
              className={cn(ROW, "group/menu pr-1", i > 0 && HAIRLINE, "focus-visible:outline-none")}
            >
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground group-focus-visible/menu:underline max-sm:text-[15px]">
                {menu.title || (handle === MAIN_MENU ? MAIN_MENU_TITLE : handle)}
              </span>
              <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground max-sm:text-[13px]">
                {headerHandle === handle ? "Header, " : ""}
                {count} {count === 1 ? "link" : "links"}
              </span>
              <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover/menu:text-foreground" />
            </button>
          )
        })}
        {roomForMore ? (
          adding ? (
            <form
              className={cn("flex items-center gap-2 py-2", HAIRLINE)}
              onSubmit={(e) => {
                e.preventDefault()
                add()
              }}
            >
              <input
                aria-label="New menu name"
                className={FIELD}
                placeholder="Footer"
                autoFocus
                value={name}
                maxLength={MENU_LIMITS.titleLength}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setAdding(false)
                    setName("")
                  }
                }}
              />
              <button
                type="submit"
                disabled={!name.trim()}
                className="h-8 max-sm:h-11 shrink-0 rounded-md bg-[#1a1a2e] px-3 text-[13px] max-sm:text-[15px] font-medium text-white transition-colors hover:bg-[#2d2d4e] disabled:opacity-40 dark:bg-white dark:text-[#0f0f0f] dark:hover:bg-white/90"
              >
                Add
              </button>
            </form>
          ) : (
            <button
              type="button"
              data-menu-add=""
              onClick={() => setAdding(true)}
              className={cn(ROW, HAIRLINE, "text-[13px] font-medium text-[#7c3aed] transition-colors hover:text-[#6d28d9] focus-visible:outline-none focus-visible:underline max-sm:text-[15px] dark:text-[#c4b5fd] dark:hover:text-white")}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add menu
            </button>
          )
        ) : (
          <p className={cn(NOTE, "pt-2")}>A site holds {MENU_LIMITS.menus} menus.</p>
        )}
      </div>
    </div>
  )
}

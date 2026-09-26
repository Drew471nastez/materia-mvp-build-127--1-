"use client"

/**
 * ===========================================================================
 *  THE SITE'S MENUS
 * ===========================================================================
 * Theme settings › Menus. A menu is a named list of links, and a link may
 * have links under it: the header shows the second level as a dropdown, a
 * footer column shows it as a list. A section that shows a menu
 * (`link_list`) names one by its handle, so the handle is fixed when the
 * menu is made and renaming the menu later changes only what people read.
 * It is made from the name and never shown: it is how sections find the
 * menu, not something a creator has to understand.
 *
 * The header's own links are the main menu without being made here: every
 * site has them already, and asking a creator to type them a second time is
 * how two navigations drift apart. A menu made here with the handle
 * `main-menu` replaces them wherever a section asks for the main menu.
 *
 * Two levels are edited here; a third that arrived in an imported theme is
 * kept as it was. Every address goes through the link picker, which is the
 * same one every link setting uses and which refuses `javascript:`.
 */
import * as React from "react"
import { ChevronDown } from "lucide-react"

import { MENU_HANDLE, MENU_LIMITS, cleanMenus, type Menu, type MenuLink } from "@/lib/storelib-theme/values"
import { cn } from "@/lib/utils"
import { LinkListEditor, NEW_LINK_LABEL, type LinkItem } from "./link-list-editor"
import { INPUT, NOTE, TEXT_BUTTON } from "./styles"

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
    />
  )
}

export function MenusEditor({ value, onChange }: { value: unknown; onChange: (menus: Record<string, Menu>) => void }) {
  /* What was saved, read the same way a section will read it, plus any link
     still being typed: an empty title is kept here until it has words. */
  const menus = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, Menu>
  const clean = cleanMenus(menus)
  const handles = Object.keys(menus).filter((h) => clean[h])
  const [open, setOpen] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState<string | null>(null)
  const [name, setName] = React.useState("")

  const put = (handle: string, menu: Menu) => onChange({ ...menus, [handle]: menu })
  const add = () => {
    const title = name.trim()
    if (!title || handles.length >= MENU_LIMITS.menus) return
    const handle = handleFor(title, new Set(handles))
    onChange({ ...menus, [handle]: { title, links: [] } })
    setName("")
    setOpen(handle)
  }
  const remove = (handle: string) => {
    const next = { ...menus }
    delete next[handle]
    onChange(next)
    setConfirming(null)
    setOpen(null)
  }

  return (
    <div className="space-y-3" data-menus-editor="">
      <p className={NOTE}>
        A section that shows a menu picks one of these. The header&apos;s own links are always there as the main menu; change them in the header.
      </p>
      {handles.map((handle) => {
        const menu = menus[handle]
        const expanded = open === handle
        const count = (menu.links ?? []).length
        return (
          <div key={handle} className="rounded-lg border border-border">
            <button
              type="button"
              aria-expanded={expanded}
              className="flex w-full items-center gap-2 px-3 py-2.5 max-sm:min-h-12 text-left"
              onClick={() => setOpen(expanded ? null : handle)}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{menu.title || handle}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {count} {count === 1 ? "link" : "links"}
                </span>
              </span>
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", expanded && "rotate-180")} />
            </button>
            {expanded && (
              <div className="space-y-3 border-t border-border p-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Menu name</span>
                  <input
                    className={INPUT}
                    value={menu.title}
                    maxLength={MENU_LIMITS.titleLength}
                    onChange={(e) => put(handle, { ...menu, title: e.target.value })}
                  />
                </label>
                <MenuLinksEditor links={menu.links ?? []} onLinks={(links) => put(handle, { ...menu, links })} />
                <div className="flex items-center justify-end gap-2 pt-1">
                  {confirming === handle ? (
                    <>
                      <span className="text-[12px] text-muted-foreground">Sections showing it will show none.</span>
                      <button type="button" className={TEXT_BUTTON} onClick={() => setConfirming(null)}>Keep</button>
                      <button type="button" className={cn(TEXT_BUTTON, "text-[#b91c1c] hover:bg-red-50 hover:text-[#991b1b]")} onClick={() => remove(handle)}>Delete</button>
                    </>
                  ) : (
                    <button type="button" className={cn(TEXT_BUTTON, "hover:bg-red-50 hover:text-[#b91c1c]")} onClick={() => setConfirming(handle)}>
                      Delete menu
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
      {handles.length < MENU_LIMITS.menus ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <input
            aria-label="New menu name"
            className={INPUT}
            placeholder="New menu, such as Footer"
            value={name}
            maxLength={MENU_LIMITS.titleLength}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="h-9 max-sm:h-11 shrink-0 rounded-lg bg-[#1a1a2e] px-3 text-sm font-medium text-white transition-colors hover:bg-[#2d2d4e] disabled:opacity-40"
          >
            Add menu
          </button>
        </form>
      ) : (
        <p className={NOTE}>A site holds {MENU_LIMITS.menus} menus.</p>
      )}
    </div>
  )
}

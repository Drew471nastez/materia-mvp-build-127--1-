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
import { ArrowDown, ArrowUp, ChevronDown, CornerDownRight, Plus, X } from "lucide-react"

import { LinkPicker, useLinkTargets } from "@/components/website-builder/link-picker"
import { MENU_HANDLE, MENU_LIMITS, cleanMenus, type Menu, type MenuLink } from "@/lib/storelib-theme/values"
import { cn } from "@/lib/utils"
import { ADD_BUTTON, ICON_BUTTON, INPUT, NOTE, TEXT_BUTTON } from "./styles"

/** "Footer links" → "footer-links", made unique against the menus there are. */
export function handleFor(title: string, taken: Set<string>): string {
  const base = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "menu"
  let handle = MENU_HANDLE.test(base) ? base : "menu"
  let n = 2
  while (taken.has(handle)) handle = `${base.slice(0, 36)}-${n++}`
  return handle
}

type Path = number[]

function linksAt(links: MenuLink[], path: Path): MenuLink[] {
  let list = links
  for (const i of path) list = list[i]?.links ?? []
  return list
}

/** The links with the list at `path` replaced by `fn` of it. */
function withLinksAt(links: MenuLink[], path: Path, fn: (list: MenuLink[]) => MenuLink[]): MenuLink[] {
  if (path.length === 0) return fn(links)
  const [head, ...rest] = path
  return links.map((l, i) => (i === head ? { ...l, links: withLinksAt(l.links ?? [], rest, fn) } : l))
}

function LinkRows({
  links,
  path,
  depth,
  onLinks,
}: {
  links: MenuLink[]
  path: Path
  depth: number
  onLinks: (next: MenuLink[]) => void
}) {
  const targets = useLinkTargets()
  const list = linksAt(links, path)
  const set = (fn: (list: MenuLink[]) => MenuLink[]) => onLinks(withLinksAt(links, path, fn))
  return (
    <div className={cn("space-y-2", depth > 0 && "border-l-2 border-border pl-3")}>
      {list.map((link, i) => (
        <div key={i} className="space-y-1.5 rounded-lg border border-border bg-background p-2">
          <div className="flex items-center gap-1">
            <input
              aria-label="Link text"
              className={INPUT}
              value={link.title}
              maxLength={MENU_LIMITS.titleLength}
              placeholder="Link text"
              onChange={(e) => set((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
            />
            <button type="button" className={ICON_BUTTON} aria-label={`Move ${link.title || "link"} up`} disabled={i === 0} onClick={() => set((l) => { const n = [...l]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n })}>
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" className={ICON_BUTTON} aria-label={`Move ${link.title || "link"} down`} disabled={i === list.length - 1} onClick={() => set((l) => { const n = [...l]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n })}>
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button type="button" className={ICON_BUTTON} aria-label={`Remove ${link.title || "link"}`} onClick={() => set((l) => l.filter((_, j) => j !== i))}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <LinkPicker value={link.url} targets={targets} onChange={(href) => set((l) => l.map((x, j) => (j === i ? { ...x, url: href } : x)))} />
          {depth === 0 && (
            <>
              {(link.links?.length ?? 0) > 0 && <LinkRows links={links} path={[...path, i]} depth={depth + 1} onLinks={onLinks} />}
              {(link.links?.length ?? 0) < MENU_LIMITS.links && (
                <button
                  type="button"
                  className={TEXT_BUTTON}
                  onClick={() => set((l) => l.map((x, j) => (j === i ? { ...x, links: [...(x.links ?? []), { title: "", url: "/" }] } : x)))}
                >
                  <CornerDownRight className="mr-1 h-3.5 w-3.5" />
                  Add a link under it
                </button>
              )}
            </>
          )}
        </div>
      ))}
      {list.length < MENU_LIMITS.links && (
        <button type="button" className={ADD_BUTTON} onClick={() => set((l) => [...l, { title: "", url: "/" }])}>
          <Plus className="h-3.5 w-3.5" />
          Add link
        </button>
      )}
    </div>
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
                  {handle} · {count} {count === 1 ? "link" : "links"}
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
                <LinkRows links={menu.links ?? []} path={[]} depth={0} onLinks={(links) => put(handle, { ...menu, links })} />
                <div className="flex items-center justify-end gap-2 pt-1">
                  {confirming === handle ? (
                    <>
                      <span className="text-[12px] text-muted-foreground">Sections showing it will show none.</span>
                      <button type="button" className={TEXT_BUTTON} onClick={() => setConfirming(null)}>Keep</button>
                      <button type="button" className={cn(TEXT_BUTTON, "text-[#b91c1c] hover:text-[#991b1b]")} onClick={() => remove(handle)}>Delete</button>
                    </>
                  ) : (
                    <button type="button" className={cn(TEXT_BUTTON, "text-[#b91c1c] hover:text-[#991b1b]")} onClick={() => setConfirming(handle)}>
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

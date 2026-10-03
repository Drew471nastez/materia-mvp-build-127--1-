/**
 * ===========================================================================
 *  THE SITE'S NAVIGATION IS THE MAIN MENU, SO THAT IS WHAT THE AI EDITS
 * ===========================================================================
 * The header shows the Main menu once it points at it (lib/website-builder/
 * main-menu.ts), Shopify's way, and then its own nav_link blocks are not
 * drawn at all. "Add a Pricing link to the menu" answered with a nav_link
 * block would be a change nobody can see. So navigation is edited here: the
 * theme's `menus` setting, the same one Website settings, Navigation edits.
 *
 *   read_menus   every menu, its links as a tree, and which one the header
 *                shows
 *   edit_menu    one link added, changed, moved or removed, in one menu
 *
 * NON-DESTRUCTIVE BY CONSTRUCTION. An edit changes one link of one menu and
 * carries every other menu and every other link over as it was. A header
 * still drawing its own links is moved over the way the editor moves it
 * (adoptHeaderLinks): the Main menu is written from those links first and
 * the header pointed at it; its blocks are never touched, so clearing the
 * header's menu brings them back exactly. Every value goes through the
 * theme's own cleaner (cleanMenus): titles cut to length, addresses made
 * safe, no deeper than three levels, no more links than a menu holds.
 *
 * Pure: settings and the header in, operations out. The editor applies them
 * with the same applier it applies every other AI change with, so Undo and
 * Save treat them like any other edit (tests/ask-images-u.test.ts).
 */
import { cleanMenus, MENU_HANDLE, MENU_LIMITS, type Menu, type MenuLink } from "@/lib/storelib-theme/values"
import { MAIN_MENU, MAIN_MENU_TITLE, adoptHeaderLinks, headerMenuHandle, mainMenuView } from "../main-menu"
import type { ThemeOp, ThemeState } from "./operations"
import type { ToolSpec } from "@/lib/sites/agent/types"

export const MENU_TOOLS: ToolSpec<string>[] = [
  {
    name: "read_menus",
    description:
      "Read the site's menus (Website settings, Navigation): each menu's links as a tree, and which menu the header shows. The header's navigation IS the Main menu (main-menu). Read this before edit_menu.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "edit_menu",
    description:
      'Change ONE link in one of the site\'s menus. This is how the header\'s navigation changes ("add a Pricing link", "rename Shop to Store", "put About last", "take Blog out"): never nav_link blocks, which a header showing a menu does not draw. Other links and menus are kept as they are.',
    parameters: {
      type: "object",
      properties: {
        menu: { type: "string", description: 'The menu\'s handle. "main-menu" for the header\'s navigation.' },
        action: { type: "string", enum: ["add", "update", "move", "remove"], description: "What to do to the link." },
        link: {
          type: "string",
          description: 'The link it is about, by its title, a child as "Parent > Child". For add: the parent to add under, or "" for the top level.',
        },
        title: { type: "string", description: 'add or update: the link\'s words. "" to keep them.' },
        url: { type: "string", description: 'add or update: where it goes, a page path like "/pages/pricing" or a full https address. "" to keep it.' },
        index: { type: "number", description: "add or move: its position among its siblings, from 0. -1 for the end." },
      },
      required: ["menu", "action", "link", "title", "url", "index"],
      additionalProperties: false,
    },
  },
]

const plain = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase()

function headerOf(state: ThemeState) {
  return state.sections.find((s) => s.type === "header")
}

/** The menus as they stand, the Main menu as the header shows it when it has not been written yet. */
function currentMenus(state: ThemeState): { menus: Record<string, Menu>; headerShows: string; fromHeader: boolean } {
  const header = headerOf(state)
  const menus = cleanMenus(state.settings.menus)
  const view = mainMenuView(state.settings.menus, header)
  if (!menus[MAIN_MENU] || menus[MAIN_MENU].links.length === 0) menus[MAIN_MENU] = { title: view.menu.title || MAIN_MENU_TITLE, links: cleanMenus({ [MAIN_MENU]: view.menu })[MAIN_MENU]?.links ?? [] }
  return { menus, headerShows: headerMenuHandle(state.settings.menus, header), fromHeader: view.fromHeader }
}

function tree(links: MenuLink[], depth = 0): string[] {
  return links.flatMap((l) => [`${"  ".repeat(depth + 1)}- ${l.title} -> ${l.url}`, ...tree(l.links ?? [], depth + 1)])
}

/** Every menu, for the model. */
export function describeMenus(state: ThemeState): string {
  const { menus, headerShows, fromHeader } = currentMenus(state)
  const lines = [`THE HEADER SHOWS: ${headerShows}${fromHeader ? " (its own links until the first menu edit, which writes them into main-menu)" : ""}`]
  for (const [handle, menu] of Object.entries(menus)) {
    lines.push(`${handle} "${menu.title}"${menu.links.length ? "" : " (empty)"}`, ...tree(menu.links))
  }
  return lines.join("\n")
}

/** The list a path names, and the index of the link in it: "Shop > Prints". */
function locate(links: MenuLink[], path: string): { list: MenuLink[]; at: number } | null {
  const parts = path.split(">").map(plain).filter(Boolean)
  if (parts.length === 0) return null
  let list = links
  for (let i = 0; i < parts.length; i++) {
    const at = list.findIndex((l) => plain(l.title) === parts[i])
    if (at < 0) return null
    if (i === parts.length - 1) return { list, at }
    list = list[at].links = list[at].links ?? []
  }
  return null
}

function depthOf(path: string): number {
  return path.split(">").map(plain).filter(Boolean).length
}

/** A copy deep enough to change one link without touching what the editor holds. */
function copy(links: MenuLink[]): MenuLink[] {
  return links.map((l) => ({ title: l.title, url: l.url, ...(l.links ? { links: copy(l.links) } : {}) }))
}

function linkList(links: MenuLink[]): string {
  return links.map((l) => l.title).join(", ") || "none"
}

/**
 * One edit to one menu, as the operations that make it: an update_theme with
 * the whole `menus` object (every other menu carried over), and, when the
 * header still drew its own links, the header pointed at the Main menu.
 */
export function editMenu(argumentsJson: string, state: ThemeState): { output: string; ops?: ThemeOp[]; failed?: true } {
  let args: Record<string, unknown>
  try {
    args = JSON.parse(argumentsJson || "{}") as Record<string, unknown>
  } catch {
    return { output: "The arguments were not JSON. Send menu, action, link, title, url and index.", failed: true }
  }
  const handle = typeof args.menu === "string" && args.menu.trim() ? args.menu.trim().toLowerCase() : MAIN_MENU
  if (!MENU_HANDLE.test(handle)) return { output: `"${handle}" is not a menu handle. The header's navigation is "main-menu".`, failed: true }
  const action = String(args.action ?? "")
  const path = typeof args.link === "string" ? args.link.trim() : ""
  const title = typeof args.title === "string" ? args.title.replace(/\s+/g, " ").trim().slice(0, MENU_LIMITS.titleLength) : ""
  const url = typeof args.url === "string" ? args.url.trim() : ""
  const index = typeof args.index === "number" && Number.isFinite(args.index) ? Math.floor(args.index) : -1

  const header = headerOf(state)
  const { menus } = currentMenus(state)
  if (!menus[handle]) {
    if (action !== "add") return { output: `There is no menu "${handle}". The menus are: ${Object.keys(menus).join(", ")}.`, failed: true }
    if (Object.keys(menus).length >= MENU_LIMITS.menus) return { output: `A site holds ${MENU_LIMITS.menus} menus and this one is full.`, failed: true }
    menus[handle] = { title: handle, links: [] }
  }
  const links = copy(menus[handle].links)

  if (action === "add") {
    if (!title) return { output: "Send the new link's title.", failed: true }
    if (depthOf(path) >= MENU_LIMITS.depth) return { output: `Menus go ${MENU_LIMITS.depth} levels deep at most.`, failed: true }
    let siblings = links
    if (path) {
      const parent = locate(links, path)
      if (!parent) return { output: `"${path}" is not a link in ${handle}. Its links: ${linkList(links)}.`, failed: true }
      const p = parent.list[parent.at]
      siblings = p.links = p.links ?? []
    }
    if (siblings.length >= MENU_LIMITS.links) return { output: `That level holds ${MENU_LIMITS.links} links and is full.`, failed: true }
    if (siblings.some((l) => plain(l.title) === plain(title))) return { output: `There is already a "${title}" there. Use update to change it.`, failed: true }
    const at = index < 0 || index > siblings.length ? siblings.length : index
    siblings.splice(at, 0, { title, url: url || "#" })
  } else {
    if (!path) return { output: `Name the link, by its title. ${handle}'s links: ${linkList(links)}.`, failed: true }
    const found = locate(links, path)
    if (!found) return { output: `"${path}" is not a link in ${handle}. Its links: ${linkList(links)}.`, failed: true }
    if (action === "update") {
      if (!title && !url) return { output: "Send the new title, the new address, or both.", failed: true }
      const was = found.list[found.at]
      found.list[found.at] = { ...was, ...(title ? { title } : {}), ...(url ? { url } : {}) }
    } else if (action === "move") {
      const [moving] = found.list.splice(found.at, 1)
      const at = index < 0 || index > found.list.length ? found.list.length : index
      found.list.splice(at, 0, moving)
    } else if (action === "remove") {
      found.list.splice(found.at, 1)
    } else {
      return { output: 'action is one of "add", "update", "move", "remove".', failed: true }
    }
  }

  const next = cleanMenus({ ...menus, [handle]: { title: menus[handle].title, links } })
  const ops: ThemeOp[] = []
  /* A header still drawing its own links is pointed at the Main menu, the way the editor's first menu edit does it. Its blocks stay. */
  if (handle === MAIN_MENU && header && adoptHeaderLinks(state.settings.menus, header)) {
    ops.push({ kind: "update_section", id: header.id, settings: { menu: MAIN_MENU } })
  }
  ops.push({ kind: "update_theme", settings: { menus: next } })
  const shown = next[handle]?.links ?? []
  return {
    output: `${handle} now reads: ${linkList(shown)}${shown.some((l) => l.links?.length) ? ` (with ${shown.filter((l) => l.links?.length).map((l) => `${l.title}: ${linkList(l.links ?? [])}`).join("; ")})` : ""}.${ops.length > 1 ? " The header now shows this menu; its old links are kept, unused." : ""}`,
    ops,
  }
}

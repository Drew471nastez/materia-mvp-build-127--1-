"use client"

import { ChevronRight } from "lucide-react"

import { cleanMenus } from "@/lib/storelib-theme/values"
import { MAIN_MENU, adoptHeaderLinks, headerMenuHandle, menuChoices } from "@/lib/website-builder/main-menu"
import { Card, PageTitle, Row, buttonClass, inputClass } from "./parts"
import type { SettingsContext } from "./types"
import { tt } from "@/lib/i18n/text"

const str = (v: unknown) => (typeof v === "string" ? v : "")

/**
 * ===========================================================================
 *  NAVIGATION: THE SITE'S MENUS, IN ONE PLACE
 * ===========================================================================
 * Shopify's Navigation: the menus first, Main menu at the top, and then which
 * menu sits where. The header shows a menu (the Main menu unless it is told
 * otherwise) and each footer column shows one.
 *
 * NOTHING HERE IS A SECOND COPY. The menus are the store's, the ones the
 * editor's Navigation panel edits, shared by every theme and saved to the
 * store as they change (lib/website-builder/store-menus-server.ts). The
 * header's menu is its own `menu`
 * setting, and the footer's two columns its `menu` and `menu_2`. A site whose
 * header still keeps its links as blocks has them shown as the Main menu, and
 * the first edit moves them in (lib/website-builder/main-menu.ts).
 *
 * The links themselves are edited in the builder's Navigation panel, not
 * here: a menu is listed with how many links it has and where it shows, and
 * a press opens it there (`onEditMenu`).
 */
export function NavigationSettings({ ctx }: { ctx: SettingsContext }) {
  const header = ctx.header
  const footer = ctx.footer
  const menus = cleanMenus(ctx.settings.menus)
  const choices = menuChoices(ctx.settings.menus, header)

  const footerOptions = [
    { value: "", label: tt("None") },
    ...Object.keys(menus).map((h) => ({ value: h, label: menus[h].title })),
  ]

  /** Where a menu shows, said under its name: "Header", "Footer". */
  const placedIn = (handle: string) => {
    const at: string[] = []
    if (header && headerMenuHandle(ctx.settings.menus, header) === handle) at.push(tt("Header"))
    if (footer && (str(footer.settings.menu) === handle || str(footer.settings.menu_2) === handle)) at.push(tt("Footer"))
    return at.join(", ")
  }

  const pickHeaderMenu = (handle: string) => {
    if (!header) return
    if (handle === MAIN_MENU) {
      const adopted = adoptHeaderLinks(ctx.settings.menus, header)
      if (adopted) ctx.onSettingChange("menus", adopted.menus)
    }
    ctx.onSectionSetting?.(header.id, "menu", handle)
  }

  return (
    <>
      <PageTitle aside={<button type="button" onClick={() => ctx.onEditMenu()} className={buttonClass} data-nav-open-menus="">{tt("Edit menus")}</button>}>
        {tt("Navigation")}
      </PageTitle>

      {/* THE MENUS ARE LISTED HERE, AND EDITED IN NAVIGATION. A menu is the
          store's, not a setting of this site, so its links are edited in one
          place: the builder's Navigation panel, next to Pages, with the page
          drawn beside it so a change is seen as it is made. A row opens that
          menu there. */}
      <Card title={tt("Menus")} footer={tt("Menus belong to your store, so every theme shows the same ones.")}>
        {choices.map((c) => (
          <button
            key={c.handle}
            type="button"
            data-nav-menu-row={c.handle}
            onClick={() => ctx.onEditMenu(c.handle)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06] md:px-6 [-webkit-tap-highlight-color:transparent]"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-medium text-white">{c.title}</span>
              <span className="mt-0.5 block text-[13px] text-white/50">
                {c.count === 0 ? tt("No links yet") : `${c.count} link${c.count === 1 ? "" : "s"}`}
                {placedIn(c.handle) ? ` · ${placedIn(c.handle)}` : ""}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-white/50" aria-hidden />
          </button>
        ))}
      </Card>

      <Card title={tt("Where menus show")}>
        {header ? (
          <Row label={tt("Header")} htmlFor="wb-nav-header-menu">
            <select
              id="wb-nav-header-menu"
              value={headerMenuHandle(ctx.settings.menus, header)}
              onChange={(e) => pickHeaderMenu(e.target.value)}
              className={inputClass}
            >
              {choices.map((c) => (
                <option key={c.handle} value={c.handle}>{c.title}</option>
              ))}
            </select>
          </Row>
        ) : (
          <Row label={tt("Header")} hint={tt("Open a page that has the site's header to choose its menu.")} />
        )}
        {footer ? (
          <>
            <Row label={tt("Footer, first column")} htmlFor="wb-nav-footer-1">
              <select
                id="wb-nav-footer-1"
                value={menus[str(footer.settings.menu)] ? str(footer.settings.menu) : ""}
                onChange={(e) => ctx.onSectionSetting?.(footer.id, "menu", e.target.value)}
                className={inputClass}
              >
                {footerOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Row>
            <Row label={tt("Footer, second column")} htmlFor="wb-nav-footer-2">
              <select
                id="wb-nav-footer-2"
                value={menus[str(footer.settings.menu_2)] ? str(footer.settings.menu_2) : ""}
                onChange={(e) => ctx.onSectionSetting?.(footer.id, "menu_2", e.target.value)}
                className={inputClass}
              >
                {footerOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Row>
          </>
        ) : (
          <Row label={tt("Footer")} hint={tt("Open a page that has the site's footer to choose its menus.")} />
        )}
      </Card>
    </>
  )
}

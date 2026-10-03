"use client"

import { MenusEditor } from "@/components/website-builder/editor/controls/menus-editor"
import { LinkTargetsProvider } from "@/components/website-builder/link-picker"
import { cleanMenus } from "@/lib/storelib-theme/values"
import { MAIN_MENU, adoptHeaderLinks, headerMenuHandle, headerReadsMenu, menuChoices } from "@/lib/website-builder/main-menu"
import { Card, GOES_LIVE, PageTitle, Row, inputClass } from "./parts"
import type { SettingsContext } from "./types"

const str = (v: unknown) => (typeof v === "string" ? v : "")

/**
 * ===========================================================================
 *  NAVIGATION: THE SITE'S MENUS, IN ONE PLACE
 * ===========================================================================
 * Shopify's Navigation: the menus first, Main menu at the top, and then which
 * menu sits where. The header shows a menu (the Main menu unless it is told
 * otherwise) and each footer column shows one.
 *
 * NOTHING HERE IS A SECOND COPY. The menus are the theme's `menus` setting,
 * the one Theme settings › Menus edits. The header's menu is its own `menu`
 * setting, and the footer's two columns its `menu` and `menu_2`. A site whose
 * header still keeps its links as blocks has them shown as the Main menu, and
 * the first edit moves them in (lib/website-builder/main-menu.ts).
 *
 * The editors are the builder's, drawn on this dark page by putting them
 * under `dark`, which flips the tokens they are written in.
 */
export function NavigationSettings({ ctx }: { ctx: SettingsContext }) {
  const header = ctx.header
  const footer = ctx.footer
  const menus = cleanMenus(ctx.settings.menus)
  const choices = menuChoices(ctx.settings.menus, header)

  const footerOptions = [
    { value: "", label: "None" },
    ...Object.keys(menus).map((h) => ({ value: h, label: menus[h].title })),
  ]

  const pickHeaderMenu = (handle: string) => {
    if (!header) return
    if (handle === MAIN_MENU) {
      const adopted = adoptHeaderLinks(ctx.settings.menus, header)
      if (adopted) ctx.onSettingChange("menus", adopted.menus)
    }
    ctx.onSectionSetting?.(header.id, "menu", handle)
  }

  return (
    <LinkTargetsProvider targets={ctx.linkTargets ?? []} sections={ctx.linkSections}>
      <PageTitle>Navigation</PageTitle>

      <Card title="Menus" footer={GOES_LIVE}>
        <div className="dark px-4 py-3 md:px-6" data-nav-menus="">
          <MenusEditor
            value={ctx.settings.menus}
            onChange={(next) => ctx.onSettingChange("menus", next)}
            header={header ?? null}
            onLinkHeader={() => {
              if (header && !headerReadsMenu(header)) ctx.onSectionSetting?.(header.id, "menu", MAIN_MENU)
            }}
          />
        </div>
      </Card>

      <Card title="Where menus show">
        {header ? (
          <Row label="Header" htmlFor="wb-nav-header-menu">
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
          <Row label="Header" hint="Open a page that has the site's header to choose its menu." />
        )}
        {footer ? (
          <>
            <Row label="Footer, first column" htmlFor="wb-nav-footer-1">
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
            <Row label="Footer, second column" htmlFor="wb-nav-footer-2">
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
          <Row label="Footer" hint="Open a page that has the site's footer to choose its menus." />
        )}
      </Card>
    </LinkTargetsProvider>
  )
}

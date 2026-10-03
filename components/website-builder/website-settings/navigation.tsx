"use client"

import { HeaderNavLinksEditor } from "@/components/website-builder/editor/controls/link-list-editor"
import { MenusEditor } from "@/components/website-builder/editor/controls/menus-editor"
import { LinkTargetsProvider } from "@/components/website-builder/link-picker"
import { cleanMenus } from "@/lib/storelib-theme/values"
import type { NavBlock } from "@/lib/website-builder/nav-links"
import { Card, GOES_LIVE, PageTitle, Row, inputClass } from "./parts"
import type { SettingsContext } from "./types"

const str = (v: unknown) => (typeof v === "string" ? v : "")

/**
 * ===========================================================================
 *  NAVIGATION: THE SITE'S LINKS, IN ONE PLACE
 * ===========================================================================
 * The header's links, the menus the footer and any section can show, and
 * which menu sits where, all edited here without opening a section first.
 *
 * NOTHING HERE IS A SECOND COPY. The header's links are the header's own
 * nav_link blocks, edited through the editor's own block writers, so a link
 * changed here is the same link the Header panel shows, saved with the
 * draft and taken back with Undo. The menus are the theme's `menus`
 * setting, the one Theme settings › Menus edits. The footer's two columns
 * are the footer's own `menu` and `menu_2` settings.
 *
 * The editors are the builder's, drawn on this dark page by putting them
 * under `dark`, which flips the tokens they are written in.
 */
export function NavigationSettings({ ctx }: { ctx: SettingsContext }) {
  const header = ctx.header
  const footer = ctx.footer
  const menus = cleanMenus(ctx.settings.menus)
  const handles = Object.keys(menus)
  const headerMenu = str(header?.settings.menu)
  const usingMenu = !!headerMenu && !!menus[headerMenu]

  const menuOptions = [
    { value: "", label: "None" },
    ...handles.map((h) => ({ value: h, label: menus[h].title })),
  ]

  return (
    <LinkTargetsProvider targets={ctx.linkTargets ?? []}>
      <PageTitle>Navigation</PageTitle>

      <Card title="Header menu" footer={GOES_LIVE}>
        {header ? (
          <>
            <Row label="Links come from" hint="The header's own links, or one of the menus below." htmlFor="wb-nav-header-source">
              <select
                id="wb-nav-header-source"
                value={usingMenu ? headerMenu : ""}
                onChange={(e) => ctx.onSectionSetting?.(header.id, "menu", e.target.value)}
                className={inputClass}
              >
                <option value="">The header's own links</option>
                {handles.map((h) => (
                  <option key={h} value={h}>{`The ${menus[h].title} menu`}</option>
                ))}
              </select>
            </Row>
            <div className="dark px-4 py-4 md:px-6" data-nav-header-links="">
              {usingMenu && (
                <p className="mb-3 text-[13px] leading-snug text-white/45">
                  The header shows the {menus[headerMenu].title} menu. These links are kept for when you switch back.
                </p>
              )}
              <HeaderNavLinksEditor
                blocks={(header.blocks ?? []) as NavBlock[]}
                disabled={usingMenu}
                onUpdateBlockSetting={(blockId, key, value) => ctx.onBlockSetting?.(header.id, blockId, key, value)}
                onAddBlock={(type, initial) => ctx.onAddBlock?.(header.id, type, initial)}
                onRemoveBlock={(blockId) => ctx.onRemoveBlock?.(header.id, blockId)}
                onReorderBlocks={(blocks) => ctx.onReorderBlocks?.(header.id, blocks)}
              />
            </div>
          </>
        ) : (
          <Row label="No header on this page" hint="Open a page that has the site's header to edit its links." />
        )}
      </Card>

      <Card title="Footer" footer={GOES_LIVE}>
        {footer ? (
          <>
            <Row label="First column" hint="A menu shown as a column of links." htmlFor="wb-nav-footer-1">
              <select
                id="wb-nav-footer-1"
                value={menus[str(footer.settings.menu)] ? str(footer.settings.menu) : ""}
                onChange={(e) => ctx.onSectionSetting?.(footer.id, "menu", e.target.value)}
                className={inputClass}
              >
                {menuOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Row>
            <Row label="Second column" htmlFor="wb-nav-footer-2">
              <select
                id="wb-nav-footer-2"
                value={menus[str(footer.settings.menu_2)] ? str(footer.settings.menu_2) : ""}
                onChange={(e) => ctx.onSectionSetting?.(footer.id, "menu_2", e.target.value)}
                className={inputClass}
              >
                {menuOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Row>
          </>
        ) : (
          <Row label="No footer on this page" hint="Open a page that has the site's footer to choose its menus." />
        )}
      </Card>

      <Card title="Menus" footer="A menu can sit in the header, in a footer column, and in any section that shows one.">
        <div className="dark px-4 py-4 md:px-6" data-nav-menus="">
          <MenusEditor value={ctx.settings.menus} onChange={(next) => ctx.onSettingChange("menus", next)} />
        </div>
      </Card>
    </LinkTargetsProvider>
  )
}

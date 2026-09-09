/** Emits a page with an announcement bar, a sticky header and a tall hero. */
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const root = process.cwd()
const OUT = process.env.OUT_DIR!

const base = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) =>
    (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]),
  ),
) as unknown as ThemeSettingsValues

const theme = {
  ...base,
  announcement_bar_enabled: true,
  announcement_bar_text: "Walk-ins welcome",
} as ThemeSettingsValues

function shipped(type: string, extra: Record<string, unknown> = {}): SectionInstance {
  const schema = JSON.parse(readFileSync(join(root, `themes/default/sections/${type}.json`), "utf8"))
  const settings: Record<string, unknown> = {}
  for (const f of schema.fields ?? []) if (f.default !== undefined) settings[f.id] = f.default
  Object.assign(settings, schema.presets?.[0]?.settings ?? {}, extra)
  const blocks = (schema.presets?.[0]?.blocks ?? []).map((b: any, i: number) => ({
    id: `${type}-b${i}`,
    type: b.type,
    settings: b.settings ?? {},
  }))
  return { id: type, type, name: type, settings, blocks }
}

/**
 * Four configurations, because the header behaves differently in each and
 * until now only three of them were ever looked at.
 *
 * `sticky-scroll-up` is the fourth, and it is the one that carries the risk:
 * it is the only mode where the header's `transform` ever changes, so it is
 * the only mode where the header is hidden, revealed, and has to land back
 * under the announcement bar afterwards. The other three never move it, which
 * is why a suite that passed on all three said nothing about this.
 */
const CASES: [string, Record<string, unknown>][] = [
  ["sticky", { header_sticky_enabled: true, header_transparent: false }],
  ["sticky-transparent", { header_sticky_enabled: true, header_transparent: true }],
  ["static", { header_sticky_enabled: false, header_transparent: false }],
  [
    "sticky-scroll-up",
    { header_sticky_enabled: true, header_transparent: false, header_sticky_on_scroll_up: true },
  ],
]

for (const [name, overrides] of CASES) {
  const html = renderToStaticMarkup(
    createElement(ThemePage, {
      theme,
      sections: [
        shipped("header", overrides),
        shipped("hero"),
        shipped("feature_grid"),
        shipped("footer"),
      ],
    }),
  )

  writeFileSync(
    join(OUT, `sticky-${name}.html`),
    `<!doctype html><meta name="viewport" content="width=device-width">
<link rel="stylesheet" href="app.css">
<style>body{margin:0}</style>
<!-- The marketing layout, verbatim: a flex column with an overflow-clipped main. -->
<div class="flex min-h-svh flex-col"><main class="flex-1 [overflow-x:clip]">${html}</main></div>
<div style="height:2200px"></div>
<pre id="out">pending</pre>`,
  )
}
console.log("emitted")

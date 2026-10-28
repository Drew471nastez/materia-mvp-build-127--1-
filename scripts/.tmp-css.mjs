import { appCss } from "./probe-css.mjs"
const css = await appCss(process.cwd())
for (const m of css.matchAll(/svg\+xml;utf8,<svg%20/g)) console.log(JSON.stringify(css.slice(m.index-40, m.index+250)))

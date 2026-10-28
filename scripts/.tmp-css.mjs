import { appCss } from "./probe-css.mjs"
const css = await appCss(process.cwd())
const i = css.indexOf("data\\:image\\/svg")
console.log(i, css.slice(i - 200, i + 400))

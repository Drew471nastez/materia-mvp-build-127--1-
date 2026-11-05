/**
 * Tailwind for every compile, except inside `pnpm build`: there
 * scripts/build-css.mjs has already compiled app/globals.css in its own
 * process, and scripts/build-next.mjs sets STORELIB_CSS_PRECOMPILED=1 so the
 * build hands that result over without loading Tailwind again. Keeps the
 * build under the 8 GB of Vercel's Standard machine (scripts/build-css.mjs).
 */
import { join } from "node:path"

/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: process.env.STORELIB_CSS_PRECOMPILED === "1"
    ? { [join(process.cwd(), "scripts", "postcss-precompiled.cjs")]: {} }
    /* scripts/site-css.cjs first: app/site.css becomes a published website's own source, for Tailwind to compile. */
    : { [join(process.cwd(), "scripts", "site-css.cjs")]: {}, "@tailwindcss/postcss": {} },
}

export default config

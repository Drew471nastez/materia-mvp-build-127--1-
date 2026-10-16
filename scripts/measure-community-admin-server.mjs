/**
 * Runs scripts/measure-community-admin-server.ts: bundled with esbuild for node, with the request-only modules (the
 * router's notFound and redirect, cookies and headers, server-only) stood in, so the real server code of the community
 * admin pages runs outside a request.
 *
 *   node scripts/measure-community-admin-server.mjs [LAT] [--staff]
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"

const root = process.cwd()
const out = join(root, ".community-admin32-server-probe")
mkdirSync(out, { recursive: true })
const stubs = {
  "server-only": "export {}\n",
  "next/navigation": "export const notFound = () => { throw new Error('NOT_FOUND') }\nexport const redirect = () => { throw new Error('REDIRECT') }\nexport const permanentRedirect = redirect\n",
  "next/headers": "export const cookies = async () => ({ get: () => undefined, getAll: () => [], set() {} })\nexport const headers = async () => new Headers()\n",
  "next/cache": "export const unstable_cache = (f) => f\nexport const revalidatePath = () => {}\nexport const revalidateTag = () => {}\n",
}
for (const [name, body] of Object.entries(stubs)) writeFileSync(join(out, `${name.replace(/\W+/g, "_")}.mjs`), body)
await build({
  entryPoints: [join(root, "scripts/measure-community-admin-server.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: join(out, "measure.cjs"),
  logLevel: "error",
  absWorkingDir: root,
  alias: { "@": "." },
  packages: "external",
  plugins: [
    {
      name: "request-stubs",
      setup(b) {
        b.onResolve({ filter: /^(server-only|next\/navigation|next\/headers|next\/cache)$/ }, (a) => ({ path: join(out, `${a.path.replace(/\W+/g, "_")}.mjs`) }))
        /* Everything else from node_modules stays a plain import; our own files are bundled. */
      },
    },
  ],
})
process.argv = [process.argv[0], join(out, "measure.cjs"), ...process.argv.slice(2)]
try {
  const { done } = await import(pathToFileURL(join(out, "measure.cjs")).href)
  await done
} finally {
  rmSync(out, { recursive: true, force: true })
}

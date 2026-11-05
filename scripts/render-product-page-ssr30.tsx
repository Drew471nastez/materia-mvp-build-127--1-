/**
 * THE PRODUCT PAGE, RENDERED ON THE SERVER, for scripts/check-transitions-round30.mjs (PRODUCT).
 *
 * The real app/(storelib)/(marketing)/p/[slug]/page.tsx and its layout, called the way the app router calls them, with the data
 * they read answered from fixtures (the probe swaps the loaders, the Supabase clients and next/headers for stubs) and
 * the element they return rendered to HTML. Not hydrated: what is measured is what the page paints, its colours.
 *
 *   renderProduct("default")  a creator who never designed anything: no store config, the platform's default look
 *   renderProduct("custom")   a creator with a look of their own: the Sage scheme and an arranged product page
 */
import React from "react"
import { renderToReadableStream } from "react-dom/server"
import ProductPage from "@/app/(storelib)/(marketing)/p/[slug]/page"
import ProductLayout from "@/app/(storelib)/(marketing)/p/[slug]/layout"

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const dec = new TextDecoder()
  let out = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out += dec.decode(value, { stream: true })
  }
  return out + dec.decode()
}

/* An async component in the tree (the page, the layout) is resolved here before React renders it: no RSC renderer in a probe. */
async function resolve(node: unknown): Promise<unknown> {
  if (Array.isArray(node)) return Promise.all(node.map(resolve))
  if (!node || typeof node !== "object" || !("type" in (node as object))) return node
  const el = node as React.ReactElement<{ children?: unknown }>
  if (typeof el.type === "function" && el.type.constructor?.name === "AsyncFunction") {
    return resolve(await (el.type as unknown as (p: unknown) => Promise<unknown>)(el.props))
  }
  const kids = el.props?.children
  if (kids === undefined) return el
  return (React.cloneElement as unknown as (e: unknown, p: undefined, ...c: unknown[]) => unknown)(el, undefined, ...([] as unknown[]).concat(await resolve(kids)))
}

export async function renderProduct(which: string): Promise<string> {
  ;(globalThis as { __productCase?: string }).__productCase = which
  const slug = "glaze-notes"
  const params = Promise.resolve({ slug })
  const searchParams = Promise.resolve({ layout: "discover", recommended: "1" })
  const page = await ProductPage({ params, searchParams } as never)
  const tree = await ProductLayout({ children: await resolve(page) as React.ReactNode, params } as never)
  const stream = await renderToReadableStream(await resolve(tree) as React.ReactElement)
  await (stream as unknown as { allReady: Promise<void> }).allReady
  return streamToString(stream)
}

"use client"

import * as React from "react"

import { Banner, Button, Filters, Panel, Placeholder } from "../_console/ui"
import { DEFAULT_LISTING_SLUG, THEME_CATEGORIES, tierLabel, type ThemeListing, type ThemeTier } from "@/lib/themes/marketplace-shared"

/**
 * ===========================================================================
 *  THEMES
 * ===========================================================================
 * Every theme creators see in Browse themes and at storelib.com/themes, in
 * the order they see them. Open one to change its name, author, category,
 * price, pictures or zip, or to hide it. A new theme is saved first (it
 * needs an id to keep its files under), then its zip and pictures go up.
 *
 * The zip goes straight from this page to private storage, and the server
 * checks it before the theme points at it (app/api/admin/themes/package).
 * Every save shows on the library and the marketplace at once.
 */

type Draft = {
  id: string | null
  builtin: boolean
  name: string
  slug: string
  author_name: string
  category: string
  tier: ThemeTier
  price: string
  published: boolean
  sort_order: string
  demo_url: string
  cover: string | null
  avatar: string | null
  screenshots: string[]
  packageKind: string | null
  hasPackage: boolean
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function toDraft(l: ThemeListing | null): Draft {
  return {
    id: l && UUID.test(l.id) ? l.id : null,
    builtin: !!l?.builtinThemeId,
    name: l?.name ?? "",
    slug: l?.slug ?? "",
    author_name: l?.author ?? "Storelib",
    category: l?.category ?? "general",
    tier: l?.tier ?? "free",
    price: l && l.tier === "paid" ? String(l.priceCents / 100) : "",
    published: l?.published ?? false,
    sort_order: String(l?.sortOrder ?? 0),
    demo_url: l?.demoUrl ?? "",
    cover: l?.cover ?? null,
    avatar: l?.authorAvatar ?? null,
    screenshots: l?.screenshots ?? [],
    packageKind: l?.packageKind ?? null,
    hasPackage: !!l?.hasPackage,
  }
}

const field = "h-9 w-full rounded-[7px] border border-white/[0.1] bg-[#0b0b0f] px-2.5 text-[13px] text-[#ededf0] outline-none focus:border-[#8b5cf6]/70"
const KIND_WORD: Record<string, string> = { storelib: "Storelib theme", shopify: "Shopify theme", export: "Storelib export" }

function putWithProgress(url: string, file: File, onProgress: (f: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", file.type || "application/zip")
    xhr.setRequestHeader("x-upsert", "true")
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300)
    xhr.onerror = () => resolve(false)
    xhr.send(file)
  })
}

export function ThemesAdmin() {
  const [list, setList] = React.useState<ThemeListing[] | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<{ tone: "good" | "bad" | "plain"; text: string } | null>(null)
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [progress, setProgress] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/themes", { cache: "no-store" })
      if (res.status === 401) return window.location.reload()
      const body = await res.json().catch(() => null)
      if (!res.ok) return setNote({ tone: "bad", text: body?.error || "The themes could not be read." })
      setList(body?.listings ?? [])
      setNotice(body?.notice ?? null)
    } catch {
      setNote({ tone: "bad", text: "Could not reach Storelib." })
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d))

  const fromListing = (l: ThemeListing) => setDraft((d) => (d ? { ...toDraft(l), builtin: d.builtin || !!l.builtinThemeId } : toDraft(l)))

  const save = async () => {
    if (!draft) return
    setBusy("save")
    setNote(null)
    try {
      const res = await fetch("/api/admin/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draft.id,
          builtin: draft.builtin,
          name: draft.name,
          slug: draft.slug,
          author_name: draft.author_name,
          category: draft.category,
          tier: draft.tier,
          price_cents: draft.tier === "paid" ? Math.round(Number(draft.price) * 100) : 0,
          published: draft.published,
          sort_order: Number(draft.sort_order),
          demo_url: draft.demo_url.trim() || null,
          screenshots: draft.screenshots,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) return setNote({ tone: "bad", text: body?.error || "The theme did not save." })
      fromListing(body.listing as ThemeListing)
      setNote({ tone: "good", text: draft.id ? "Saved. It shows in the library and the marketplace now." : "Saved. Add its zip and pictures below." })
      await load()
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!draft?.id || !window.confirm(`Remove ${draft.name}? Websites already made from it keep everything.`)) return
    setBusy("remove")
    try {
      const res = await fetch(`/api/admin/themes?id=${encodeURIComponent(draft.id)}`, { method: "DELETE" })
      const body = await res.json().catch(() => null)
      if (!res.ok) return setNote({ tone: "bad", text: body?.error || "The theme was not removed." })
      setDraft(null)
      setNote({ tone: "good", text: "Removed." })
      await load()
    } finally {
      setBusy(null)
    }
  }

  const uploadZip = async (file: File) => {
    if (!draft?.id) return
    setBusy("zip")
    setNote(null)
    setProgress(0)
    try {
      const start = await fetch("/api/admin/themes/package", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId: draft.id, size: file.size }) })
      const place = await start.json().catch(() => null)
      if (!start.ok || !place?.url) return setNote({ tone: "bad", text: place?.error || "Could not start the upload." })
      const sent = await putWithProgress(place.url, file, setProgress)
      if (!sent) return setNote({ tone: "bad", text: "The zip did not upload. Try again." })
      setProgress(null)
      setBusy("check")
      const res = await fetch("/api/admin/themes/package", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId: draft.id, path: place.path }) })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        const more = Array.isArray(body?.errors) && body.errors.length > 1 ? ` ${body.errors.slice(1, 4).join(" ")}` : ""
        return setNote({ tone: "bad", text: `${body?.error || "The zip was refused."}${more}` })
      }
      fromListing(body.listing as ThemeListing)
      setNote({ tone: "good", text: `${KIND_WORD[body.kind] ?? "Theme"} checked: ${body.files} files.` })
      await load()
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  const uploadImage = async (kind: "cover" | "screenshot" | "avatar", file: File) => {
    if (!draft?.id) return
    setBusy(kind)
    setNote(null)
    try {
      const form = new FormData()
      form.append("listingId", draft.id)
      form.append("kind", kind)
      form.append("file", file)
      const res = await fetch("/api/admin/themes/image", { method: "POST", body: form })
      const body = await res.json().catch(() => null)
      if (!res.ok) return setNote({ tone: "bad", text: body?.error || "The picture did not upload." })
      fromListing(body.listing as ThemeListing)
      await load()
    } finally {
      setBusy(null)
    }
  }

  /* One file, or several one after another (screenshots), never two uploads at once. */
  const picker = (onFile: (f: File) => unknown, multiple = false) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ""
    void (async () => {
      for (const f of multiple ? files : files.slice(0, 1)) await onFile(f)
    })()
  }

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-[#ededf0] [font-family:Inter,system-ui,sans-serif]" data-admin-themes="">
      <div className="mx-auto w-full max-w-[1100px] px-4 pb-16 pt-5 sm:px-6 lg:px-8 lg:pt-7">
        <a href="/admin" className="-ml-2 mb-1 inline-flex h-8 items-center rounded-[7px] px-2 text-[13px] text-[#9b9ba6] hover:bg-white/[0.04] hover:text-[#ededf0]">
          Console
        </a>
        <div className="mb-5 flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold tracking-[-0.015em] sm:text-[22px]">Themes</h1>
            <p className="mt-0.5 text-[13px] text-[#9b9ba6]">Browse themes in the library and storelib.com/themes, in this order.</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/themes" target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-[7px] px-3 text-[13px] text-[#9b9ba6] hover:bg-white/[0.05] hover:text-[#ededf0]">
              Open marketplace
            </a>
            <Button variant="primary" onClick={() => setDraft(toDraft(null))} disabled={!!notice}>
              New theme
            </Button>
          </div>
        </div>

        {notice ? <div className="mb-4"><Banner>{notice}</Banner></div> : null}
        {note ? <div className="mb-4"><Banner tone={note.tone} onClose={() => setNote(null)}>{note.text}</Banner></div> : null}

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <Panel title="Listed" meta={list ? `${list.length}` : undefined}>
            {!list ? (
              <Placeholder rows={4} />
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {list.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => setDraft(toDraft(l))}
                      data-admin-theme-row={l.slug}
                      className={`flex w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.03] ${draft?.slug === l.slug ? "bg-white/[0.05]" : ""}`}
                    >
                      <span className="block h-10 w-14 shrink-0 overflow-hidden rounded-[5px] bg-[#1d1d24]">
                        {l.cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={l.cover} alt="" className="h-full w-full object-cover object-top" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{l.name}</span>
                        <span className="block truncate text-[12px] text-[#9b9ba6]">{l.author} · {tierLabel(l)}{l.builtinThemeId ? " · built in" : l.hasPackage ? "" : " · no zip"}</span>
                      </span>
                      <span className={`shrink-0 text-[12px] ${l.published ? "text-[#3fb950]" : "text-[#9b9ba6]"}`}>{l.published ? "Published" : "Hidden"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {draft ? (
            <Panel title={draft.id ? draft.name || "Theme" : draft.builtin ? `${draft.name} (built in)` : "New theme"}>
              <form
                data-admin-theme-form=""
                className="space-y-4 p-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  void save()
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-[12px] text-[#9b9ba6]">
                    Name
                    <input className={`${field} mt-1`} value={draft.name} maxLength={80} onChange={(e) => set("name", e.target.value)} required />
                  </label>
                  <label className="block text-[12px] text-[#9b9ba6]">
                    Address
                    <input className={`${field} mt-1`} value={draft.slug} maxLength={64} placeholder="from the name" disabled={draft.builtin && draft.slug === DEFAULT_LISTING_SLUG} onChange={(e) => set("slug", e.target.value.toLowerCase())} />
                  </label>
                  <label className="block text-[12px] text-[#9b9ba6]">
                    Author
                    <input className={`${field} mt-1`} value={draft.author_name} maxLength={80} onChange={(e) => set("author_name", e.target.value)} />
                  </label>
                  <label className="block text-[12px] text-[#9b9ba6]">
                    Category
                    <select className={`${field} mt-1`} value={draft.category} onChange={(e) => set("category", e.target.value)}>
                      {THEME_CATEGORIES.map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Filters label="Price" options={[{ id: "free", label: "Free" }, { id: "paid", label: "Paid" }, { id: "pro", label: "Grow and Pro" }]} value={draft.tier} onChange={(v) => set("tier", v as ThemeTier)} />
                  {draft.tier === "paid" ? (
                    <label className="flex items-center gap-2 text-[12px] text-[#9b9ba6]">
                      USD
                      <input className={`${field} w-24`} inputMode="decimal" value={draft.price} placeholder="49" onChange={(e) => set("price", e.target.value.replace(/[^0-9.]/g, ""))} />
                    </label>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                  <label className="block text-[12px] text-[#9b9ba6]">
                    Demo store, optional
                    <input className={`${field} mt-1`} value={draft.demo_url} placeholder="https://" onChange={(e) => set("demo_url", e.target.value)} />
                  </label>
                  <label className="block text-[12px] text-[#9b9ba6]">
                    Order
                    <input className={`${field} mt-1`} inputMode="numeric" value={draft.sort_order} onChange={(e) => set("sort_order", e.target.value.replace(/[^0-9-]/g, ""))} />
                  </label>
                </div>

                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={draft.published} onChange={(e) => set("published", e.target.checked)} className="h-4 w-4 accent-[#8b5cf6]" />
                  Published
                </label>

                <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-4">
                  {draft.id ? (
                    <Button variant="quiet" onClick={() => void remove()} disabled={!!busy}>
                      Remove
                    </Button>
                  ) : <span />}
                  <Button variant="primary" type="submit" disabled={!!busy || !draft.name.trim()}>
                    {busy === "save" ? "Saving" : "Save"}
                  </Button>
                </div>
              </form>

              {draft.id ? (
                <div className="space-y-4 border-t border-white/[0.08] p-4" data-admin-theme-files="">
                  {!draft.builtin ? (
                    <div>
                      <p className="text-[12px] text-[#9b9ba6]">Theme zip</p>
                      <div className="mt-1 flex flex-wrap items-center gap-3">
                        <label className="inline-flex h-8 cursor-pointer items-center rounded-[7px] border border-white/[0.1] bg-[#17171d] px-3 text-[13px] font-medium hover:bg-[#1d1d24]">
                          {draft.hasPackage ? "Replace zip" : "Upload zip"}
                          <input type="file" accept=".zip,application/zip" className="sr-only" disabled={!!busy} onChange={picker((f) => uploadZip(f))} />
                        </label>
                        <span className="text-[12px] text-[#9b9ba6]">
                          {busy === "zip" && progress !== null ? `Uploading ${Math.round(progress * 100)}%` : busy === "check" ? "Checking" : draft.hasPackage ? KIND_WORD[draft.packageKind ?? ""] ?? "Zip stored" : "Up to 50 MB. Storelib or Shopify theme."}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-[12px] text-[#9b9ba6]">Cover, a full page screenshot</p>
                      <div className="mt-1 aspect-[4/3] overflow-hidden rounded-[7px] bg-[#1d1d24]">
                        {draft.cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={draft.cover} alt="" className="h-full w-full object-cover object-top" />
                        ) : null}
                      </div>
                      <label className="mt-2 inline-flex h-8 cursor-pointer items-center rounded-[7px] border border-white/[0.1] bg-[#17171d] px-3 text-[13px] font-medium hover:bg-[#1d1d24]">
                        {busy === "cover" ? "Uploading" : "Upload cover"}
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" className="sr-only" disabled={!!busy} onChange={picker((f) => uploadImage("cover", f))} />
                      </label>
                    </div>
                    <div>
                      <p className="text-[12px] text-[#9b9ba6]">Author photo</p>
                      <div className="mt-1 flex items-center gap-3">
                        <span className="block h-12 w-12 overflow-hidden rounded-full bg-[#1d1d24]">
                          {draft.avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={draft.avatar} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </span>
                        <label className="inline-flex h-8 cursor-pointer items-center rounded-[7px] border border-white/[0.1] bg-[#17171d] px-3 text-[13px] font-medium hover:bg-[#1d1d24]">
                          {busy === "avatar" ? "Uploading" : "Upload photo"}
                          <input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" className="sr-only" disabled={!!busy} onChange={picker((f) => uploadImage("avatar", f))} />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-[12px] text-[#9b9ba6]">Screenshots ({draft.screenshots.length} of 12)</p>
                    <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {draft.screenshots.map((src) => (
                        <div key={src} className="group relative aspect-[4/3] overflow-hidden rounded-[7px] bg-[#1d1d24]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt="" className="h-full w-full object-cover object-top" />
                          <button
                            type="button"
                            onClick={() => set("screenshots", draft.screenshots.filter((s) => s !== src))}
                            className="absolute right-1 top-1 rounded-[5px] bg-black/70 px-1.5 py-0.5 text-[11px] text-white"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    <label className="mt-2 inline-flex h-8 cursor-pointer items-center rounded-[7px] border border-white/[0.1] bg-[#17171d] px-3 text-[13px] font-medium hover:bg-[#1d1d24]">
                      {busy === "screenshot" ? "Uploading" : "Add screenshots"}
                      <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif,image/gif" className="sr-only" disabled={!!busy || draft.screenshots.length >= 12} onChange={picker((f) => uploadImage("screenshot", f), true)} />
                    </label>
                    <p className="mt-1 text-[12px] text-[#6b6b76]">A removed screenshot goes when you press Save.</p>
                  </div>
                </div>
              ) : (
                <p className="border-t border-white/[0.08] px-4 py-3 text-[12px] text-[#9b9ba6]">Save once to add the zip and pictures.</p>
              )}
            </Panel>
          ) : (
            <Panel>
              <p className="px-4 py-8 text-[13px] text-[#9b9ba6]">Open a theme to change it, or add a new one.</p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}

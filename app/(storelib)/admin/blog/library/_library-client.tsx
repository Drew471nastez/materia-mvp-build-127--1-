"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import BlogEditor, { blankBlock } from "@/components/admin/blog-editor"
import { Button, ConfirmDialog, Filters, Panel, cx } from "@/app/(storelib)/admin/_console/ui"
import type { Block } from "@/lib/blog/blocks"
import type { BlogAuthor, BlogCategory, BlogSnippet } from "@/lib/blog/admin-store"

import { BlogBar, Field, field, formatAgo } from "../_ui"

/**
 * The blog's library: categories (a managed list; a category's slug is its
 * address and stays when it is renamed), author profiles (the byline on
 * their posts follows a rename), and snippets, reusable blocks written with
 * the post editor itself. Every change is one request and the page is read
 * again from the server after it.
 */

type Tab = "categories" | "authors" | "snippets"

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })
    return { ok: res.ok, data: await res.json().catch(() => ({})) }
  } catch {
    return { ok: false, data: { error: "Could not reach the server." } }
  }
}

export default function LibraryClient({ tab: initialTab, full, note345, categories, authors, snippets }: { tab: Tab; full: boolean; note345: string; categories: BlogCategory[]; authors: BlogAuthor[]; snippets: (BlogSnippet & { posts: number })[] }) {
  const router = useRouter()
  const [tab, setTab] = React.useState<Tab>(initialTab)
  const [message, setMessage] = React.useState<{ tone: "good" | "bad"; text: string } | null>(null)
  const [, start] = React.useTransition()
  const refresh = (text?: string) => {
    if (text) setMessage({ tone: "good", text })
    start(() => router.refresh())
  }
  const fail = (data: Record<string, unknown>) => setMessage({ tone: "bad", text: typeof data.error === "string" ? data.error : "That did not work." })

  return (
    <div className="min-h-[100dvh] bg-[#0b0b0f] text-[#ededf0] [color-scheme:dark]">
      <BlogBar current="/admin/blog/library" />
      <main className="mx-auto max-w-[1000px] space-y-3 px-4 pb-16 pt-6 sm:px-6">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em]">Library</h1>
        <Filters
          label="Library"
          value={tab}
          onChange={(t) => {
            setTab(t)
            setMessage(null)
            window.history.replaceState(null, "", `/admin/blog/library?tab=${t}`)
          }}
          options={[
            { id: "categories", label: `Categories ${categories.length}` },
            { id: "authors", label: `Authors ${authors.length}` },
            { id: "snippets", label: `Snippets ${snippets.length}` },
          ]}
        />
        {message ? (
          <p role="status" className={cx("rounded-[10px] border px-4 py-2.5 text-[13px]", message.tone === "good" ? "border-[#3fb950]/30" : "border-[#f47067]/40 text-[#f47067]")}>
            {message.text}
          </p>
        ) : null}
        {!full ? <p className="rounded-[10px] border border-white/[0.08] px-4 py-3 text-[13px] text-[#9b9ba6]">The library is read only until the tables exist. {note345}</p> : null}
        {tab === "categories" ? <Categories items={categories} full={full} onDone={refresh} onFail={fail} /> : tab === "authors" ? <Authors items={authors} full={full} onDone={refresh} onFail={fail} /> : <Snippets items={snippets} full={full} onDone={refresh} onFail={fail} />}
      </main>
    </div>
  )
}

type Done = { onDone: (text?: string) => void; onFail: (data: Record<string, unknown>) => void }

/* ── Categories ───────────────────────────────────────────────────────── */

function Categories({ items, full, onDone, onFail }: { items: BlogCategory[]; full: boolean } & Done) {
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [removing, setRemoving] = React.useState<BlogCategory | null>(null)
  const [moveTo, setMoveTo] = React.useState("")
  const [removeError, setRemoveError] = React.useState<string | null>(null)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { ok, data } = await call("/api/admin/blog/categories", "POST", { name, description })
    setBusy(false)
    if (!ok) return onFail(data)
    setName("")
    setDescription("")
    onDone(`Added ${name}.`)
  }

  async function remove() {
    if (!removing?.id) return
    setBusy(true)
    const { ok, data } = await call(`/api/admin/blog/categories/${removing.id}${moveTo ? `?move_to=${moveTo}` : ""}`, "DELETE")
    setBusy(false)
    if (!ok) return setRemoveError(typeof data.error === "string" ? data.error : "That did not work.")
    setRemoving(null)
    onDone(`Deleted ${removing.name}.`)
  }

  return (
    <>
      {full ? (
        <Panel title="Add a category">
          <form onSubmit={add} className="grid gap-2 p-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className={cx(field, "h-9")} />
            </Field>
            <Field label="Description">
              <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="Shown at the top of the category's page" className={cx(field, "h-9")} />
            </Field>
            <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
              Add
            </Button>
          </form>
        </Panel>
      ) : null}
      <Panel title="Categories" meta="A category's address keeps its slug when it is renamed">
        <ul>
          {items.map((c) => (
            <CategoryRow key={c.slug} c={c} full={full} onDone={onDone} onFail={onFail} onRemove={() => { setRemoving(c); setMoveTo(""); setRemoveError(null) }} />
          ))}
        </ul>
      </Panel>
      <ConfirmDialog open={Boolean(removing)} title={`Delete ${removing?.name ?? ""}?`} confirmLabel="Delete" danger busy={busy} error={removeError} onClose={() => setRemoving(null)} onConfirm={remove}>
        {removing?.posts ? (
          <>
            <p>
              {removing.posts === 1 ? "1 post is" : `${removing.posts} posts are`} in it. Move {removing.posts === 1 ? "it" : "them"} to:
            </p>
            <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className={cx(field, "h-9")} aria-label="Move posts to">
              <option value="">Choose a category</option>
              {items
                .filter((c) => c.id && c.id !== removing.id)
                .map((c) => (
                  <option key={c.id!} value={c.id!}>
                    {c.name}
                  </option>
                ))}
            </select>
            <p>/blog/explore/categories/{removing.slug} will answer 404.</p>
          </>
        ) : (
          <p>No post is in it. /blog/explore/categories/{removing?.slug} will answer 404.</p>
        )}
      </ConfirmDialog>
    </>
  )
}

function CategoryRow({ c, full, onDone, onFail, onRemove }: { c: BlogCategory; full: boolean; onRemove: () => void } & Done) {
  const [name, setName] = React.useState(c.name)
  const [description, setDescription] = React.useState(c.description)
  const [busy, setBusy] = React.useState(false)
  const changed = name.trim() !== c.name || description.trim() !== c.description
  async function save() {
    setBusy(true)
    const { ok, data } = await call(`/api/admin/blog/categories/${c.id}`, "PATCH", { name, description })
    setBusy(false)
    if (!ok) return onFail(data)
    onDone(name.trim() !== c.name ? `Renamed to ${name.trim()}. Its posts moved with it; the address stays /blog/explore/categories/${c.slug}.` : "Saved.")
  }
  return (
    <li className="grid gap-2 border-b border-white/[0.06] px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-center">
      <div className="min-w-0">
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={!full} aria-label="Name" className={cx(field, "h-9 font-medium")} />
        <p className="mt-1 truncate text-[12px] text-[#6b6b76]">
          /{c.slug} · {c.posts === 1 ? "1 post" : `${c.posts ?? 0} posts`}
        </p>
      </div>
      <input value={description} onChange={(e) => setDescription(e.target.value)} disabled={!full} aria-label="Description" placeholder="No description" className={cx(field, "h-9 self-start")} />
      <div className="flex gap-1.5 self-start">
        <Button variant="plain" disabled={!full || !changed || busy || !name.trim()} onClick={save}>
          Save
        </Button>
        <Button variant="quiet" disabled={!full} onClick={onRemove} className="text-[#f47067]">
          Delete
        </Button>
      </div>
    </li>
  )
}

/* ── Authors ──────────────────────────────────────────────────────────── */

const emptyAuthor = (): Partial<BlogAuthor> => ({ name: "", role: "", bio: "", avatar_url: "", links: [] })

function Authors({ items, full, onDone, onFail }: { items: BlogAuthor[]; full: boolean } & Done) {
  const [open, setOpen] = React.useState<string | null>(null)
  const [removing, setRemoving] = React.useState<BlogAuthor | null>(null)
  const [busy, setBusy] = React.useState(false)
  return (
    <>
      <Panel title="Authors" meta="A post's byline follows its author's name and role" action={full ? <Button variant="plain" onClick={() => setOpen(open === "new" ? null : "new")}>{open === "new" ? "Cancel" : "Add an author"}</Button> : undefined}>
        {open === "new" ? <AuthorForm author={emptyAuthor()} onDone={(t) => { setOpen(null); onDone(t) }} onFail={onFail} /> : null}
        {!items.length && open !== "new" ? <p className="px-4 py-8 text-center text-[13px] text-[#6b6b76]">{full ? "No author profiles yet. Posts show their byline text." : "Author profiles need SQL part 345."}</p> : null}
        <ul>
          {items.map((a) => (
            <li key={a.id} className="border-b border-white/[0.06] last:border-b-0">
              <div className="flex items-center gap-3 px-4 py-3">
                <Avatar url={a.avatar_url} name={a.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{a.name}</p>
                  <p className="truncate text-[12px] text-[#6b6b76]">
                    {a.role || "No role"} · {a.posts === 1 ? "1 post" : `${a.posts ?? 0} posts`}
                  </p>
                </div>
                <Button variant="plain" onClick={() => setOpen(open === a.id ? null : a.id)}>
                  {open === a.id ? "Close" : "Edit"}
                </Button>
                <Button variant="quiet" className="text-[#f47067]" onClick={() => setRemoving(a)}>
                  Delete
                </Button>
              </div>
              {open === a.id ? <AuthorForm author={a} onDone={(t) => { setOpen(null); onDone(t) }} onFail={onFail} /> : null}
            </li>
          ))}
        </ul>
      </Panel>
      <ConfirmDialog
        open={Boolean(removing)}
        title={`Delete ${removing?.name ?? ""}?`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          setBusy(true)
          const { ok, data } = await call(`/api/admin/blog/authors/${removing.id}`, "DELETE")
          setBusy(false)
          setRemoving(null)
          if (!ok) return onFail(data)
          onDone(`Deleted ${removing.name}.`)
        }}
      >
        <p>Their posts keep the byline “{removing ? (removing.role ? `${removing.name} - ${removing.role}` : removing.name) : ""}” and lose the profile.</p>
      </ConfirmDialog>
    </>
  )
}

function Avatar({ url, name }: { url: string | null | undefined; name: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.04] text-[13px] text-[#9b9ba6]">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  )
}

function AuthorForm({ author, onDone, onFail }: { author: Partial<BlogAuthor> } & Done) {
  const [a, setA] = React.useState(author)
  const [links, setLinks] = React.useState((author.links ?? []).map((l) => `${l.label} ${l.url}`).join("\n"))
  const [busy, setBusy] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const parsed = links
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const m = l.match(/^(.*?)\s*(https?:\/\/\S+|mailto:\S+)$/i)
        return m ? { label: m[1] || "Link", url: m[2] } : null
      })
      .filter(Boolean)
    const body = { name: a.name, role: a.role, bio: a.bio, avatar_url: a.avatar_url, links: parsed }
    const { ok, data } = await call(a.id ? `/api/admin/blog/authors/${a.id}` : "/api/admin/blog/authors", a.id ? "PATCH" : "POST", body)
    setBusy(false)
    if (!ok) return onFail(data)
    onDone(a.id ? "Saved. Their posts' bylines follow." : `Added ${a.name}.`)
  }
  async function upload(f: File) {
    const fd = new FormData()
    fd.append("file", f)
    const res = await fetch("/api/admin/blog/upload", { method: "POST", body: fd })
    const d = await res.json().catch(() => ({}))
    if (res.ok && d.url) setA((x) => ({ ...x, avatar_url: d.url }))
    else onFail(d)
  }
  return (
    <form onSubmit={submit} className="grid gap-3 border-t border-white/[0.06] bg-[#0b0b0f]/40 px-4 py-4 sm:grid-cols-2">
      <Field label="Name">
        <input value={a.name ?? ""} onChange={(e) => setA({ ...a, name: e.target.value })} required maxLength={80} className={cx(field, "h-9")} />
      </Field>
      <Field label="Role">
        <input value={a.role ?? ""} onChange={(e) => setA({ ...a, role: e.target.value })} maxLength={80} placeholder="Head of Marketing" className={cx(field, "h-9")} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Bio" count={{ n: (a.bio ?? "").length, max: 1000 }}>
          <textarea value={a.bio ?? ""} onChange={(e) => setA({ ...a, bio: e.target.value })} rows={3} maxLength={1000} className={cx(field, "resize-y py-2 leading-5")} />
        </Field>
      </div>
      <Field label="Photo">
        <div className="flex items-center gap-2">
          <Avatar url={a.avatar_url} name={a.name ?? ""} />
          <input value={a.avatar_url ?? ""} onChange={(e) => setA({ ...a, avatar_url: e.target.value.trim() })} placeholder="https://…" className={cx(field, "h-9 min-w-0 flex-1")} />
          <Button variant="plain" onClick={() => fileRef.current?.click()}>
            Upload
          </Button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f) }} />
        </div>
      </Field>
      <Field label="Links, one per line" hint="A label, then the address: X https://x.com/name">
        <textarea value={links} onChange={(e) => setLinks(e.target.value)} rows={3} className={cx(field, "resize-y py-2 leading-5")} />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" variant="primary" disabled={busy || !(a.name ?? "").trim()}>
          {busy ? "Saving…" : a.id ? "Save" : "Add author"}
        </Button>
      </div>
    </form>
  )
}

/* ── Snippets ─────────────────────────────────────────────────────────── */

function Snippets({ items, full, onDone, onFail }: { items: (BlogSnippet & { posts: number })[]; full: boolean } & Done) {
  const [editing, setEditing] = React.useState<{ id: string | null; name: string; blocks: Block[] } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [removing, setRemoving] = React.useState<(BlogSnippet & { posts: number }) | null>(null)

  async function save() {
    if (!editing) return
    setBusy(true)
    const { ok, data } = await call(editing.id ? `/api/admin/blog/snippets/${editing.id}` : "/api/admin/blog/snippets", editing.id ? "PATCH" : "POST", { name: editing.name, blocks: editing.blocks })
    setBusy(false)
    if (!ok) return onFail(data)
    setEditing(null)
    onDone(editing.id ? "Snippet saved. Every post that places it shows the change." : `Added ${editing.name}.`)
  }

  async function upload(file: File) {
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/admin/blog/upload", { method: "POST", body: fd })
    const d = await res.json().catch(() => ({}))
    if (!res.ok || !d.url) throw new Error(typeof d.error === "string" ? d.error : "The picture could not be uploaded.")
    return d.url as string
  }

  if (editing) {
    return (
      <Panel
        title={editing.id ? "Edit snippet" : "New snippet"}
        action={
          <div className="flex gap-1.5">
            <Button variant="quiet" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={busy || !editing.name.trim()}>
              {busy ? "Saving…" : "Save snippet"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 p-4">
          <Field label="Name" hint="Only you see it, when picking a snippet in a post.">
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={120} placeholder="Newsletter sign up box" className={cx(field, "h-9")} />
          </Field>
          <div className="rounded-[10px] border border-white/[0.08] py-4 pl-10 pr-4 sm:pl-12">
            <BlogEditor blocks={editing.blocks} onChange={(blocks) => setEditing((e) => (e ? { ...e, blocks: blocks.filter((b) => b.type !== "snippet") } : e))} onUpload={upload} snippetsNote="A snippet cannot hold another snippet." />
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <>
      <Panel title="Snippets" meta="Written once, placed in any post" action={full ? <Button variant="plain" onClick={() => setEditing({ id: null, name: "", blocks: [blankBlock("p")] })}>New snippet</Button> : undefined}>
        {!items.length ? <p className="px-4 py-8 text-center text-[13px] text-[#6b6b76]">{full ? "No snippets yet: a sign up box, a disclaimer, a fees table." : "Snippets need SQL part 345."}</p> : null}
        <ul>
          {items.map((s) => (
            <li key={s.id} className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{s.name}</p>
                <p className="truncate text-[12px] text-[#6b6b76]">
                  {s.blocks.length} block{s.blocks.length === 1 ? "" : "s"} · in {s.posts === 1 ? "1 post" : `${s.posts} posts`} · edited {formatAgo(s.updated_at)}
                </p>
              </div>
              <Button variant="plain" onClick={() => setEditing({ id: s.id, name: s.name, blocks: s.blocks.length ? s.blocks : [blankBlock("p")] })}>
                Edit
              </Button>
              <Button variant="quiet" className="text-[#f47067]" onClick={() => setRemoving(s)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </Panel>
      <ConfirmDialog
        open={Boolean(removing)}
        title={`Delete ${removing?.name ?? ""}?`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          setBusy(true)
          const { ok, data } = await call(`/api/admin/blog/snippets/${removing.id}`, "DELETE")
          setBusy(false)
          setRemoving(null)
          if (!ok) return onFail(data)
          onDone(`Deleted ${removing.name}.`)
        }}
      >
        <p>{removing?.posts ? `${removing.posts === 1 ? "1 post places" : `${removing.posts} posts place`} it; the snippet disappears from ${removing.posts === 1 ? "it" : "them"}.` : "No post places it."}</p>
      </ConfirmDialog>
    </>
  )
}

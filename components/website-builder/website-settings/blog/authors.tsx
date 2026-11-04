"use client"

/**
 * The people a post can be written by: a name, a role, a short bio, a
 * picture and a few links, which the post template shows under an article
 * and search engines read as the article's author. Deleting one keeps their
 * posts, with no author named.
 */
import * as React from "react"
import { ChevronDown, Plus, Trash2, UserRound } from "lucide-react"
import { Reveal } from "@/components/ui/reveal"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { postSlugFrom } from "@/lib/site-blog/slug"
import type { SiteBlogAuthor } from "@/lib/site-blog/types"
import { WbImagePicker } from "@/components/website-builder/editor/image-picker"
import { DarkScope, ErrorNote, buttonClass, iconButtonClass, inputClass, primaryButtonClass, textAreaClass } from "../parts"
import { createAuthor, deleteAuthor, updateAuthor, type AuthorInput } from "./api"
import { BlogDialog } from "./ui"

const LINKS_MAX = 5
type Draft = { name: string; role: string; bio: string; avatarUrl: string; links: { label: string; url: string }[] }
const draftOf = (a?: SiteBlogAuthor): Draft => ({ name: a?.name ?? "", role: a?.role ?? "", bio: a?.bio ?? "", avatarUrl: a?.avatarUrl ?? "", links: a?.links?.length ? a.links.map((l) => ({ ...l })) : [] })

export function AuthorsEditor({ installId, authors, onChanged }: { installId: string; authors: SiteBlogAuthor[]; onChanged: () => void }) {
  const [open, setOpen] = React.useState<string | null>(null)
  return (
    <div data-blog-authors="">
      <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
        <p className="text-[13px] leading-snug text-white/50">{tt("Shown with each post, and given to search engines as its author.")}</p>
        <button type="button" onClick={() => setOpen((o) => (o === "new" ? null : "new"))} className={buttonClass} aria-expanded={open === "new"}>
          <Plus className="h-4 w-4" />
          {tt("Add author")}
        </button>
      </div>
      <Reveal open={open === "new"} className="border-t border-white/[0.06] bg-white/[0.02]">
        <AuthorForm installId={installId} onDone={() => { setOpen(null); onChanged() }} onCancel={() => setOpen(null)} />
      </Reveal>
      {authors.length === 0 ? (
        <p className="border-t border-white/[0.07] px-4 py-4 text-[14px] text-white/50 md:px-6">{tt("No authors yet. Posts show no byline until you add one.")}</p>
      ) : (
        <ul>
          {authors.map((a) => (
            <li key={a.id} className="border-t border-white/[0.07]">
              <button
                type="button"
                onClick={() => setOpen((o) => (o === a.id ? null : a.id))}
                aria-expanded={open === a.id}
                className="group flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left md:px-6 [-webkit-tap-highlight-color:transparent]"
              >
                {a.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full bg-white/[0.06] object-cover" />
                ) : (
                  <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.06]">
                    <UserRound className="h-4 w-4 text-white/50" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium text-white">{a.name}</span>
                  {a.role && <span className="block truncate text-[13px] text-white/50">{a.role}</span>}
                </span>
                <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-white/50 transition-[rotate] duration-200 motion-reduce:transition-none", open === a.id && "rotate-180")} />
              </button>
              <Reveal open={open === a.id} className="border-t border-white/[0.06] bg-white/[0.02]">
                <AuthorForm installId={installId} author={a} onDone={() => { setOpen(null); onChanged() }} onCancel={() => setOpen(null)} />
              </Reveal>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AuthorForm({ installId, author, onDone, onCancel }: { installId: string; author?: SiteBlogAuthor; onDone: () => void; onCancel: () => void }) {
  const [d, setD] = React.useState<Draft>(() => draftOf(author))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState(false)
  const id = React.useId()
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))

  async function save() {
    if (!d.name.trim()) return setError(tt("Give the author a name."))
    setBusy(true)
    setError(null)
    const input: AuthorInput = {
      name: d.name.trim(),
      role: d.role.trim(),
      bio: d.bio.trim(),
      avatarUrl: d.avatarUrl,
      links: d.links.map((l) => ({ label: l.label.trim(), url: l.url.trim() })).filter((l) => l.url),
      ...(author ? {} : { slug: postSlugFrom(d.name) }),
    }
    try {
      if (author) await updateAuthor(installId, author.id, input)
      else await createAuthor(installId, input)
      if (!author) setD(draftOf())
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("Something went wrong. Try again."))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!author) return
    setBusy(true)
    setError(null)
    try {
      await deleteAuthor(installId, author.id)
      setConfirming(false)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("Something went wrong. Try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="space-y-4 px-4 py-4 md:px-6"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block" htmlFor={`${id}-name`}>
          <span className="text-[14px] font-medium text-white">{tt("Name")}</span>
          <input id={`${id}-name`} value={d.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} className={cn(inputClass, "mt-1.5 md:w-full")} />
        </label>
        <label className="block" htmlFor={`${id}-role`}>
          <span className="text-[14px] font-medium text-white">{tt("Role")}</span>
          <input id={`${id}-role`} value={d.role} maxLength={120} onChange={(e) => set({ role: e.target.value })} placeholder={tt("Founder")} className={cn(inputClass, "mt-1.5 md:w-full")} />
        </label>
      </div>
      <label className="block" htmlFor={`${id}-bio`}>
        <span className="text-[14px] font-medium text-white">{tt("Bio")}</span>
        <textarea id={`${id}-bio`} value={d.bio} rows={3} maxLength={600} onChange={(e) => set({ bio: e.target.value })} placeholder={tt("A line or two about them.")} className={cn(textAreaClass, "mt-1.5")} />
      </label>
      <div>
        <p className="text-[14px] font-medium text-white">{tt("Picture")}</p>
        <DarkScope className="mt-2 max-w-[420px]">
          <WbImagePicker value={d.avatarUrl || undefined} onChange={(url) => set({ avatarUrl: url ?? "" })} layout="row" aspectRatio="square" folder="blog" />
        </DarkScope>
      </div>
      <fieldset>
        <legend className="text-[14px] font-medium text-white">{tt("Links")}</legend>
        <div className="mt-2 space-y-2">
          {d.links.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={l.label} maxLength={40} onChange={(e) => set({ links: d.links.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} placeholder={tt("Label")} aria-label={tt("Link {n} label", { n: i + 1 })} className={cn(inputClass, "w-[38%] md:w-[160px]")} />
              <input value={l.url} maxLength={500} onChange={(e) => set({ links: d.links.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)) })} placeholder="https://" aria-label={tt("Link {n} address", { n: i + 1 })} className={cn(inputClass, "flex-1 md:w-auto")} />
              <button type="button" onClick={() => set({ links: d.links.filter((_, k) => k !== i) })} className={iconButtonClass} aria-label={tt("Remove link {n}", { n: i + 1 })}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {d.links.length < LINKS_MAX && (
            <button type="button" onClick={() => set({ links: [...d.links, { label: "", url: "" }] })} className={buttonClass}>
              <Plus className="h-4 w-4" />
              {tt("Add link")}
            </button>
          )}
        </div>
      </fieldset>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy} className={primaryButtonClass + " px-4"}>
          {busy ? tt("Saving") : author ? tt("Save") : tt("Add author")}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={buttonClass}>
          {tt("Cancel")}
        </button>
        {author && (
          <button type="button" onClick={() => setConfirming(true)} disabled={busy} className={cn(buttonClass, "ml-auto text-red-300")}>
            {tt("Delete")}
          </button>
        )}
      </div>
      {confirming && author && (
        <BlogDialog
          destructive
          title={tt("Delete this author?")}
          lead={tt("{name} is deleted. Their posts stay, with no author named.", { name: author.name })}
          confirmLabel={tt("Delete")}
          busyLabel={tt("Deleting")}
          busy={busy}
          error={error}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void remove()}
        />
      )}
    </form>
  )
}

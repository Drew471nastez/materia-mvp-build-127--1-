"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ImagePlus, Loader2, X } from "lucide-react"

import { COVER_PRESETS, MAX_BIO_CHARS, normaliseBio, resolveCover } from "@/lib/profile/covers"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/**
 * Editing the two parts of a profile that belong to the profile.
 *
 * Not in settings, and that is the point. Everything else about an account —
 * the email, the password, the payout details — is a form you go and find; a
 * cover and a bio are what the screen you are looking at LOOKS like, and
 * changing them anywhere other than on top of the thing being changed means
 * pressing save and then navigating back to find out what you did. So this
 * opens over the profile, the cover choice is applied to the strip behind it as
 * you touch each one, and closing it is the whole of "done".
 *
 * A sheet on a phone and a centred card on a desktop, from one tree: the
 * geometry is the only thing that differs and duplicating the contents to get
 * two of them is how the two drift apart.
 */

type Saved = { bio: string | null; cover: string | null }

export function ProfileEditor({
  userId,
  initialBio,
  initialCover,
  onClose,
  onApplied,
}: {
  userId: string
  initialBio: string | null
  initialCover: string | null
  onClose: () => void
  /** Applied optimistically to the profile behind this, so the strip changes
   *  under the picker rather than after it closes. */
  onApplied: (next: Saved) => void
}) {
  const router = useRouter()
  const [bio, setBio] = useState(initialBio ?? "")
  const [cover, setCover] = useState<string | null>(initialCover)
  const [busy, setBusy] = useState<null | "cover" | "save">(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const firstFieldRef = useRef<HTMLTextAreaElement>(null)

  // Escape closes it, because on a desktop that is what a dialog does and the
  // pointer may be nowhere near the X.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // The body must not scroll behind a sheet — on a phone that is the difference
  // between a modal and a panel that happens to be on top of a moving page.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const pickPreset = useCallback(
    (id: string) => {
      void triggerHaptic("light")
      const next = `preset:${id}`
      setCover(next)
      // Shown behind the sheet immediately. The write happens on save; what
      // this is for is letting somebody SEE the choice against their own avatar
      // and their own name, which is the only way anybody can judge one.
      onApplied({ bio: normaliseBio(bio) || null, cover: next })
    },
    [bio, onApplied],
  )

  const upload = useCallback(
    async (file: File) => {
      setBusy("cover")
      setError(null)
      try {
        const body = new FormData()
        body.append("file", file)
        const res = await fetch("/api/profile/cover", { method: "POST", body, credentials: "include" })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setError(data?.error ?? "Încărcarea a eșuat.")
          return
        }
        setCover(data.url)
        onApplied({ bio: normaliseBio(bio) || null, cover: data.url })
        // The upload already wrote the column, so the server's copy of this
        // page is out of date the moment it succeeds.
        router.refresh()
      } catch {
        setError("Încărcarea a eșuat.")
      } finally {
        setBusy(null)
      }
    },
    [bio, onApplied, router],
  )

  const save = useCallback(async () => {
    setBusy("save")
    setError(null)
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ bio: normaliseBio(bio), cover }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(
          data?.missingColumns
            ? "Rulează supabase/sql/RUN_PROFILE_COVER_BIO.sql pentru a activa biografia și coperta."
            : (data?.error ?? "Salvarea a eșuat."),
        )
        return
      }
      onApplied({ bio: data.bio ?? null, cover: data.cover ?? null })
      router.refresh()
      onClose()
    } catch {
      setError("Salvarea a eșuat.")
    } finally {
      setBusy(null)
    }
  }, [bio, cover, onApplied, onClose, router])

  const preview = resolveCover(cover, userId)
  const remaining = MAX_BIO_CHARS - bio.length

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="Închide"
        onClick={onClose}
        className="absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Editează profilul"
        className="relative flex max-h-[88svh] w-full flex-col overflow-hidden rounded-t-[22px] bg-white shadow-[0_-8px_40px_-12px_rgba(15,15,15,0.35)] md:max-h-[80svh] md:max-w-lg md:rounded-[22px] md:shadow-[0_24px_60px_-20px_rgba(15,15,15,0.45)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition-colors active:bg-neutral-100"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-[15.5px] font-semibold text-neutral-900">Editează profilul</h2>
          <button
            type="button"
            onClick={save}
            disabled={busy !== null}
            className="flex h-9 items-center justify-center rounded-full bg-[#7c3aed] px-4 text-[13.5px] font-semibold text-white transition-transform active:scale-[0.96] disabled:opacity-60"
          >
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvează"}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {/* What you are choosing, at the size it will be seen. A row of
              swatches is a row of swatches; a strip the shape of the real thing
              is the only preview that answers the question. */}
          <div
            className="relative h-[104px] w-full overflow-hidden rounded-2xl bg-neutral-200"
            style={preview.kind === "preset" ? { background: preview.preset.css } : undefined}
          >
            {preview.kind === "image" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt="" className="h-full w-full object-cover" />
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null}
              className="absolute bottom-2.5 right-2.5 inline-flex h-9 items-center gap-1.5 rounded-full bg-white/95 px-3 text-[12.5px] font-semibold text-neutral-800 shadow-[0_2px_10px_-2px_rgba(15,15,15,0.35)] transition-transform active:scale-[0.96] disabled:opacity-60"
            >
              {busy === "cover" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              Încarcă
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              // Cleared so choosing the SAME file twice still fires a change —
              // otherwise a failed upload cannot be retried without picking a
              // different picture.
              e.target.value = ""
              if (f) void upload(f)
            }}
          />

          <p className="mb-2 mt-5 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-neutral-400">
            Coperta
          </p>
          <div className="grid grid-cols-4 gap-2">
            {COVER_PRESETS.map((p) => {
              const active = cover === `preset:${p.id}` || (cover === null && preview.kind === "preset" && preview.preset.id === p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickPreset(p.id)}
                  aria-label={p.label}
                  aria-pressed={active}
                  className={cn(
                    "relative h-[46px] overflow-hidden rounded-xl transition-transform active:scale-[0.95]",
                    active ? "ring-2 ring-[#7c3aed] ring-offset-2 ring-offset-white" : "ring-1 ring-black/5",
                  )}
                  style={{ background: p.css }}
                >
                  {active && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Check className="h-4 w-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" strokeWidth={3} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <p className="mb-2 mt-6 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-neutral-400">
            Despre tine
          </p>
          <textarea
            ref={firstFieldRef}
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO_CHARS))}
            rows={4}
            placeholder="Ce vinzi, de unde ești, cât de repede expediezi…"
            // 16px, not smaller. iOS Safari zooms the whole page in when a
            // focused field is under it, and the zoom does not come back out.
            className="w-full resize-none rounded-2xl border border-neutral-200 bg-neutral-50 p-3.5 text-[16px] leading-relaxed text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-[#7c3aed]/40 focus:bg-white"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[12px] text-neutral-400">Apare sub numele tău.</span>
            <span className={cn("text-[12px] tabular-nums", remaining <= 20 ? "text-[#7c3aed]" : "text-neutral-400")}>
              {remaining}
            </span>
          </div>

          {error && (
            <p className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-red-700">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}

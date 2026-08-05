"use client"

import { useCallback, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Camera, Check, ImagePlus, Loader2 } from "lucide-react"

import {
  COVER_PRESETS,
  MAX_BIO_CHARS,
  MAX_NAME_CHARS,
  normaliseBio,
  normaliseName,
  resolveCover,
} from "@/lib/profile/covers"
import { triggerHaptic } from "@/lib/native-bridge"
import { navigateBlended } from "@/lib/nav-blend"
import { beginTabLeave } from "@/lib/tab-leave"
import { cn } from "@/lib/utils"

/**
 * /profile/edit — everything about your profile, on its own screen.
 *
 * ---------------------------------------------------------------------------
 * Why a page and not the sheet it replaces
 * ---------------------------------------------------------------------------
 * The first version was a modal over the profile, on the argument that you
 * should be able to see the cover you are choosing against your own avatar. It
 * is a good argument for one control and a bad shape for five. A sheet is for a
 * single decision you make and dismiss; the moment it holds a name, a bio, a
 * picture, a cover and an upload it is a form, and a form in a sheet is a form
 * with a scroll container inside a scroll container, no address of its own, no
 * back button, and nowhere for anything to grow.
 *
 * A page costs one thing — you can no longer see the profile behind it — and
 * pays for it by showing the parts that matter FULL SIZE. The cover preview is
 * the cover, at the height it renders at, with the avatar sitting on it exactly
 * where it will sit. That is a better answer to "how will this look" than a
 * glimpse of the real thing through a gap at the top of a modal.
 *
 * ---------------------------------------------------------------------------
 * Saving
 * ---------------------------------------------------------------------------
 * The two images save THEMSELVES, the moment they are chosen, because an upload
 * is not a draft: the bytes have already left the device and there is nothing
 * to be gained by making somebody press save before the server is allowed to
 * keep what it already has. Everything else — name, bio, which preset — is text
 * you are still editing, and it saves on Salvează.
 */

type Saved = {
  displayName: string | null
  bio: string | null
  cover: string | null
  avatar: string | null
}

export function ProfileEditForm({
  userId,
  username,
  initial,
}: {
  userId: string
  username: string
  initial: Saved
}) {
  const router = useRouter()
  const [displayName, setDisplayName] = useState(initial.displayName ?? "")
  const [bio, setBio] = useState(initial.bio ?? "")
  const [cover, setCover] = useState<string | null>(initial.cover)
  const [avatar, setAvatar] = useState<string | null>(initial.avatar)
  const [busy, setBusy] = useState<null | "cover" | "avatar" | "save">(null)
  const [error, setError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)
  const coverFile = useRef<HTMLInputElement>(null)
  const avatarFile = useRef<HTMLInputElement>(null)

  const preview = resolveCover(cover, userId)
  const name = displayName.trim() || username

  const back = useCallback(() => {
    void triggerHaptic("light")
    beginTabLeave()
    navigateBlended("back", () =>
      window.history.length > 1 ? router.back() : router.push("/profile"),
    )
  }, [router])

  const upload = useCallback(
    async (kind: "cover" | "avatar", file: File) => {
      setBusy(kind)
      setError(null)
      try {
        const body = new FormData()
        body.append("file", file)
        const res = await fetch(`/api/profile/${kind}`, { method: "POST", body, credentials: "include" })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setError(
            data?.missingColumns
              ? "Rulează supabase/sql/RUN_PROFILE_COVER_BIO.sql pentru a activa coperta și biografia."
              : (data?.error ?? "Încărcarea a eșuat."),
          )
          return
        }
        if (kind === "cover") setCover(data.url)
        else setAvatar(data.url)
        void triggerHaptic("light")
        // The upload already wrote the column, so every server-rendered copy of
        // this person — the profile, the inbox rows, the thread header — is out
        // of date the moment it succeeds.
        router.refresh()
      } catch {
        setError("Încărcarea a eșuat.")
      } finally {
        setBusy(null)
      }
    },
    [router],
  )

  const save = useCallback(async () => {
    setBusy("save")
    setError(null)
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          displayName: normaliseName(displayName),
          bio: normaliseBio(bio),
          cover,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(
          data?.missingColumns
            ? "Rulează supabase/sql/RUN_PROFILE_COVER_BIO.sql pentru a activa coperta și biografia."
            : (data?.error ?? "Salvarea a eșuat."),
        )
        return
      }
      void triggerHaptic("light")
      setSavedNote(true)
      router.refresh()
      // Straight back to the profile: the reason anybody opened this screen was
      // to change how that one looks, and leaving them on a form with a green
      // tick makes them press back to find out whether it worked.
      window.setTimeout(back, 380)
    } catch {
      setError("Salvarea a eșuat.")
    } finally {
      setBusy(null)
    }
  }, [displayName, bio, cover, back, router])

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[680px] flex-col pb-16">
      {/* Its own header, sticky, with the save on the right. On a form this
          long the control that finishes it must not be at the bottom of a
          scroll — you should be able to stop editing at any point without
          hunting for the way out.
          
          The safe-area inset is deliberately NOT paid here. GlobalMobileTopBar
          already reserves exactly that height above <main> on every /profile
          route (see `ownsNoChrome` there), so adding it again would push this
          header down by a notch's worth of nothing — the same inset paid twice,
          which is a band of empty white above the only row on the screen you
          need. */}
      <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-2 border-b border-neutral-100 bg-white/95 px-2 py-2 backdrop-blur-md">
        <button
          type="button"
          onClick={back}
          aria-label="Înapoi"
          className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-800 transition-colors active:bg-neutral-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[15.5px] font-semibold text-neutral-900">Editează profilul</h1>
        <button
          type="button"
          onClick={save}
          disabled={busy !== null}
          className="mr-1 flex h-9 min-w-[84px] items-center justify-center rounded-full bg-[#7c3aed] px-4 text-[13.5px] font-semibold text-white transition-transform active:scale-[0.96] disabled:opacity-60"
        >
          {busy === "save" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : savedNote ? (
            <Check className="h-4 w-4" strokeWidth={3} />
          ) : (
            "Salvează"
          )}
        </button>
      </div>

      {/* THE PREVIEW IS THE REAL THING, at the real size. A row of swatches
          answers "which colours are there"; only this answers "how will my
          profile look", which is the question anybody is actually asking. */}
      <div className="px-4 pt-4">
        <div
          className="relative h-[148px] w-full overflow-hidden rounded-2xl"
          style={{ background: preview.kind === "preset" ? preview.preset.css : undefined }}
        >
          {preview.kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/20 to-transparent"
          />
          <button
            type="button"
            onClick={() => coverFile.current?.click()}
            disabled={busy !== null}
            className="absolute bottom-2.5 right-2.5 inline-flex h-9 items-center gap-1.5 rounded-full bg-black/35 px-3 text-[12.5px] font-semibold text-white ring-1 ring-white/25 backdrop-blur-md transition-transform active:scale-[0.96] disabled:opacity-60"
          >
            {busy === "cover" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            Schimbă coperta
          </button>
        </div>

        {/* The avatar straddles the preview exactly as it does on the profile,
            so what this screen shows is the arrangement, not an approximation
            of it. */}
        <div className="flex items-start gap-4">
          <div className="relative -mt-11 shrink-0">
            <span className="block h-[88px] w-[88px] overflow-hidden rounded-full bg-neutral-100 shadow-[0_6px_18px_-8px_rgba(15,15,15,0.35)] ring-4 ring-white">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[32px] font-semibold text-neutral-400">
                  {name.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => avatarFile.current?.click()}
              disabled={busy !== null}
              aria-label="Schimbă poza de profil"
              className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-[#7c3aed] text-white shadow-[0_2px_8px_-1px_rgba(124,58,237,0.6)] ring-[3px] ring-white transition-transform active:scale-90 disabled:opacity-60"
            >
              {busy === "avatar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
          </div>
          <div className="min-w-0 flex-1 pt-3">
            <p className="truncate text-[17px] font-bold text-neutral-900">{name}</p>
            <p className="truncate text-[13px] text-neutral-500">@{username}</p>
          </div>
        </div>
      </div>

      <input
        ref={coverFile}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          // Cleared so choosing the SAME file twice still fires a change —
          // otherwise a failed upload cannot be retried without picking a
          // different picture.
          e.target.value = ""
          if (f) void upload("cover", f)
        }}
      />
      <input
        ref={avatarFile}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (f) void upload("avatar", f)
        }}
      />

      <Section title="Nume">
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value.slice(0, MAX_NAME_CHARS))}
          placeholder={username}
          maxLength={MAX_NAME_CHARS}
          // 16px, not smaller. iOS Safari zooms the whole page in when a focused
          // field is under it, and the zoom does not come back out.
          className="h-12 w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-3.5 text-[16px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-[#7c3aed]/40 focus:bg-white"
        />
        <Hint left="Numele afișat pe profil și pe articolele tale." right={`${MAX_NAME_CHARS - displayName.length}`} />
      </Section>

      <Section title="Despre tine">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO_CHARS))}
          rows={4}
          placeholder="Ce vinzi, de unde ești, cât de repede expediezi…"
          className="w-full resize-none rounded-2xl border border-neutral-200 bg-neutral-50 p-3.5 text-[16px] leading-relaxed text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-[#7c3aed]/40 focus:bg-white"
        />
        <Hint left="Apare sub numele tău." right={`${MAX_BIO_CHARS - bio.length}`} warn={MAX_BIO_CHARS - bio.length <= 20} />
      </Section>

      <Section title="Coperta">
        <div className="grid grid-cols-4 gap-2">
          {COVER_PRESETS.map((p) => {
            const active =
              cover === `preset:${p.id}` ||
              (cover === null && preview.kind === "preset" && preview.preset.id === p.id)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  void triggerHaptic("light")
                  setCover(`preset:${p.id}`)
                }}
                aria-label={p.label}
                aria-pressed={active}
                className={cn(
                  "relative h-[52px] overflow-hidden rounded-xl transition-transform active:scale-[0.95]",
                  active ? "ring-2 ring-[#7c3aed] ring-offset-2 ring-offset-white" : "ring-1 ring-black/5",
                )}
                style={{ background: p.css }}
              >
                {active && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Check className="h-4 w-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]" strokeWidth={3} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {/* Only offered once there is something to go back FROM. On an account
            that has never chosen, this button would undo nothing. */}
        {cover !== null && (
          <button
            type="button"
            onClick={() => {
              void triggerHaptic("light")
              setCover(null)
            }}
            className="mt-3 text-[13px] font-semibold text-[#7c3aed] transition-opacity active:opacity-60"
          >
            Revino la coperta implicită
          </button>
        )}
      </Section>

      {error && (
        <p className="mx-4 mt-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 pt-7">
      <h2 className="mb-2 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-neutral-400">{title}</h2>
      {children}
    </section>
  )
}

function Hint({ left, right, warn = false }: { left: string; right: string; warn?: boolean }) {
  return (
    <div className="mt-1.5 flex items-center justify-between gap-3">
      <span className="text-[12px] text-neutral-400">{left}</span>
      <span className={cn("shrink-0 text-[12px] tabular-nums", warn ? "text-[#7c3aed]" : "text-neutral-400")}>
        {right}
      </span>
    </div>
  )
}

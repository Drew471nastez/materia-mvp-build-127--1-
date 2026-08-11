"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, ArrowLeft, Camera, Check, ImagePlus, Loader2 } from "lucide-react"

import {
  coverImageUrl,
  defaultCoverFor,
  MAX_BIO_CHARS,
  MAX_NAME_CHARS,
  normaliseBio,
  normaliseName,
  resolveCover,
} from "@/lib/profile/covers"
import { compressImage, PROFILE_IMAGE } from "@/lib/images/compress"
import { triggerHaptic } from "@/lib/native-bridge"
import { navigateBlended } from "@/lib/nav-blend"
import { beginTabLeave } from "@/lib/tab-leave"
import { slugifyUsername } from "@/lib/profile/username"
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
  /**
   * THE HANDLE FOLLOWS THE NAME UNTIL SOMEBODY TOUCHES IT.
   *
   * Both readings of "should it change with the name" are right for different
   * people, and the way every platform resolves that is the same: the handle is
   * DERIVED while it has never been edited, and becomes its own field the
   * moment it has. Somebody typing their name gets a handle without thinking
   * about it; somebody who wants "rullz" instead types it once and the name can
   * then change freely without taking it away again.
   *
   * `touched` starts true for an account that already HAS a handle it chose.
   * Deriving over an existing username the first time somebody edits their
   * display name would silently change the address every one of their listings
   * is linked from — which is the one thing this must never do by itself.
   */
  const [handle, setHandle] = useState(username)
  const [handleTouched, setHandleTouched] = useState(true)
  const [handleState, setHandleState] = useState<
    { status: "idle" | "checking" | "free" } | { status: "taken" | "invalid"; message: string; suggestions: string[] }
  >({ status: "idle" })
  const [bio, setBio] = useState(initial.bio ?? "")
  const [cover, setCover] = useState<string | null>(initial.cover)
  const [avatar, setAvatar] = useState<string | null>(initial.avatar)
  const [busy, setBusy] = useState<null | "cover" | "avatar" | "save">(null)
  /** The one thing this screen says back, whatever happened. */
  const [notice, setNotice] = useState<{ tone: "good" | "part" | "bad"; title: string; detail: string | null } | null>(
    null,
  )
  /** The confirmation is on its way out — see the note in `save`. */
  const [leaving, setLeaving] = useState(false)
  const coverFile = useRef<HTMLInputElement>(null)
  const avatarFile = useRef<HTMLInputElement>(null)

  const preview = resolveCover(cover, userId)
  /** The colour under the band and the photograph over it — the same pair the
   *  profile uses, so this preview cannot look different from the real thing. */
  const previewTint =
    preview.kind === "preset"
      ? preview.preset.tint
      : preview.kind === "none"
        ? preview.tint
        : defaultCoverFor(userId).tint
  const previewPhoto =
    preview.kind === "image" ? preview.url : preview.kind === "preset" ? coverImageUrl(preview.preset, 900) : null
  const name = displayName.trim() || username

  /** What the name would produce, if the handle is still following it. */
  useEffect(() => {
    if (handleTouched) return
    setHandle(slugifyUsername(displayName))
  }, [displayName, handleTouched])

  /**
   * Asked as you type, and debounced — a request per keystroke over a table of
   * every account is a request per keystroke over a table of every account.
   *
   * The check is skipped entirely while the handle is unchanged, because "is my
   * own username taken" is a question with an unhelpful answer and the server
   * excludes the caller anyway. `alive` closes the race where a slow answer for
   * an old query lands after a fast one for the current text and overwrites it
   * with a verdict about something nobody typed.
   */
  useEffect(() => {
    const wanted = handle.trim()
    if (!wanted || wanted.toLowerCase() === username.toLowerCase()) {
      setHandleState({ status: "idle" })
      return
    }
    setHandleState({ status: "checking" })
    let alive = true
    const timer = window.setTimeout(() => {
      const q = new URLSearchParams({ q: wanted, name: displayName })
      fetch(`/api/profile/username?${q}`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!alive || !d) return
          if (!d.valid) {
            setHandleState({
              status: "invalid",
              message: "Folosește 3-30 de litere mici, cifre sau linii, fără spații.",
              suggestions: d.suggestions ?? [],
            })
          } else if (!d.available) {
            setHandleState({
              status: "taken",
              message: "Numele de utilizator este deja luat.",
              suggestions: d.suggestions ?? [],
            })
          } else {
            setHandleState({ status: "free" })
          }
        })
        .catch(() => {
          // A failed check is not a verdict. Leaving it idle lets the save go
          // through, where the server decides for real — refusing on a network
          // blip would be the form inventing a rule.
          if (alive) setHandleState({ status: "idle" })
        })
    }, 320)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [handle, username, displayName])

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
      setNotice(null)
      try {
        const body = new FormData()
        // Resized once, here, rather than transformed on every view.
        //
        // An avatar renders at 24–96 CSS pixels and a cover at a few hundred;
        // neither has ever needed the 4000px original a phone camera hands
        // over. With Supabase image transformations removed, this is what keeps
        // the stored file a sensible size — and unlike a transform it is paid
        // once, by the device that already has the bytes.
        //
        // Both kinds use the same 800px ceiling: a cover is wider than an
        // avatar but never taller than the strip it sits in, and one preset is
        // one fewer thing to get wrong. compressImage returns the original on
        // any failure, so this cannot break an upload.
        body.append("file", await compressImage(file, PROFILE_IMAGE))
        const res = await fetch(`/api/profile/${kind}`, { method: "POST", body, credentials: "include" })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setNotice({
            tone: "bad",
            title: "Încărcarea a eșuat",
            detail: data?.missingColumns
              ? "Rulează supabase/sql/RUN_PROFILE_COVER_BIO.sql pentru copertă."
              : (data?.detail ?? data?.error ?? "Încearcă o altă imagine."),
          })
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
        setNotice({ tone: "bad", title: "Încărcarea a eșuat", detail: "Verifică conexiunea." })
      } finally {
        setBusy(null)
      }
    },
    [router],
  )

  const save = useCallback(async () => {
    if (busy) return
    setBusy("save")
    setNotice(null)
    setLeaving(false)
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          displayName: normaliseName(displayName),
          bio: normaliseBio(bio),
          cover,
          // Only when it actually differs. Sending the current handle on every
          // save is a uniqueness check, and a write, for a value nobody
          // touched — and it is the path on which a race with yourself in
          // another tab could refuse a save that changes only a bio.
          ...(handle.trim() && handle.trim().toLowerCase() !== username.toLowerCase()
            ? { username: handle.trim() }
            : null),
        }),
      })
      const data = await res.json().catch(() => null)
      setBusy(null)

      if (!res.ok) {
        // EVERY OUTCOME IS SAID IN THE SAME PLACE, over the middle of the
        // screen. It used to be a paragraph appended after the cover picker —
        // at the bottom of a form long enough that nothing about it was on
        // screen when you pressed the button at the top. So a save that failed
        // looked exactly like a button that did nothing, which is what it was
        // reported as.
        setNotice({
          tone: "bad",
          title: data?.missingColumns ? "Nu se poate salva" : "Salvarea a eșuat",
          detail: data?.missingColumns
            ? "Rulează supabase/sql/RUN_PROFILE_COVER_BIO.sql pentru biografie și copertă."
            // The server's own reason when there is one. A failure you can read
            // is a failure somebody can act on; "încearcă din nou" over a
            // constraint violation is an instruction to repeat the same thing
            // and get the same result.
            : (data?.detail ?? data?.error ?? "Încearcă din nou."),
        })
        return
      }

      void triggerHaptic("medium")
      // Some of it may have had nowhere to go — the columns for the bio and the
      // cover arrive with a migration, and the server now writes what it can
      // rather than refusing the lot. Saying which is the difference between a
      // partial save and a silent one.
      const skipped: string[] = Array.isArray(data?.skipped) ? data.skipped : []
      setNotice(
        skipped.length > 0
          ? {
              tone: "part",
              title: "Nume salvat",
              detail: "Biografia și coperta au nevoie de RUN_PROFILE_COVER_BIO.sql.",
            }
          : { tone: "good", title: "Profil salvat", detail: null },
      )
      router.refresh()
      /**
       * Read it, then let it go, THEN leave.
       *
       * This used to navigate straight out from under the confirmation, so the
       * badge was torn out of the DOM in the same frame the page began to move.
       * Two abrupt changes at once is most of why the return felt buggy rather
       * than finished.
       *
       * Now the confirmation fades itself out first (180ms) and the navigation
       * starts as it lands, so only one thing is moving at any moment. The
       * timings are the same total wait — the difference is entirely in what
       * happens during it.
       *
       * A failure does NOT navigate: you are still in the form, with what you
       * typed, able to try again.
       */
      const dwell = skipped.length > 0 ? 1500 : 950
      window.setTimeout(() => setLeaving(true), Math.max(0, dwell - 180))
      window.setTimeout(back, dwell)
    } catch {
      setBusy(null)
      setNotice({ tone: "bad", title: "Salvarea a eșuat", detail: "Verifică conexiunea și încearcă din nou." })
    }
    /**
     * `handle` AND `username` ARE IN HERE, and their absence was the bug.
     *
     * useCallback froze this function on the first render, so the `handle` it
     * closed over was the one the form was born with — the account's existing
     * username. The comparison against `username` was therefore always equal,
     * the `username` key was never added to the body, and pressing save after
     * changing the handle sent everything EXCEPT the handle. The request
     * succeeded, the form said "Profil salvat", and nothing about the address
     * had changed.
     *
     * Nothing in the code read wrong. A stale closure is invisible at the call
     * site and the save it produces is a successful save of the old value.
     */
  }, [busy, displayName, bio, cover, handle, username, back, router])

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[680px] flex-col pb-16">
      {/* Its own header, sticky, with the save on the right. On a form this
          long the control that finishes it must not be at the bottom of a
          scroll — you should be able to stop editing at any point without
          hunting for the way out.
          
          PULLED UP BY THE INSET AND PAID BACK AS PADDING, which is the whole of
          why it can be sticky at all.
          
          The shell reserves the safe-area strip above <main> on this route, and
          that spacer SCROLLS AWAY — so a header stuck to `top: 0` rose past it
          and came to rest under the clock and the signal bars, with the back
          arrow and Salvează sitting behind them. Simply offsetting the sticky
          top by the inset leaves a transparent gap above the header instead,
          with the form visible through it.
          
          Paying the inset as padding means the header's own white fills that
          strip whenever it is stuck, and the negative margin cancels it at rest
          so nothing is pushed down while you are at the top of the page. Both
          terms are zero on the web, where there is no inset and none of this
          applies. */}
      <div
        className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-2 border-b border-neutral-100 bg-white/95 px-2 py-2 backdrop-blur-md"
        style={{
          marginTop: "calc(-1 * env(safe-area-inset-top, 0px))",
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
        }}
      >
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
          /* No scale on press.
             *
             * A button that shrinks when you touch it is the "bump" — it reads
             * as cheap because it is a physical metaphor applied to something
             * that is not physical, and at 4% it is small enough to look like a
             * rendering glitch rather than a deliberate response.
             *
             * What replaces it is what every native control actually does:
             * the surface darkens under the finger and returns. One colour
             * transition, no transform, nothing that moves the button's
             * geometry — so it cannot nudge the header around it, and it
             * cannot fight the page transition that starts on the same tap. */
            className="mr-1 flex h-9 min-w-[84px] items-center justify-center rounded-full bg-[#7c3aed] px-4 text-[13.5px] font-semibold text-white transition-colors duration-150 hover:bg-[#6d28d9] active:bg-[#5b21b6] disabled:opacity-60"
        >
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvează"}
        </button>
      </div>

      {/* THE PREVIEW IS THE REAL THING, at the real size. A row of swatches
          answers "which colours are there"; only this answers "how will my
          profile look", which is the question anybody is actually asking. */}
      <div className="px-4 pt-4">
        <div
          className="relative h-[168px] w-full overflow-hidden rounded-2xl"
          style={{ backgroundColor: previewTint }}
        >
          {previewPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={previewPhoto}
              src={previewPhoto}
              alt=""
              className="profile-cover-photo absolute inset-0 h-full w-full object-cover"
              onLoad={(e) => e.currentTarget.classList.add("is-loaded")}
            />
          )}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/35 to-transparent"
          />
          <button
            type="button"
            onClick={() => coverFile.current?.click()}
            disabled={busy !== null}
            className="absolute bottom-2.5 right-2.5 inline-flex h-9 items-center gap-1.5 rounded-full bg-black/35 px-3 text-[12.5px] font-semibold text-white ring-1 ring-white/25 backdrop-blur-md transition-colors duration-150 active:bg-black/55 disabled:opacity-60"
          >
            {busy === "cover" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            Încarcă
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
                <img
                  key={avatar}
                  src={avatar}
                  alt=""
                  className="profile-cover-photo h-full w-full object-cover"
                  onLoad={(e) => e.currentTarget.classList.add("is-loaded")}
                />
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
              className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-[#7c3aed] text-white shadow-[0_2px_8px_-1px_rgba(124,58,237,0.6)] ring-[3px] ring-white transition-colors duration-150 active:bg-[#5b21b6] disabled:opacity-60"
            >
              {busy === "avatar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
          </div>
          <div className="min-w-0 flex-1 pt-3">
            <p className="truncate text-[17px] font-bold text-neutral-900">{name}</p>
            <p className="truncate text-[13px] text-neutral-500">@{handle || username}</p>
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

      <Section title="Nume de utilizator">
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[16px] text-neutral-400"
          >
            @
          </span>
          <input
            value={handle}
            onChange={(e) => {
              // SLUGIFIED AS YOU TYPE, not on blur and not on save.
              //
              // A field that accepts a space and removes it later is a field
              // that tells you one thing and stores another. Doing it here also
              // means the availability check below is asking about exactly the
              // string that would be written.
              setHandleTouched(true)
              setHandle(slugifyUsername(e.target.value))
            }}
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={30}
            placeholder={slugifyUsername(displayName) || username}
            className={cn(
              "h-12 w-full rounded-2xl border bg-neutral-50 pl-8 pr-11 text-[16px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:bg-white",
              // The field itself carries the verdict. A red ring is the whole
              // of "negative" — it needs no sentence to be understood, and it
              // is on the control that is wrong rather than under it.
              handleState.status === "taken" || handleState.status === "invalid"
                ? "border-red-300 focus:border-red-400"
                : "border-neutral-200 focus:border-[#7c3aed]/40",
            )}
          />

          {/* One box, two marks, cross-fading in place.
              Both are always mounted and only their opacity changes, so the
              answer arriving does not move anything and does not pop — which on
              a field somebody is still typing into is the difference between an
              indicator and a flicker. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center"
          >
            <Check
              className={cn(
                "absolute right-0 h-[18px] w-[18px] text-emerald-500 transition-opacity duration-200",
                handleState.status === "free" ? "opacity-100" : "opacity-0",
              )}
              strokeWidth={2.6}
            />
            <AlertCircle
              className={cn(
                "absolute right-0 h-[18px] w-[18px] text-red-500 transition-opacity duration-200",
                handleState.status === "taken" || handleState.status === "invalid"
                  ? "opacity-100"
                  : "opacity-0",
              )}
              strokeWidth={2.4}
            />
          </span>
        </div>

        {/* NOTHING IS SAID WHEN NOTHING IS WRONG.

            It used to print "Verificăm…" while the request was out and "Este
            liber." when it came back — two lines of prose, under a field, about
            a handle somebody had already decided on. Most of what a person
            types here is available, so the common path was a running commentary
            on a non-event.

            A tick in the field says the same thing without a sentence, and it
            fades rather than appearing so the field does not flicker under the
            cursor while the answer settles. The words are kept for the case
            that actually needs words: it is taken, and here is what else. */}
        {(handleState.status === "taken" || handleState.status === "invalid") && (
          <div className="mt-1.5 px-1">
            <p className="text-[12.5px] font-medium text-amber-700">{handleState.message}</p>
            {/* SOMETHING TO PRESS, not just a refusal.
                Being told a handle is taken and left to invent another one is
                the whole reason people give up on this field. The server only
                offers candidates it has just checked are free. */}
            {handleState.suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {handleState.suggestions.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => {
                      setHandleTouched(true)
                      setHandle(sug)
                    }}
                    className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[12.5px] font-semibold text-neutral-700 transition-colors active:bg-neutral-100 [@media(hover:hover)]:hover:bg-neutral-50"
                  >
                    @{sug}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <Hint left="Adresa profilului tău. Fără spații, litere mici." right={`${30 - handle.length}`} />
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

      {/* THE COVER LIBRARY IS GONE.
          
          This was a grid of stock photographs a person picked their cover
          from, and every profile that had not chosen one was ALSO assigned a
          preset from its account id — so the default state of the app was a
          marketplace where a random third of the sellers had the same picture
          of a rail of coats behind their name. A cover is meant to say
          something about the seller; a shared stock photo says the opposite,
          and says it more loudly the more accounts there are.
          
          No cover is now genuinely no cover: a plain tinted band, and an
          upload button on it. See lib/profile/covers.ts.
          
          Nothing was deleted from storage and no stored value changed —
          `lib:<id>` still resolves for any profile that already chose one, it
          simply cannot be chosen again. */}

      {/* THE ONE THING THIS SCREEN SAYS BACK.
          
          Centred rather than a corner toast, because it is not a notification
          about something happening elsewhere — it is the result of the button
          you just pressed, and on a success it is the last thing on this screen
          before the profile appears. Fades and springs in on transform and
          opacity alone, so it composites on its own layer and nothing behind it
          is repainted for it. */}
      {notice && (
        <div className="pointer-events-none fixed inset-0 z-[130] flex items-center justify-center px-8">
          <div
            role="status"
            aria-live="polite"
            className={cn(
              "pointer-events-auto flex max-w-[320px] flex-col items-center gap-2.5 rounded-3xl bg-neutral-900/92 px-7 py-6 text-center text-white shadow-[0_20px_50px_-16px_rgba(15,15,15,0.6)] backdrop-blur-md",
              leaving ? "saved-pop-out" : "saved-pop",
            )}
          >
            <span
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full",
                notice.tone === "bad" ? "bg-red-500" : notice.tone === "part" ? "bg-amber-500" : "bg-[#7c3aed]",
              )}
            >
              {notice.tone === "bad" ? (
                <AlertCircle className="h-6 w-6" strokeWidth={2.6} />
              ) : (
                <Check className="h-6 w-6" strokeWidth={3} />
              )}
            </span>
            <span className="text-[15px] font-semibold">{notice.title}</span>
            {notice.detail && (
              // Selectable, and allowed to wrap: when this is a database
              // message it is the one thing on the screen worth copying.
              <span className="max-h-[40vh] select-text overflow-y-auto break-words text-[12.5px] leading-relaxed text-white/70">
                {notice.detail}
              </span>
            )}
            {notice.tone === "bad" && (
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="pointer-events-auto mt-1 rounded-full bg-white/15 px-4 py-1.5 text-[12.5px] font-semibold"
              >
                Am înțeles
              </button>
            )}
          </div>
        </div>
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

"use client"

/**
 * VERIFY ID ON YOUR PHONE: the page the QR code on a computer opens.
 *
 * Storelib's own camera, front then back (or "No back" for a passport), each
 * photo straight to Stripe through /api/payments/handoff, with a clear word
 * after each one and an end screen that says to go back to the computer,
 * which has already moved on by itself. No sign in, nothing about the
 * account shown, no photo picked from the library: the live camera only.
 */
import * as React from "react"
import { Camera, Check, RotateCcw } from "lucide-react"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { IdCamera, armCameraSounds, sendIdPhoto, shrinkPhoto, type IdSide } from "@/components/app/settings/id-camera"
import { playAskSound } from "@/lib/website-builder/ask-sounds"
import { cn } from "@/lib/utils"

type Sides = { front: boolean; back: boolean }

async function call<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw Object.assign(new Error(body.error || "That did not go through. Try again."), { status: res.status })
  return body
}

export function VerifyIdOnPhone({ token }: { token: string }) {
  const [sides, setSides] = React.useState<Sides | null>(null)
  const [expired, setExpired] = React.useState(false)
  const [camera, setCamera] = React.useState<IdSide | null>(null)
  const [sending, setSending] = React.useState<IdSide | null>(null)
  const [noBack, setNoBack] = React.useState(false)
  const [note, setNote] = React.useState<string | null>(null)
  const [pct, setPct] = React.useState(0)
  const [error, setError] = React.useState<{ side: IdSide; text: string } | null>(null)

  React.useEffect(() => {
    let gone = false
    fetch(`/api/payments/handoff?t=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => call<Sides & { wanted: boolean }>(r))
      .then((s) => !gone && setSides({ front: s.front, back: s.back }))
      .catch((e: { status?: number }) => {
        if (gone) return
        if (e.status === 410) setExpired(true)
        else setSides({ front: false, back: false })
      })
    return () => {
      gone = true
    }
  }, [token])

  const open = (side: IdSide) => {
    armCameraSounds()
    setError(null)
    setCamera(side)
  }

  const send = async (side: IdSide, blob: Blob) => {
    setSending(side)
    setError(null)
    setNote(null)
    try {
      const shrunk = await shrinkPhoto(new File([blob], "id.jpg", { type: blob.type || "image/jpeg" }))
      const data = new FormData()
      data.set("t", token)
      data.set("side", side)
      data.set("file", shrunk, "id.jpg")
      setPct(0)
      const next = await sendIdPhoto<Sides>("/api/payments/handoff", data, setPct)
      setSides(next)
      playAskSound("done")
      setNote(side === "front" ? "Front added. Stripe has it." : "Back added. Stripe has it.")
    } catch (e) {
      playAskSound("error")
      if ((e as { status?: number }).status === 410) setExpired(true)
      else setError({ side, text: e instanceof Error ? e.message : "That photo could not be used. Take it again in good light." })
    } finally {
      setSending(null)
    }
  }

  const done = !!sides?.front && (sides.back || noBack)

  return (
    <main className="flex min-h-[100dvh] flex-col bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-[#1a1a2e]">
      <header className="flex h-14 items-center justify-center gap-2 border-b border-[#f1f2f4]">
        <StorelibLogo size={24} />
        <span className="text-[15px] font-semibold">Storelib</span>
      </header>

      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col px-5 py-6">
        {expired ? (
          <Center title="This link has expired" line="Scan the new code on your computer to carry on." />
        ) : !sides ? (
          <div className="flex flex-1 items-center justify-center">
            <span aria-label="Loading" className="h-5 w-5 animate-spin rounded-full border-2 border-[#1a1a2e]/10 border-t-[#1a1a2e]/60" />
          </div>
        ) : done ? (
          <Center ok title="All done" line="Your ID is with Stripe. Go back to your computer: setup has already moved on to your bank account." />
        ) : (
          <>
            <h1 className="text-[20px] font-semibold">Verify your ID</h1>
            <p className="mt-1.5 text-[14px] leading-5 text-[#6b7280]">
              Take a photo of your passport, national ID or driving licence. It goes straight to Stripe, and Storelib never keeps it.
            </p>

            <div className="mt-6 divide-y divide-[#f1f2f4] overflow-hidden rounded-2xl border border-[#e3e5e8]">
              {(["front", "back"] as const).map((side) => {
                const have = side === "front" ? sides.front : sides.back
                const busy = sending === side
                const skipped = side === "back" && noBack && !have
                const locked = side === "back" && !sides.front
                return (
                  <div key={side} className="flex items-center gap-3 px-4 py-3.5">
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", have ? "bg-[#dcfae6] text-[#067647]" : "bg-[#f3f4f6] text-[#6b7280]")}>
                      {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1a1a2e]/15 border-t-[#1a1a2e]" /> : have ? <Check className="h-4 w-4" strokeWidth={3} /> : <Camera className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium">{side === "front" ? "Front" : "Back"}</span>
                      <span className="block text-[13px] text-[#6b7280]">{busy ? (pct >= 99 ? "Stripe is saving it..." : `Sending to Stripe... ${pct}%`) : have ? "Added" : skipped ? "Not needed, it's a passport" : side === "back" ? "Needed for an ID card or licence" : "The side with your photo"}</span>
                      {side === "back" && !have && !skipped && !busy && sides.front ? (
                        <button type="button" onClick={() => setNoBack(true)} className="mt-0.5 text-[13px] font-medium text-[#4b5563] underline underline-offset-2">
                          It's a passport
                        </button>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      disabled={busy || locked || skipped}
                      onClick={() => open(side)}
                      className={cn(
                        "flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium outline-none transition-transform active:scale-[0.97] disabled:opacity-40",
                        have ? "border border-[#e3e5e8] bg-white text-[#4b5563]" : "bg-[#1a1a2e] text-white",
                      )}
                    >
                      {have ? <RotateCcw className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                      {have ? "Retake" : "Take"}
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="mt-4 min-h-[44px]">
              {error ? (
                <div role="alert" className="flex items-center gap-3 rounded-xl border border-[#f3b8ab] bg-[#fff8f6] px-3.5 py-2.5">
                  <span className="min-w-0 flex-1 text-[13px] leading-[18px] text-[#b42318]">{error.text}</span>
                  <button type="button" onClick={() => open(error.side)} className="shrink-0 rounded-full bg-[#1a1a2e] px-3 py-1.5 text-[12.5px] font-medium text-white">
                    Take it again
                  </button>
                </div>
              ) : note ? (
                <p role="status" className="flex items-center gap-2 text-[14px] font-medium text-[#067647]">
                  <Check className="h-4 w-4" strokeWidth={3} /> {note}
                </p>
              ) : null}
            </div>

            {!sides.front ? (
              <button type="button" onClick={() => open("front")} className="mt-auto flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] text-[15px] font-semibold text-white active:scale-[0.99]">
                <Camera className="h-5 w-5" /> Open the camera
              </button>
            ) : null}
          </>
        )}
      </div>

      <IdCamera
        open={!!camera}
        side={camera ?? "front"}
        zIndex={300}
        onClose={() => setCamera(null)}
        onNoBack={() => {
          setNoBack(true)
          setCamera(null)
        }}
        onPhoto={(blob) => {
          const side = camera ?? "front"
          void send(side, blob)
          /* The front goes to Stripe while the camera turns to the back. */
          if (side === "front" && !sides?.back && !noBack) setCamera("back")
          else setCamera(null)
        }}
      />
    </main>
  )
}

function Center({ title, line, ok = false }: { title: string; line: string; ok?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <span className={cn("flex h-14 w-14 items-center justify-center rounded-full", ok ? "bg-[#ecfdf3] text-[#067647]" : "bg-[#f3f4f6] text-[#6b7280]")}>
        {ok ? <Check className="h-6 w-6" strokeWidth={3} /> : <Camera className="h-6 w-6" />}
      </span>
      <h1 className="mt-4 text-[19px] font-semibold">{title}</h1>
      <p className="mt-1.5 max-w-[320px] text-[14px] leading-5 text-[#6b7280]">{line}</p>
    </div>
  )
}

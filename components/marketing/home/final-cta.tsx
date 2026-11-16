"use client"

import Link from "next/link"
import { useId, useLayoutEffect, useState, type FormEvent } from "react"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { readAuthSnapshot, subscribeAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { DotField } from "./dot-field"

/*
  THE LAST WORD ABOVE THE FOOTER.

  Wave 13, the owner: it faded in and was too tall. Round 4, the owner: he did
  not like it either, nor how it met the footer (a purple sheet ending in the
  footer's lit edge). Now it is the end of the page's dark close, centred and
  quiet: the Storelib mark, one line, two ways in, on a fine dot grid whose
  light drifts slowly (dot-field.tsx) and fades out before the edges. The
  footer below continues the same near-black with no lit top edge, so the two
  read as one surface. Nothing rises or fades in; only the grid's light
  drifts, and only while it is on screen.

  Round 5, the owner: "what you make" a little lighter (it read too grey),
  and the dots smoother, scattered and following the mouse: DotField is a
  canvas now (dot-field.tsx), its light gliding after the pointer.

  Round 7, the owner: the pattern here was "smooth, flowing, following the
  mouse cursor and going auto, very subtle", bring it back. The field is an
  even grid again with a slow current of light flowing through it by
  itself, and the pointer's light gliding after the mouse (dot-field.tsx).
  The block sits in the page's one width (--home-edge, app/globals.css).

  Round 8, the owner: the dots "a little more visible, just a little bit",
  moving by themselves and following the mouse, smoother and cleaner
  (dot-field.tsx: round dots, a light that wanders on its own and glides
  after the mouse while it is over the field, 60 frames a second, paused off
  screen). There are no graphs here; the flowing field is the motion. And
  "the section should fade very nicely into the footer, but the footer
  should still have some depth/border": the field fades out well before
  the section's foot (fade="close"), so the call ends on plain black, and
  the footer starts on that same black, so nothing cuts across. What marks
  the footer as the footer is its top edge: one hairline of light, brightest
  in the middle and gone at both sides, a soft light falling a little way
  under it, and a ground that lifts very slightly before it settles. All
  of it is still background (gradients and a 1px line), nothing that moves.

  Landing round 11, the owner: "the pattern dots should be more smooth and
  clean and more visible at the bottom as well; and that section has too
  much height, reduce it just a little." The dots are brighter, crisper and
  still on their points, and run on to the section's foot (dot-field.tsx);
  the section pads about 15% less above and below (about 600px tall at
  1440x800, was 646).

  Landing round 12, the owner:
    dots    "too regular, straight rows and columns": scattered
            (<DotField scatter />, seeded Poisson disc in dot-field.tsx), the
            same tone and the same light.
    email   an email field with a faint outline and a little glass, the
            button inside it. Submitting goes straight to sign up with the
            address: /signup?intent=sell&email=...&start=1. The sign up page
            already fills the field from ?email=; start=1 has it press
            Continue by itself, which checks the address and moves on to the
            password, or to Log in with the address kept when the account
            exists (lib/auth/existing-account). Checked here first: an empty
            field goes to sign up as before, a malformed one says so under
            the field and goes nowhere. Without JavaScript it is a plain GET
            form to the same address.
    signed in   the header's own record of who is signed in
            (lib/auth/auth-snapshot, read before paint, as the hero's
            buttons do): a seller sees one Dashboard button instead of the
            field, a buyer one Start selling button. The server draws the
            field (it cannot know), so a signed in visitor could see it for a
            frame only if this section were on screen before the page
            hydrated; it is the last section, so in practice it never is.
*/
const STYLES = `
.fcta{position:relative;isolation:isolate;background:transparent;color:#fff;padding:clamp(76px,8.4vw,128px) var(--home-edge,clamp(20px,5.15vw,84px)) clamp(68px,7.6vw,116px)}
.fcta-in{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;max-width:880px;margin:0 auto;text-align:center}
.fcta-mark{display:block;margin-bottom:28px}
.fcta-title{margin:0;max-width:15ch;font-size:clamp(38px,5.6vw,80px);font-weight:500;line-height:1.02;letter-spacing:-.05em;color:#fafafa;text-wrap:balance}
.fcta-title em{font-style:normal;color:#b6b3c1}
.fcta-note{margin:20px 0 0;font-size:clamp(15px,1.3vw,18px);line-height:1.5;color:#a3a0ac}
.fcta-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-top:36px}
.fcta-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:54px;padding:0 28px;border-radius:999px;font-size:16px;font-weight:600;text-decoration:none;white-space:nowrap;transition:background-color .2s ease,border-color .2s ease,color .2s ease}
.fcta-btn:focus-visible{outline:2px solid #fff;outline-offset:3px}
.fcta-primary{background:#fff;color:#18181b}
.fcta-primary:hover{background:#e7e5ee}
.fcta-btn svg{transition:transform .25s cubic-bezier(.2,.8,.2,1)}
.fcta-btn:hover svg{transform:translateX(3px)}
.fcta-actions[hidden],.fcta-form[hidden]{display:none!important}
/* The email field (landing round 12): a faint outline, a little glass, the button inside it. */
.fcta-form{width:100%;max-width:480px;margin-top:36px}
.fcta-field{display:flex;align-items:center;gap:6px;height:60px;padding:6px 6px 6px 22px;border-radius:999px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.14);box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 12px 32px -18px rgba(0,0,0,.6);-webkit-backdrop-filter:blur(10px) saturate(140%);backdrop-filter:blur(10px) saturate(140%);transition:border-color .2s ease,background-color .2s ease}
.fcta-field:hover{border-color:rgba(255,255,255,.2)}
.fcta-field:focus-within{border-color:rgba(255,255,255,.34);background:rgba(255,255,255,.075)}
.fcta-form[data-invalid] .fcta-field{border-color:rgba(252,165,165,.6)}
.fcta-field input{flex:1;min-width:0;height:100%;padding:0;border:0;background:transparent;color:#fafafa;font:inherit;font-size:16px;outline:none}
.fcta-field input::placeholder{color:#8d8a97}
.fcta-field .fcta-btn{flex:none;height:46px;padding:0 20px 0 22px;border:0;cursor:pointer;font-family:inherit}
.fcta-error{margin:10px 0 0;font-size:14px;color:#fca5a5;text-align:center}
.fcta-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@media(max-width:639px){
  .fcta-actions{flex-direction:column;align-items:stretch;width:100%;max-width:360px}
  .fcta-actions .fcta-btn{width:100%}
  .fcta-form{max-width:400px;margin-top:30px}
  .fcta-field{height:56px;padding-left:18px}
  .fcta-field .fcta-btn{height:44px;padding:0 16px 0 18px;font-size:15px}
}
@media(prefers-reduced-motion:reduce){
  .fcta-btn,.fcta-btn svg,.fcta-field{transition:none}
}
/* The footer under it, on the home page only (this sheet of rules is only drawn there). Round 8: it starts on the call's own black, so the call fades into it, and its top edge gives it depth: a hairline faded at both ends, a faint light under it, the ground lifting a touch. */
footer.storelib-footer{background-color:#050506;background-image:radial-gradient(ellipse 60% 140px at 50% 0%,rgba(255,255,255,.045),transparent 100%),linear-gradient(180deg,#050506 0%,#0a0a0c 140px,#060607 55%,#030304 100%);box-shadow:inset 0 18px 36px -30px rgba(255,255,255,.06)}
footer.storelib-footer::before{content:"";background:linear-gradient(90deg,transparent 4%,rgba(255,255,255,.07) 22%,rgba(255,255,255,.16) 50%,rgba(255,255,255,.07) 78%,transparent 96%)}
`

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

/** An address worth sending on: something, an @, a domain with a dot. The sign up page checks it properly. */
export const FINAL_CTA_EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

/** Where the field sends somebody: sign up with the address, Continue pressed for them (start=1); an empty field goes to sign up as before. */
export function finalCtaHref(raw: string): string {
  const email = raw.trim()
  if (!email) return "/signup?intent=sell"
  return `/signup?intent=sell&email=${encodeURIComponent(email)}&start=1`
}

type Audience = "guest" | "buyer" | "seller"

/** The home page's closing call: Start free. (Landing round 5: the owner asked for "See creators on Storelib" to go.) */
export function FinalCta() {
  const id = useId()
  const [audience, setAudience] = useState<Audience>("guest")
  const [invalid, setInvalid] = useState(false)

  /* Who is signed in, from the header's record, before this paints (as the hero does). */
  useLayoutEffect(() => {
    const read = () => {
      const s = readAuthSnapshot()
      setAudience(!s?.signedIn ? "guest" : s.isSeller ? "seller" : "buyer")
    }
    read()
    return subscribeAuthSnapshot(read)
  }, [])

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim()
    if (email && !FINAL_CTA_EMAIL.test(email)) {
      setInvalid(true)
      e.currentTarget.querySelector("input")?.focus()
      return
    }
    window.location.assign(finalCtaHref(email))
  }

  return (
    <section className="fcta" data-final-cta="" aria-labelledby="fcta-title">
      <style>{STYLES}</style>
      <DotField fade="close" scatter />
      <div className="fcta-in">
        <span className="fcta-mark" aria-hidden="true">
          <StorelibLogo size={44} />
        </span>
        <h2 id="fcta-title" className="fcta-title">
          Start selling <em>what you make.</em>
        </h2>
        <p className="fcta-note">Free to start. No card needed.</p>
        <form action="/signup" method="get" noValidate className="fcta-form" data-fcta-form="" data-invalid={invalid ? "" : undefined} hidden={audience !== "guest"} onSubmit={onSubmit}>
          <input type="hidden" name="intent" value="sell" />
          <input type="hidden" name="start" value="1" />
          <div className="fcta-field">
            <label htmlFor={id} className="fcta-sr">
              Email address
            </label>
            <input
              id={id}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              enterKeyHint="go"
              maxLength={254}
              placeholder="Your email"
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? `${id}-error` : undefined}
              onInput={() => invalid && setInvalid(false)}
            />
            <button type="submit" className="fcta-btn fcta-primary">
              Start free
              <Arrow />
            </button>
          </div>
          {invalid && (
            <p id={`${id}-error`} className="fcta-error" role="alert">
              That email does not look right.
            </p>
          )}
        </form>
        <div className="fcta-actions" hidden={audience === "guest"}>
          <Link href={audience === "seller" ? "/app" : "/signup?intent=sell"} className="fcta-btn fcta-primary" data-fcta-account={audience === "guest" ? undefined : audience}>
            {audience === "buyer" ? "Start selling" : "Dashboard"}
            <Arrow />
          </Link>
        </div>
      </div>
    </section>
  )
}

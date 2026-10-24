"use client"

import { useLayoutEffect, useState } from "react"
import Link from "next/link"
import { readAuthSnapshot, subscribeAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { HERO_CTA, heroCtaState, type HeroCtaState } from "@/lib/marketing/hero-cta-state"

/**
 * The hero's one button, by who is looking:
 *
 *   a creator (seller access)           Dashboard       /app
 *   signed in, not selling yet          Start Creating  /sell (seller onboarding)
 *   signed out                          Start Now       /sell (asks them to sign up first)
 *
 * WHY NOT A SERVER READ. Reading the session in the page would make
 * storelib.com's front page render per request and lose the CDN copy the
 * marketing layout is careful to keep (see app/(marketing)/layout.tsx). The
 * header already verifies the session and writes the result to the auth
 * snapshot (lib/auth/auth-snapshot); this reads that snapshot before the
 * first paint after hydration and follows it when the header corrects it.
 *
 * The three labels, each with its arrow, share one grid cell: the button is
 * as wide as the longest whichever is showing, the one showing is centred in
 * it, and a label that changes moves nothing around it.
 */

export function HeroCta({ className }: { className?: string }) {
  const [state, setState] = useState<HeroCtaState>("guest")

  useLayoutEffect(() => {
    const read = () => setState(heroCtaState(readAuthSnapshot()))
    read()
    return subscribeAuthSnapshot(read)
  }, [])

  const { href } = HERO_CTA[state]
  return (
    <Link href={href} data-hero-cta={state} className={className}>
      <span className="grid justify-items-center">
        {(Object.keys(HERO_CTA) as HeroCtaState[]).map((key) => (
          <span key={key} aria-hidden={key !== state || undefined} className={`col-start-1 row-start-1 inline-flex items-center gap-2 ${key === state ? "" : "invisible"}`}>
            <span data-hero-cta-label="">{HERO_CTA[key].label}</span>
            <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </span>
        ))}
      </span>
    </Link>
  )
}

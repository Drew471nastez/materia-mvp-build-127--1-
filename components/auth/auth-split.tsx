import type React from "react"
import Image from "next/image"
import { AuthLogo } from "@/components/auth/auth-logo"
import { AppAvatar } from "@/components/app/app-avatar"
import { HtmlClass } from "@/components/platform/html-class"

/**
 * ===========================================================================
 *  THE LOG IN PAGE'S LAYOUT, FOR A LINK SOMEBODY WAS SENT
 * ===========================================================================
 * A business handover (app/(storelib)/team/claim) and a team invite
 * (app/(storelib)/team/join) are the first Storelib page their reader sees,
 * often before they have an account. They used to be a grey page with a
 * white card of their own; they now open in the same layout as Log in and
 * Create account (app/(storelib)/(auth)/login/page.tsx): white, the Storelib
 * logo, a 32px heading and a 15px grey line under it, a 400px column, the
 * near black round primary button and the outlined second one, and the photo
 * filling the right half from 1024px. The classes are the login page's own,
 * copied rather than imported because that page is one client component.
 *
 * Not data-page="auth": in the apps that word locks the document's scroll
 * (globals.css, for the login form that fits one screen), and a handover's
 * details can be taller than a phone.
 */

export const AUTH_PHOTO = "https://storelib.com/media/platform%20images/collage%20imags/eemo.png"

export { AUTH_BTN_PRIMARY, AUTH_BTN_SECONDARY, AUTH_LINK } from "@/components/auth/auth-buttons"

export function AuthSplit({ page, children }: { page: string; children: React.ReactNode }) {
  return (
    <main data-page={page} className="flex min-h-svh w-full bg-white font-sans lg:h-[100dvh] lg:max-h-[100dvh] lg:overflow-hidden">
      <HtmlClass name="with-page-auth" />
      <div className="flex w-full flex-col justify-start px-6 py-8 sm:py-10 lg:w-1/2 lg:h-[100dvh] lg:overflow-y-auto page-scroll lg:px-16 lg:py-10 xl:px-24 auth-stack auth-shell">
        <div className="mx-auto w-full max-w-[400px] py-2 pb-[max(8px,env(safe-area-inset-bottom))] sm:py-3 lg:py-4 animate-fade-in-up" data-auth-column="">
          <AuthLogo />
          {children}
        </div>
      </div>
      <div className="relative hidden shrink-0 overflow-hidden bg-neutral-900 lg:block lg:h-[100dvh] lg:w-1/2" aria-hidden>
        <Image src={AUTH_PHOTO} alt="" fill className="object-cover object-center" sizes="(min-width: 1024px) 50vw, 0px" quality={75} priority decoding="async" />
      </div>
    </main>
  )
}

/** The heading and the grey line under it, as Log in has them. */
export function AuthHeading({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <>
      <h1 className="mb-2 text-[28px] font-bold leading-[34px] tracking-tight text-neutral-900 [overflow-wrap:anywhere] sm:text-[32px] sm:leading-[38px]">{title}</h1>
      {sub ? <p className="mb-8 text-[15px] leading-[22px] text-neutral-500">{sub}</p> : <div className="mb-8" />}
    </>
  )
}

/** A store or business, as a link names it: its photo (or first letter), its name and a line under it. */
export function AuthStore({ name, avatarUrl, line }: { name: string; avatarUrl: string | null; line?: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-3" data-auth-store="">
      {avatarUrl ? (
        <AppAvatar src={avatarUrl} name={name} size={40} className="shrink-0 ring-1 ring-neutral-200" />
      ) : (
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-900 text-[16px] font-semibold text-white">
          {name.trim().charAt(0).toUpperCase() || "S"}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold leading-5 text-neutral-900">{name}</p>
        {line ? <p className="truncate text-[13px] leading-[18px] text-neutral-500">{line}</p> : null}
      </div>
    </div>
  )
}

/** A small grey line under the buttons: who the link is for, how long it works. */
export function AuthFoot({ children }: { children: React.ReactNode }) {
  return <p className="mt-6 text-center text-[13px] leading-5 text-neutral-400 [overflow-wrap:anywhere]">{children}</p>
}

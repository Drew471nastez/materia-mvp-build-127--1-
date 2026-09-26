/**
 * TWO BUSINESSES OF ONE LOGIN, EACH IN ITS OWN /app, for scripts/check-
 * business-switch.mjs.
 *
 * The /app shell as app/app/layout.tsx mounts it: the real wrapper
 * (components/app/app-layout-wrapper, with its LanguageProvider fallback and
 * AppStage), the real AppSidebar (the header, the rail, the account dropdown
 * and the phone's account sheet, both headed by the business switcher), and
 * a page shaped like Home in the content area.
 *
 *   OldTree   Mara Lind's /app, the page the switch starts from, drawn in
 *             the browser as a loaded app is.
 *   NewTree   Lind Studio's /app, rendered on the probe's "server" to HTML
 *             and hydrated in the browser, with the switch's arrival screen
 *             beside it exactly as app/app/layout.tsx puts it (the spin
 *             script, then BusinessSwitchArrival) when the cookie came. Its
 *             photo, its page's picture and its chart's figures are answered
 *             late by the probe's server, as a real network would.
 */
import React, { useEffect, useState } from "react"
import { AppLayoutWrapper } from "@/components/app/app-layout-wrapper"
import { AppSidebar } from "@/components/app/sidebar"
import { BusinessSwitchArrival } from "@/components/app/business-switch-screen"
import { LocaleProvider } from "@/components/locale-provider"
import { SWRProvider } from "@/lib/swr-config"
import { SWITCH_SPIN_SCRIPT } from "@/lib/businesses/switch-screen"
import type { BusinessRow } from "@/components/app/business-switcher"

export const OLD: BusinessRow = { userId: "00000000-0000-4000-8000-00000000000a", name: "Mara Lind", handle: "maralind", avatarUrl: "/photos/mara.png", ready: true, current: true, role: "owner" }
export const NEW: BusinessRow = { userId: "00000000-0000-4000-8000-00000000000b", name: "Lind Studio", handle: "lindstudio", avatarUrl: "/photos/studio.png", ready: true, current: false, role: "member" }

const card = "bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"

function Figure({ label, value }: { label: string; value: string | null }) {
  return (
    <div className={`${card} p-4`}>
      <p className="text-[13px] text-[#6b7280]">{label}</p>
      {/* The figure's room is held while it comes, so nothing moves when it lands. */}
      <p className="mt-1 h-[30px] text-[22px] font-semibold tabular-nums text-[#1a1a2e]">{value ?? ""}</p>
    </div>
  )
}

function Home({ who, page, figures, picture }: { who: string; page: "old" | "new"; figures: string[] | null; picture: string }) {
  return (
    <div data-probe-page={page} className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Good morning, {who}</h1>
      <p className="mt-1 text-[14px] text-[#6b7280]">Here is how the store did this week.</p>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {["Views", "Revenue", "Orders", "Conversion"].map((l, i) => <Figure key={l} label={l} value={figures ? figures[i] : null} />)}
      </div>
      <div data-probe-chart="" aria-busy={figures ? undefined : true} className={`${card} mt-4 h-[220px] p-4`}>
        {figures ? <div className="h-full rounded-xl bg-[#eef0f3]" /> : null}
      </div>
      <div className={`${card} mt-4 flex items-center gap-4 p-4`}>
        {/* A picture on the first screen: the arrival waits for it to be decoded. */}
        <img src={picture} alt="" width={96} height={72} className="h-[72px] w-[96px] rounded-xl object-cover" />
        <div>
          <p className="text-[15px] font-medium text-[#1a1a2e]">Latest product</p>
          <p className="text-[14px] text-[#6b7280]">Published on your store</p>
        </div>
      </div>
    </div>
  )
}

function Shell({ me, businesses, children }: { me: BusinessRow; businesses: BusinessRow[]; children: React.ReactNode }) {
  return (
    <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316] app-no-scrollbar">
      <AppSidebar
        creatorSlug={me.handle ?? undefined}
        username={me.handle ?? undefined}
        storePublished
        avatarUrl={me.avatarUrl ?? undefined}
        displayName={me.name}
        stripeConnected
        stripeStatus="connected"
        onePagePublished
        setupProgress={{ completed: 6, total: 7 }}
        businesses={businesses}
      />
      <main className="h-svh pt-[calc(68px_+_env(safe-area-inset-top,_0px))] md:pt-[calc(58px+env(safe-area-inset-top,_0px))] md:pl-[240px] bg-[#f8f9fa] md:bg-white rounded-t-[20px] md:rounded-none overflow-hidden app-main-content">
        <div className="h-[calc(100svh_-_68px_-_env(safe-area-inset-top,_0px))] md:h-[calc(100svh-58px-env(safe-area-inset-top,_0px))] overflow-y-auto app-content-scroll">
          {children}
        </div>
      </main>
    </div>
  )
}

function Root({ children }: { children: React.ReactNode }) {
  return <SWRProvider><LocaleProvider>{children}</LocaleProvider></SWRProvider>
}

export function OldTree() {
  return (
    <Root>
      <AppLayoutWrapper>
        <Shell me={OLD} businesses={[OLD, NEW]}>
          <Home who="Mara" page="old" figures={["1.2K", "$840", "31", "2.6%"]} picture="/photos/old-product.png" />
        </Shell>
      </AppLayoutWrapper>
    </Root>
  )
}

function NewHome() {
  const [figures, setFigures] = useState<string[] | null>(null)
  useEffect(() => {
    fetch("/api/figures", { cache: "no-store" }).then((r) => r.json()).then((f: { figures: string[] }) => setFigures(f.figures)).catch(() => setFigures(["0", "$0", "0", "0%"]))
  }, [])
  return <Home who="Lind Studio" page="new" figures={figures} picture="/photos/new-product.png" />
}

/** `arriving`: the name and photo the switch's cookie carried, as app/app/layout.tsx reads them (readSwitchArrival); null for a load with no switch behind it. */
export function NewTree({ arriving }: { arriving: { name: string; photo: string | null } | null }) {
  const me = { ...NEW, current: true }
  return (
    <Root>
      {arriving ? (
        <>
          <script dangerouslySetInnerHTML={{ __html: SWITCH_SPIN_SCRIPT }} />
          <BusinessSwitchArrival name={arriving.name} photo={arriving.photo} />
        </>
      ) : null}
      <AppLayoutWrapper>
        <Shell me={me} businesses={[me, { ...OLD, current: false }]}>
          <NewHome />
        </Shell>
      </AppLayoutWrapper>
    </Root>
  )
}

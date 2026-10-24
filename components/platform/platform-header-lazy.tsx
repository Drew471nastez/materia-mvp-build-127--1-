"use client"

/**
 * ===========================================================================
 *  THE 404'S HEADER IS FETCHED WHEN A 404 IS DRAWN, NOT ON EVERY PAGE
 * ===========================================================================
 * The root not-found (app/not-found.tsx) travels in the payload of every
 * page, a creator's published website included, because it is the root
 * layout's boundary. It drew Storelib's header with a plain import, so every
 * website downloaded the whole platform header with it: the account menu,
 * the notification bell, community search and the sign-in client, about
 * 120 KB compressed that a visitor never sees (measured on trp8.storelib.com).
 *
 * Loaded on demand instead. A real 404 on Storelib still draws the header on
 * the server (ssr stays on), so the page looks the same; a website only
 * carries this small file.
 */
import dynamic from "next/dynamic"

export const PlatformHeaderClient = dynamic(
  () => import("@/components/platform/platform-header-client").then((m) => m.PlatformHeaderClient),
  { loading: () => <div className="h-[65px] md:h-[72px]" aria-hidden /> },
)

import { notFound, redirect } from "next/navigation"
import { cookies, headers } from "next/headers"
import type { Metadata } from "next"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { creatorByName, publishedShopByName } from "@/lib/website-builder/published-site"
import { SiteNotPublished } from "../not-published"
import { readSiteAccess } from "@/lib/site-password/store"
import { passCookieName, passHolds } from "@/lib/site-password/pass"
import { passReturnPath } from "@/lib/site-password/gate"
import { passwordNotice } from "@/lib/site-password/enter"
import { siteMetadata } from "../render-site"
import { renderAccountPage } from "../render-account"

/**
 * ===========================================================================
 *  THE PASSWORD PAGE, ON THE CREATOR'S OWN WEBSITE
 * ===========================================================================
 * What every page of a website shows while its owner asks for a password
 * (Website Settings, Publishing): the proxy rewrites a visitor without a
 * pass here (lib/site-password/gate.ts), with the page they asked for as
 * `?return=`. The page is the creator's: the `password` page they arranged
 * in the builder, or the generated one (lib/website-builder/account-pages
 * passwordSections), with the site's own colours and logo.
 *
 * A website that does not ask for a password, or a visitor who already has
 * a pass, is sent on to the page they asked for: this address is never a
 * dead end. Per visitor, never cached, never indexed.
 */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string }>
  searchParams: Promise<{ return?: string; error?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  /* The website's own title and icon, as its front page has them: the tab says whose site this is, not "Password page". */
  const base = await siteMetadata(username, undefined, "home")
  return { title: base.title, icons: base.icons, robots: { index: false, follow: false } }
}

export default async function SitePasswordPage({ params, searchParams }: PageProps) {
  const { username } = await params
  const sp = await searchParams.catch(() => ({}) as Awaited<PageProps["searchParams"]>)
  const creator = await creatorByName(username)
  if (!creator) notFound()
  const back = passReturnPath(sp.return)

  const access = await readSiteAccess(createAdminClient(), creator.creatorId)
  const [jar, h] = await Promise.all([cookies(), headers()])
  const host = (h.get("host") || "").toLowerCase()
  /*
    Typed in by hand (no `return`, which only the proxy adds): a website
    that does not ask, or a visitor already let in, goes to the front page.
    Sent here by the proxy, the page is drawn whatever this read says: the
    proxy's answer is up to fifteen seconds old (lib/site-password/proxy-gate),
    and sending the visitor back to it would bounce between the two.
  */
  if (sp.return === undefined) {
    if (!access.enabled) redirect("/")
    if (await passHolds(jar.get(passCookieName(host))?.value, { creatorId: creator.creatorId, host, version: access.version })) redirect("/")
  }

  /* Asking for a password before anything is published: the Coming soon page every unpublished website shows. */
  const shop = await publishedShopByName(username)
  if (shop.kind === "unpublished") return <SiteNotPublished username={username} displayName={shop.displayName} creatorId={creator.creatorId} />

  const owner = new URL("/api/site-password/owner", `https://${getMainDomain()}`)
  owner.searchParams.set("host", host)
  if (back !== "/") owner.searchParams.set("return", back)

  return renderAccountPage(username, "password", {
    notice: passwordNotice(sp.error),
    password: { returnTo: back, ownerUrl: owner.toString() },
  })
}

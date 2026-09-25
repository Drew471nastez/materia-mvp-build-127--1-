import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import { signInNotice } from "@/lib/website-builder/account-pages"
import { siteMetadata } from "../../render-site"
import { renderAccountPage } from "../../render-account"
import { siteVisitor } from "../../visitor"

/**
 * ===========================================================================
 *  SIGN IN, ON THE CREATOR'S OWN WEBSITE
 * ===========================================================================
 * The page every shop has at /account/login. Its button leaves for
 * storelib.com, where the account is, and the visitor comes back to their
 * account page here (app/api/site-account). A visitor who is already signed
 * in to this website goes straight to it.
 *
 * `?error=` is how the last step of signing in says why it refused a code;
 * the page turns the reason into a fixed sentence and prints nothing else
 * from the address.
 */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string }>
  searchParams: Promise<{ error?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  const base = await siteMetadata(username, undefined, "login")
  return { ...base, alternates: undefined, robots: { index: false, follow: false } }
}

export default async function SiteSignInPage({ params, searchParams }: PageProps) {
  const { username } = await params
  const { error } = await searchParams.catch(() => ({}) as { error?: string })
  const { visitor, creatorId } = await siteVisitor(username)
  if (!creatorId) notFound()
  if (visitor) redirect("/account")
  return renderAccountPage(username, "login", { notice: signInNotice(error) })
}

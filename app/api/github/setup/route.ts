/**
 * GET  Where GitHub sends a creator back after installing the Storelib app.
 *
 * Three things must hold before anything is stored:
 *   1. the state is ours, unexpired, and names a site;
 *   2. the person signed in now owns that site;
 *   3. the person on GitHub can reach the installation, proved by trading
 *      the one-time `code` GitHub sent for a user token and asking. An
 *      installation id in a URL proves nothing on its own.
 * Then the site is linked to the installation, and the creator is sent back
 * to the builder to pick a repository.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { githubConfig, installationAccount, userCanReachInstallation } from "@/lib/github-sync/github"
import { verifyState } from "@/lib/github-sync/core"
import { linksNotSetUp, ownInstall } from "@/lib/github-sync/own-install"
import { handBackToApp } from "@/lib/connect/app-return"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function back(req: Request, installId: string | null, result: string) {
  const url = new URL(installId ? `/website-builder/editor/${installId}` : "/app/website-builder", req.url)
  url.searchParams.set("settings", "connections")
  url.searchParams.set("github", result)
  return NextResponse.redirect(url)
}

export async function GET(req: Request) {
  const cfg = githubConfig()
  const q = new URL(req.url).searchParams
  const state = verifyState(q.get("state"), cfg?.clientSecret)
  if (!cfg || !state) return back(req, null, "expired")
  /* Started in the phone app, and this is its in-app browser: finished in the app, signed in (lib/connect/app-return.ts). */
  const handBack = handBackToApp(req, state)
  if (handBack) return handBack

  const own = await ownInstall(state.installId)
  /* Could not tell (Auth or the site read did not answer): "try again", never "expired" (round rel2-auth). */
  if (own === "unavailable") return back(req, state.installId, "error")
  if (!own || own.creatorId !== state.creatorId) return back(req, null, "expired")

  const installationId = Number(q.get("installation_id"))
  const code = q.get("code") ?? ""
  if (!Number.isSafeInteger(installationId) || installationId <= 0 || !code) return back(req, own.installId, "cancelled")

  let reachable = false
  try {
    reachable = await userCanReachInstallation(cfg, code, installationId)
  } catch {
    reachable = false
  }
  if (!reachable) return back(req, own.installId, "denied")

  const account = await installationAccount(cfg, installationId).catch(() => "")
  const db = createAdminClient()
  const { data: existing } = await db.from("theme_github_links").select("installation_id").eq("install_id", own.installId).maybeSingle()
  const row = {
    install_id: own.installId,
    creator_id: own.creatorId,
    installation_id: installationId,
    account_login: account,
    updated_at: new Date().toISOString(),
    /* A different installation means the old repository may be out of reach. */
    ...(existing && Number(existing.installation_id) !== installationId ? { repo_id: null, repo_full_name: null, branch: null } : {}),
  }
  const { error } = await db.from("theme_github_links").upsert(row, { onConflict: "install_id" })
  if (error) return back(req, own.installId, linksNotSetUp(error.message) ? "not-set-up" : "error")
  return back(req, own.installId, "pick")
}

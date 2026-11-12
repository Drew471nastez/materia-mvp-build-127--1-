/**
 * GET ?installId=  "Connect GitHub". Sends the creator to GitHub to install
 * the Storelib app on the repositories they choose, carrying a signed note
 * of which site this is for. GitHub sends them back to /api/github/setup.
 *
 * From the phone app (?app=ios|android, lib/native-connect.ts): the same
 * address as JSON, for the in-app browser sheet, with the platform signed
 * into the state so the setup page hands itself back to the app
 * (lib/connect/app-return.ts).
 */
import { NextResponse } from "next/server"
import { githubConfig } from "@/lib/github-sync/github"
import { signState } from "@/lib/github-sync/core"
import { ownInstall } from "@/lib/github-sync/own-install"
import { appAsked, appStart } from "@/lib/connect/app-return"
import { storeUnavailableResponse } from "@/lib/team/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const installId = new URL(req.url).searchParams.get("installId") ?? ""
  const own = await ownInstall(installId)
  if (own === "unavailable") return storeUnavailableResponse()
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const cfg = githubConfig()
  if (!cfg) return NextResponse.json({ error: "GitHub is not set up on this server yet." }, { status: 503 })
  const app = appAsked(req)
  const state = signState({ installId: own.installId, creatorId: own.creatorId, ...(app ? { app } : {}) }, cfg.clientSecret)
  const url = `https://github.com/apps/${encodeURIComponent(cfg.slug)}/installations/new?state=${encodeURIComponent(state)}`
  return app ? appStart(url) : NextResponse.redirect(url)
}

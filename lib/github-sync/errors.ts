/**
 * ===========================================================================
 *  WHY A SYNC FAILED, IN WORDS A CREATOR CAN ACT ON
 * ===========================================================================
 * "Last sync failed" with nothing after it was the report. Every way a sync
 * goes wrong is named here once: what happened, and the one thing to do
 * about it. The card, the activity list, the commit status and the webhook
 * all say the same sentence.
 *
 * Pure. GitHub's own message is read to tell cases apart, and is never shown
 * as it is: it can name internals, and it is not written for a creator.
 */

export type SyncProblem =
  | "app-key"
  | "installation-gone"
  | "no-access"
  | "repo-missing"
  | "branch-protected"
  | "moved-on"
  | "rate-limited"
  | "too-large"
  | "github-down"
  | "unreachable"
  | "not-configured"
  | "unknown"

export interface Explained {
  problem: SyncProblem
  /** What happened, one sentence. */
  message: string
  /** What to do, one sentence. */
  fix: string
}

/** The pieces of a failed GitHub call this needs. GitHubError (./github.ts) has them. */
export interface FailedCall {
  status: number
  message: string
  /** Which call: "token", "ref", "write-ref", "tree", "blob", "commit", "contents", "status", "repos", "other". */
  step?: string
  /** When the hourly limit comes back, ms since the epoch. */
  resetAt?: number | null
}

function clock(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`
}

export function explainFailure(e: FailedCall, ctx: { repo?: string | null; branch?: string | null } = {}): Explained {
  const repo = ctx.repo ? ctx.repo : "the repository"
  const branch = ctx.branch ? ctx.branch : "the branch"
  const said = (e.message || "").toLowerCase()

  if (e.status === 0) {
    return { problem: "unreachable", message: "Storelib could not reach GitHub.", fix: "Check GitHub's status page, then press Push again." }
  }
  if (e.status === 401) {
    if (e.step === "token") {
      return { problem: "app-key", message: "GitHub did not accept Storelib's app key.", fix: "This is on Storelib's side. Try again in a few minutes, and tell support if it keeps happening." }
    }
    return { problem: "app-key", message: "GitHub turned down Storelib's sign in for this repository.", fix: "Press Push again. If it keeps happening, disconnect GitHub and connect it again." }
  }
  if (e.status === 429 || ((e.status === 403 || e.status === 429) && /rate limit|secondary/.test(said))) {
    const when = e.resetAt && e.resetAt > Date.now() ? ` until ${clock(e.resetAt)}` : " for a few minutes"
    return { problem: "rate-limited", message: `GitHub is limiting how often Storelib can write${when}.`, fix: "Nothing is lost. Press Push after that, or keep working: the next push is synced as usual." }
  }
  if (e.step === "token" && e.status === 404) {
    return { problem: "installation-gone", message: "The Storelib app is no longer installed on your GitHub account.", fix: "Disconnect GitHub here, then connect it again." }
  }
  if (/protected branch|branch is protected|required status|must be made through a pull request|required review|push declined due to repository rule|repository rule violation/.test(said) || (e.step === "write-ref" && e.status === 403)) {
    return {
      problem: "branch-protected",
      message: `${branch} is protected on GitHub, so Storelib cannot push to it.`,
      fix: `Link a branch of its own, such as storelib, under Change repository, or let the Storelib app bypass the rule in ${repo}'s branch settings.`,
    }
  }
  if (/not a fast.?forward|reference cannot be updated|update is not a fast forward/.test(said) || (e.status === 409 && e.step === "write-ref")) {
    return { problem: "moved-on", message: `Someone pushed to ${branch} while Storelib was sending.`, fix: "Press Push again. Their commit stays; Storelib adds its changes on top." }
  }
  if (e.status === 403 && /resource not accessible|not accessible by integration|permission/.test(said)) {
    return {
      problem: "no-access",
      message: `The Storelib app does not have write access to ${repo}.`,
      fix: "On GitHub open Settings, Applications, Storelib, Configure, and give it this repository. Its Contents permission must be Read and write.",
    }
  }
  if (e.status === 403) {
    return { problem: "no-access", message: `GitHub refused Storelib's change to ${repo}.`, fix: "Check the Storelib app still has this repository under Settings, Applications, Storelib, Configure on GitHub." }
  }
  if (e.status === 404) {
    if (e.step === "ref") return { problem: "repo-missing", message: `The branch ${branch} was not found in ${repo}.`, fix: "Press Push to make it, or pick another branch under Change repository." }
    return { problem: "repo-missing", message: `GitHub could not find ${repo}.`, fix: "It may have been renamed, deleted, or taken away from the Storelib app. Pick it again under Change repository." }
  }
  if (e.status === 413 || /too large|exceeds|larger than/.test(said)) {
    return { problem: "too-large", message: "A file was too large for GitHub.", fix: "Storelib leaves files over 20 MB out. Press Push again; if it fails again, tell support which site it was." }
  }
  if (e.status === 409 && /empty/.test(said)) {
    return { problem: "repo-missing", message: `${repo} has no commits yet, and GitHub would not take the first one.`, fix: "Add a README on GitHub, then press Push." }
  }
  if (e.status >= 500) {
    return { problem: "github-down", message: "GitHub had a problem on its side.", fix: "Storelib tried a few times. Press Push in a minute." }
  }
  if (e.status === 422) {
    return { problem: "unknown", message: `GitHub would not take Storelib's commit on ${branch}.`, fix: "Press Push again. If it fails twice, link a fresh branch under Change repository." }
  }
  return { problem: "unknown", message: "Something went wrong talking to GitHub.", fix: "Press Push again." }
}

/** One line for a card or a commit status: what happened, then what to do. */
export function failureLine(x: Explained): string {
  return `${x.message} ${x.fix}`
}

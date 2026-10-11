/**
 * ===========================================================================
 *  TALKING TO GITHUB AS THE STORELIB GITHUB APP
 * ===========================================================================
 * The app signs a short JWT with its private key (RS256, node:crypto, no
 * library), trades it for an installation token that reaches only the
 * repositories the creator chose, and uses that. Nothing is cached in memory:
 * a Vercel function does not keep it, and a token is one request to mint.
 * No token is ever stored or logged.
 *
 * Six environment variables, all server side. See docs/github-sync.md.
 */
import "server-only"
import { createSign } from "node:crypto"

const API = "https://api.github.com"

export interface GitHubConfig {
  appId: string
  privateKey: string
  slug: string
  clientId: string
  clientSecret: string
  webhookSecret: string
}

/** The app's settings, or null while any is missing. */
export function githubConfig(): GitHubConfig | null {
  const appId = process.env.GITHUB_APP_ID?.trim()
  const rawKey = process.env.GITHUB_APP_PRIVATE_KEY
  const slug = process.env.GITHUB_APP_SLUG?.trim()
  const clientId = process.env.GITHUB_APP_CLIENT_ID?.trim()
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET?.trim()
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET?.trim()
  if (!appId || !rawKey || !slug || !clientId || !clientSecret || !webhookSecret) return null
  /* Pasted into Vercel on one line, a PEM's newlines arrive as "\n". */
  const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey
  return { appId, privateKey, slug, clientId, clientSecret, webhookSecret }
}

const b64url = (s: string | Buffer) =>
  Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

/** The app's own JWT: ten minutes at most, backdated a minute for clock skew. */
function appJwt(cfg: GitHubConfig): string {
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const body = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: cfg.appId }))
  const signer = createSign("RSA-SHA256")
  signer.update(`${head}.${body}`)
  return `${head}.${body}.${b64url(signer.sign(cfg.privateKey))}`
}

export class GitHubError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function call<T>(path: string, token: string, init: { method?: string; body?: unknown; scheme?: "Bearer" | "token" } = {}): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `${init.scheme ?? "Bearer"} ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Storelib",
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  })
  if (!res.ok) {
    /* GitHub's own message, which never contains the token that was sent. */
    const detail = await res.json().then((d: { message?: string }) => d?.message ?? "").catch(() => "")
    throw new GitHubError(res.status, detail || `GitHub answered ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** A token for one installation, good for an hour, used for one request's work. */
export async function installationToken(cfg: GitHubConfig, installationId: number): Promise<string> {
  const d = await call<{ token: string }>(`/app/installations/${installationId}/access_tokens`, appJwt(cfg), { method: "POST" })
  return d.token
}

/** The account an installation is on, as the app sees it. */
export async function installationAccount(cfg: GitHubConfig, installationId: number): Promise<string> {
  const d = await call<{ account?: { login?: string } }>(`/app/installations/${installationId}`, appJwt(cfg))
  return d.account?.login ?? ""
}

/**
 * The code GitHub sends back after install, traded for a user token, and
 * asked which installations that user can reach. This is what proves the
 * person connecting owns the installation: an installation id in a URL on
 * its own proves nothing, anyone can type one.
 */
export async function userCanReachInstallation(cfg: GitHubConfig, code: string, installationId: number): Promise<boolean> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "Storelib" },
    body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code }),
    cache: "no-store",
  })
  const d = (await res.json().catch(() => ({}))) as { access_token?: string }
  if (!d.access_token) return false
  for (let page = 1; page <= 5; page++) {
    const list = await call<{ installations?: { id: number }[] }>(`/user/installations?per_page=100&page=${page}`, d.access_token)
    const items = list.installations ?? []
    if (items.some((i) => i.id === installationId)) return true
    if (items.length < 100) break
  }
  return false
}

export interface Repo {
  id: number
  full_name: string
  default_branch: string
  private: boolean
  html_url: string
}

/** The repositories the creator let the app reach. */
export async function installationRepos(token: string): Promise<Repo[]> {
  const out: Repo[] = []
  for (let page = 1; page <= 5; page++) {
    const d = await call<{ repositories?: Repo[] }>(`/installation/repositories?per_page=100&page=${page}`, token)
    const items = d.repositories ?? []
    out.push(...items.map((r) => ({ id: r.id, full_name: r.full_name, default_branch: r.default_branch, private: r.private, html_url: r.html_url })))
    if (items.length < 100) break
  }
  return out
}

/** One file's text at a commit, or null when it is not there. */
export async function fileAt(token: string, repo: string, path: string, ref: string): Promise<string | null> {
  try {
    const d = await call<{ content?: string; encoding?: string; size?: number }>(
      `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
      token,
    )
    if (d.encoding !== "base64" || typeof d.content !== "string") return null
    return Buffer.from(d.content, "base64").toString("utf8")
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return null
    throw e
  }
}

/** Every file changed between two commits. */
export async function compareFiles(token: string, repo: string, base: string, head: string) {
  const d = await call<{ files?: { filename?: string; status?: string; previous_filename?: string }[] }>(
    `/repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
    token,
  )
  return d.files ?? []
}

/** The green tick or red cross on a commit, named "Storelib". */
export async function setStatus(
  token: string,
  repo: string,
  sha: string,
  status: { state: "success" | "failure" | "error" | "pending"; description: string; target_url?: string },
) {
  await call(`/repos/${repo}/statuses/${encodeURIComponent(sha)}`, token, {
    method: "POST",
    body: { ...status, context: "Storelib" },
  })
}

/** One change in a commit: a file's new text, or its removal. */
export type FileChange = { path: string; content: string } | { path: string; delete: true }

/**
 * Write many changes as ONE commit on a branch, through the Git data API.
 * Returns the new commit, or null when nothing differed. An empty repository
 * has no commit to build on, so its first file goes in through the contents
 * API and the rest follow as usual.
 */
export async function commitFiles(
  token: string,
  repo: string,
  branch: string,
  changes: FileChange[],
  message: string,
): Promise<string | null> {
  const files = changes.filter((c): c is { path: string; content: string } => !("delete" in c))
  let head: string
  try {
    const ref = await call<{ object: { sha: string } }>(`/repos/${repo}/git/ref/heads/${branch}`, token)
    head = ref.object.sha
  } catch (e) {
    if (!(e instanceof GitHubError) || (e.status !== 404 && e.status !== 409) || files.length === 0) {
      /* Nothing to write into an empty repository, only removals: nothing to do. */
      if (e instanceof GitHubError && (e.status === 404 || e.status === 409) && files.length === 0) return null
      throw e
    }
    const first = files[0]
    const created = await call<{ commit: { sha: string } }>(
      `/repos/${repo}/contents/${first.path.split("/").map(encodeURIComponent).join("/")}`,
      token,
      { method: "PUT", body: { message, content: Buffer.from(first.content, "utf8").toString("base64"), branch } },
    )
    head = created.commit.sha
  }
  const commit = await call<{ tree: { sha: string } }>(`/repos/${repo}/git/commits/${head}`, token)
  const tree = await call<{ sha: string }>(`/repos/${repo}/git/trees`, token, {
    method: "POST",
    body: {
      base_tree: commit.tree.sha,
      /* A removal is an entry with no blob; GitHub drops the path. */
      tree: changes.map((c) =>
        "delete" in c
          ? { path: c.path, mode: "100644", type: "blob", sha: null }
          : { path: c.path, mode: "100644", type: "blob", content: c.content },
      ),
    },
  })
  if (tree.sha === commit.tree.sha) return null
  const made = await call<{ sha: string }>(`/repos/${repo}/git/commits`, token, {
    method: "POST",
    body: { message, tree: tree.sha, parents: [head] },
  })
  await call(`/repos/${repo}/git/refs/heads/${branch}`, token, { method: "PATCH", body: { sha: made.sha } })
  return made.sha
}

/** Every file on a branch, with the id of its bytes, for "Pull from GitHub". */
export async function listTree(token: string, repo: string, branch: string): Promise<{ sha: string; paths: string[]; blobs: Map<string, string> }> {
  const ref = await call<{ object: { sha: string } }>(`/repos/${repo}/git/ref/heads/${branch}`, token)
  const tree = await call<{ tree?: { path?: string; type?: string; sha?: string }[]; truncated?: boolean }>(
    `/repos/${repo}/git/trees/${ref.object.sha}?recursive=1`,
    token,
  )
  const files = (tree.tree ?? []).filter((t) => t.type === "blob" && typeof t.path === "string")
  return {
    sha: ref.object.sha,
    paths: files.map((t) => t.path as string),
    blobs: new Map(files.map((t) => [t.path as string, String(t.sha ?? "")])),
  }
}

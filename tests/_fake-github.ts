/**
 * A GitHub that lives in memory: enough of the REST and Git data APIs for
 * lib/github-sync to run against with no network. Repositories hold real
 * git objects in miniature (blobs by their git sha, trees as path maps,
 * commits with parents), so "only what differs is sent", fast forwards and
 * a branch moving underneath a commit behave as they do on GitHub.
 *
 * `fail` queues answers for calls that match, for the error paths: a
 * protected branch, a 502, the hourly limit, an installation that is gone.
 * Every call is in `calls`.
 */
import { createHash } from "node:crypto"

type Tree = Map<string, string>
interface Commit {
  tree: string
  parents: string[]
  message: string
}
interface Repo {
  default_branch: string
  refs: Map<string, string>
  commits: Map<string, Commit>
  trees: Map<string, Tree>
  blobs: Map<string, Buffer>
  protected: Set<string>
  /** Ruleset rules by branch, as GET /rules/branches/{branch} lists them. */
  rules: Map<string, string[]>
  /** Push protection: text that looks like a secret. A commit holding it does not move a branch. */
  secrets: RegExp | null
  statuses: { sha: string; state: string; description: string; context: string; target_url?: string }[]
  comments: { sha: string; body: string; html_url: string }[]
}

export interface Planned {
  method?: string
  path: RegExp
  status: number
  body?: unknown
  headers?: Record<string, string>
  times?: number
}

const gitSha = (b: Buffer) => createHash("sha1").update(`blob ${b.byteLength}\0`).update(b).digest("hex")
const hashOf = (v: unknown) => createHash("sha1").update(JSON.stringify(v)).digest("hex")

export function fakeGitHub(opts: { installations?: number[] } = {}) {
  const repos = new Map<string, Repo>()
  const calls: { method: string; path: string; body?: any }[] = []
  const planned: Planned[] = []
  /** Run before a call is answered: a person pushing at just the wrong moment. */
  const hooks: ((method: string, path: string) => void)[] = []
  const installations = new Set(opts.installations ?? [1])
  let serial = 0

  function newRepo(name: string, branch = "main", files: Record<string, string> | null = {}) {
    const r: Repo = { default_branch: branch, refs: new Map(), commits: new Map(), trees: new Map(), blobs: new Map(), protected: new Set(), rules: new Map(), secrets: null, statuses: [], comments: [] }
    repos.set(name, r)
    if (files) commitFiles(name, branch, files, "Initial commit")
    return r
  }

  function treeSha(r: Repo, t: Tree): string {
    const sha = hashOf([...t.entries()].sort())
    r.trees.set(sha, new Map(t))
    return sha
  }

  function putBlob(r: Repo, b: Buffer): string {
    const sha = gitSha(b)
    r.blobs.set(sha, b)
    return sha
  }

  /** A commit made "by a person", straight into the repository. */
  function commitFiles(name: string, branch: string, files: Record<string, string | Buffer | null>, message: string): string {
    const r = repos.get(name)!
    const head = r.refs.get(branch)
    const t: Tree = head ? new Map(r.trees.get(r.commits.get(head)!.tree)!) : new Map()
    for (const [p, c] of Object.entries(files)) {
      if (c === null) t.delete(p)
      else t.set(p, putBlob(r, Buffer.isBuffer(c) ? c : Buffer.from(c, "utf8")))
    }
    const sha = hashOf({ n: ++serial, message })
    r.commits.set(sha, { tree: treeSha(r, t), parents: head ? [head] : [], message })
    r.refs.set(branch, sha)
    return sha
  }

  function filesAt(name: string, ref: string): Record<string, Buffer> {
    const r = repos.get(name)!
    const sha = r.refs.get(ref) ?? ref
    const c = r.commits.get(sha)
    if (!c) return {}
    const out: Record<string, Buffer> = {}
    for (const [p, b] of r.trees.get(c.tree)!) out[p] = r.blobs.get(b)!
    return out
  }

  const text = (name: string, ref: string, path: string) => filesAt(name, ref)[path]?.toString("utf8")
  /** The git note on a commit in refs/notes/storelib, as `git notes --ref=storelib show <sha>` prints it. */
  const note = (name: string, sha: string) => text(name, "refs/notes/storelib", sha)

  function isAncestor(r: Repo, maybe: string, of: string): boolean {
    const seen = new Set<string>()
    const stack = [of]
    while (stack.length) {
      const s = stack.pop()!
      if (s === maybe) return true
      if (seen.has(s)) continue
      seen.add(s)
      stack.push(...(r.commits.get(s)?.parents ?? []))
    }
    return false
  }

  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })

  async function handle(url: string, init: { method: string; body?: string }): Promise<Response> {
    const u = new URL(url)
    const path = decodeURIComponent(u.pathname)
    const method = init.method
    const body = init.body ? JSON.parse(init.body) : undefined
    calls.push({ method, path: path + u.search, body })
    for (const h of hooks) h(method, path)

    const plan = planned.find((p) => (!p.method || p.method === method) && p.path.test(path) && (p.times ?? 1) > 0)
    if (plan) {
      plan.times = (plan.times ?? 1) - 1
      return json(plan.status, plan.body ?? { message: "planned" }, plan.headers)
    }

    let m = /^\/app\/installations\/(\d+)\/access_tokens$/.exec(path)
    if (m) return installations.has(Number(m[1])) ? json(201, { token: "ghs_fake_installation_token" }) : json(404, { message: "Not Found" })

    m = /^\/repos\/([^/]+\/[^/]+)(\/.*)?$/.exec(path)
    if (!m) return json(404, { message: "Not Found" })
    const name = m[1]
    const rest = m[2] ?? ""
    const r = repos.get(name)
    if (!r) return json(404, { message: "Not Found" })
    const empty = r.refs.size === 0

    if (rest === "" && method === "GET") return json(200, { default_branch: r.default_branch, full_name: name })

    if ((m = /^\/git\/ref\/heads\/(.+)$/.exec(rest)) && method === "GET") {
      if (empty) return json(409, { message: "Git Repository is empty." })
      const sha = r.refs.get(m[1])
      return sha ? json(200, { object: { sha } }) : json(404, { message: "Not Found" })
    }
    /* Any other ref (refs/notes/storelib): kept under its full name, beside the branches. */
    if ((m = /^\/git\/ref\/((?!heads\/).+)$/.exec(rest)) && method === "GET") {
      const sha = r.refs.get(`refs/${m[1]}`)
      return sha ? json(200, { object: { sha } }) : json(404, { message: "Not Found" })
    }
    if ((m = /^\/git\/refs\/((?!heads\/).+)$/.exec(rest)) && method === "PATCH") {
      const name = `refs/${m[1]}`
      const cur = r.refs.get(name)
      if (!cur) return json(422, { message: "Reference does not exist" })
      if (!body.force && !isAncestor(r, cur, body.sha)) return json(422, { message: "Update is not a fast forward" })
      r.refs.set(name, body.sha)
      return json(200, { object: { sha: body.sha } })
    }
    if (rest === "/git/refs" && method === "POST") {
      const b = String(body.ref).replace(/^refs\/heads\//, "")
      if (r.refs.has(b)) return json(422, { message: "Reference already exists" })
      r.refs.set(b, body.sha)
      return json(201, { ref: body.ref, object: { sha: body.sha } })
    }
    if ((m = /^\/branches\/(.+)$/.exec(rest)) && method === "GET") {
      if (!r.refs.has(m[1])) return json(404, { message: "Branch not found" })
      return json(200, { name: m[1], protected: r.protected.has(m[1]) })
    }
    if ((m = /^\/rules\/branches\/(.+)$/.exec(rest)) && method === "GET") {
      return json(200, (r.rules.get(m[1]) ?? []).map((type) => ({ type, ruleset_source_type: "Repository", ruleset_id: 1 })))
    }
    if ((m = /^\/git\/refs\/heads\/(.+)$/.exec(rest)) && method === "PATCH") {
      const b = m[1]
      if (r.protected.has(b)) return json(422, { message: "Protected branch update failed for refs/heads/" + b + "." })
      if (r.secrets) {
        const t = r.trees.get(r.commits.get(body.sha)?.tree ?? "")
        const leak = t && [...t.values()].some((sha) => r.secrets!.test(r.blobs.get(sha)?.toString("utf8") ?? ""))
        if (leak) return json(422, { message: "Repository rule violations found\n\n- GITHUB PUSH PROTECTION\n  Push cannot contain secrets", metadata: { secret_scanning: { bypass_placeholders: [{ placeholder_id: "x", token_type: "stripe_api_key" }] } } })
      }
      const cur = r.refs.get(b)
      if (cur && !body.force && !isAncestor(r, cur, body.sha)) return json(422, { message: "Update is not a fast forward" })
      r.refs.set(b, body.sha)
      return json(200, { object: { sha: body.sha } })
    }
    if ((m = /^\/git\/commits\/([0-9a-f]+)$/.exec(rest)) && method === "GET") {
      const c = r.commits.get(m[1])
      return c ? json(200, { sha: m[1], tree: { sha: c.tree }, message: c.message }) : json(404, { message: "Not Found" })
    }
    if (rest === "/git/commits" && method === "POST") {
      if (!r.trees.has(body.tree)) return json(422, { message: "Tree not found" })
      const sha = hashOf({ n: ++serial, m: body.message })
      r.commits.set(sha, { tree: body.tree, parents: body.parents, message: body.message })
      return json(201, { sha })
    }
    if ((m = /^\/git\/trees\/([0-9a-f]+)$/.exec(rest)) && method === "GET") {
      const t = r.trees.get(r.commits.get(m[1])?.tree ?? m[1])
      if (!t) return json(404, { message: "Not Found" })
      return json(200, { tree: [...t].map(([p, b]) => ({ path: p, type: "blob", sha: b, size: r.blobs.get(b)!.byteLength })), truncated: false })
    }
    if (rest === "/git/trees" && method === "POST") {
      if (empty) return json(409, { message: "Git Repository is empty." })
      const base = body.base_tree ? r.trees.get(body.base_tree) : new Map<string, string>()
      if (!base) return json(422, { message: "base_tree not found" })
      const t: Tree = new Map(base)
      for (const e of body.tree as { path: string; sha?: string | null; content?: string }[]) {
        if (e.sha === null) {
          if (!t.has(e.path)) return json(422, { message: `GitRPC::BadObjectState: ${e.path} not in tree` })
          t.delete(e.path)
        } else if (typeof e.content === "string") t.set(e.path, putBlob(r, Buffer.from(e.content, "utf8")))
        else if (e.sha && r.blobs.has(e.sha)) t.set(e.path, e.sha)
        else return json(422, { message: "blob not found" })
      }
      return json(201, { sha: treeSha(r, t) })
    }
    if (rest === "/git/blobs" && method === "POST") {
      if (empty) return json(409, { message: "Git Repository is empty." })
      const b = Buffer.from(body.content, body.encoding === "base64" ? "base64" : "utf8")
      return json(201, { sha: putBlob(r, b) })
    }
    if ((m = /^\/git\/blobs\/([0-9a-f]+)$/.exec(rest)) && method === "GET") {
      const b = r.blobs.get(m[1])
      return b ? json(200, { content: b.toString("base64"), encoding: "base64", size: b.byteLength }) : json(404, { message: "Not Found" })
    }
    if ((m = /^\/contents\/(.+)$/.exec(rest)) && method === "PUT") {
      const sha = commitFiles(name, body.branch ?? r.default_branch, { [m[1]]: Buffer.from(body.content, "base64") }, body.message)
      return json(201, { commit: { sha } })
    }
    if ((m = /^\/compare\/([0-9a-f]+)\.\.\.([0-9a-f]+)$/.exec(rest)) && method === "GET") {
      if (!r.commits.has(m[1]) || !r.commits.has(m[2])) return json(404, { message: "Not Found" })
      const a = r.trees.get(r.commits.get(m[1])?.tree ?? "") ?? new Map()
      const b = r.trees.get(r.commits.get(m[2])?.tree ?? "") ?? new Map()
      const files: { filename: string; status: string }[] = []
      for (const [p, s] of b) if (!a.has(p)) files.push({ filename: p, status: "added" })
      else if (a.get(p) !== s) files.push({ filename: p, status: "modified" })
      for (const p of a.keys()) if (!b.has(p)) files.push({ filename: p, status: "removed" })
      const status = m[1] === m[2] ? "identical" : isAncestor(r, m[1], m[2]) ? "ahead" : isAncestor(r, m[2], m[1]) ? "behind" : "diverged"
      return json(200, { status, files })
    }
    if ((m = /^\/statuses\/([0-9a-f]+)$/.exec(rest)) && method === "POST") {
      r.statuses.push({ sha: m[1], state: body.state, description: body.description, context: body.context, target_url: body.target_url })
      return json(201, {})
    }
    if ((m = /^\/commits\/([0-9a-f]+)\/comments$/.exec(rest)) && method === "POST") {
      const html_url = `https://github.com/${name}/commit/${m[1]}#commitcomment-${r.comments.length + 1}`
      r.comments.push({ sha: m[1], body: body.body, html_url })
      return json(201, { html_url })
    }
    return json(404, { message: `fake GitHub has no ${method} ${rest}` })
  }

  return {
    repos,
    calls,
    newRepo,
    commitFiles,
    filesAt,
    text,
    note,
    fail: (p: Planned) => planned.push(p),
    hooks,
    transport: (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => handle(url, init),
    installations,
  }
}

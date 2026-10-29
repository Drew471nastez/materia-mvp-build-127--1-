/**
 * What keeps a canvas document alive after a push let go of its iframe.
 *
 * scripts/check-editor-push-lag.mjs counts the documents alive after a
 * collection (Memory.getDOMCounters): this takes a heap snapshot after a few
 * pushes and prints, for each document that is no longer in an iframe, the
 * shortest path from the page's roots to it, so the holder can be named.
 *
 *   npx tsx scripts/editor-push-retainers.mjs
 */
process.env.PROBE_CSS = process.env.PROBE_CSS ?? "source"
const { bundle, css } = await import("./editor-probe-harness.mjs")
const { importedTheme, openEditor, sleep } = await import("./canvas-probe-kit.mjs")

const compat = await importedTheme({ store: true })
const GLOBALS = `window.PROBE_ACTIVITY={events:[{id:1000,agent_name:"GitHub · ada",path:"pages/home",action:"page",detail:{page:"home",replaced:true},created_at:"2026-10-01T00:00:00.000Z"}],syncAt:"2026-10-01T00:00:00.000Z"};window.PROBE_CONNECTIONS={agents:[],github:{repo:"ada/theme"},latest:null};`
const ed = await openEditor({ kind: "imported", bundle, css, compat, globals: GLOBALS, width: 1280, height: 900, settle: 3000 })
try {
  const cdp = await ed.page.createCDPSession()
  const counters = async () => { await cdp.send("HeapProfiler.collectGarbage"); return (await cdp.send("Memory.getDOMCounters")).documents }
  console.log("documents at rest:", await counters())
  for (let k = 0; k < Number(process.env.PUSHES ?? 3); k++) {
    const p = "shopify/assets/materia.css"
    compat.all[p] = `${compat.all[p]}\n:root{--r${k}:1}`
    await ed.page.evaluate((path, text) => {
      window.PROBE_COMPAT.files[path] = text
      const a = window.PROBE_ACTIVITY
      a.events.push({ id: a.events[a.events.length - 1].id + 1, agent_name: "GitHub · ada", path, action: "updated", created_at: new Date().toISOString() })
      a.syncAt = new Date().toISOString()
    }, p, compat.all[p])
    await sleep(6000)
    console.log(`documents after push ${k + 1}:`, await counters(), "iframes:", await ed.js(() => document.querySelectorAll("iframe").length))
  }
  await cdp.send("HeapProfiler.enable")
  const chunks = []
  cdp.on("HeapProfiler.addHeapSnapshotChunk", (e) => chunks.push(e.chunk))
  await cdp.send("HeapProfiler.collectGarbage")
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false })
  const snap = JSON.parse(chunks.join(""))
  const m = snap.snapshot.meta
  const NF = m.node_fields.length, EF = m.edge_fields.length
  const nTypes = m.node_types[0], eTypes = m.edge_types[0]
  const nodes = snap.nodes, edges = snap.edges, strings = snap.strings
  const N = nodes.length / NF
  const fi = (n) => m.node_fields.indexOf(n), ei = (n) => m.edge_fields.indexOf(n)
  const nName = fi("name"), nType = fi("type"), nEdges = fi("edge_count"), nId = fi("id")
  const eType = ei("type"), eName = ei("name_or_index"), eTo = ei("to_node")
  const firstEdge = new Uint32Array(N + 1)
  for (let i = 0, e = 0; i < N; i++) { firstEdge[i] = e; e += nodes[i * NF + nEdges] * EF }
  firstEdge[N] = edges.length
  const name = (i) => strings[nodes[i * NF + nName]]
  /* Shortest paths from the root, ignoring weak edges. */
  const prev = new Int32Array(N).fill(-1), prevEdge = new Int32Array(N).fill(-1)
  const seen = new Uint8Array(N)
  const queue = [0]
  seen[0] = 1
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]
    for (let e = firstEdge[i]; e < firstEdge[i + 1]; e += EF) {
      if (eTypes[edges[e + eType]] === "weak") continue
      /* A weak map's entry, and the hidden edges a heap snapshot draws for it, hold nothing by themselves. */
      const t0 = eTypes[edges[e + eType]]
      if ((t0 === "internal" || t0 === "property") && typeof strings[edges[e + eName]] === "string" && /part of key|ephemeron/.test(strings[edges[e + eName]])) continue
      const to = edges[e + eTo] / NF
      if (seen[to]) continue
      seen[to] = 1
      prev[to] = i
      prevEdge[to] = e
      queue.push(to)
    }
  }
  /* Who points at each window of this origin, beside the snapshot's own root: a frame let go but still pointed at is the leak. */
  const into = new Map()
  for (let i = 0; i < N; i++) {
    for (let e = firstEdge[i]; e < firstEdge[i + 1]; e += EF) {
      const to = edges[e + eTo] / NF
      if (!(process.env.DOCS ? /^HTMLDocument\b/ : /^Window \/ http/).test(name(to))) continue
      const t = eTypes[edges[e + eType]]
      if (t === "weak" || i === 0) continue
      const label = t === "element" || t === "hidden" ? `[${edges[e + eName]}]` : strings[edges[e + eName]]
      if (!into.has(to)) into.set(to, [])
      into.get(to).push(`${name(i).slice(0, 70)} --${t}:${String(label).slice(0, 50)}`)
    }
  }
  for (const [w, from] of into) {
    console.log(`\n${name(w)} @${nodes[w * NF + nId]}: ${from.length} referrers`)
    const counts = new Map()
    for (const f of from) counts.set(f, (counts.get(f) ?? 0) + 1)
    for (const [f, c] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.REFS ?? 14))) console.log(`   ${c}x ${f}`)
  }
  /* How many of each of the editor's own objects that hold a theme or a frame are alive. */
  const tally = new Map()
  for (let i = 0; i < N; i++) {
    const nm = name(i)
    if (/^(CompatTheme|PreviewSheet|HTMLIFrameElement|Detached HTMLIFrameElement|Window|Detached Window)$/.test(nm) && strings[nodes[i * NF + nType]] !== "hidden") tally.set(nm, (tally.get(nm) ?? 0) + 1)
    if (nodes[i * NF + nType] === nTypes.indexOf("object") && /^(CompatTheme|PreviewSheet)$/.test(nm)) tally.set(`${nm} (object)`, (tally.get(`${nm} (object)`) ?? 0) + 1)
  }
  console.log("alive:", JSON.stringify(Object.fromEntries(tally)))
  /* The shortest path from a window to each object named in PATH_TO (a theme the editor no longer draws, a sheet). */
  if (process.env.PATH_TO) {
    const byId = new Map()
    for (let i = 0; i < N; i++) byId.set(nodes[i * NF + nId], i)
    const pathOf = (i) => {
      const path = []
      for (let cur = i; cur > 0 && prev[cur] >= 0; cur = prev[cur]) {
        const e = prevEdge[cur]
        const t = eTypes[edges[e + eType]]
        const label = t === "element" || t === "hidden" ? `[${edges[e + eName]}]` : strings[edges[e + eName]]
        path.push(`${name(prev[cur]).slice(0, 50)} .${String(label).slice(0, 70)} (${t})`)
      }
      return path.reverse()
    }
    const done = new Set()
    const show = (i, title, depth) => {
      if (done.has(i) || depth > 3) return
      done.add(i)
      const p = pathOf(i)
      console.log(`\n${"  ".repeat(depth)}${title} @${nodes[i * NF + nId]}:\n   ${p.join("\n   ")}`)
      /* A weak map's entry lives while its key does: what holds the key. */
      for (const line of p) {
        const k = /part of key \([^@]*@(\d+)\)/.exec(line)
        if (k && byId.has(Number(k[1]))) show(byId.get(Number(k[1])), `  key of that entry (${name(byId.get(Number(k[1])))})`, depth + 1)
      }
    }
    for (let i = 0; i < N; i++) {
      const wantId = /^@\d+$/.test(process.env.PATH_TO) ? Number(process.env.PATH_TO.slice(1)) : null
      if (wantId !== null ? nodes[i * NF + nId] !== wantId : name(i) !== process.env.PATH_TO || nodes[i * NF + nType] !== nTypes.indexOf("object")) continue
      show(i, process.env.PATH_TO, 0)
    }
  }
  const docs = []
  for (let i = 0; i < N; i++) if (/^(Detached )?HTMLDocument\b/.test(name(i))) docs.push(i)
  console.log(`\n${docs.length} HTMLDocument nodes in the snapshot`)
  for (const d of docs) {
    const path = []
    for (let cur = d; cur > 0 && prev[cur] >= 0; cur = prev[cur]) {
      const e = prevEdge[cur]
      const t = eTypes[edges[e + eType]]
      const label = t === "element" || t === "hidden" ? `[${edges[e + eName]}]` : strings[edges[e + eName]]
      path.push(`${name(prev[cur]).slice(0, 60)} --${t}:${String(label).slice(0, 40)}--> `)
    }
    /* A frame's own document (its window holds it) is not the question; one held from anywhere else is. */
    const own = path.some((p) => /DocumentCachedAccessor/.test(p)) && path.length <= 3
    const unreached = prev[d] < 0
    if ((own || unreached) && !process.env.ALL) continue
    console.log(`\n${name(d).slice(0, 80)} (@${nodes[d * NF + nId]})${unreached ? " unreached" : ""}\n  ${path.reverse().join("\n  ")}`)
  }
} finally {
  await ed.close()
}

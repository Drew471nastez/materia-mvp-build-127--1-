#!/usr/bin/env node
/**
 * The build's memory, measured, with a ceiling.
 *
 *   node scripts/ci/measure-build.mjs                 runs `pnpm build`
 *   node scripts/ci/measure-build.mjs -- next build   runs anything else
 *
 * Spawns the build and, every 250 ms, walks /proc for the whole process
 * tree under it (pnpm, node, next, the Turbopack workers) and adds up their
 * resident memory. The highest sum seen is the peak.
 *
 * It fails when the build fails, or when the peak is over BUILD_PEAK_LIMIT_MB
 * (7,600 by default). Vercel's Standard build machine has 8 GB; a build that
 * needs more is killed there with no useful message, so CI says it first,
 * on a runner with room to spare (about 16 GB).
 *
 * The sum of RSS counts a page shared by two processes twice, so it reads a
 * little high; the proportional figure (PSS, from smaps_rollup) is printed
 * beside it. The ceiling is on RSS, the cautious one.
 *
 * Writes the figures to `.next/build-memory.json` and, on GitHub, to the job
 * summary. Linux only: elsewhere there is no /proc and it just runs the build.
 */
import { spawn } from "node:child_process"
import { readFileSync, readdirSync, writeFileSync, appendFileSync, existsSync } from "node:fs"
import { cpus, totalmem } from "node:os"

const LIMIT_MB = Number(process.env.BUILD_PEAK_LIMIT_MB || 7600)
const INTERVAL_MS = 250

const sep = process.argv.indexOf("--")
const command = sep >= 0 ? process.argv.slice(sep + 1) : ["pnpm", "build"]
if (!command.length) {
  console.error("measure-build: nothing to run after --")
  process.exit(2)
}

const hasProc = existsSync("/proc/self/status")
const pageKb = 4 // statm counts pages; every Linux runner this meets uses 4 KiB pages

/** pid -> parent pid, for every process we can read. */
function parents() {
  const map = new Map()
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue
    try {
      const stat = readFileSync(`/proc/${name}/stat`, "utf8")
      // The command name is in parentheses and may itself hold spaces or parentheses.
      const rest = stat.slice(stat.lastIndexOf(")") + 2).split(" ")
      map.set(Number(name), Number(rest[1]))
    } catch {
      /* exited between the listing and the read */
    }
  }
  return map
}

function tree(root) {
  const map = parents()
  const out = new Set([root])
  let grew = true
  while (grew) {
    grew = false
    for (const [pid, ppid] of map) {
      if (!out.has(pid) && out.has(ppid)) {
        out.add(pid)
        grew = true
      }
    }
  }
  return [...out]
}

function rssKb(pid) {
  try {
    return Number(readFileSync(`/proc/${pid}/statm`, "utf8").split(" ")[1]) * pageKb
  } catch {
    return 0
  }
}

function pssKb(pid) {
  try {
    const m = /^Pss:\s+(\d+) kB/m.exec(readFileSync(`/proc/${pid}/smaps_rollup`, "utf8"))
    return m ? Number(m[1]) : 0
  } catch {
    return 0
  }
}

const started = Date.now()
const child = spawn(command[0], command.slice(1), { stdio: "inherit", env: process.env })

let peakRssKb = 0
let peakPssKb = 0
let peakProcesses = 0
let samples = 0
let pssTick = 0

const timer = hasProc
  ? setInterval(() => {
      if (!child.pid) return
      const pids = tree(child.pid)
      const rss = pids.reduce((s, p) => s + rssKb(p), 0)
      samples++
      if (rss > peakRssKb) {
        peakRssKb = rss
        peakProcesses = pids.length
      }
      // smaps_rollup walks every mapping: once a second is plenty.
      if (++pssTick % 4 === 0 || rss >= peakRssKb) {
        const pss = pids.reduce((s, p) => s + pssKb(p), 0)
        if (pss > peakPssKb) peakPssKb = pss
      }
    }, INTERVAL_MS)
  : null

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig))

child.on("exit", (code, signal) => {
  if (timer) clearInterval(timer)
  const seconds = Math.round((Date.now() - started) / 1000)
  const mb = (kb) => Math.round(kb / 1024)
  const result = {
    command: command.join(" "),
    exitCode: code,
    signal,
    seconds,
    peakRssMb: hasProc ? mb(peakRssKb) : null,
    peakPssMb: hasProc ? mb(peakPssKb) : null,
    peakProcesses,
    samples,
    limitMb: LIMIT_MB,
    cpus: cpus().length,
    machineMb: mb(totalmem() / 1024),
    nodeOptions: process.env.NODE_OPTIONS ?? "",
  }

  const over = hasProc && result.peakRssMb > LIMIT_MB
  const line = hasProc
    ? `Build peak memory: ${result.peakRssMb} MB RSS (${result.peakPssMb} MB PSS) across ${peakProcesses} processes, limit ${LIMIT_MB} MB, ${seconds} s on ${result.cpus} CPUs`
    : `Build took ${seconds} s (no /proc here, memory not measured)`
  console.log(`\n${line}`)

  try {
    if (existsSync(".next")) writeFileSync(".next/build-memory.json", JSON.stringify(result, null, 2) + "\n")
  } catch {
    /* the figure is printed either way */
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = [
      "### Build memory",
      "",
      "| | |",
      "| --- | --- |",
      `| Peak RSS (process tree) | **${result.peakRssMb ?? "n/a"} MB** |`,
      `| Peak PSS | ${result.peakPssMb ?? "n/a"} MB |`,
      `| Limit | ${LIMIT_MB} MB (Vercel Standard has 8 GB) |`,
      `| Time | ${seconds} s on ${result.cpus} CPUs |`,
      `| Result | ${code !== 0 ? "build failed" : over ? "over the limit" : "within the limit"} |`,
      "",
    ]
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, rows.join("\n"))
    } catch {
      /* summary is a nicety */
    }
  }

  if (code !== 0) {
    console.error(`measure-build: the build exited ${code ?? signal}`)
    process.exit(code || 1)
  }
  if (over) {
    console.error(`measure-build: peak ${result.peakRssMb} MB is over the ${LIMIT_MB} MB limit. Vercel Standard (8 GB) would likely kill this build.`)
    process.exit(1)
  }
})

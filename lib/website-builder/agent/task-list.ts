/**
 * ===========================================================================
 *  SEVERAL THINGS ASKED AT ONCE ARE A LIST, DONE IN ORDER
 * ===========================================================================
 * "Add a pricing section, make the hero darker and put an FAQ at the bottom"
 * is three changes. Read as one request, the run did the first properly, the
 * second partly, and closed with a sentence about the first; the third was
 * never started and nothing said so.
 *
 * So a request with several parts is split here, in code, into its parts.
 * The chat shows them as the plan, each part is a step that is ticked when
 * the model says it is finished (`task_done`), and a run that tries to close
 * with a part still open is told which one and carries on. Parts that a
 * ceiling stops are picked up by the chat's Continue, with this conversation
 * as its memory.
 *
 * Conservative: "make the hero bold and bigger" is one change, because
 * "bigger" is not an instruction on its own. A part has to start with
 * something to do.
 *
 * Pure: tests/round-bc-aiagent.test.ts.
 */
import type { ToolSpec } from "@/lib/sites/agent/types"

export const MAX_TASKS = 8

const VERB = /^(?:please\s+)?(?:add|make|change|remove|delete|hide|show|build|create|design|redesign|set|put|move|rewrite|write|fix|update|replace|turn|give|use|swap|insert|include|translate|rename|link|connect|reorder|align|centre|center|increase|decrease|reduce|shorten|lengthen|tighten|darken|lighten|recolou?r|restyle|improve|polish|clean|tidy|animate|apply|upload|switch|edit|style|list|feature|highlight|pin|drop|get rid of|take out|bring|let|i (?:want|need)|we (?:want|need))\b/i

function clean(part: string): string {
  return part
    .replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "")
    .replace(/^\s*(?:and|also|then|and then|plus|after that|next|finally|lastly|first(?:ly)?|second(?:ly)?)\b[,:]?\s*/i, "")
    .replace(/^\s*(?:and|also|then)\b\s*/i, "")
    .replace(/[\s,;.]+$/, "")
    .trim()
}

function isTask(part: string): boolean {
  return part.length >= 6 && VERB.test(part)
}

/** The parts of a request, in order, when it has two or more; otherwise an empty list. */
export function splitTasks(prompt: string): string[] {
  const text = (prompt ?? "").trim()
  if (!text || text.length > 4000) return []

  /* A list typed as a list: numbered or bulleted lines. */
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const listed = lines.filter((l) => /^(?:\d+[.)]|[-*•])\s+/.test(l))
  if (listed.length >= 2) {
    const tasks = listed.map(clean).filter((t) => t.length >= 3)
    return tasks.length >= 2 ? tasks.slice(0, MAX_TASKS).map((t) => t.slice(0, 160)) : []
  }

  /* Sentences, then clauses joined by "then", "also", "and" or a semicolon, kept only when each starts with something to do. */
  const pieces: string[] = []
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+|;\s*/)) {
    const clauses = sentence.split(/,?\s+(?:and then|then|and also|also|plus|after that)\s+|,\s+and\s+|\s+and\s+(?=(?:please\s+)?(?:add|make|change|remove|delete|hide|build|create|put|move|rewrite|write|fix|update|replace|turn|give|use|swap|insert|translate|rename|link|redesign|set)\b)|,\s+(?=(?:please\s+)?(?:add|make|change|remove|delete|hide|build|create|put|move|rewrite|write|fix|update|replace|turn|give|use|swap|insert|translate|rename|link|redesign|set)\b)/i)
    for (const c of clauses) {
      const part = clean(c)
      if (part) pieces.push(part)
    }
  }
  const tasks = pieces.filter(isTask)
  /* Every piece has to be a task: a split that leaves words that are not ("bigger", "for my bakery") split something that was one. */
  if (tasks.length < 2 || tasks.length !== pieces.length) return []
  return tasks.slice(0, MAX_TASKS).map((t) => t.slice(0, 160))
}

/** The parts as the chat shows them, as the plan. */
export function tasksForCreator(tasks: string[]): string {
  return tasks.map((t, i) => `${i + 1}. ${t.charAt(0).toUpperCase()}${t.slice(1)}`).join("\n")
}

export function taskStepId(n: number): string {
  return `task:${n}`
}

export function taskStepLabel(n: number, of: number, task: string): string {
  const said = task.length > 70 ? `${task.slice(0, 67).trimEnd()}...` : task
  return `Part ${n} of ${of}: ${said.charAt(0).toUpperCase()}${said.slice(1)}`
}

/** What the model reads beside the request. */
export function taskGuidance(tasks: string[]): string {
  return [
    `THIS REQUEST HAS ${tasks.length} PARTS. Do every one, in this order, finishing each before you start the next:`,
    ...tasks.map((t, i) => `  ${i + 1}. ${t}`),
    "When a part is finished, call task_done with its number in the same turn as its last change. Then go straight on to the next part. Your closing sentence comes only after the last part, and names each part you did.",
  ].join("\n")
}

export const TASK_TOOL: ToolSpec<string> = {
  name: "task_done",
  description: "Mark one part of this request finished, by its number in THIS REQUEST HAS N PARTS. Call it in the same turn as that part's last change.",
  parameters: {
    type: "object",
    properties: { part: { type: "number", description: "The part's number, from 1." } },
    required: ["part"],
    additionalProperties: false,
  },
}

/** The part a task_done call names, or null. */
export function readTaskDone(argumentsJson: string, of: number): number | null {
  try {
    const n = Number((JSON.parse(argumentsJson || "{}") as { part?: unknown }).part)
    return Number.isInteger(n) && n >= 1 && n <= of ? n : null
  } catch {
    return null
  }
}

/** Said to a run that tried to finish with parts still open. */
export function openTasksNote(tasks: string[], open: number[]): string {
  return [
    `NOT FINISHED: ${open.length === 1 ? "this part of the request is" : "these parts of the request are"} still open:`,
    ...open.map((n) => `  ${n}. ${tasks[n - 1]}`),
    "Do it now with the tools, then call task_done for it. If it is already done, call task_done for it. If it genuinely cannot be done here, say why in your closing sentence.",
  ].join("\n")
}

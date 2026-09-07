/**
 * How much of the project the creator is asking to change.
 *
 * ---------------------------------------------------------------------------
 *  WHY THIS IS DECIDED HERE AND NOT BY THE MODEL
 * ---------------------------------------------------------------------------
 * "Make this button bigger" and "start over with a completely different look"
 * are different permissions, and the expensive mistake is only in one
 * direction: treating a small edit as a licence to redesign throws away work
 * somebody liked, while treating a redesign conservatively produces a change
 * that is merely too small — annoying, and repairable by asking again.
 *
 * So the default is the cautious one, and widening it requires the creator to
 * have actually said something that widens it. Leaving that judgement to the
 * model means it is re-made, slightly differently, on every run: a model
 * mid-generation is a poor judge of how much it has been invited to touch,
 * and it errs enthusiastically.
 *
 * This is a floor, not a ceiling. The model still reads the sentence; this
 * just decides which posture it starts from.
 */

export type EditIntent = "edit" | "add" | "redesign" | "rebuild"

/**
 * Phrases that genuinely mean "replace what is there".
 *
 * Deliberately narrow and mostly multi-word. "New" alone appears in "add a new
 * section", which is an ADD; "redo" appears in "redo the spacing on the hero",
 * which is an EDIT. A word that can innocently appear inside a small request
 * cannot be a trigger for permission to rewrite the site.
 */
const REBUILD_PHRASES = [
  "start over",
  "start again",
  "from scratch",
  "rebuild the site",
  "rebuild the website",
  "rebuild it",
  "scrap it",
  "scrap this",
  "throw it away",
  "throw this away",
  "delete everything",
  "completely new site",
  "completely new website",
  "brand new site",
  "brand new website",
]

const REDESIGN_PHRASES = [
  "redesign",
  "re-design",
  "restyle",
  "re-style",
  "new look",
  "different look",
  "new design",
  "different design",
  "completely different",
  "totally different",
  "new style",
  "different style",
  "change the whole",
  "overhaul",
  "revamp",
  "new brand",
  "rebrand",
]

/** Words that mean "there should be more here", without touching what exists. */
const ADD_PHRASES = [
  "add ",
  "create a",
  "create an",
  "include a",
  "include an",
  "insert a",
  "insert an",
  "put a",
  "put an",
  "new page",
  "new section",
  "another section",
]

export function classifyIntent(prompt: string): EditIntent {
  const text = prompt.toLowerCase()

  if (REBUILD_PHRASES.some((phrase) => text.includes(phrase))) return "rebuild"
  if (REDESIGN_PHRASES.some((phrase) => text.includes(phrase))) return "redesign"
  if (ADD_PHRASES.some((phrase) => text.includes(phrase))) return "add"
  return "edit"
}

/**
 * The posture, spelled out for the model.
 *
 * Written as instructions rather than a label because a label ("intent: edit")
 * is something a model can acknowledge and then ignore. These say what to do
 * and, more usefully, what not to.
 */
export function intentInstruction(intent: EditIntent): string {
  switch (intent) {
    case "rebuild":
      return `This request asks to REBUILD. The creator has said something like "start over" or "from scratch", so replacing the structure is what they want. Even here, keep the business, the audience and the language of the site unless they asked you to change those too.`

    case "redesign":
      return `This request asks to REDESIGN. Changing the visual direction is what they want — palette, type, spacing, the feel of it. Keep the CONTENT, the pages and the functionality that already exist; a redesign is not a rewrite. Move the tokens in ${"`src/styles.css`"} rather than hard-coding new values into components.`

    case "add":
      return `This request asks to ADD something. Build the new thing using what the project already has — its components, its tokens, its spacing, its typography, its container widths. Do not touch anything that is already there beyond what is needed to slot the new thing in, and do not take the arrival of new content as an occasion to tidy or restyle the old.`

    case "edit":
    default:
      return `This request is an EDIT: change the specific thing named and nothing else. If they say a button should be bigger, change that button — do not rework the section around it, do not adjust neighbouring spacing "while you are there", and do not touch any file the change does not require. The smallest change that satisfies the request is the correct change.`
  }
}

/**
 * ===========================================================================
 *  A SMALL HIGHLIGHTER FOR THE FOUR LANGUAGES A SECTION IS WRITTEN IN
 * ===========================================================================
 * The hub's code is `.storelib` files, CSS, JSON and a little TypeScript. A
 * general highlighter is a large dependency that knows two hundred languages
 * and not this one, and would colour `{% if %}` as nonsense. This knows
 * exactly what the hub shows.
 *
 * A `.storelib` file is split at its four block tags first, and each block is
 * coloured as what it is: the template as markup with template tags, the style
 * as CSS, the script as JavaScript, the schema as JSON.
 *
 * It returns tokens, not HTML. The page turns them into <span>s with React,
 * so nothing here can inject markup, whatever a code sample contains.
 */

export type TokenKind = "comment" | "string" | "template" | "tag" | "attr" | "property" | "number" | "keyword" | "punct"
export interface Token { text: string; kind?: TokenKind }

type Rule = [RegExp, TokenKind]

const T_COMMENT: Rule = [/\{#[\s\S]*?#\}/y, "comment"]
const HTML_COMMENT: Rule = [/<!--[\s\S]*?-->/y, "comment"]
const BLOCK_COMMENT: Rule = [/\/\*[\s\S]*?\*\//y, "comment"]
const LINE_COMMENT: Rule = [/\/\/[^\n]*/y, "comment"]
const TEMPLATE: Rule = [/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/y, "template"]
const DQ: Rule = [/"(?:\\.|[^"\\\n])*"/y, "string"]
const SQ: Rule = [/'(?:\\.|[^'\\\n])*'/y, "string"]
const BQ: Rule = [/`(?:\\.|[^`\\])*`/y, "string"]
const NUMBER: Rule = [/-?\b\d+(?:\.\d+)?(?:px|rem|em|ms|s|%|fr|vw|vh|deg)?\b/y, "number"]

const LANGS: Record<string, Rule[]> = {
  html: [
    T_COMMENT, HTML_COMMENT, TEMPLATE, DQ, SQ,
    [/<\/?[a-zA-Z][\w-]*|\/?>/y, "tag"],
    [/[a-zA-Z_:@][\w:.-]*(?==)/y, "attr"],
  ],
  css: [
    BLOCK_COMMENT, TEMPLATE, DQ, SQ,
    [/@[a-z-]+/y, "keyword"],
    [/--[\w-]+/y, "property"],
    [/[a-z-]+(?=\s*:(?!:)[^;{]*[;}\n])/y, "property"],
    NUMBER,
    [/[{}();,]/y, "punct"],
  ],
  js: [
    LINE_COMMENT, BLOCK_COMMENT, DQ, SQ, BQ,
    [/\b(?:const|let|var|function|return|if|else|for|of|in|new|export|import|from|interface|type|async|await|true|false|null|undefined)\b/y, "keyword"],
    NUMBER,
  ],
  json: [
    [/"(?:\\.|[^"\\\n])*"(?=\s*:)/y, "property"],
    DQ,
    [/\b(?:true|false|null)\b/y, "keyword"],
    NUMBER,
    [/[{}[\],:]/y, "punct"],
  ],
  md: [[/^#.*$/my, "keyword"], LINE_COMMENT],
}

const ALIAS: Record<string, string> = { ts: "js", typescript: "js", javascript: "js", css: "css", json: "json", html: "html", md: "md" }

/** One language, one pass. Unmatched characters are plain text. */
function tokenizeAs(src: string, lang: string): Token[] {
  const rules = LANGS[ALIAS[lang] ?? lang]
  if (!rules) return [{ text: src }]
  const out: Token[] = []
  let plain = ""
  let i = 0
  outer: while (i < src.length) {
    for (const [re, kind] of rules) {
      re.lastIndex = i
      const m = re.exec(src)
      if (m && m.index === i && m[0].length > 0) {
        if (plain) { out.push({ text: plain }); plain = "" }
        out.push({ text: m[0], kind })
        i += m[0].length
        continue outer
      }
    }
    plain += src[i]
    i++
  }
  if (plain) out.push({ text: plain })
  return out
}

const BLOCK_OF: Record<string, string> = { template: "html", style: "css", script: "js", schema: "json" }

/**
 * A `.storelib` file, block by block. The opening and closing tags are tags;
 * what is between them is coloured as its own language. A `{# … #}` comment
 * outside any block is a comment.
 */
function tokenizeStorelib(src: string): Token[] {
  const out: Token[] = []
  const re = /^<(template|style|script|schema)(\s+scoped)?>\s*$/gm
  let at = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    if (m.index > at) out.push(...tokenizeAs(src.slice(at, m.index), "html"))
    const name = m[1]
    out.push({ text: m[0], kind: "tag" })
    const close = new RegExp(`^</${name}>\\s*$`, "m")
    const rest = src.slice(re.lastIndex)
    const c = close.exec(rest)
    const end = c ? re.lastIndex + c.index : src.length
    out.push(...tokenizeAs(src.slice(re.lastIndex, end), BLOCK_OF[name]))
    if (c) {
      out.push({ text: c[0], kind: "tag" })
      at = end + c[0].length
    } else {
      at = src.length
    }
    re.lastIndex = at
  }
  if (at < src.length) out.push(...tokenizeAs(src.slice(at), "html"))
  return out
}

export function highlight(code: string, lang: string): Token[] {
  const l = lang.toLowerCase()
  if (l === "storelib") {
    /* A fragment of a template, with no block tags, is markup. */
    return /^<(template|style|script|schema)/m.test(code) ? tokenizeStorelib(code) : tokenizeAs(code, "html")
  }
  return tokenizeAs(code, l)
}

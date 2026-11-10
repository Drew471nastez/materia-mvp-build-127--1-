/**
 * A plain About story as written text (wave 10): its Markdown read by
 * lib/storefront/story-markdown and drawn as React elements in the page's
 * `storelib-prose` typography, so "# Heading" is a heading and never a hash
 * on the page. No HTML is ever made from the story's own characters.
 */
import { Fragment, type ReactNode } from "react"
import { parseStory, type Block, type Inline } from "@/lib/storefront/story-markdown"

function inline(list: Inline[], key = ""): ReactNode[] {
  return list.map((x, i) => {
    const k = `${key}${i}`
    switch (x.t) {
      case "text":
        return <Fragment key={k}>{x.v}</Fragment>
      case "br":
        return <br key={k} />
      case "strong":
        return <strong key={k}>{inline(x.c, `${k}.`)}</strong>
      case "em":
        return <em key={k}>{inline(x.c, `${k}.`)}</em>
      case "code":
        return <code key={k}>{x.v}</code>
      case "link":
        return (
          <a key={k} href={x.href} target="_blank" rel="noopener noreferrer nofollow ugc">
            {inline(x.c, `${k}.`)}
          </a>
        )
    }
  })
}

function block(b: Block, i: number): ReactNode {
  switch (b.t) {
    case "h":
      return b.level === 3 ? <h3 key={i}>{inline(b.c)}</h3> : <h4 key={i}>{inline(b.c)}</h4>
    case "p":
      return <p key={i}>{inline(b.c)}</p>
    case "ul":
      return <ul key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>
    case "ol":
      return <ol key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ol>
    case "quote":
      return <blockquote key={i}>{inline(b.c)}</blockquote>
    case "hr":
      return <hr key={i} />
  }
}

export function StoryText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className ? `storelib-prose ${className}` : "storelib-prose"} data-story-text="">
      {parseStory(text).map(block)}
    </div>
  )
}

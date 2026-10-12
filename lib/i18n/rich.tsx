import { Fragment, type ReactNode } from "react"

/**
 * A translated sentence with markup inside it, kept whole so each language
 * puts the bold part where its own word order wants it:
 *
 *   <Rich text={tt("Type {name} to delete it.")} parts={{ name: <strong>{name}</strong> }} />
 *
 * tt() leaves a {name} it was not given in place, and this draws parts.name
 * there. A placeholder with no part stays visible rather than vanishing.
 */
export function Rich({ text, parts }: { text: string; parts: Record<string, ReactNode> }) {
  const pieces = text.split(/\{(\w+)\}/g)
  return (
    <>
      {pieces.map((piece, i) => (i % 2 === 1 ? <Fragment key={i}>{piece in parts ? parts[piece] : `{${piece}}`}</Fragment> : piece))}
    </>
  )
}

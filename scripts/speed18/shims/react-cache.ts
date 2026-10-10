/**
 * React, with `cache()` held per request as React's server build holds it.
 * The harness runs outside the RSC renderer, where the client build's
 * `cache` remembers nothing, and a page that leans on it (one product read
 * shared by the metadata and the page) would be counted twice.
 */
// @ts-ignore: the real React, by path, so this module is not resolved to itself
import * as React from "__REAL_REACT__"
import { current } from "../context"

export * from "__REAL_REACT__"
export default (React as any).default ?? React

export function cache<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  return (...args: A) => {
    const state = current()
    if (!state) return fn(...args)
    let byFn = state.memo.get(fn) as Map<string, R> | undefined
    if (!byFn) {
      byFn = new Map()
      state.memo.set(fn, byFn)
    }
    const key = JSON.stringify(args)
    if (byFn.has(key)) return byFn.get(key)!
    const value = fn(...args)
    byFn.set(key, value)
    return value
  }
}

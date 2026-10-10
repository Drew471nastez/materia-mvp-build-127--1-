"use client"

import { Component } from "react"

/**
 * Told when `value` changes, in the commit that brings the change and BEFORE
 * React touches the page: getSnapshotBeforeUpdate runs for the whole tree
 * ahead of any change, so what is on screen can still be measured (the
 * height a row of pills holds while its next content lands, lib/ui/
 * pill-switch.ts holdHeight). Draws nothing.
 */
export class BeforeChange extends Component<{ value: string; onBefore: () => void }> {
  getSnapshotBeforeUpdate(prev: { value: string }) {
    if (prev.value !== this.props.value) this.props.onBefore()
    return null
  }
  componentDidUpdate() {}
  render() {
    return null
  }
}

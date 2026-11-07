"use client"
/*
  WHICH HALF A BLOCK'S OWN EDITOR DRAWS (components/onepage/block-settings
  BlockEditorTabs). Kept in a file of its own so a block's renderer module,
  which the published page loads, can read it without loading the editor.
*/
import * as React from "react"

export type BlockPart = "settings" | "layout"
export const BlockPartContext = React.createContext<BlockPart | null>(null)
export const useBlockPart = () => React.useContext(BlockPartContext)

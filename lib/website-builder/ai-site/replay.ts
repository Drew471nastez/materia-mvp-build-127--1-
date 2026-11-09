/**
 * ===========================================================================
 *  START WITH AI: AN OPERATION THE PAGE ALREADY HAS IS NOT APPLIED TWICE
 * ===========================================================================
 * The editor replays a generation job's operations onto its canvas
 * (./use-generation.ts). The page it loaded may already hold some of them
 * (the job wrote the draft before the editor opened, or the creator went to
 * another page and back), so an add of a section or block that is already
 * there, or a change to one that is gone, is skipped. Every other operation
 * is the same value written again, which changes nothing. Pure and small:
 * the editor and the job (./apply.ts applyOnce) both use it.
 */
import type { ThemeOp } from "../agent/operations"
import type { SectionInstance } from "../types"

export function opIsNew(sections: readonly SectionInstance[], op: ThemeOp): boolean {
  const section = (id: string) => sections.find((s) => s.id === id)
  switch (op.kind) {
    case "add_section":
      return !section(op.id)
    case "remove_section":
    case "update_section":
    case "move_section":
    case "rename_section":
    case "set_section_visibility":
    case "set_section_type":
      return !!section(op.id)
    case "add_block": {
      const s = section(op.sectionId)
      return !!s && !(s.blocks ?? []).some((b) => b.id === op.blockId)
    }
    case "remove_block":
    case "update_block":
    case "move_block": {
      const s = section(op.sectionId)
      return !!s && (s.blocks ?? []).some((b) => b.id === op.blockId)
    }
    default:
      return true
  }
}

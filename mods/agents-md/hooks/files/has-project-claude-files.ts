import type { FsAncestor, InstructionFile } from 'claude-code'

import Frames from '../frames'

/**
 * Whether a CLAUDE walk found a file that is not known user memory.
 *
 * The person's `~/.claude/CLAUDE.md` sits above every repo under home, so a
 * length check would treat it as a project CLAUDE.md and skip AGENTS.md.
 * A project's own file still counts when it imports that memory. Unknown
 * identity, missing source parts, and other kinds keep the existing
 * conservative veto.
 *
 * @param found the CLAUDE files the ancestor walk found
 * @param handed the engine's instruction files, carrying their kinds
 * @returns true unless every found file is known to be user memory
 */
export function hasProjectClaudeFiles(
  found: readonly FsAncestor[],
  handed: readonly InstructionFile[],
): boolean {
  return found.some(entry => {
    const own = entry.parts[0]

    return (
      own === undefined ||
      !handed.some(
        file =>
          file.kind === 'user' &&
          file.parent === undefined &&
          Frames.isFileAt(file, own.path),
      )
    )
  })
}

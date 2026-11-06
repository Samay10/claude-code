import { describe, expect, test, tier } from 'claude-code/testing'

import Files from '../../hooks/files'
import Fixtures from '../fixtures'

tier('builtin')

describe('has-project-claude-files', () => {
  const user = {
    path: '/home/person/.claude/CLAUDE.md',
    kind: 'user' as const,
    content: '# user',
  }

  test('an empty walk does not count', () => {
    expect(Files.hasProjectClaudeFiles([], [user])).toBe(false)
  })

  test('known top-level user memory does not count', () => {
    expect(
      Files.hasProjectClaudeFiles(
        [Fixtures.ancestorOf('/home/person', '.claude/CLAUDE.md', '# user')],
        [user],
      ),
    ).toBe(false)
  })

  test('Windows separators still match the handed user file', () => {
    expect(
      Files.hasProjectClaudeFiles(
        [
          Fixtures.ancestorOf(
            'C:\\Users\\person',
            '.claude/CLAUDE.md',
            '# user',
          ),
        ],
        [
          {
            path: 'C:/Users/person/.claude/CLAUDE.md',
            kind: 'user',
            content: '# user',
          },
        ],
      ),
    ).toBe(false)
  })

  test('a project file beside user memory still counts', () => {
    expect(
      Files.hasProjectClaudeFiles(
        [
          Fixtures.ancestorOf('/home/person', '.claude/CLAUDE.md', '# user'),
          Fixtures.ancestorOf('/home/person/repo', 'CLAUDE.md', '# project'),
        ],
        [user],
      ),
    ).toBe(true)
  })

  test('an unclassified ancestor still counts', () => {
    expect(
      Files.hasProjectClaudeFiles(
        [Fixtures.ancestorOf('/home/person', 'CLAUDE.md', '# project')],
        [user],
      ),
    ).toBe(true)
  })

  test('a project file that imports user memory still counts', () => {
    expect(
      Files.hasProjectClaudeFiles(
        [
          {
            dir: '/home/person/repo',
            name: 'CLAUDE.md',
            content: '# project\n# user',
            parts: [
              { path: '/home/person/repo/CLAUDE.md', content: '# project' },
              {
                path: '/home/person/.claude/CLAUDE.md',
                content: '# user',
              },
            ],
          },
        ],
        [user],
      ),
    ).toBe(true)
  })

  test('a walk entry with no source parts still counts', () => {
    expect(
      Files.hasProjectClaudeFiles(
        [
          {
            dir: '/home/person/repo',
            name: 'CLAUDE.md',
            content: '# project',
            parts: [],
          },
        ],
        [user],
      ),
    ).toBe(true)
  })

  test('user memory imported into a project file still counts at that path', () => {
    expect(
      Files.hasProjectClaudeFiles(
        [Fixtures.ancestorOf('/home/person/repo', 'CLAUDE.md', '# project')],
        [
          user,
          {
            path: '/home/person/repo/CLAUDE.md',
            kind: 'user',
            content: '# project',
            parent: user.path,
          },
        ],
      ),
    ).toBe(true)
  })
})

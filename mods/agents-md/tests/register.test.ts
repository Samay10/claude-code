import { describe, expect, test, tier } from 'claude-code/testing'

import Hooks from '../hooks'
import Fixtures from './fixtures'

tier('builtin')

/**
 * The blocks the engine hands `prompt.context`.
 */
const BLOCKS = [
  { name: 'claudeMd', text: 'x' },
  { name: 'currentDate', text: 'today' },
]

describe('register', () => {
  test('by default a project with AGENTS.md alone gets it', async ($, on) => {
    const started = Fixtures.projectOf(
      on,
      [Fixtures.ancestorOf('/repo', 'AGENTS.md', '# top\n')],
      [],
    )

    on('prompt.context', ($, e) => ({
      blocks: e.blocks,
      instructionFiles: e.instructionFiles,
    }))

    const context = await $.prompt.context({
      blocks: BLOCKS,
      instructionFiles: [],
    })

    expect(context.instructionFiles).toEqual([
      { path: '/repo/AGENTS.md', kind: 'project', content: '# top\n' },
    ])
    expect(context.blocks?.[0]?.text).toContain(
      'Contents of /repo/AGENTS.md (project instructions, checked into the ' +
        'codebase):\n\n# top',
    )

    await started.clock.settle()

    expect(started.lines, 'nothing new in the transcript').toEqual([])
    expect(started.debugLines).toEqual([
      'no CLAUDE.md found; AGENTS.md loaded: /repo/AGENTS.md',
    ])
  })

  test('by default a project with a CLAUDE.md is left to the engine', async ($, on) => {
    const started = Fixtures.projectOf(
      on,
      [Fixtures.ancestorOf('/repo', 'AGENTS.md', '# top\n')],
      [Fixtures.ancestorOf('/repo/a/b', 'CLAUDE.md', '# mine\n')],
    )
    const handed = [
      { path: '/repo/a/b/CLAUDE.md', kind: 'project' as const, content: '#' },
    ]

    on('prompt.context', ($, e) => ({
      blocks: e.blocks,
      instructionFiles: e.instructionFiles,
    }))

    expect(
      await $.prompt.context({ blocks: BLOCKS, instructionFiles: handed }),
    ).toEqual({ blocks: BLOCKS, instructionFiles: handed })

    await started.clock.settle()

    expect(started.walks).toEqual([])
    expect(started.lines).toEqual([])
    expect(started.debugLines).toEqual([])
  })

  test('a failed walk leaves the context as handed', async ($, on) => {
    Fixtures.unreadableProjectOf(on)

    on('prompt.context', ($, e) => ({
      blocks: e.blocks,
      instructionFiles: e.instructionFiles,
    }))

    expect(
      await $.prompt.context({ blocks: BLOCKS, instructionFiles: [] }),
    ).toEqual({ blocks: BLOCKS, instructionFiles: [] })
  })

  test(
    'the start sends the mode row alone: no walk, no toast',
    { plugins: [Fixtures.RECORDING] },
    async ($, on) => {
      const started = Fixtures.projectOf(
        on,
        [Fixtures.ancestorOf('/repo', 'AGENTS.md', '# top\n')],
        [],
      )

      expect(await $.session.start(Fixtures.SESSION)).toEqual({
        cwd: '/repo/a/b',
      })

      await started.clock.settle()

      expect(Fixtures.rowsOf(started)).toEqual([
        [
          'log',
          {
            event: Hooks.MODE_EVENT,
            props: {
              mode: { value: 'claude-md-or-agents-md', of: [...Hooks.MODES] },
              is_interactive: true,
            },
          },
        ],
      ])
      expect(Hooks.MODE_EVENT).toBe('agents_md_mode')
      expect(started.walks).toEqual([])
      expect(started.toasts).toEqual([])
    },
  )

  test('with no telemetry noun the start goes on untouched', async ($, on) => {
    const started = Fixtures.projectOf(
      on,
      [Fixtures.ancestorOf('/repo', 'AGENTS.md', '# top\n')],
      [],
    )

    expect(
      await $.session.start({ ...Fixtures.SESSION, isInteractive: false }),
    ).toEqual({ cwd: '/repo/a/b' })

    await started.clock.settle()

    expect(Fixtures.rowsOf(started)).toEqual([])
    expect(started.toasts).toEqual([])
  })
})

// The engine's user classification, rather than an inferred HOME spelling,
// distinguishes personal memory from a project's own ancestor CLAUDE.md.
for (const { label, root, memory, walked } of [
  {
    label: 'home user memory',
    root: '/home/person/repo',
    memory: '/home/person/.claude/CLAUDE.md',
    walked: Fixtures.ancestorOf('/home/person', '.claude/CLAUDE.md', '# user'),
  },
  {
    label: 'Windows user memory with different separators',
    root: 'C:/Users/person/repo',
    memory: 'C:/Users/person/.claude/CLAUDE.md',
    walked: Fixtures.ancestorOf(
      'C:\\Users\\person',
      '.claude/CLAUDE.md',
      '# user',
    ),
  },
  {
    label: 'a custom user memory directory',
    root: '/work/config/repo',
    memory: '/work/config/CLAUDE.md',
    walked: Fixtures.ancestorOf('/work/config', 'CLAUDE.md', '# user'),
  },
]) {
  test(`${label} does not disable the project fallback`, async ($, on) => {
    const handed = [{ path: memory, kind: 'user' as const, content: '# user' }]
    on('session.root', () => ({ value: root }))
    on('fs.ancestors', ($, e) => ({
      value: e.names.includes('AGENTS.md')
        ? [Fixtures.ancestorOf(root, 'AGENTS.md', '# project')]
        : [walked],
    }))
    on('ui.log', () => ({ value: undefined }))
    on('prompt.context', ($, e) => ({
      blocks: e.blocks,
      instructionFiles: e.instructionFiles,
    }))

    const result = await $.prompt.context({
      blocks: BLOCKS,
      instructionFiles: handed,
    })
    expect(result.instructionFiles).toEqual([
      ...handed,
      { path: `${root}/AGENTS.md`, kind: 'project', content: '# project' },
    ])
  })
}

describe('user memory on a CLAUDE walk', () => {
  test('a move to another project still attaches its nested AGENTS.md', async ($, on) => {
    let root = '/home/person/first'
    const handed = [
      {
        path: '/home/person/.claude/CLAUDE.md',
        kind: 'user' as const,
        content: '# user',
      },
    ]
    on('session.root', () => ({ value: root }))
    on('session.cwd', () => ({ value: root }))
    on('env.get', () => ({ value: undefined }))
    on('ui.log', () => ({ value: undefined }))
    on('fs.ancestors', ($, e) => ({
      value: e.names.includes('CLAUDE.md')
        ? e.below === undefined
          ? [Fixtures.ancestorOf('/home/person', '.claude/CLAUDE.md', '# user')]
          : []
        : e.below === undefined
          ? []
          : [
              Fixtures.ancestorOf(
                '/home/person/second/src',
                'AGENTS.md',
                '# nested',
              ),
            ],
    }))
    on('prompt.context', ($, e) => ({
      blocks: e.blocks,
      instructionFiles: e.instructionFiles,
    }))
    on('tool.call', { tool: 'Read' }, () => ({
      result: {
        type: 'text',
        file: {
          filePath: '/home/person/second/src/a.ts',
          content: 'x',
          numLines: 1,
          startLine: 1,
          totalLines: 1,
        },
      },
    }))

    await $.prompt.context({ blocks: BLOCKS, instructionFiles: handed })
    root = '/home/person/second'
    const result = await $.tool.call({
      tool: 'Read',
      file_path: '/home/person/second/src/a.ts',
    })
    expect(result.context).toEqual([
      'Contents of /home/person/second/src/AGENTS.md:\n\n# nested',
    ])
  })

  for (const { label, found, fails } of [
    {
      label: 'a project file alongside user memory',
      found: [
        Fixtures.ancestorOf('/home/person', '.claude/CLAUDE.md', '# user'),
        Fixtures.ancestorOf('/home/person/repo', 'CLAUDE.md', '# project'),
      ],
    },
    {
      label: 'an unclassified ancestor',
      found: [Fixtures.ancestorOf('/home/person', 'CLAUDE.md', '# project')],
    },
    {
      label: 'a project CLAUDE.md importing user memory',
      found: [
        {
          dir: '/home/person/repo',
          name: 'CLAUDE.md',
          content: '# project\n# user',
          parts: [
            { path: '/home/person/repo/CLAUDE.md', content: '# project' },
            { path: '/home/person/.claude/CLAUDE.md', content: '# user' },
          ],
        },
      ],
    },
    {
      label: 'a walk entry with no source parts',
      found: [
        {
          dir: '/home/person/repo',
          name: 'CLAUDE.md',
          content: '# project',
          parts: [],
        },
      ],
    },
    { label: 'a failed walk', found: [], fails: true },
  ]) {
    test(`${label} still prevents fallback`, async ($, on) => {
      const handed = [
        {
          path: '/home/person/.claude/CLAUDE.md',
          kind: 'user' as const,
          content: '# user',
        },
      ]
      on('session.root', () => ({ value: '/home/person/repo' }))
      on('fs.ancestors', ($, e) => {
        if (e.names.includes('AGENTS.md')) {
          return {
            value: [
              Fixtures.ancestorOf(
                '/home/person/repo',
                'AGENTS.md',
                '# agents',
              ),
            ],
          }
        }
        if (fails) throw new Error('cannot walk')
        return { value: found }
      })
      on('prompt.context', ($, e) => ({
        blocks: e.blocks,
        instructionFiles: e.instructionFiles,
      }))
      const result = await $.prompt.context({
        blocks: BLOCKS,
        instructionFiles: handed,
      })
      expect(result.instructionFiles).toEqual(handed)
    })
  }
})

test('a project CLAUDE.md imported by user memory still prevents fallback', async ($, on) => {
  const handed = [
    {
      path: '/home/person/.claude/CLAUDE.md',
      kind: 'user' as const,
      content: '# user',
    },
    {
      path: '/home/person/repo/CLAUDE.md',
      kind: 'user' as const,
      content: '# project',
      parent: '/home/person/.claude/CLAUDE.md',
    },
  ]
  on('session.root', () => ({ value: '/home/person/repo' }))
  on('fs.ancestors', ($, e) => ({
    value: e.names.includes('CLAUDE.md')
      ? [Fixtures.ancestorOf('/home/person/repo', 'CLAUDE.md', '# project')]
      : [Fixtures.ancestorOf('/home/person/repo', 'AGENTS.md', '# agents')],
  }))
  on('ui.log', () => ({ value: undefined }))
  on('prompt.context', ($, e) => ({
    blocks: e.blocks,
    instructionFiles: e.instructionFiles,
  }))

  const result = await $.prompt.context({
    blocks: BLOCKS,
    instructionFiles: handed,
  })
  expect(result.instructionFiles).toEqual(handed)
})


import { atom, read, update } from 'claude-code'
import type { Register, ThemeMessageRule, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { SCENE_HEAD, SCENE_TAIL } from './scene'

// How deep the snow lies: 0 to 10, one step per tenth of the context window.
const snowLevel = atom({ plugin: 'gouache-winter', key: 'snowLevel' } as const, 0)

const levelOf = (percent: number | undefined) => Math.max(0, Math.min(10, Math.floor((percent ?? 0) / 10)))

// A soft drift across the bottom, in a 1600 by 1000 box stretched to the window.
function drift(level: number): string {
  const ridge = (top: number, amp: number, shift: number) => {
    let d = `M0 ${top}`
    for (let x = 0; x < 1600; x += 200) {
      const bump = ((x / 200 + shift) % 2 === 0 ? -amp : amp * 0.6)
      d += ` Q${x + 100} ${top + bump} ${x + 200} ${top}`
    }
    return `${d} V1000 H0 Z`
  }
  const h = 4 + level * 6

  return `<path class="drift2" d="${ridge(1000 - h - 8, 6 + level, 1)}"/><path class="drift" d="${ridge(1000 - h, 5 + level * 0.8, 0)}"/>`
}


// Gouache on warm paper by day; the same paper under a lantern by night.
const { theme, problems } = makeColors({
  label: 'Gouache winter',
  roles: { accent: '#b9532f', danger: '#a3262a', success: '#5a7a3e', warning: '#c08a2a', pro: '#6a5a8a' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#e6ddcc',
        'surface-1': '#ece5d8',
        'surface-2': '#f3eee4',
        'text-primary': '#2e2a24',
        'text-secondary': '#564e45',
        'text-muted': '#6a6157',
      },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#1f1d1a',
        'surface-1': '#272420',
        'surface-2': '#2e2b26',
        'surface-3': '#35312b',
        'text-primary': '#efe8dc',
        'text-secondary': '#cfc6b8',
        'text-muted': '#a99f91',
      },
    },
  },
})

// Message colors per mode (makeColors does not take these).
theme.inputs.light = { ...theme.inputs.light,
  'bg-user-message': '#f0d3bf',
  'text-user-message': '#2e2a24',
  'bg-assistant-message': '#f5f0e6',
  'text-assistant-message': '#2e2a24',
}
theme.inputs.dark = { ...theme.inputs.dark,
  'bg-user-message': '#55382a',
  'text-user-message': '#f3e9dc',
  'bg-assistant-message': '#2b2823',
  'text-assistant-message': '#ece5d8',
}

// A dab of paint with uneven, brushed edges: the corners draw once, the edges stretch.
const blob = (color: 'bg-user-message' | 'bg-assistant-message') => ({
  vector: {
    viewBox: 100,
    slice: 22,
    paths: [
      { d: 'M7 5 Q30 1 52 4 Q76 2 94 6 Q99 28 97 50 Q99 74 95 94 Q72 99 48 96 Q24 99 5 95 Q1 72 3 50 Q0 26 7 5 Z', color },
    ],
  },
})

const user: ThemeMessageRule = {
  color: 'text-user-message',
  backgroundColor: 'bg-user-message',
  fill: blob('bg-user-message'),
  padding: 14,
  paddingX: 18,
  shadow: { x: 0, y: 2, blur: 6, color: '#3a2a1a22' },
}

const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: 'gouache-snow' },
  style: {
    Text: { fontFamily: ['serif'], fontSize: 16, lineHeight: 26 },
    Heading: { fontFamily: ['serif'], fontWeight: 'bold', color: 'text-accent' },
    UserMessage: [
      { ...user, rotate: -0.6 },
      { ...user, rotate: 0.5 },
    ],
    AssistantMessage: {
      color: 'text-assistant-message',
      backgroundColor: 'bg-assistant-message',
      fill: blob('bg-assistant-message'),
      padding: 16,
      paddingX: 20,
    },
    ToolUse: { color: 'text-secondary', backgroundColor: 'surface-1', radius: [10, 4, 12, 6], paddingX: 10 },
  },
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }

    const { context } = await $.session.usage()
    await update($, snowLevel, () => levelOf(context.percent))

    try {
      const set = await $.theme.set(LOOK)

      if (!set.isDrawn) {
        $.ui.status(set.reason)
      }
    } catch (error) {
      // An older build may not take `style`: keep the colors and the scene.
      $.ui.log(String(error))
      await $.theme.set({ colors: theme, backdrop: LOOK.backdrop })
    }

    return next(e)
  })

  // Each measurement after a turn: let the snow pile up as the context fills (and melt after a compact).
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      const level = levelOf(e.context.percent)

      if (level !== (await read($, snowLevel))) {
        await update($, snowLevel, () => level)
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || e.props.scene !== 'gouache-snow') {
      return next(e)
    }

    const { Svg } = $.ui.resolve(e)

    const level = await read($, snowLevel)

    return <Svg source={SCENE_HEAD + drift(level) + SCENE_TAIL} alt="Snow falling on a cat with a lantern, a rabbit and a mouse beside a little pine" isInteractive />
  })
}

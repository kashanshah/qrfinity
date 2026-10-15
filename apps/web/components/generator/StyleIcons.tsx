import type { DotStyle, EyeBallStyle, EyeFrameStyle, FrameStyle } from '@qrfinity/core'

/** Small previews for the pattern, eye and frame pickers. Drawn in currentColor. */
const box = {
  width: 28,
  height: 28,
  viewBox: '0 0 28 28',
  'aria-hidden': true,
  fill: 'currentColor',
} as const

export function DotIcon({ style }: { style: DotStyle }) {
  const cells = [
    [0, 0],
    [1, 0],
    [3, 0],
    [0, 1],
    [2, 1],
    [3, 1],
    [1, 2],
    [2, 2],
    [0, 3],
    [2, 3],
    [3, 3],
  ]
  return (
    <svg {...box}>
      {cells.map(([c, r]) => {
        const x = 2 + c! * 6
        const y = 2 + r! * 6
        if (style === 'dots') return <circle key={`${c}${r}`} cx={x + 3} cy={y + 3} r={3} />
        if (style === 'diamond')
          return (
            <path
              key={`${c}${r}`}
              d={`M${x + 3} ${y}L${x + 6} ${y + 3}L${x + 3} ${y + 6}L${x} ${y + 3}Z`}
            />
          )
        const rx = style === 'rounded' ? 1.8 : style === 'fluid' ? 3 : 0
        return (
          <rect
            key={`${c}${r}`}
            x={x + (style === 'rounded' ? 0.3 : 0)}
            y={y + (style === 'rounded' ? 0.3 : 0)}
            width={style === 'rounded' ? 5.4 : 6}
            height={style === 'rounded' ? 5.4 : 6}
            rx={rx}
          />
        )
      })}
    </svg>
  )
}

const ringRadius = { square: [0, 0], rounded: [7, 4], circle: [12, 7], leaf: [10, 6] } as const

export function EyeFrameIcon({ style }: { style: EyeFrameStyle }) {
  const [ro, ri] = ringRadius[style]
  if (style === 'leaf') {
    return (
      <svg {...box} fillRule="evenodd">
        <path d="M14 2H26V14A12 12 0 0 1 14 26H2V14A12 12 0 0 1 14 2ZM14 7H21V14A7 7 0 0 1 14 21H7V14A7 7 0 0 1 14 7Z" />
      </svg>
    )
  }
  return (
    <svg {...box} fillRule="evenodd">
      <path
        d={
          `M${2 + ro} 2H${26 - ro}A${ro} ${ro} 0 0 1 26 ${2 + ro}V${26 - ro}A${ro} ${ro} 0 0 1 ${26 - ro} 26H${2 + ro}A${ro} ${ro} 0 0 1 2 ${26 - ro}V${2 + ro}A${ro} ${ro} 0 0 1 ${2 + ro} 2Z` +
          `M${7 + ri} 7H${21 - ri}A${ri} ${ri} 0 0 1 21 ${7 + ri}V${21 - ri}A${ri} ${ri} 0 0 1 ${21 - ri} 21H${7 + ri}A${ri} ${ri} 0 0 1 7 ${21 - ri}V${7 + ri}A${ri} ${ri} 0 0 1 ${7 + ri} 7Z`
        }
      />
    </svg>
  )
}

export function EyeBallIcon({ style }: { style: EyeBallStyle }) {
  if (style === 'leaf')
    return (
      <svg {...box}>
        <path d="M14 6H22V14A8 8 0 0 1 14 22H6V14A8 8 0 0 1 14 6Z" />
      </svg>
    )
  const rx = { square: 0, rounded: 3, circle: 8 }[style]
  return (
    <svg {...box}>
      <rect x={6} y={6} width={16} height={16} rx={rx} />
    </svg>
  )
}

export function FrameIcon({ style }: { style: FrameStyle }) {
  const qr = (y: number) => <rect x={8} y={y} width={12} height={12} rx={1} />
  switch (style) {
    case 'none':
      return <svg {...box}>{qr(8)}</svg>
    case 'box-bottom':
      return (
        <svg {...box} fillRule="evenodd">
          <path d="M5 1H23A2 2 0 0 1 25 3V25A2 2 0 0 1 23 27H5A2 2 0 0 1 3 25V3A2 2 0 0 1 5 1ZM6 4V18H22V4Z" />
          {qr(5)}
        </svg>
      )
    case 'box-top':
      return (
        <svg {...box} fillRule="evenodd">
          <path d="M5 1H23A2 2 0 0 1 25 3V25A2 2 0 0 1 23 27H5A2 2 0 0 1 3 25V3A2 2 0 0 1 5 1ZM6 10V24H22V10Z" />
          {qr(11)}
        </svg>
      )
    case 'pill-bottom':
      return (
        <svg {...box}>
          {qr(3)}
          <rect x={4} y={19} width={20} height={6} rx={3} />
        </svg>
      )
  }
}

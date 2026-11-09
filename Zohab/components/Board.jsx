'use client'

// The Ludo board (same geometry as design.html) and the pawns on top of it.
// Token positions come from the server: -1 base, 0-50 main track, 51-55 home column, 56 home.
// The whole board is turned so the player's own colour is always bottom-left.
import { memo, useEffect, useState } from 'react'
import { LUDO } from '@/lib/lib'
import { Pawn } from './ui.jsx'

const COLORS = ['red', 'green', 'yellow', 'blue']

// The 52 shared track cells as [row, col], clockwise.
const TRACK = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0], [6, 0],
]
const HOME_COL = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
}
const BASE = { red: [0, 0], green: [0, 9], yellow: [9, 9], blue: [9, 0] }
// Start cells are 13 apart in the backend's order (red → green → yellow → blue), so captures match the server.
const START = { red: 0, green: 13, yellow: 26, blue: 39 }
const SAFE = [0, 8, 13, 21, 26, 34, 39, 47]
const TURNS = { red: 3, green: 2, yellow: 1, blue: 0 } // quarter turns that put this colour bottom-left
const HOME_SPOT = { red: [6.55, 7.5], green: [7.5, 6.55], yellow: [8.45, 7.5], blue: [7.5, 8.45] }
const S = 10 // one cell in SVG units (the board is 150 x 150)

// Centre of a token as [x, y] in cells.
function tokenPoint(t) {
  const { color, position: pos, token_no: n } = t
  if (pos < 0) {
    const [r, c] = BASE[color]
    return [[c + 2, r + 2], [c + 4, r + 2], [c + 2, r + 4], [c + 4, r + 4]][(n - 1) % 4]
  }
  if (pos >= 56) {
    const [x, y] = HOME_SPOT[color]
    const s = (n - 2.5) * 0.28
    return color === 'red' || color === 'yellow' ? [x, y + s] : [x + s, y]
  }
  if (pos > 50) {
    const [r, c] = HOME_COL[color][pos - 51]
    return [c + 0.5, r + 0.5]
  }
  const [r, c] = TRACK[(START[color] + pos) % 52]
  return [c + 0.5, r + 0.5]
}

// Tokens on the same square share a key (so they can be spread out a little).
function squareKey(t) {
  if (t.position < 0) return `b${t.color}${t.token_no}`
  if (t.position >= 56) return `h${t.color}${t.token_no}`
  if (t.position > 50) return `c${t.color}${t.position}`
  return `t${(START[t.color] + t.position) % 52}`
}

function star(cx, cy, outer, inner) {
  const points = []
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? inner : outer
    const a = (Math.PI / 5) * k - Math.PI / 2
    points.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`)
  }
  return points.join(' ')
}

// Moves tokens one cell at a time (instead of jumping), so everyone can follow the move.
function useSteps(tokens) {
  const [shown, setShown] = useState(tokens)
  useEffect(() => {
    const timer = setInterval(() => {
      setShown((prev) => {
        let moving = false
        const next = tokens.map((t) => {
          const old = prev.find((p) => p.token_id === t.token_id)
          if (!old || old.position === t.position) return t
          moving = true
          // Forward on the board: one step. Leaving the base or being captured: straight there.
          return old.position >= 0 && t.position > old.position ? { ...t, position: old.position + 1 } : t
        })
        return moving ? next : prev
      })
    }, 160)
    return () => clearInterval(timer)
  }, [tokens])
  return shown
}

const cell = (r, c, fill, key) => <rect key={key} x={c * S} y={r * S} width={S} height={S} fill={fill} stroke="#CFC8B8" strokeWidth=".4" />

// The printed board. Only the gold ring around the active base changes.
const BoardSvg = memo(function BoardSvg({ active }) {
  const M = 7.5 * S
  return (
    <svg viewBox="0 0 150 150" className="board-svg" aria-hidden="true">
      <rect width="150" height="150" rx={S * 0.6} fill="#FFFDF7" />
      {COLORS.map((col) => {
        const [r, c] = BASE[col]
        const on = col === active
        return (
          <g key={col}>
            <rect x={c * S} y={r * S} width={6 * S} height={6 * S} fill={LUDO[col].main} />
            <rect
              x={(c + 1) * S}
              y={(r + 1) * S}
              width={4 * S}
              height={4 * S}
              rx={S * 0.7}
              fill="#fff"
              stroke={on ? '#FFC93C' : LUDO[col].dark}
              strokeWidth={on ? 1.9 : 0.7}
              className={on ? 'base-on' : undefined}
            />
            {[[2, 2], [2, 4], [4, 2], [4, 4]].map(([dr, dc]) => (
              <circle key={`${dr}${dc}`} cx={(c + dc) * S} cy={(r + dr) * S} r={S * 0.62} fill={LUDO[col].light} stroke={LUDO[col].main} strokeWidth=".9" />
            ))}
          </g>
        )
      })}
      {TRACK.map(([r, c], i) => {
        const startColor = COLORS.find((x) => START[x] === i)
        return cell(r, c, startColor ? LUDO[startColor].main : '#fff', `t${i}`)
      })}
      {COLORS.map((col) => HOME_COL[col].map(([r, c], i) => cell(r, c, LUDO[col].main, `${col}${i}`)))}
      {SAFE.map((i) => {
        const [r, c] = TRACK[i]
        const isStart = Object.values(START).includes(i)
        return <polygon key={`s${i}`} points={star((c + 0.5) * S, (r + 0.5) * S, S * 0.37, S * 0.15)} fill={isStart ? 'rgba(255,255,255,.85)' : '#C9C1AE'} />
      })}
      <polygon points={`${6 * S},${6 * S} ${6 * S},${9 * S} ${M},${M}`} fill={LUDO.red.main} />
      <polygon points={`${6 * S},${6 * S} ${9 * S},${6 * S} ${M},${M}`} fill={LUDO.green.main} />
      <polygon points={`${9 * S},${6 * S} ${9 * S},${9 * S} ${M},${M}`} fill={LUDO.yellow.main} />
      <polygon points={`${6 * S},${9 * S} ${9 * S},${9 * S} ${M},${M}`} fill={LUDO.blue.main} />
      <circle cx={M} cy={M} r={S * 0.45} fill="#fff" opacity=".9" />
    </svg>
  )
})

function Board({ tokens, me = 'red', active = null, validIds = [], onMove }) {
  const shown = useSteps(tokens)
  const turns = TURNS[me] ?? 0

  const groups = {}
  for (const t of shown) (groups[squareKey(t)] ||= []).push(t.token_id)

  return (
    <div className="board-frame">
      <div className="board-rot" style={{ transform: `rotate(${turns * 90}deg)` }}>
        <BoardSvg active={active} />
        {shown.map((t) => {
          const group = groups[squareKey(t)]
          const crowded = group.length > 1
          const spread = crowded ? (group.indexOf(t.token_id) - (group.length - 1) / 2) * 0.28 : 0
          const [x, y] = tokenPoint(t)
          const canMove = validIds.includes(t.token_id)
          const scale = (t.position >= 56 ? 0.7 : crowded ? 0.78 : 1) * (canMove ? 1.12 : 1)
          return (
            <button
              key={t.token_id}
              type="button"
              className={`token${canMove ? ' can-move' : ''}`}
              style={{
                left: `${((x + spread) / 15) * 100}%`,
                top: `${(y / 15) * 100}%`,
                transform: `translate(-50%, -50%) rotate(${-turns * 90}deg) scale(${scale})`,
                zIndex: canMove ? 50 : 10 + Math.round(y),
              }}
              disabled={!canMove}
              onClick={() => onMove?.(t.token_id)}
              aria-label={`Move ${t.color} token ${t.token_no}`}
            >
              <span className="token-hop" key={t.position}>
                <Pawn color={t.color} />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default Board

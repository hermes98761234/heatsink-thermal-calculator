import type { T } from '../i18n'

export interface DiagramStage {
  name: string
  r: number
}
interface Props {
  stages: DiagramStage[]
  temps: number[]
  power: number
  ambient: number
  limit: number
  t: T
  nodeNames: string[]
}

const STEP = 170
const X0 = 110

function Zig({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  const w = x2 - x1
  const a = x1 + w * 0.2
  const b = x2 - w * 0.2
  const n = 6
  let d = `M${x1} ${y}L${a} ${y}`
  for (let i = 0; i < n; i++) d += `L${a + ((b - a) * (i + 0.5)) / n} ${y + (i % 2 === 0 ? -9 : 9)}`
  d += `L${b} ${y}L${x2} ${y}`
  return <path d={d} fill="none" stroke="var(--fg)" strokeWidth={2} strokeLinejoin="round" />
}

function heat(tc: number, lo: number, hi: number): string {
  const f = hi > lo ? Math.min(1, Math.max(0, (tc - lo) / (hi - lo))) : 0
  return `hsl(${Math.round(215 - 215 * f)} 80% 55%)`
}

/** Series thermal-resistor chain: Tj at the left, ambient (ground) at the right. */
export default function Diagram({ stages, temps, power, ambient, limit, t, nodeNames }: Props) {
  const n = stages.length
  const width = X0 + n * STEP + 60
  const y = 78
  const hi = temps[0]
  return (
    <div className="diagram">
      <svg viewBox={`0 0 ${width} 170`} style={{ width, maxWidth: '100%', minWidth: Math.min(width, 520) }} role="img" aria-label={t('Thermal resistance network diagram')}>
        <defs>
          <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0 0L8 4L0 8z" fill="var(--warn)" />
          </marker>
        </defs>
        {/* power source */}
        <line x1={X0 - 38} y1={y + 44} x2={X0} y2={y + 44} stroke="var(--fg)" strokeWidth={2} />
        <path d={`M${X0 - 38} ${y + 44}V${y}`} stroke="var(--warn)" strokeWidth={2.5} fill="none" markerEnd="url(#arr)" />
        <text x={X0 - 46} y={y + 22} textAnchor="end" className="dg" fill="var(--warn)">{power} W</text>
        <line x1={X0} y1={y} x2={X0} y2={y + 44} stroke="var(--fg)" strokeWidth={2} />
        {stages.map((s, i) => {
          const xa = X0 + i * STEP
          const xb = xa + STEP
          return (
            <g key={i}>
              <Zig x1={xa} x2={xb} y={y} />
              <text x={(xa + xb) / 2} y={y + 28} textAnchor="middle" className="dg">{s.r.toFixed(s.r < 10 ? 2 : 1)} K/W</text>
              <text x={(xa + xb) / 2} y={y + 46} textAnchor="middle" className="dg muted">{s.name}</text>
            </g>
          )
        })}
        {temps.map((tc, i) => {
          const x = X0 + i * STEP
          const last = i === n
          const over = !last && i === 0 && tc > limit
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={7} fill={heat(tc, ambient, hi)} stroke="var(--fg)" strokeWidth={1.5} />
              <text x={x} y={y - 30} textAnchor="middle" className="dg muted">{nodeNames[i]}</text>
              <text x={x} y={y - 14} textAnchor="middle" className="dg bold" fill={over ? 'var(--err)' : 'var(--fg)'}>{tc.toFixed(1)} °C</text>
            </g>
          )
        })}
        {/* ambient ground */}
        {(() => {
          const x = X0 + n * STEP
          return (
            <g stroke="var(--fg)" strokeWidth={2}>
              <line x1={x} y1={y + 7} x2={x} y2={y + 56} />
              <line x1={x - 14} y1={y + 56} x2={x + 14} y2={y + 56} />
              <line x1={x - 9} y1={y + 62} x2={x + 9} y2={y + 62} />
              <line x1={x - 4} y1={y + 68} x2={x + 4} y2={y + 68} />
            </g>
          )
        })()}
      </svg>
    </div>
  )
}

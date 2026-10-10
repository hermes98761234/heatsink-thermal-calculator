import { useState } from 'react'

export interface Series {
  label: string
  x: number[]
  y: number[]
  color: string
  dash?: string
}
export interface Line {
  value: number
  label: string
  color: string
}

interface Props {
  series: Series[]
  xLog?: boolean
  yLog?: boolean
  /** Include zero on a linear y axis (default true). */
  zero?: boolean
  xLabel: string
  yLabel: string
  hLines?: Line[]
  vLines?: Line[]
  /** Formats the x value in the hover readout. */
  fmtX?: (x: number) => string
  fmtY?: (y: number) => string
  /** Title announced to screen readers. */
  title: string
}

const W = 640
const H = 280
const M = { l: 52, r: 14, t: 12, b: 38 }

function niceTicks(lo: number, hi: number, count = 6): number[] {
  if (!(hi > lo)) return [lo]
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const f = raw / mag
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v)
  return out
}

function logTicks(lo: number, hi: number): number[] {
  const decades = Math.log10(hi / lo)
  const mult = decades < 1.5 ? [1, 2, 3, 5, 7] : decades < 3.5 ? [1, 2, 5] : [1]
  const out: number[] = []
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of mult) {
      const v = m * 10 ** e
      if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) out.push(v)
    }
  }
  return out
}

function fmtTick(v: number): string {
  const a = Math.abs(v)
  if (a === 0) return '0'
  if (a >= 1e5 || a < 1e-2) return v.toExponential(0).replace('e+', 'e')
  return String(+v.toPrecision(3))
}

export default function Chart({ series, xLog, yLog, zero = true, xLabel, yLabel, hLines = [], vLines = [], fmtX = fmtTick, fmtY = fmtTick, title }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const xs = series.flatMap((s) => s.x).filter((v) => Number.isFinite(v) && (!xLog || v > 0))
  const ys = [...series.flatMap((s) => s.y), ...hLines.map((l) => l.value)].filter((v) => Number.isFinite(v) && (!yLog || v > 0))
  if (xs.length === 0 || ys.length === 0) return <div className="chart-empty">–</div>
  let x0 = Math.min(...xs)
  let x1 = Math.max(...xs)
  let y0 = yLog || !zero ? Math.min(...ys) : Math.min(0, ...ys)
  let y1 = Math.max(...ys)
  if (x1 === x0) x1 = x0 + 1
  if (y1 === y0) y1 = y0 + 1
  const xt = xLog ? logTicks(x0, x1) : niceTicks(x0, x1)
  const yt = yLog ? logTicks(y0, y1) : niceTicks(y0, y1 + (y1 - y0) * 0.05)
  if (!yLog) y1 = Math.max(y1 + (y1 - y0) * 0.05, yt[yt.length - 1] ?? y1)
  if (yLog) {
    y0 = Math.min(y0, yt[0] ?? y0)
    y1 = Math.max(y1, yt[yt.length - 1] ?? y1)
  }
  const fx = (v: number) => (xLog ? Math.log10(v / x0) / Math.log10(x1 / x0) : (v - x0) / (x1 - x0))
  const fy = (v: number) => (yLog ? Math.log10(v / y0) / Math.log10(y1 / y0) : (v - y0) / (y1 - y0))
  const px = (v: number) => M.l + fx(v) * (W - M.l - M.r)
  const py = (v: number) => H - M.b - fy(v) * (H - M.t - M.b)
  const path = (s: Series) => {
    let d = ''
    s.x.forEach((x, i) => {
      const y = s.y[i]
      if (!Number.isFinite(x) || !Number.isFinite(y) || (xLog && x <= 0) || (yLog && y <= 0)) return
      d += `${d ? 'L' : 'M'}${px(x).toFixed(1)} ${py(y).toFixed(1)}`
    })
    return d
  }
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const u = ((e.clientX - r.left) / r.width) * W
    const f = Math.min(1, Math.max(0, (u - M.l) / (W - M.l - M.r)))
    setHover(xLog ? x0 * (x1 / x0) ** f : x0 + f * (x1 - x0))
  }
  const near = (s: Series, x: number) => {
    let bi = 0
    for (let i = 1; i < s.x.length; i++) if (Math.abs(s.x[i] - x) < Math.abs(s.x[bi] - x)) bi = i
    return bi
  }
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} onPointerMove={move} onPointerLeave={() => setHover(null)}>
      <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="var(--chart-bg)" stroke="var(--line)" />
      {xt.map((v) => (
        <g key={`x${v}`}>
          <line x1={px(v)} x2={px(v)} y1={M.t} y2={H - M.b} stroke="var(--grid)" />
          <text x={px(v)} y={H - M.b + 14} textAnchor="middle" className="tick">{fmtTick(v)}</text>
        </g>
      ))}
      {yt.map((v) => (
        <g key={`y${v}`}>
          <line x1={M.l} x2={W - M.r} y1={py(v)} y2={py(v)} stroke="var(--grid)" />
          <text x={M.l - 5} y={py(v) + 3} textAnchor="end" className="tick">{fmtTick(v)}</text>
        </g>
      ))}
      {hLines.filter((l) => Number.isFinite(l.value)).map((l) => (
        <g key={`h${l.label}`}>
          <line x1={M.l} x2={W - M.r} y1={py(l.value)} y2={py(l.value)} stroke={l.color} strokeDasharray="5 4" />
          <text x={W - M.r - 4} y={py(l.value) - 4} textAnchor="end" className="tick" fill={l.color}>{l.label}</text>
        </g>
      ))}
      {vLines.filter((l) => Number.isFinite(l.value) && l.value >= x0 && l.value <= x1).map((l) => (
        <g key={`v${l.label}`}>
          <line x1={px(l.value)} x2={px(l.value)} y1={M.t} y2={H - M.b} stroke={l.color} strokeDasharray="5 4" />
          <text x={px(l.value) + 4} y={M.t + 11} className="tick" fill={l.color}>{l.label}</text>
        </g>
      ))}
      {series.map((s) => (
        <path key={s.label} d={path(s)} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} strokeLinejoin="round" />
      ))}
      {hover !== null && (
        <g pointerEvents="none">
          <line x1={px(hover)} x2={px(hover)} y1={M.t} y2={H - M.b} stroke="var(--grid-strong)" />
          <text x={px(hover) > W / 2 ? px(hover) - 6 : px(hover) + 6} y={M.t + 12} textAnchor={px(hover) > W / 2 ? 'end' : 'start'} className="tick" fill="var(--fg)">
            {xLabel.split(' [')[0]} = {fmtX(hover)}
          </text>
          {series.map((s, k) => {
            const i = near(s, hover)
            const y = s.y[i]
            if (!Number.isFinite(y)) return null
            return (
              <text key={s.label} x={px(hover) > W / 2 ? px(hover) - 6 : px(hover) + 6} y={M.t + 25 + k * 12} textAnchor={px(hover) > W / 2 ? 'end' : 'start'} className="tick" fill={s.color}>
                {s.label}: {fmtY(y)}
              </text>
            )
          })}
        </g>
      )}
      <text x={(M.l + W - M.r) / 2} y={H - 4} textAnchor="middle" className="axis">{xLabel}</text>
      <text transform={`translate(12 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle" className="axis">{yLabel}</text>
    </svg>
  )
}

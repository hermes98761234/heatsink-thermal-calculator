import {
  MATERIALS, TIMS, findPackage, finSinkEstimate, pcbEstimate, timResistance, OZ_TO_MM,
  type FinSink, type FinSinkResult, type NetStage, type PcbCopper, type PcbResult,
} from './thermal'

export type Lang = 'en' | 'uk'
export type Theme = 'auto' | 'light' | 'dark'
export type Src = 'manual' | 'pkg' | 'tim' | 'sink' | 'pcb'
export type Tab = 'tim' | 'sink' | 'pcb' | 'transient'

export interface StageDef {
  id: string
  /** Custom name; '' = default name for the source (translated). */
  name: string
  src: Src
  /** Manual values (also the fallback when an estimator input is invalid). */
  r: number
  c: number
}

export interface SinkParams extends FinSink {
  materialId: string
}

export interface AppState {
  lang: Lang
  theme: Theme
  tab: Tab
  power: number
  ambient: number
  tjMax: number
  margin: number
  pkgId: string
  timId: string
  timArea: number
  stages: StageDef[]
  sink: SinkParams
  pcb: PcbCopper
  pulseWidthMs: number
  pulsePeriodMs: number
  pulseCount: number
}

export const DEFAULT_NAME: Record<Src, string> = {
  manual: 'Custom element',
  pkg: 'Junction to case',
  tim: 'Case to sink (interface)',
  sink: 'Heatsink to ambient',
  pcb: 'PCB copper to ambient',
}

let counter = 0
export const newId = () => `s${Date.now().toString(36)}${(counter++).toString(36)}`

export const mkStage = (src: Src, r = 1, c = 0): StageDef => ({ id: newId(), name: '', src, r, c })

export const boltedNetwork = (): StageDef[] => [mkStage('pkg'), mkStage('tim'), mkStage('sink')]
export const smdNetwork = (): StageDef[] => [mkStage('pkg'), mkStage('pcb')]

const al = MATERIALS[0]

export const DEFAULT_SINK: SinkParams = {
  materialId: al.id, width: 100, length: 100, baseT: 5, fins: 9, finH: 25, finT: 2, k: al.k, emissivity: 0.85, rho: al.rho, cp: al.cp,
}

export const DEFAULT_PCB: PcbCopper = {
  areaCm2: 10, oz: 1, bothSides: true, padCm2: 0.9, vertical: true, emissivity: 0.9, vias: 0, viaDrillMm: 0.3, viaPlatingUm: 25, boardMm: 1.6,
}

export function defaultState(): AppState {
  return {
    lang: 'en', theme: 'auto', tab: 'sink', power: 10, ambient: 40, tjMax: 150, margin: 10,
    pkgId: 'to220', timId: 'grease', timArea: 1.5, stages: boltedNetwork(), sink: { ...DEFAULT_SINK }, pcb: { ...DEFAULT_PCB },
    pulseWidthMs: 10, pulsePeriodMs: 100, pulseCount: 10,
  }
}

const KEY = 'heatsink-thermal-calculator:v1'

export function loadState(): AppState {
  const d = defaultState()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return d
    const s = JSON.parse(raw) as Partial<AppState>
    const merged: AppState = {
      ...d, ...s, sink: { ...d.sink, ...s.sink }, pcb: { ...d.pcb, ...s.pcb },
      stages: Array.isArray(s.stages) && s.stages.length > 0 ? s.stages : d.stages,
    }
    return merged
  } catch {
    return d
  }
}

export function saveState(s: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable */
  }
}

export interface Resolved extends NetStage {
  id: string
  src: Src
  /** True when an estimator input is invalid and the manual value is used instead. */
  fallback: boolean
}

export interface Derived {
  sink: FinSinkResult
  pcb: PcbResult
  timR: number
  stages: Resolved[]
}

/** Heat capacity of the board copper + FR4 under the pour, J/K. */
export function pcbCapacity(p: PcbCopper): number {
  const a = p.areaCm2 * 1e-4
  const cu = a * (p.bothSides ? 2 : 1) * p.oz * OZ_TO_MM * 1e-3 * 8960 * 385
  const fr4 = a * (p.boardMm * 1e-3) * 1850 * 1100
  return cu + fr4
}

export function derive(s: AppState): Derived {
  const sink = finSinkEstimate(s.sink, s.power, s.ambient)
  const pcb = pcbEstimate(s.pcb, s.power, s.ambient)
  const tim = TIMS.find((t) => t.id === s.timId) ?? TIMS[1]
  const timR = s.timArea > 0 ? timResistance(tim, s.timArea) : NaN
  const pkg = findPackage(s.pkgId)
  const stages = s.stages.map<Resolved>((d) => {
    const base = { id: d.id, src: d.src }
    const use = (r: number, c: number): Resolved =>
      Number.isFinite(r) && r > 0 ? { ...base, r, c, fallback: false } : { ...base, r: d.r, c: d.c, fallback: true }
    switch (d.src) {
      case 'pkg': return use(pkg.rjc, pkg.c)
      case 'tim': return use(timR, 0.003)
      case 'sink': return use(sink.r, sink.capacity)
      case 'pcb': return use(pcb.r, pcbCapacity(s.pcb))
      default: return { ...base, r: d.r, c: d.c, fallback: false }
    }
  })
  return { sink, pcb, timR, stages }
}

/** Index of the stage whose resistance the "required heatsink" budget applies to. */
export function targetIndex(stages: readonly { src: Src }[]): number {
  for (let i = stages.length - 1; i >= 0; i--) if (stages[i].src === 'sink' || stages[i].src === 'pcb') return i
  return stages.length - 1
}

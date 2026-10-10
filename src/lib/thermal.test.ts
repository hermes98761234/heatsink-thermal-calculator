import { describe, expect, it } from 'vitest'
import {
  MATERIALS, PACKAGES, TIMS, airK, airNu, finEfficiency, finSinkEstimate, finSinkSpacing, fosterFromStages, hRadiation, junctionTemp,
  logspace, maxPower, nodeTemps, nuChurchillChu, nuElenbaas, parallelR, pcbEstimate, pulseTrainRise, requiredSinkR, timResistance,
  totalR, viaResistance, zth, zthPeriodicPeak, type FinSink, type PcbCopper,
} from './thermal'

const al = MATERIALS[0]
const sink: FinSink = { width: 100, length: 100, baseT: 5, fins: 9, finH: 25, finT: 2, k: al.k, emissivity: 0.85, rho: al.rho, cp: al.cp }
const pcb: PcbCopper = { areaCm2: 6.45, oz: 1, bothSides: true, padCm2: 0.9, vertical: false, emissivity: 0.9, vias: 0, viaDrillMm: 0.3, viaPlatingUm: 25, boardMm: 1.6 }

describe('series network', () => {
  const stages = [{ r: 1.5 }, { r: 0.5 }, { r: 3 }]
  it('sums resistances and finds Tj', () => {
    expect(totalR(stages)).toBe(5)
    expect(junctionTemp(10, 25, stages)).toBe(75)
  })
  it('gives node temperatures from junction to ambient', () => {
    expect(nodeTemps(10, 25, stages)).toEqual([75, 60, 55, 25])
  })
  it('solves required sink resistance and max power', () => {
    // (150-10-40)/10 - 2 = 8 K/W
    expect(requiredSinkR(10, 40, 150, 10, 2)).toBeCloseTo(8, 12)
    expect(maxPower(25, 125, 5)).toBe(20)
  })
})

describe('interface and vias', () => {
  it('computes gap-pad resistance as (t/k + Rc)/A', () => {
    // 1 mm / 3 W/mK = 3.333 K·cm²/W, +0.4, over 1.5 cm²
    expect(timResistance(TIMS.find((t) => t.id === 'pad1')!, 1.5)).toBeCloseTo(3.7333 / 1.5, 3)
  })
  it('greased is much better than dry', () => {
    const g = timResistance(TIMS.find((t) => t.id === 'grease')!, 1.5)
    const d = timResistance(TIMS.find((t) => t.id === 'dry')!, 1.5)
    expect(g).toBeLessThan(0.5)
    expect(d).toBeGreaterThan(g * 5)
  })
  it('matches the annulus formula for a 0.3 mm via through 1.6 mm', () => {
    // A = pi*25e-6*(0.3e-3-25e-6) = 2.16e-8 m², R = 1.6e-3/(385*A) = 192 K/W
    expect(viaResistance(0.3, 25, 1.6)).toBeCloseTo(192.4, 0)
    expect(parallelR([200, 200, 200, 200])).toBeCloseTo(50, 10)
  })
})

describe('air and convection correlations', () => {
  it('reproduces air properties at 300 K', () => {
    expect(airNu(300)).toBeCloseTo(1.57e-5, 7)
    expect(airK(300)).toBeCloseTo(0.0262, 4)
    expect(airK(400)).toBeGreaterThan(0.032)
  })
  it('Churchill-Chu gives Nu ~ 123 at Ra = 1e9, Pr = 0.71', () => {
    expect(nuChurchillChu(1e9)).toBeGreaterThan(120)
    expect(nuChurchillChu(1e9)).toBeLessThan(126)
  })
  it('Elenbaas tends to Ra/24 for narrow channels and ~0.6 Ra^1/4 for wide ones', () => {
    expect(nuElenbaas(1)).toBeCloseTo(1 / 24, 3)
    expect(nuElenbaas(1e6) / Math.pow(1e6, 0.25)).toBeGreaterThan(0.55)
    expect(nuElenbaas(1e6) / Math.pow(1e6, 0.25)).toBeLessThan(0.65)
  })
  it('linearised radiation of a black body at 350 K in 300 K surroundings', () => {
    // eps*sigma*(Ts^2+Ta^2)(Ts+Ta) with Ts=76.85C: ~ 7.4 W/m²K
    expect(hRadiation(1, 76.85, 26.85)).toBeCloseTo(7.4, 0)
  })
  it('fin efficiency is 1 for short fins and tanh(1)/1 at mL = 1', () => {
    expect(finEfficiency(10, 200, 0.002, 1e-6)).toBeCloseTo(1, 6)
    const m = Math.sqrt((2 * 10) / (200 * 0.002))
    expect(finEfficiency(10, 200, 0.002, 1 / m)).toBeCloseTo(Math.tanh(1), 6)
  })
})

describe('plate-fin heatsink', () => {
  it('gets the fin gap right', () => {
    expect(finSinkSpacing(sink)).toBeCloseTo((100 - 18) / 8, 10)
  })
  it('conserves energy and lands in a plausible range', () => {
    const r = finSinkEstimate(sink, 20, 25)
    expect(r.valid).toBe(true)
    expect(r.qConv + r.qRad).toBeCloseTo(20, 3)
    expect(r.r).toBeGreaterThan(1)
    expect(r.r).toBeLessThan(5)
    expect(r.massKg).toBeCloseTo(0.1 * 0.1 * 0.005 * 2700 + 9 * 0.025 * 0.002 * 0.1 * 2700, 6)
  })
  it('a flat plate is worse than a finned sink; radiation helps; more power lowers R', () => {
    const plate = finSinkEstimate({ ...sink, fins: 0 }, 20, 25)
    const fin = finSinkEstimate(sink, 20, 25)
    expect(plate.r).toBeGreaterThan(fin.r * 1.5)
    const bright = finSinkEstimate({ ...sink, emissivity: 0.1 }, 20, 25)
    expect(bright.r).toBeGreaterThan(fin.r)
    expect(finSinkEstimate(sink, 60, 25).r).toBeLessThan(fin.r)
  })
  it('taller fins and a bigger base reduce the resistance', () => {
    const base = finSinkEstimate(sink, 20, 25).r
    expect(finSinkEstimate({ ...sink, finH: 40 }, 20, 25).r).toBeLessThan(base)
    expect(finSinkEstimate({ ...sink, width: 150, fins: 13 }, 20, 25).r).toBeLessThan(base)
  })
  it('flags impossible geometry', () => {
    expect(finSinkEstimate({ ...sink, fins: 60 }, 20, 25).valid).toBe(false)
  })
})

describe('pcb copper', () => {
  it('falls with copper area and rises with fewer layers', () => {
    const a = pcbEstimate(pcb, 2, 25).rSpread
    const b = pcbEstimate({ ...pcb, areaCm2: 25 }, 2, 25).rSpread
    expect(b).toBeLessThan(a)
    expect(pcbEstimate({ ...pcb, bothSides: false }, 2, 25).rSpread).toBeGreaterThan(a)
    expect(pcbEstimate({ ...pcb, oz: 2 }, 2, 25).rSpread).toBeLessThan(a)
  })
  it('adds via resistance in series', () => {
    const r = pcbEstimate({ ...pcb, vias: 9 }, 2, 25)
    expect(r.rVias).toBeCloseTo(viaResistance(0.3, 25, 1.6) / 9, 6)
    expect(r.r).toBeCloseTo(r.rSpread + r.rVias, 9)
  })
  it('stays in a realistic range for 1 in² of 1 oz copper', () => {
    const r = pcbEstimate(pcb, 2, 25).rSpread
    expect(r).toBeGreaterThan(30)
    expect(r).toBeLessThan(150)
  })
})

describe('transient Foster model', () => {
  const one = [{ r: 2, tau: 1 }]
  it('follows R(1 - exp(-t/tau))', () => {
    expect(zth(one, 1)).toBeCloseTo(2 * (1 - Math.exp(-1)), 12)
    expect(zth(one, 0)).toBe(0)
    expect(zth(one, 50)).toBeCloseTo(2, 10)
  })
  it('builds stages from R and C and treats C=0 as instantaneous', () => {
    const f = fosterFromStages([{ r: 1, c: 2 }, { r: 3, c: 0 }])
    expect(f).toEqual([{ r: 1, tau: 2 }, { r: 3, tau: 0 }])
    expect(zth(f, 1e-9)).toBeCloseTo(3, 6)
  })
  it('single pulse rise is P*Zth(tp) at the end of the pulse', () => {
    expect(pulseTrainRise(one, 10, 0.5, 5, 1, 0.5)).toBeCloseTo(10 * zth(one, 0.5), 12)
    // after the pulse the rise decays
    expect(pulseTrainRise(one, 10, 0.5, 5, 1, 3)).toBeLessThan(pulseTrainRise(one, 10, 0.5, 5, 1, 0.5))
  })
  it('periodic-peak formula matches brute-force superposition', () => {
    const f = [{ r: 1.5, tau: 0.02 }, { r: 3, tau: 0.8 }]
    const tp = 0.05
    const T = 0.2
    const n = 200
    const brute = pulseTrainRise(f, 1, tp, T, n, (n - 1) * T + tp)
    expect(zthPeriodicPeak(f, tp, T)).toBeCloseTo(brute, 5)
  })
  it('100% duty degenerates to the DC resistance', () => {
    expect(zthPeriodicPeak(one, 1, 1)).toBeCloseTo(2, 12)
  })
  it('logspace spans decades', () => {
    const x = logspace(1e-3, 1e3, 7)
    expect(x[0]).toBeCloseTo(1e-3, 12)
    expect(x[3]).toBeCloseTo(1, 10)
    expect(x[6]).toBeCloseTo(1e3, 8)
  })
})

describe('package presets', () => {
  it('have unique ids and sane values', () => {
    expect(new Set(PACKAGES.map((p) => p.id)).size).toBe(PACKAGES.length)
    for (const p of PACKAGES) {
      expect(p.rjc).toBeGreaterThan(0)
      expect(p.rja).toBeGreaterThan(p.rjc)
    }
  })
})

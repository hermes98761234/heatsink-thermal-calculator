// Steady-state thermal network maths, free convection correlations and Foster transient model.
// All temperatures in °C (differences in K), resistances in K/W, capacities in J/K, lengths in metres
// unless a name says otherwise.

export const G = 9.80665
export const SIGMA = 5.670374419e-8

// ---------- Series thermal resistance network ----------

export interface NetStage {
  /** Thermal resistance, K/W. */
  r: number
  /** Heat capacity, J/K (0 = ignore for transient). */
  c: number
}

export function totalR(stages: readonly { r: number }[]): number {
  return stages.reduce((a, s) => a + s.r, 0)
}

/** Node temperatures from the junction down to ambient: length = stages + 1, first = Tj, last = Ta. */
export function nodeTemps(power: number, ambient: number, stages: readonly { r: number }[]): number[] {
  const out = new Array<number>(stages.length + 1)
  out[stages.length] = ambient
  for (let i = stages.length - 1; i >= 0; i--) out[i] = out[i + 1] + power * stages[i].r
  return out
}

export function junctionTemp(power: number, ambient: number, stages: readonly { r: number }[]): number {
  return ambient + power * totalR(stages)
}

/** Largest R(sink to ambient) that keeps Tj <= tjMax - margin, given the other series resistances. */
export function requiredSinkR(power: number, ambient: number, tjMax: number, margin: number, otherR: number): number {
  return (tjMax - margin - ambient) / power - otherR
}

/** Largest continuous power for a given total junction-to-ambient resistance. */
export function maxPower(ambient: number, tjMax: number, rTotal: number): number {
  return (tjMax - ambient) / rTotal
}

// ---------- Interface materials and vias ----------

export interface Tim {
  id: string
  name: string
  /** Bond-line thickness, mm. */
  t: number
  /** Conductivity, W/m·K. */
  k: number
  /** Area-specific contact resistance of both interfaces, K·cm²/W. */
  contact: number
}

export const TIMS: Tim[] = [
  { id: 'dry', name: 'Dry contact (no interface)', t: 0.05, k: 0.03, contact: 2.5 },
  { id: 'grease', name: 'Thermal grease', t: 0.03, k: 3, contact: 0.3 },
  { id: 'pcm', name: 'Phase-change pad', t: 0.05, k: 3, contact: 0.2 },
  { id: 'pad1', name: 'Silicone gap pad 1 mm, 3 W/mK', t: 1, k: 3, contact: 0.4 },
  { id: 'pad2', name: 'Silicone gap pad 2 mm, 6 W/mK', t: 2, k: 6, contact: 0.4 },
  { id: 'mica', name: 'Mica insulator + grease', t: 0.1, k: 0.7, contact: 0.6 },
]

/** Interface resistance in K/W for a contact area in cm². R = t/(k·A) + R_contact''/A. */
export function timResistance(tim: Pick<Tim, 't' | 'k' | 'contact'>, areaCm2: number): number {
  const bulk = (tim.t / tim.k) * 10 // mm/(W/mK) = 1e-3 m²K/W = 10 K·cm²/W
  return (bulk + tim.contact) / areaCm2
}

/** Thermal resistance of one plated via barrel (annulus), K/W. All lengths in mm. */
export function viaResistance(drillMm: number, platingUm: number, lengthMm: number, kCu = 385): number {
  const tp = platingUm / 1000
  const area = Math.PI * tp * (drillMm - tp) * 1e-6 // m²
  return (lengthMm * 1e-3) / (kCu * area)
}

export function parallelR(rs: readonly number[]): number {
  return 1 / rs.reduce((a, r) => a + 1 / r, 0)
}

// ---------- Air properties and free convection ----------

export const PR = 0.707

/** Kinematic viscosity of air, m²/s (power-law fit to tables around 250–450 K). */
export function airNu(tK: number): number {
  return 1.568e-5 * Math.pow(tK / 300, 1.7)
}
/** Thermal conductivity of air, W/m·K. */
export function airK(tK: number): number {
  return 0.02624 * Math.pow(tK / 300, 0.83)
}

/** Rayleigh number for a characteristic length l (m) and temperature difference, evaluated at the film temperature. */
export function rayleigh(l: number, dT: number, tAmbC: number): number {
  const tf = tAmbC + 273.15 + dT / 2
  const nu = airNu(tf)
  return (G * dT * l ** 3 * PR) / (tf * nu * nu)
}

/** Churchill–Chu Nu for an isothermal vertical plate of height l, over the full Ra range. */
export function nuChurchillChu(ra: number): number {
  const d = Math.pow(1 + Math.pow(0.492 / PR, 9 / 16), 8 / 27)
  return (0.825 + (0.387 * Math.pow(ra, 1 / 6)) / d) ** 2
}

/** Elenbaas Nu (based on spacing) for an isothermal vertical channel; raPrime = Ra_s·s/L. */
export function nuElenbaas(raPrime: number): number {
  if (raPrime <= 0) return 0
  return (raPrime / 24) * Math.pow(1 - Math.exp(-35 / raPrime), 0.75)
}

/** Vertical plate (flow height l): convection coefficient, W/m²K. */
export function hVerticalPlate(l: number, dT: number, tAmbC: number): number {
  const ra = rayleigh(l, dT, tAmbC)
  const tf = tAmbC + 273.15 + dT / 2
  return (nuChurchillChu(ra) * airK(tf)) / l
}

/** Horizontal plate, McAdams. up = hot face looking up. lChar = area / perimeter. */
export function hHorizontalPlate(lChar: number, dT: number, tAmbC: number, up: boolean): number {
  const ra = rayleigh(lChar, dT, tAmbC)
  const tf = tAmbC + 273.15 + dT / 2
  let nu: number
  if (up) nu = ra < 1e7 ? 0.54 * Math.pow(ra, 0.25) : 0.15 * Math.cbrt(ra)
  else nu = 0.27 * Math.pow(ra, 0.25)
  return (nu * airK(tf)) / lChar
}

/** Linearised radiation coefficient to surroundings at ambient, W/m²K. */
export function hRadiation(emissivity: number, tSurfC: number, tAmbC: number): number {
  const ts = tSurfC + 273.15
  const ta = tAmbC + 273.15
  return emissivity * SIGMA * (ts * ts + ta * ta) * (ts + ta)
}

/** Straight-fin efficiency tanh(mL)/(mL), m = sqrt(h·P/(k·A)) = sqrt(2h/(k·t)) for thin fins. */
export function finEfficiency(h: number, k: number, thicknessM: number, lengthM: number): number {
  const ml = Math.sqrt((2 * h) / (k * thicknessM)) * lengthM
  if (ml < 1e-9) return 1
  return Math.tanh(ml) / ml
}

/** Bisection for the surface temperature rise at which heat(dT) == power. heat must be increasing. */
export function solveRise(power: number, heat: (dT: number) => number): number {
  let lo = 1e-3
  let hi = 400
  if (heat(hi) < power) return hi
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (heat(mid) < power) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

// ---------- Natural convection plate-fin heatsink ----------

export const MATERIALS = [
  { id: 'al6063', name: 'Aluminium 6063', k: 201, rho: 2700, cp: 900 },
  { id: 'al1050', name: 'Aluminium 1050', k: 229, rho: 2700, cp: 900 },
  { id: 'cu', name: 'Copper', k: 390, rho: 8960, cp: 385 },
] as const

export interface FinSink {
  /** Base width across the fins, mm. */
  width: number
  /** Length along the vertical flow direction, mm. */
  length: number
  /** Base plate thickness, mm. */
  baseT: number
  /** Number of fins (0 = flat plate, heat leaves both faces). */
  fins: number
  /** Fin height above base, mm. */
  finH: number
  /** Fin thickness, mm. */
  finT: number
  /** Material conductivity, W/m·K. */
  k: number
  emissivity: number
  /** Density, kg/m³, and specific heat, J/kg·K, for mass and heat capacity. */
  rho: number
  cp: number
}

export interface FinSinkResult {
  /** Surface (base) temperature rise over ambient, K. */
  rise: number
  /** Sink-to-ambient resistance, K/W. */
  r: number
  /** Convective and radiative heat flow shares, W. */
  qConv: number
  qRad: number
  h: number
  etaFin: number
  /** Fin-to-fin gap, mm. */
  spacing: number
  massKg: number
  /** Heat capacity, J/K. */
  capacity: number
  valid: boolean
}

export function finSinkSpacing(s: FinSink): number {
  return s.fins > 1 ? (s.width - s.fins * s.finT) / (s.fins - 1) : 0
}

function finSinkHeat(s: FinSink, dT: number, ta: number): { conv: number; rad: number; h: number; eta: number } {
  const W = s.width / 1000
  const L = s.length / 1000
  if (s.fins < 1) {
    // flat plate: two faces, vertical
    const h = hVerticalPlate(L, dT, ta)
    const hr = hRadiation(s.emissivity, ta + dT, ta)
    const area = 2 * W * L
    return { conv: h * area * dT, rad: hr * area * dT, h, eta: 1 }
  }
  const sp = finSinkSpacing(s) / 1000
  const H = s.finH / 1000
  const t = s.finT / 1000
  const tf = ta + 273.15 + dT / 2
  const raS = (G * dT * sp ** 3 * PR) / (tf * airNu(tf) ** 2)
  const nu = nuElenbaas((raS * sp) / L)
  // channel h can never beat an isolated plate of the same height by a wide margin; use Elenbaas directly.
  const h = (nu * airK(tf)) / sp
  const eta = finEfficiency(h, s.k, t, H + t / 2)
  const aFin = 2 * s.fins * (H + t / 2) * L
  const aGap = Math.max(s.fins - 1, 0) * sp * L
  const conv = h * (aGap + eta * aFin) * dT
  // radiation leaves the envelope: back face, two outer sides and the fin-tip plane
  const hr = hRadiation(s.emissivity, ta + dT, ta)
  const aEnv = 2 * W * L + 2 * (H + s.baseT / 1000) * L
  const rad = hr * aEnv * dT * 0.85
  return { conv, rad, h, eta }
}

export function finSinkEstimate(s: FinSink, power: number, tAmbC: number): FinSinkResult {
  const gap = finSinkSpacing(s)
  const valid = s.width > 0 && s.length > 0 && (s.fins < 1 || (gap > 0.2 && s.finH > 0 && s.finT > 0)) && power > 0
  const W = s.width / 1000
  const L = s.length / 1000
  const volume = W * L * (s.baseT / 1000) + s.fins * (s.finH / 1000) * (s.finT / 1000) * L
  const massKg = Math.max(volume, 0) * s.rho
  const base = { massKg, capacity: massKg * s.cp, spacing: gap }
  if (!valid) return { ...base, rise: NaN, r: NaN, qConv: NaN, qRad: NaN, h: NaN, etaFin: NaN, valid: false }
  const rise = solveRise(power, (dT) => {
    const q = finSinkHeat(s, dT, tAmbC)
    return q.conv + q.rad
  })
  const q = finSinkHeat(s, rise, tAmbC)
  return { ...base, rise, r: rise / power, qConv: q.conv, qRad: q.rad, h: q.h, etaFin: q.eta, valid: true }
}

// ---------- PCB copper heatsinking ----------

export interface PcbCopper {
  /** Copper pour area on the component side, cm². */
  areaCm2: number
  /** Copper weight, oz/ft² (1 oz = 35 µm). */
  oz: number
  /** Copper on both sides (stitched with vias) or top only. */
  bothSides: boolean
  /** Component thermal-pad/tab area, cm² (where the heat enters). */
  padCm2: number
  /** Board orientation. */
  vertical: boolean
  emissivity: number
  /** Thermal vias under the pad. */
  vias: number
  viaDrillMm: number
  viaPlatingUm: number
  boardMm: number
}

export const OZ_TO_MM = 0.035

export interface PcbResult {
  /** Copper-to-ambient resistance, K/W (convection + radiation from the board). */
  rSpread: number
  /** Resistance through the via array from top pad to the bottom copper, K/W (0 if not used). */
  rVias: number
  /** Total from the component pad to ambient. */
  r: number
  rise: number
  h: number
  eta: number
  valid: boolean
}

export function pcbEstimate(p: PcbCopper, power: number, tAmbC: number): PcbResult {
  const bad = !(p.areaCm2 > 0 && p.padCm2 > 0 && power > 0 && p.oz > 0)
  if (bad) return { rSpread: NaN, rVias: NaN, r: NaN, rise: NaN, h: NaN, eta: NaN, valid: false }
  const A = Math.max(p.areaCm2, p.padCm2) * 1e-4
  const side = Math.sqrt(A)
  const tCu = p.oz * OZ_TO_MM * 1e-3
  const re = Math.sqrt(A / Math.PI)
  const r0 = Math.sqrt((p.padCm2 * 1e-4) / Math.PI)
  const heat = (dT: number) => {
    const hTop = p.vertical ? hVerticalPlate(side, dT, tAmbC) : hHorizontalPlate(A / (4 * side), dT, tAmbC, true)
    const hBot = p.vertical ? hTop : hHorizontalPlate(A / (4 * side), dT, tAmbC, false)
    const hr = hRadiation(p.emissivity, tAmbC + dT, tAmbC)
    const hT = hTop + hr
    const hB = hBot + hr
    const kEff = 385 * (p.bothSides ? 2 : 1)
    const eta = finEfficiency((hT + hB) / 2, kEff, tCu, Math.max(re - r0, 1e-4))
    // bare FR4 on the underside still dissipates (through-thickness conduction), weighted lightly if no copper there
    const bottom = p.bothSides ? hB * eta : hB * 0.25 * eta
    return { q: (A * eta * hT + A * bottom) * dT, h: (hT + hB) / 2, eta }
  }
  const rise = solveRise(power, (dT) => heat(dT).q)
  const st = heat(rise)
  const rSpread = rise / power
  const rVias = p.vias > 0 ? viaResistance(p.viaDrillMm, p.viaPlatingUm, p.boardMm) / p.vias : 0
  // with vias but no bottom copper pour the via path adds nothing useful; when used, the bottom pour shares the load
  return { rSpread, rVias, r: rSpread + rVias, rise, h: st.h, eta: st.eta, valid: true }
}

// ---------- Transient: Foster network ----------

export interface Foster {
  r: number
  tau: number
}

/** Foster stages from series network stages: tau = R·C. Zero-capacity stages react instantly. */
export function fosterFromStages(stages: readonly NetStage[]): Foster[] {
  return stages.filter((s) => s.r > 0).map((s) => ({ r: s.r, tau: s.r * s.c }))
}

/** Thermal impedance Zth(t) in K/W; 0 for t <= 0. */
export function zth(foster: readonly Foster[], t: number): number {
  if (t <= 0) return 0
  let z = 0
  for (const f of foster) z += f.tau > 0 ? f.r * (1 - Math.exp(-t / f.tau)) : f.r
  return z
}

/** Junction temperature rise above ambient (K) at time t for a train of identical rectangular pulses starting at t=0. */
export function pulseTrainRise(foster: readonly Foster[], power: number, width: number, period: number, count: number, t: number): number {
  let sum = 0
  for (let k = 0; k < count; k++) {
    const start = k * period
    if (t <= start) break
    sum += zth(foster, t - start) - zth(foster, t - start - width)
  }
  return power * sum
}

/**
 * Effective Zth(tp, D): peak rise per watt at the end of a pulse once an infinite periodic pulse train has settled.
 * Exact for a Foster network: per stage R·(1 - e^(-tp/τ)) / (1 - e^(-T/τ)); instantaneous stages follow the pulse and contribute R.
 */
export function zthPeriodicPeak(foster: readonly Foster[], width: number, period: number): number {
  let z = 0
  for (const f of foster) {
    if (f.tau <= 0) z += f.r
    else z += (f.r * (1 - Math.exp(-width / f.tau))) / (1 - Math.exp(-period / f.tau))
  }
  return z
}

/** Logarithmically spaced points. */
export function logspace(a: number, b: number, n: number): number[] {
  const la = Math.log10(a)
  const lb = Math.log10(b)
  return Array.from({ length: n }, (_, i) => 10 ** (la + ((lb - la) * i) / (n - 1)))
}

// ---------- Package presets ----------

export interface PackagePreset {
  id: string
  name: string
  /** Junction-to-case (or junction-to-pad/tab) resistance, K/W. */
  rjc: number
  /** Typical junction-to-ambient, still air, K/W (reference only, depends on footprint). */
  rja: number
  /** Thermal tab / pad area, cm². */
  area: number
  tjMax: number
  /** Heat capacity of the die + package, J/K (for transient). */
  c: number
  /** Component uses a PCB pour instead of a bolted-on sink. */
  smd: boolean
  note: string
}

export const PACKAGES: PackagePreset[] = [
  { id: 'to220', name: 'TO-220', rjc: 1.5, rja: 62, area: 1.5, tjMax: 150, c: 0.012, smd: false, note: 'Bolted tab, typical MOSFET / regulator' },
  { id: 'to247', name: 'TO-247', rjc: 0.5, rja: 40, area: 3.0, tjMax: 175, c: 0.04, smd: false, note: 'Large power MOSFET / IGBT' },
  { id: 'to3p', name: 'TO-3P / TO-264', rjc: 0.6, rja: 35, area: 3.5, tjMax: 150, c: 0.045, smd: false, note: 'Power transistor, bipolar' },
  { id: 'dpak', name: 'DPAK (TO-252)', rjc: 2.0, rja: 80, area: 0.6, tjMax: 175, c: 0.006, smd: true, note: 'SMD, solder tab to PCB copper' },
  { id: 'd2pak', name: 'D²PAK (TO-263)', rjc: 1.0, rja: 50, area: 0.9, tjMax: 175, c: 0.01, smd: true, note: 'SMD, solder tab to PCB copper' },
  { id: 'sot223', name: 'SOT-223', rjc: 15, rja: 90, area: 0.2, tjMax: 150, c: 0.003, smd: true, note: 'Small regulator, tab to copper' },
  { id: 'so8pp', name: 'PowerPAK SO-8 / LFPAK', rjc: 1.2, rja: 50, area: 0.4, tjMax: 150, c: 0.004, smd: true, note: 'Bottom-cooled power SO-8' },
  { id: 'qfn', name: 'QFN 5x5 exposed pad (with vias)', rjc: 3.0, rja: 35, area: 0.16, tjMax: 125, c: 0.003, smd: true, note: 'Thermal pad soldered to a via array' },
]

export function findPackage(id: string): PackagePreset {
  return PACKAGES.find((p) => p.id === id) ?? PACKAGES[0]
}

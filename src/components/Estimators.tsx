import NumInput from './NumInput'
import Chart, { type Series } from './Chart'
import {
  MATERIALS, TIMS, finSinkEstimate, finSinkSpacing, fosterFromStages, logspace, pcbEstimate, pulseTrainRise, totalR, zth, zthPeriodicPeak,
  findPackage, timResistance,
} from '../lib/thermal'
import { pcbCapacity, type AppState, type Derived } from '../lib/model'
import type { T } from '../i18n'

interface Common {
  s: AppState
  d: Derived
  /** Required resistance for the target element (K/W). */
  req: number
  set: (p: Partial<AppState>) => void
  t: T
}

const f = (v: number, dig = 2) => (Number.isFinite(v) ? v.toFixed(dig) : '–')

export function TimPanel({ s, d, set, t }: Common) {
  const pkg = findPackage(s.pkgId)
  const tim = TIMS.find((x) => x.id === s.timId) ?? TIMS[1]
  return (
    <div>
      <p className="hint">{t('Interface resistance between the package tab and the heatsink: R = (t/k + R_contact) / A.')}</p>
      <div className="grid2">
        <div className="field">
          <label>{t('Interface material')}</label>
          <select value={s.timId} onChange={(e) => set({ timId: e.target.value })}>
            {TIMS.map((x) => (
              <option key={x.id} value={x.id}>{t(x.name)}</option>
            ))}
          </select>
        </div>
        <NumInput label={t('Contact area')} unit="cm²" value={s.timArea} min={0.01} onChange={(v) => set({ timArea: v })} />
      </div>
      <div className="row">
        <button className="small" onClick={() => set({ timArea: pkg.area })}>{t('Use tab area of {0}', pkg.name)} ({pkg.area} cm²)</button>
      </div>
      <table className="data">
        <tbody>
          <tr><td>{t('Bond-line thickness')}</td><td>{tim.t} mm</td></tr>
          <tr><td>{t('Conductivity')}</td><td>{tim.k} W/m·K</td></tr>
          <tr><td>{t('Contact resistance (both faces)')}</td><td>{tim.contact} K·cm²/W</td></tr>
          <tr><td>{t('Interface resistance')}</td><td><b>{f(d.timR, 3)} K/W</b></td></tr>
        </tbody>
      </table>
      <table className="data compare">
        <thead><tr><td>{t('Material')}</td><td>R [K/W]</td></tr></thead>
        <tbody>
          {TIMS.map((x) => (
            <tr key={x.id} className={x.id === s.timId ? 'active' : undefined}>
              <td>{t(x.name)}</td>
              <td>{f(timResistance(x, s.timArea), 3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SinkPanel({ s, d, req, set, t }: Common) {
  const k = s.sink
  const setSink = (p: Partial<typeof k>) => set({ sink: { ...k, ...p } })
  const r = d.sink
  const gap = finSinkSpacing(k)
  const pts = logspace(Math.max(s.power / 5, 0.2), s.power * 4, 24)
  const rs = pts.map((p) => finSinkEstimate(k, p, s.ambient).r)
  const series: Series[] = [{ label: 'Rθsa', x: pts, y: rs, color: 'var(--accent)' }]
  const emis = k.emissivity
  return (
    <div>
      <p className="hint">{t('Natural convection (Elenbaas channel flow between vertical fins) plus radiation, with fin efficiency. Fins vertical, still air.')}</p>
      <div className="grid3">
        <div className="field">
          <label>{t('Material')}</label>
          <select
            value={k.materialId}
            onChange={(e) => {
              const m = MATERIALS.find((x) => x.id === e.target.value) ?? MATERIALS[0]
              setSink({ materialId: m.id, k: m.k, rho: m.rho, cp: m.cp })
            }}
          >
            {MATERIALS.map((m) => (
              <option key={m.id} value={m.id}>{t(m.name)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t('Surface')}</label>
          <select value={emis >= 0.7 ? 'anod' : emis <= 0.15 ? 'bare' : 'mid'} onChange={(e) => setSink({ emissivity: e.target.value === 'anod' ? 0.85 : e.target.value === 'bare' ? 0.1 : 0.4 })}>
            <option value="anod">{t('Black anodised (ε 0.85)')}</option>
            <option value="mid">{t('Painted / oxidised (ε 0.4)')}</option>
            <option value="bare">{t('Bare shiny (ε 0.1)')}</option>
          </select>
        </div>
        <NumInput label={t('Emissivity')} value={emis} min={0.02} max={1} step={0.05} onChange={(v) => setSink({ emissivity: v })} />
      </div>
      <div className="grid3">
        <NumInput label={t('Base width (across fins)')} unit="mm" value={k.width} min={5} onChange={(v) => setSink({ width: v })} />
        <NumInput label={t('Length (vertical)')} unit="mm" value={k.length} min={5} onChange={(v) => setSink({ length: v })} />
        <NumInput label={t('Base thickness')} unit="mm" value={k.baseT} min={0.5} onChange={(v) => setSink({ baseT: v })} />
        <NumInput label={t('Number of fins (0 = flat plate)')} value={k.fins} min={0} integer onChange={(v) => setSink({ fins: v })} />
        <NumInput label={t('Fin height')} unit="mm" value={k.finH} min={1} onChange={(v) => setSink({ finH: v })} />
        <NumInput label={t('Fin thickness')} unit="mm" value={k.finT} min={0.3} onChange={(v) => setSink({ finT: v })} />
      </div>
      {!r.valid ? (
        <p className="err-text">{t('Invalid geometry: the fins must fit across the base with a gap of at least 0.2 mm.')}</p>
      ) : (
        <table className="data">
          <tbody>
            <tr><td>{t('Heatsink resistance Rθsa')}</td><td><b>{f(r.r, 2)} K/W</b> {t('at {0} W', s.power)}</td></tr>
            <tr><td>{t('Required for the target')}</td><td className={r.r <= req ? 'ok-text' : 'err-text'}>{req > 0 ? `≤ ${f(req, 2)} K/W` : t('not reachable')}</td></tr>
            <tr><td>{t('Sink temperature rise')}</td><td>{f(r.rise, 1)} K → {f(s.ambient + r.rise, 1)} °C</td></tr>
            <tr><td>{t('Convection / radiation share')}</td><td>{f(r.qConv, 1)} W / {f(r.qRad, 1)} W</td></tr>
            <tr><td>{t('Channel h, fin efficiency')}</td><td>{f(r.h, 1)} W/m²K, {f(r.etaFin * 100, 0)} %</td></tr>
            <tr><td>{t('Fin gap')}</td><td>{k.fins > 1 ? `${f(gap, 1)} mm` : '–'}</td></tr>
            <tr><td>{t('Mass, heat capacity')}</td><td>{f(r.massKg * 1000, 0)} g, {f(r.capacity, 0)} J/K</td></tr>
          </tbody>
        </table>
      )}
      <h4>{t('Rθsa vs dissipated power')}</h4>
      <Chart
        title={t('Heatsink resistance versus power')}
        series={series}
        xLog
        xLabel={`${t('Power')} [W]`}
        yLabel="Rθsa [K/W]"
        hLines={req > 0 ? [{ value: req, label: t('required'), color: 'var(--ref-line)' }] : []}
        vLines={[{ value: s.power, label: t('operating point'), color: 'var(--ok)' }]}
        fmtX={(x) => `${f(x, 1)} W`}
        fmtY={(y) => `${f(y, 2)} K/W`}
      />
    </div>
  )
}

export function PcbPanel({ s, d, req, set, t }: Common) {
  const p = s.pcb
  const setP = (q: Partial<typeof p>) => set({ pcb: { ...p, ...q } })
  const r = d.pcb
  const areas = logspace(Math.max(p.padCm2, 0.5), 200, 28)
  const oz = [1, 2, 3]
  const colors = ['var(--accent)', 'var(--ok)', 'var(--warn)']
  const series: Series[] = oz.map((o, i) => ({
    label: `${o} oz`, x: areas, y: areas.map((a) => pcbEstimate({ ...p, areaCm2: a, oz: o }, s.power, s.ambient).r), color: colors[i],
  }))
  return (
    <div>
      <p className="hint">{t('Heat spreads radially through the copper pour (fin model) and leaves by natural convection and radiation from both board faces. Boards with internal ground planes do better than this.')}</p>
      <div className="grid3">
        <NumInput label={t('Copper pour area')} unit="cm²" value={p.areaCm2} min={0.1} onChange={(v) => setP({ areaCm2: v })} />
        <NumInput label={t('Copper weight')} unit="oz" value={p.oz} min={0.25} step={0.5} onChange={(v) => setP({ oz: v })} />
        <NumInput label={t('Component pad area')} unit="cm²" value={p.padCm2} min={0.01} onChange={(v) => setP({ padCm2: v })} />
      </div>
      <div className="row checks">
        <label className="check"><input type="checkbox" checked={p.bothSides} onChange={(e) => setP({ bothSides: e.target.checked })} /> {t('Copper on both sides')}</label>
        <label className="check"><input type="checkbox" checked={p.vertical} onChange={(e) => setP({ vertical: e.target.checked })} /> {t('Board mounted vertically')}</label>
      </div>
      <h4>{t('Thermal vias under the pad (to the other side)')}</h4>
      <div className="grid2 grid4">
        <NumInput label={t('Via count')} value={p.vias} min={0} integer onChange={(v) => setP({ vias: v })} />
        <NumInput label={t('Drill')} unit="mm" value={p.viaDrillMm} min={0.1} onChange={(v) => setP({ viaDrillMm: v })} />
        <NumInput label={t('Plating')} unit="µm" value={p.viaPlatingUm} min={5} onChange={(v) => setP({ viaPlatingUm: v })} />
        <NumInput label={t('Board thickness')} unit="mm" value={p.boardMm} min={0.2} onChange={(v) => setP({ boardMm: v })} />
      </div>
      {!r.valid ? (
        <p className="err-text">{t('Invalid input.')}</p>
      ) : (
        <table className="data">
          <tbody>
            <tr><td>{t('Copper to ambient')}</td><td><b>{f(r.rSpread, 1)} K/W</b></td></tr>
            <tr><td>{t('Via array')}</td><td>{p.vias > 0 ? `${f(r.rVias, 1)} K/W` : '–'}</td></tr>
            <tr><td>{t('Pad to ambient (total)')}</td><td><b>{f(r.r, 1)} K/W</b> {req > 0 ? `(${t('required')} ≤ ${f(req, 1)})` : ''}</td></tr>
            <tr><td>{t('Copper rise, effective h, spreading efficiency')}</td><td>{f(r.rise, 0)} K, {f(r.h, 1)} W/m²K, {f(r.eta * 100, 0)} %</td></tr>
            <tr><td>{t('Board heat capacity')}</td><td>{f(pcbCapacity(p), 1)} J/K</td></tr>
          </tbody>
        </table>
      )}
      <h4>{t('Resistance vs copper area')}</h4>
      <Chart
        title={t('PCB copper resistance versus area')}
        series={series}
        xLog
        yLog
        xLabel={`${t('Copper area')} [cm²]`}
        yLabel="Rθ [K/W]"
        hLines={req > 0 ? [{ value: req, label: t('required'), color: 'var(--ref-line)' }] : []}
        vLines={[{ value: p.areaCm2, label: t('current'), color: 'var(--muted)' }]}
        fmtX={(x) => `${f(x, 1)} cm²`}
        fmtY={(y) => `${f(y, 1)} K/W`}
      />
    </div>
  )
}

export function TransientPanel({ s, d, set, t }: Common) {
  const foster = fosterFromStages(d.stages)
  const rth = totalR(foster)
  const tauMax = Math.max(1, ...foster.map((x) => x.tau))
  const times = logspace(1e-4, tauMax * 6, 80)
  const zs = times.map((x) => zth(foster, x))
  const tp = s.pulseWidthMs / 1000
  const T = s.pulsePeriodMs / 1000
  const n = Math.max(1, Math.min(500, Math.round(s.pulseCount)))
  const validPulse = tp > 0 && T >= tp
  const tEnd = n * T
  const ts = Array.from({ length: 401 }, (_, i) => (tEnd * i) / 400)
  const tj = validPulse ? ts.map((x) => s.ambient + pulseTrainRise(foster, s.power, tp, T, n, x)) : []
  const D = validPulse ? tp / T : NaN
  const single = s.ambient + s.power * zth(foster, tp)
  const periodic = s.ambient + s.power * zthPeriodicPeak(foster, tp, T)
  const avg = s.ambient + s.power * D * rth
  const peakSim = tj.length ? Math.max(...tj) : NaN
  const limit = s.tjMax
  return (
    <div>
      <p className="hint">{t('Each network element becomes a Foster stage with R and τ = R·C. Zth(t) = Σ R(1 − e^(−t/τ)). Set the heat capacity of each element in the network list.')}</p>
      <div className="grid3">
        <NumInput label={t('Pulse width')} unit="ms" value={s.pulseWidthMs} min={0.001} onChange={(v) => set({ pulseWidthMs: v })} />
        <NumInput label={t('Period')} unit="ms" value={s.pulsePeriodMs} min={0.001} onChange={(v) => set({ pulsePeriodMs: v })} />
        <NumInput label={t('Number of pulses')} value={s.pulseCount} min={1} max={500} integer onChange={(v) => set({ pulseCount: v })} />
      </div>
      <p className="hint">{t('Pulse power is the power dissipation set on the left.')}</p>
      <h4>{t('Thermal impedance Zth(t)')}</h4>
      <Chart
        title={t('Thermal impedance versus time')}
        series={[{ label: 'Zth', x: times, y: zs, color: 'var(--accent)' }]}
        xLog
        xLabel={`${t('Time')} [s]`}
        yLabel="Zth [K/W]"
        hLines={[{ value: rth, label: `Rth ${f(rth, 2)}`, color: 'var(--ref-line)' }]}
        vLines={validPulse ? [{ value: tp, label: t('pulse width'), color: 'var(--muted)' }] : []}
        fmtX={(x) => `${Number(x.toPrecision(3))} s`}
        fmtY={(y) => `${f(y, 3)} K/W`}
      />
      <h4>{t('Junction temperature under the pulse train (cold start)')}</h4>
      {!validPulse ? (
        <p className="err-text">{t('The period must be at least as long as the pulse width.')}</p>
      ) : (
        <>
          <Chart
            title={t('Junction temperature versus time')}
            zero={false}
            series={[{ label: 'Tj', x: ts.map((x) => x * 1000), y: tj, color: 'var(--err)' }]}
            xLabel={`${t('Time')} [ms]`}
            yLabel="Tj [°C]"
            hLines={[{ value: limit, label: `Tj max ${limit}`, color: 'var(--ref-line)' }]}
            fmtX={(x) => `${f(x, 1)} ms`}
            fmtY={(y) => `${f(y, 1)} °C`}
          />
          <table className="data">
            <tbody>
              <tr><td>{t('Duty cycle')}</td><td>{f(D * 100, 1)} %</td></tr>
              <tr><td>{t('Single-pulse peak')}</td><td>{f(single, 1)} °C (ΔT {f(single - s.ambient, 1)} K)</td></tr>
              <tr><td>{t('Peak in this window')}</td><td>{f(peakSim, 1)} °C</td></tr>
              <tr><td>{t('Steady periodic peak')}</td><td className={periodic > limit ? 'err-text' : 'ok-text'}><b>{f(periodic, 1)} °C</b></td></tr>
              <tr><td>{t('Average-power temperature')}</td><td>{f(avg, 1)} °C</td></tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

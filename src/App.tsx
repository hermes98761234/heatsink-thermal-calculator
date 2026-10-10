import { useEffect, useMemo, useState } from 'react'
import { boltedNetwork, defaultState, derive, DEFAULT_NAME, loadState, mkStage, saveState, smdNetwork, targetIndex, type AppState, type Tab } from './lib/model'
import { findPackage, maxPower, nodeTemps, PACKAGES, requiredSinkR, totalR } from './lib/thermal'
import { tr, type T } from './i18n'
import NumInput from './components/NumInput'
import NetworkEditor from './components/NetworkEditor'
import Diagram from './components/Diagram'
import { PcbPanel, SinkPanel, TimPanel, TransientPanel } from './components/Estimators'

const f = (v: number, dig = 1) => (Number.isFinite(v) ? v.toFixed(dig) : '–')

const TABS: { id: Tab; label: string }[] = [
  { id: 'sink', label: 'Fin heatsink' },
  { id: 'tim', label: 'Interface' },
  { id: 'pcb', label: 'PCB copper' },
  { id: 'transient', label: 'Transient' },
]

export default function App() {
  const [state, setState] = useState<AppState>(loadState)
  const set = (p: Partial<AppState>) => setState((s) => ({ ...s, ...p }))
  const t: T = (s, ...a) => tr(state.lang, s, ...a)
  const d = useMemo(() => derive(state), [state])

  useEffect(() => saveState(state), [state])
  useEffect(() => {
    const root = document.documentElement
    if (state.theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = state.theme
    root.lang = state.lang
  }, [state.theme, state.lang])

  const { power, ambient, tjMax, margin } = state
  const inputsOk = power > 0 && Number.isFinite(ambient) && tjMax > ambient && margin >= 0 && margin < tjMax - ambient
  const stages = d.stages
  const temps = nodeTemps(power, ambient, stages)
  const tj = temps[0]
  const rTot = totalR(stages)
  const tgt = targetIndex(stages)
  const others = rTot - stages[tgt].r
  const req = requiredSinkR(power, ambient, tjMax, margin, others)
  const limit = tjMax - margin
  const pMax = maxPower(ambient, limit, rTot)
  const status = tj <= limit ? 'ok' : tj <= tjMax ? 'warn' : 'err'
  const nameOf = (i: number) => state.stages[i].name || t(DEFAULT_NAME[state.stages[i].src])
  const nodeNames = [
    t('Junction'),
    ...stages.slice(1).map((_, i) => (state.stages[i].src === 'pkg' ? t('Case') : state.stages[i].src === 'tim' ? t('Sink') : '')),
    t('Ambient'),
  ]

  const pkg = findPackage(state.pkgId)
  const setPackage = (id: string) => {
    const p = findPackage(id)
    const hasPcb = state.stages.some((x) => x.src === 'pcb')
    const hasSink = state.stages.some((x) => x.src === 'sink')
    let stagesNew = state.stages
    if (p.smd && !hasPcb) stagesNew = smdNetwork()
    else if (!p.smd && !hasSink) stagesNew = boltedNetwork()
    setState((s) => ({ ...s, pkgId: id, tjMax: p.tjMax, timArea: p.area, pcb: { ...s.pcb, padCm2: p.area }, stages: stagesNew, tab: p.smd ? 'pcb' : s.tab === 'pcb' ? 'sink' : s.tab }))
  }
  const reset = () => {
    const x = defaultState()
    setState({ ...x, lang: state.lang, theme: state.theme })
  }
  const addMissing = (src: 'sink' | 'pcb' | 'tim') => {
    if (!state.stages.some((x) => x.src === src)) set({ stages: [...state.stages, mkStage(src)] })
  }

  const common = { s: state, d, req, set, t }
  const verdictText =
    status === 'ok' ? t('OK: the junction stays {0} °C below the limit.', f(limit - tj))
      : status === 'warn' ? t('Marginal: inside the absolute maximum but within your {0} K design margin.', margin)
        : t('Too hot: the junction would exceed {0} °C by {1} K.', tjMax, f(tj - tjMax))

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">{t('Heatsink & thermal calculator')}</span>
        <span className="hint">{t('Thermal resistance network, required heatsink, fin and PCB estimates, transient Zth.')}</span>
        <span className="spacer" />
        <label className="inline">
          {t('Language')}
          <select value={state.lang} onChange={(e) => set({ lang: e.target.value as AppState['lang'] })}>
            <option value="en">English</option>
            <option value="uk">Українська</option>
          </select>
        </label>
        <label className="inline">
          {t('Theme')}
          <select value={state.theme} onChange={(e) => set({ theme: e.target.value as AppState['theme'] })}>
            <option value="auto">{t('System')}</option>
            <option value="light">{t('Light')}</option>
            <option value="dark">{t('Dark')}</option>
          </select>
        </label>
      </header>
      <div className="body">
        <aside className="side">
          <div className="panel">
            <div className="section">
              <h3>{t('Operating conditions')}</h3>
              <div className="grid2">
                <NumInput label={t('Power dissipation')} unit="W" value={power} min={0.001} onChange={(v) => set({ power: v })} />
                <NumInput label={t('Ambient temperature')} unit="°C" value={ambient} onChange={(v) => set({ ambient: v })} />
                <NumInput label={t('Max junction temperature')} unit="°C" value={tjMax} onChange={(v) => set({ tjMax: v })} />
                <NumInput label={t('Design margin')} unit="K" value={margin} min={0} onChange={(v) => set({ margin: v })} />
              </div>
              <div className="field">
                <label>{t('Package')}</label>
                <select value={state.pkgId} onChange={(e) => setPackage(e.target.value)}>
                  {PACKAGES.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <p className="hint">
                {t(pkg.note)}. Rθjc {pkg.rjc} K/W, {t('typical Rθja')} {pkg.rja} K/W, Tj max {pkg.tjMax} °C.
              </p>
            </div>
            <NetworkEditor stages={state.stages} resolved={stages} onChange={(st) => set({ stages: st })} t={t} />
            <button className="danger small" onClick={reset}>{t('Reset to defaults')}</button>
          </div>
        </aside>
        <main className="main">
          <section className="box">
            <h3>{t('Result')}</h3>
            {!inputsOk ? (
              <p className="verdict err">{t('Check the operating conditions: power must be positive and the margin must fit below the limit.')}</p>
            ) : (
              <>
                <p className={`verdict ${status}`}>{verdictText}</p>
                <div className="kpis">
                  <div className="kpi"><span>{t('Junction temperature')}</span><b>{f(tj)} °C</b></div>
                  <div className="kpi"><span>{t('Total Rθja')}</span><b>{f(rTot, 2)} K/W</b></div>
                  <div className="kpi">
                    <span>{t('Required {0}', nameOf(tgt))}</span>
                    <b className={req > 0 ? '' : 'err-text'}>{req > 0 ? `≤ ${f(req, 2)} K/W` : t('not reachable')}</b>
                  </div>
                  <div className="kpi"><span>{t('Max power at the limit')}</span><b>{f(pMax)} W</b></div>
                </div>
                {req <= 0 && <p className="hint err-text">{t('Even a perfect heatsink cannot hold the limit: reduce power, lower the other resistances or accept a higher Tj.')}</p>}
                {req > 0 && stages[tgt].r > req && <p className="hint warn-text">{t('The current {0} is {1} K/W too high.', nameOf(tgt), f(stages[tgt].r - req, 2))}</p>}
                <Diagram
                  stages={stages.map((x, i) => ({ name: nameOf(i), r: x.r }))}
                  temps={temps}
                  power={power}
                  ambient={ambient}
                  limit={limit}
                  nodeNames={nodeNames}
                  t={t}
                />
                <table className="data">
                  <tbody>
                    {stages.map((x, i) => (
                      <tr key={x.id}>
                        <td>{nameOf(i)}</td>
                        <td>{f(x.r, 3)} K/W</td>
                        <td>ΔT {f(power * x.r)} K</td>
                        <td>{f(temps[i])} → {f(temps[i + 1])} °C</td>
                        <td>{f((x.r / rTot) * 100, 0)} %</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
          <section className="box">
            <div className="tabs" role="tablist">
              {TABS.map((x) => (
                <button key={x.id} role="tab" aria-selected={state.tab === x.id} className={state.tab === x.id ? 'tab on' : 'tab'} onClick={() => set({ tab: x.id })}>
                  {t(x.label)}
                </button>
              ))}
            </div>
            {state.tab !== 'transient' && state.tab !== 'tim' && !state.stages.some((x) => x.src === state.tab) && (
              <p className="hint">
                {t('This estimator is not part of the network.')} <button className="small" onClick={() => addMissing(state.tab as 'sink' | 'pcb')}>{t('Add to network')}</button>
              </p>
            )}
            {state.tab === 'tim' && !state.stages.some((x) => x.src === 'tim') && (
              <p className="hint">
                {t('This estimator is not part of the network.')} <button className="small" onClick={() => addMissing('tim')}>{t('Add to network')}</button>
              </p>
            )}
            {state.tab === 'sink' && <SinkPanel {...common} />}
            {state.tab === 'tim' && <TimPanel {...common} />}
            {state.tab === 'pcb' && <PcbPanel {...common} />}
            {state.tab === 'transient' && <TransientPanel {...common} />}
          </section>
        </main>
      </div>
      <p className="hint foot">
        {t('Estimates for design guidance. Verify with measurements; natural convection varies with enclosure, orientation and altitude.')}{' '}
        <a href="https://github.com/hermes98761234/heatsink-thermal-calculator">{t('Source on GitHub')}</a>
      </p>
    </div>
  )
}

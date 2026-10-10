import NumInput from './NumInput'
import { DEFAULT_NAME, mkStage, type Resolved, type Src, type StageDef } from '../lib/model'
import type { T } from '../i18n'

interface Props {
  stages: StageDef[]
  resolved: Resolved[]
  onChange: (s: StageDef[]) => void
  t: T
}

const SRC_LABEL: Record<Src, string> = {
  manual: 'Manual value',
  pkg: 'Package preset',
  tim: 'Interface calculator',
  sink: 'Fin heatsink estimator',
  pcb: 'PCB copper estimator',
}

export default function NetworkEditor({ stages, resolved, onChange, t }: Props) {
  const patch = (i: number, p: Partial<StageDef>) => onChange(stages.map((s, k) => (k === i ? { ...s, ...p } : s)))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= stages.length) return
    const c = stages.slice()
    ;[c[i], c[j]] = [c[j], c[i]]
    onChange(c)
  }
  return (
    <div className="section">
      <h3>{t('Thermal resistance network (junction to ambient)')}</h3>
      {stages.map((s, i) => {
        const r = resolved[i]
        return (
          <div className="card" key={s.id}>
            <div className="row">
              <input
                className="grow"
                aria-label={t('Name')}
                placeholder={t(DEFAULT_NAME[s.src])}
                value={s.name}
                onChange={(e) => patch(i, { name: e.target.value })}
              />
              <button className="small" aria-label={t('Move up')} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button className="small" aria-label={t('Move down')} disabled={i === stages.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button className="small danger" aria-label={t('Remove')} disabled={stages.length <= 1} onClick={() => onChange(stages.filter((_, k) => k !== i))}>✕</button>
            </div>
            <div className="field">
              <label>{t('Source')}</label>
              <select value={s.src} onChange={(e) => patch(i, { src: e.target.value as Src })}>
                {(Object.keys(SRC_LABEL) as Src[]).map((k) => (
                  <option key={k} value={k}>{t(SRC_LABEL[k])}</option>
                ))}
              </select>
            </div>
            {s.src === 'manual' || r.fallback ? (
              <div className="grid2">
                <NumInput label="Rθ" unit="K/W" value={s.r} min={0.0001} onChange={(v) => patch(i, { r: v })} />
                <NumInput label={t('Heat capacity')} unit="J/K" value={s.c} min={0} onChange={(v) => patch(i, { c: v })} />
              </div>
            ) : (
              <p className="hint">Rθ = <b>{r.r.toFixed(3)} K/W</b>, C = {r.c < 10 ? r.c.toPrecision(2) : r.c.toFixed(0)} J/K</p>
            )}
            {r.fallback && s.src !== 'manual' && <p className="hint warn-text">{t('Estimator input is invalid; using the manual value.')}</p>}
          </div>
        )
      })}
      <div className="row">
        <button className="small" onClick={() => onChange([...stages, mkStage('manual', 0.5, 0)])}>+ {t('Custom element')}</button>
        <button className="small" onClick={() => onChange([...stages, mkStage('tim')])}>+ {t('Interface')}</button>
        <button className="small" onClick={() => onChange([...stages, mkStage('sink')])}>+ {t('Heatsink')}</button>
        <button className="small" onClick={() => onChange([...stages, mkStage('pcb')])}>+ {t('PCB copper')}</button>
      </div>
    </div>
  )
}

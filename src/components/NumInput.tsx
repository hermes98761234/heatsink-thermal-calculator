import { useId, useState } from 'react'

interface Props {
  label: string
  value: number
  onChange: (n: number) => void
  unit?: string
  min?: number
  max?: number
  step?: number
  integer?: boolean
}

/** Number field that keeps its own text while typing and reports only valid numbers. */
export default function NumInput({ label, value, onChange, unit, min, max, step, integer }: Props) {
  const id = useId()
  const [edit, setEdit] = useState({ typed: String(value), forValue: value })
  // Show what the user typed until the value is changed from outside (preset, reset, ...).
  const text = edit.forValue === value ? edit.typed : String(value)
  const n = parseFloat(text)
  const bad = !Number.isFinite(n) || (min !== undefined && n < min) || (max !== undefined && n > max) || (integer === true && !Number.isInteger(n))
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {unit ? <span className="unit"> [{unit}]</span> : null}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={text}
        min={min}
        max={max}
        step={step ?? 'any'}
        className={bad ? 'bad' : undefined}
        aria-invalid={bad}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          setEdit({ typed: e.target.value, forValue: Number.isFinite(v) ? v : value })
          if (Number.isFinite(v)) onChange(v)
        }}
      />
    </div>
  )
}

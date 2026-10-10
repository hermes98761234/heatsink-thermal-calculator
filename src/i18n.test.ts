import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { UK, tr } from './i18n'
import { PACKAGES, TIMS, MATERIALS } from './lib/thermal'
import { DEFAULT_NAME } from './lib/model'

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(`${dir}/${e.name}`) : /\.tsx$/.test(e.name) ? [readFileSync(`${dir}/${e.name}`, 'utf8')] : [],
  )
}

describe('i18n', () => {
  it('interpolates placeholders', () => {
    expect(tr('en', 'Use tab area of {0}', 'TO-220')).toBe('Use tab area of TO-220')
    expect(tr('uk', 'at {0} W', 12)).toBe('при 12 Вт')
  })
  it('falls back to English for unknown strings', () => {
    expect(tr('uk', 'no such key')).toBe('no such key')
  })
  it('translates every literal passed to t() in the UI', () => {
    const missing: string[] = []
    for (const src of sources('src')) {
      for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) {
        const key = m[1].replace(/\\'/g, "'")
        if (!(key in UK)) missing.push(key)
      }
    }
    expect(missing).toEqual([])
  })
  it('translates data-driven labels', () => {
    const keys = [...TIMS.map((x) => x.name), ...MATERIALS.map((x) => x.name), ...PACKAGES.map((p) => p.note), ...Object.values(DEFAULT_NAME)]
    expect(keys.filter((k) => !(k in UK))).toEqual([])
  })
  it('keeps placeholders consistent', () => {
    for (const [en, uk] of Object.entries(UK)) {
      const ph = (s: string) => [...s.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort().join()
      expect(ph(uk), en).toBe(ph(en))
    }
  })
})

import { describe, expect, it } from 'vitest'
import { fromForm, toForm } from './zones'

const row = { name: 'UK', countries: ['GB'], standard: '5.95', express: '12.95', extra: '1.5' }

describe('delivery groups', () => {
  it('round-trips what is saved', () => {
    const r = fromForm(toForm([{ name: 'UK', countries: ['GB'], standard: 5.95, express: 12.95, extra: 1.5 }]))
    expect(r).toEqual({ zones: [{ name: 'UK', countries: ['GB'], standard: 5.95, express: 12.95, extra: 1.5 }] })
  })
  it('never allows free or missing prices', () => {
    expect(fromForm([{ ...row, standard: '0' }])).toHaveProperty('problem')
    expect(fromForm([{ ...row, express: '' }])).toHaveProperty('problem')
    expect(fromForm([{ ...row, extra: '-1' }])).toHaveProperty('problem')
  })
  it('keeps a country in one group only, and drops empty groups', () => {
    expect(fromForm([row, { ...row, name: 'Again' }])).toHaveProperty('problem')
    expect(fromForm([row, { ...row, countries: [] }])).toEqual(fromForm([row]))
    expect(fromForm([{ ...row, countries: [] }])).toHaveProperty('problem')
  })
})

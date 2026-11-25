import { expect, it } from 'vitest'
import { csvCell } from './csv'

it('quotes cells and defuses formulas', () => {
  expect(['a,"b"', '=1+1', 'x@y.com'].map(csvCell)).toEqual(['"a,""b"""', '"\'=1+1"', '"x@y.com"'])
})

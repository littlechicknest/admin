import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { detect, looksRight, readPics, viewRank, voteColor, type Palette } from './mockups'

const uid = (color: string, size = 's') => `apparel_product_gca_hoodie_gsc_pullover_gcu_unisex_gqa_classic_gsi_${size}_gco_${color}_gpr_4-4_gildan_18500`
const palette = (names: string[], extra: Partial<Palette> = {}): Palette => ({ colors: names.map((name) => ({ name })), options: [], skus: [], ...extra })
const color = (path: string, p: Palette) => detect(path, p).color

describe('colour of a picture', () => {
  it('reads Gelato folders by product code, whatever the size', () => {
    const p = palette(['Sand', 'Navy'], { skus: [{ color: 'Navy', size: 'S', uid: uid('navy') }, { color: 'Sand', size: 'S', uid: uid('sand') }] })
    expect(color(`ebffd2e0/${uid('navy', '5xl')}/premium_model_male_man2_front-1.jpeg`, p)).toBe('Navy')
    // the code decides even when Gelato's code and the colour name differ
    expect(color(`x/${uid('natural-x')}/white-bg.png`, palette(['White', 'Oat'], { skus: [{ color: 'Oat', size: 'S', uid: uid('natural-x') }] }))).toBe('Oat')
  })
  it('reads the colour part of codes it does not know', () => {
    expect(color(`x/${uid('military-green')}/a.jpg`, palette(['Green', 'Military Green']))).toBe('Military Green')
    expect(color('x/mug_gco_red/a.jpg', palette(['Ceramic Red', 'Ceramic Black']))).toBe('Ceramic Red')
  })
  it('reads plain folder and file names', () => {
    const p = palette(['Red', 'Cherry Red', 'Light Blue', 'Sport Grey', 'Navy'])
    expect(['Cherry-Red/a.png', 'red/a.png', 'lightblue/a.webp', 'sport gray/1.jpg', 'photos/hoodie navy 2.JPG', 'navy/front on white.jpg', 'x/rendered.png'].map((x) => color(x, p)))
      .toEqual(['Cherry Red', 'Red', 'Light Blue', 'Sport Grey', 'Navy', 'Navy', null])
  })
  it('needs no name when there is only one colour', () => expect(color('a.png', palette(['White']))).toBe('White'))
  it('finds the design option', () => {
    const p = palette(['White'], { options: ['Design Option 1', 'Design Option 2'] })
    expect(['white/design-option-2.png', 'option 1/front-2.png', 'white/front-1.png'].map((x) => detect(x, p).option)).toEqual(['Design Option 2', 'Design Option 1', null])
  })
  it('falls back to the pixels', () => {
    const px = (c: number[], n: number) => Array.from({ length: n }, () => [...c, 255]).flat()
    const colors = [{ name: 'Navy', hex: '#1b2545' }, { name: 'Sand', hex: '#d8cbb3' }]
    expect(voteColor([...px([20, 35, 80], 8), ...px([250, 250, 250], 2)], colors)).toBe('Navy')
    expect(voteColor(px([0, 0, 0], 4), [{ name: 'Zzz' }])).toBeNull()
  })
})

it('spots a zip of another product', () => {
  const skus = [{ color: 'Navy', size: 'S', uid: uid('navy') }]
  expect(looksRight([`x/${uid('sand', '5xl')}/a.jpg`], skus)).toBe(true)
  expect(looksRight([`x/${uid('navy').replace('18500', '5000')}/a.jpg`], skus)).toBe(false)
  expect(looksRight(['red/a.jpg'], skus)).toBe(true)
})

it('puts front views first', () => {
  expect(['a/man1_back-1.jpeg', 'a/editorial.jpeg', 'a/man2_front.jpeg'].sort((a, b) => viewRank(a) - viewRank(b))[0]).toBe('a/man2_front.jpeg')
})

it('unpacks zips and ignores junk', async () => {
  const one = new Uint8Array([1])
  const zip = zipSync({ 'Red/a.PNG': one, 'Red/b.webp': one, '__MACOSX/Red/._a.png': one, 'Red/.DS_Store': one, 'notes.txt': one })
  const { pics, skipped } = await readPics([new File([zip as Uint8Array<ArrayBuffer>], 'x.zip'), new File([one], 'c.jpg')])
  expect(pics.map((p) => p.path)).toEqual(['Red/a.PNG', 'Red/b.webp', 'c.jpg'])
  expect(skipped).toEqual(['notes.txt'])
})

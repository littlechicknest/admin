// Delivery prices by destination (store_settings.shipping_zones), the same shape public.shipping_cost() reads.

/** Countries the checkout accepts (same list as the shop and the create-checkout-session function). */
export const COUNTRIES: [string, string][] = [
  ['GB', 'United Kingdom'], ['IE', 'Ireland'], ['FR', 'France'], ['BE', 'Belgium'], ['NL', 'Netherlands'], ['DE', 'Germany'],
  ['ES', 'Spain'], ['IT', 'Italy'], ['PT', 'Portugal'], ['AT', 'Austria'], ['DK', 'Denmark'], ['SE', 'Sweden'], ['NO', 'Norway'],
  ['FI', 'Finland'], ['PL', 'Poland'], ['CH', 'Switzerland'], ['US', 'United States'], ['CA', 'Canada'], ['AU', 'Australia'], ['NZ', 'New Zealand'],
]
export const countryName = (code: string) => COUNTRIES.find(([c]) => c === code)?.[1] ?? code

export type Zone = { name: string; countries: string[]; standard: number; express: number; extra: number }
/** What the form holds: prices as typed. */
export type ZoneForm = { name: string; countries: string[]; standard: string; express: string; extra: string }

export const toForm = (v: unknown): ZoneForm[] =>
  (Array.isArray(v) ? v : []).map((z) => ({
    name: String(z?.name ?? ''), countries: Array.isArray(z?.countries) ? z.countries.map(String) : [],
    standard: String(z?.standard ?? ''), express: String(z?.express ?? ''), extra: String(z?.extra ?? '0'),
  }))

const money = (s: string) => (s.trim() !== '' && Number.isFinite(Number(s)) ? Math.round(Number(s) * 100) / 100 : NaN)

/** Checks the form; returns the zones to save, or a plain-English problem. Delivery is never free. */
export function fromForm(form: ZoneForm[]): { zones: Zone[] } | { problem: string } {
  const zones: Zone[] = []
  const seen = new Set<string>()
  for (const f of form) {
    const name = f.name.trim() || 'Unnamed group'
    const [standard, express, extra] = [f.standard, f.express, f.extra || '0'].map(money)
    if (!f.countries.length) continue // an empty group delivers nowhere: drop it
    if (!(standard > 0) || !(express > 0)) return { problem: `${name}: standard and express delivery must cost more than 0.` }
    if (!(extra >= 0)) return { problem: `${name}: "each extra item" must be 0 or more.` }
    for (const c of f.countries) {
      if (seen.has(c)) return { problem: `${countryName(c)} is in two groups. Please keep it in one.` }
      seen.add(c)
    }
    zones.push({ name, countries: f.countries, standard, express, extra })
  }
  if (!zones.length) return { problem: 'Please keep at least one group with countries, or nobody can check out.' }
  return { zones }
}

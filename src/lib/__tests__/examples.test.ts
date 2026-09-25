import { describe, it, expect } from 'vitest'
import { parseFormula } from '../parser'
import { balance } from '../solver'

const EXAMPLES: Array<{ name: string; left: string[]; right: string[] }> = [
  { name: '普通', left: ['CH4','O2'], right: ['CO2','H2O'] },
  { name: '嵌套', left: ['Mg2[Fe(CN)6]','KOH'], right: ['Mg(OH)2','K4[Fe(CN)6]'] },
  { name: '结晶水', left: ['CuSO4·5H2O'], right: ['CuSO4','H2O'] },
  { name: '离子', left: ['MnO4^-','H^+','e^-'], right: ['Mn^2+','H2O'] },
]

describe('内置示例', () => {
  for (const ex of EXAMPLES) {
    it(`${ex.name} 可唯一配平`, () => {
      const sp = [
        ...ex.left.map((raw) => ({ raw, formula: parseFormula(raw).ok ? (parseFormula(raw) as any).formula : null, side: 'left' as const })),
        ...ex.right.map((raw) => ({ raw, formula: parseFormula(raw).ok ? (parseFormula(raw) as any).formula : null, side: 'right' as const })),
      ]
      const r = balance(sp as any)
      if (r.kind !== 'unique') console.log(ex.name, r)
      expect(r.kind).toBe('unique')
      if (r.kind === 'unique') console.log(ex.name, r.coefficients.join(','))
    })
  }
})

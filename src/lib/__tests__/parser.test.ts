import { describe, it, expect } from 'vitest'
import { parseFormula } from '../parser'

describe('parseFormula', () => {
  it('解析简单下标', () => {
    const r = parseFormula('H2O')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.formula.elements).toEqual({ H: 2n, O: 1n })
    expect(r.formula.charge).toBe(0n)
  })

  it('括号外下标乘整个分组', () => {
    const r = parseFormula('Ca(OH)2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.formula.elements).toEqual({ Ca: 1n, O: 2n, H: 2n })
  })

  it('支持多层嵌套括号', () => {
    const r = parseFormula('Ca3(Fe(CN)6)2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.formula.elements).toEqual({ Ca: 3n, Fe: 2n, C: 12n, N: 12n })
  })

  it('支持中括号与花括号并检查匹配类型', () => {
    const r = parseFormula('[Mg(H2O)6]Cl2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.formula.elements).toEqual({ Mg: 1n, H: 12n, O: 6n, Cl: 2n })
    const bad = parseFormula('(OH]')
    expect(bad.ok).toBe(false)
  })

  it('结晶水点号：倍数只乘该段', () => {
    const r = parseFormula('CuSO4·5H2O')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.formula.elements).toEqual({ Cu: 1n, S: 1n, O: 9n, H: 10n })
    expect(r.formula.segmentCount).toBe(2)
  })

  it('多段结晶水分别计数', () => {
    const r = parseFormula('Na2CO3.10H2O')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.formula.elements.O).toBe(13n)
    expect(r.formula.elements.H).toBe(20n)
  })

  it('解析电荷 ^2+ 与 ^-', () => {
    expect((parseFormula('Mg^2+') as any).formula.charge).toBe(2n)
    expect((parseFormula('SO4^2-') as any).formula.charge).toBe(-2n)
    expect((parseFormula('K+') as any).ok).toBe(false)
  })

  it('电子 e^- 电荷为 -1 且无元素', () => {
    const r = parseFormula('e^-')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.formula.charge).toBe(-1n)
    expect(r.formula.isElectron).toBe(true)
    expect(Object.keys(r.formula.elements)).toHaveLength(0)
  })

  it('报告未知元素并定位', () => {
    const r = parseFormula('Xy2')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.message).toContain('未知元素')
    expect(r.error.pos).toBe(0)
  })

  it('报告空分组', () => {
    const r = parseFormula('H2()3')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.message).toContain('空分组')
  })

  it('报告非法下标 0', () => {
    const r = parseFormula('H0')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.message).toContain('下标')
  })

  it('报告括号不匹配', () => {
    expect((parseFormula('(H2O') as any).error.message).toContain('括号')
    expect((parseFormula('H2O)') as any).error.message).toContain('括号')
  })

  it('电荷只能出现在末尾', () => {
    expect(parseFormula('^+H2O').ok).toBe(false)
    expect(parseFormula('H2^+O').ok).toBe(false)
    expect(parseFormula('H2^0+').ok).toBe(false)
  })
})

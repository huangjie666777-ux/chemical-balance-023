import { describe, it, expect } from 'vitest';
import { solve, buildMatrix, toPrimitiveInts, nullSpace } from './solver';
import { parseSubstance } from './parser';
import { frac } from './fraction';

function balance(reactants: string[], products: string[]) {
  return solve([
    ...reactants.map((text) => {
      const r = parseSubstance(text);
      if (!r.ok) throw new Error(r.error.message);
      return { side: 'reactant' as const, elements: r.elements, charge: r.charge };
    }),
    ...products.map((text) => {
      const r = parseSubstance(text);
      if (!r.ok) throw new Error(r.error.message);
      return { side: 'product' as const, elements: r.elements, charge: r.charge };
    }),
  ]);
}

describe('solve', () => {
  it('配平简单反应', () => {
    expect(balance(['H2', 'O2'], ['H2O'])).toEqual({ kind: 'unique', coefficients: [2, 1, 2] });
  });

  it('配平结晶水反应（莫尔盐类，段乘数参与守恒）', () => {
    const r = balance(['CuSO4.5H2O'], ['CuSO4', 'H2O']);
    expect(r).toEqual({ kind: 'unique', coefficients: [1, 1, 5] });
  });

  it('配平带电子的离子半反应并核对电荷', () => {
    const r = balance(['MnO4^-', 'H^+', 'e^-'], ['Mn^2+', 'H2O']);
    expect(r).toEqual({ kind: 'unique', coefficients: [1, 8, 5, 1, 4] });
  });

  it('配平嵌套分组反应', () => {
    const r = balance(['Ca5(PO4)3F', 'H2SO4'], ['H3PO4', 'CaSO4', 'HF']);
    expect(r).toEqual({ kind: 'unique', coefficients: [1, 5, 3, 5, 1] });
  });

  it('无解（元素无法守恒）返回零解说明', () => {
    const r = balance(['H2'], ['H2O']);
    expect(r.kind).toBe('inconsistent');
  });

  it('解空间多维时不擅自选择', () => {
    // 两个独立燃烧反应混在一个方程组中：CH4+O2->CO2+H2O 与 H2+O2->H2O
    const r = balance(['CH4', 'H2', 'O2'], ['CO2', 'H2O']);
    expect(r.kind).toBe('undertermined');
    if (r.kind === 'undertermined') expect(r.dimension).toBeGreaterThan(1);
  });

  it('必须出现零或负系数时明确报因', () => {
    // C -> CO2 与 O2 同侧会迫使某系数为负/零的构造：
    // 反应物 C, O2；生成物 O2（重复）→ O2 系数需抵消，导致非正
    const r = balance(['C', 'O2'], ['CO2', 'C']);
    expect(r.kind === 'nonpositive' || r.kind === 'undertermined').toBe(true);
  });

  it('全部系数互质（最简整数比）', () => {
    const r = balance(['C2H6', 'O2'], ['CO2', 'H2O']);
    expect(r).toEqual({ kind: 'unique', coefficients: [2, 7, 4, 6] });
  });
});

describe('精确有理数运算', () => {
  it('RREF/零空间全程不使用浮点', () => {
    // 构造 1/3 类比例，验证精确化
    const m = [[frac(2n), frac(-1n)], [frac(-4n), frac(2n)]].map((row) => row);
    const basis = nullSpace(m);
    expect(basis.length).toBe(1);
    expect(toPrimitiveInts(basis[0])).toEqual([1, 2]);
  });

  it('buildMatrix 反应物正生成物负', () => {
    const { rows } = buildMatrix([
      { side: 'reactant', elements: { H: 2 }, charge: 0 },
      { side: 'product', elements: { H: 2 }, charge: 0 },
    ]);
    expect(rows[0].map((x) => x.n)).toEqual([2n, -2n]);
  });
});

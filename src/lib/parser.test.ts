import { describe, it, expect } from 'vitest';
import { parseSubstance, collectElementSpans } from './parser';

describe('parseSubstance', () => {
  it('解析普通分子式', () => {
    const r = parseSubstance('H2SO4');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.elements).toEqual({ H: 2, S: 1, O: 4 });
  });

  it('解析多层嵌套括号', () => {
    const r = parseSubstance('Ca3(Mg(CO3)2)2');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.elements).toEqual({ Ca: 3, Mg: 2, C: 4, O: 12 });
  });

  it('解析结晶水且段乘数只乘该段', () => {
    const r = parseSubstance('(NH4)2Fe(SO4)2.6H2O');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.elements).toEqual({ N: 2, H: 20, Fe: 1, S: 2, O: 14 });
      expect(r.charge).toBe(0);
    }
  });

  it('支持 Unicode 点号与无乘数点号', () => {
    const r = parseSubstance('CuSO4·H2O');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.elements.O).toBe(5);
  });

  it('解析电荷与电子', () => {
    expect((parseSubstance('SO4^2-') as any).charge).toBe(-2);
    expect((parseSubstance('Mg^2+') as any).charge).toBe(2);
    const e = parseSubstance('e^-');
    expect(e.ok).toBe(true);
    if (e.ok) { expect(e.charge).toBe(-1); expect(e.formula.isElectron).toBe(true); }
  });

  it('定位未知元素', () => {
    const r = parseSubstance('H2Xy');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain('未知元素');
      expect(r.error.start).toBe(2);
      expect(r.error.end).toBe(4);
    }
  });

  it('识别空分组', () => {
    const r = parseSubstance('H2()');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('空分组');
  });

  it('识别非法下标 0 与前导零', () => {
    expect((parseSubstance('H0') as any).error.message).toContain('下标');
    expect((parseSubstance('H02') as any).error.message).toContain('下标');
    expect((parseSubstance('CuSO4.0H2O') as any).error.message).toContain('结晶水');
  });

  it('识别括号不匹配', () => {
    expect((parseSubstance('(H2O') as any).error.message).toContain('括号不匹配');
    expect((parseSubstance('H2O)') as any).error.message).toContain('括号不匹配');
  });

  it('电荷只能位于末尾且格式合法', () => {
    expect((parseSubstance('H^2O') as any).error.message).toContain('电荷');
    expect((parseSubstance('H2^') as any).ok).toBe(false);
    expect((parseSubstance('H2^0+') as any).ok).toBe(false);
  });

  it('收集高亮 span 时含嵌套与段乘数', () => {
    const r = parseSubstance('Mg(OH)2.3H2O');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const spans = collectElementSpans(r.formula);
      const o = spans.filter((s) => s.element === 'O').map((s) => s.multiplier);
      expect(o).toEqual([2, 3]);
    }
  });
});

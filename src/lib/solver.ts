import { Fraction, frac, fzero, fadd, fmul, fneg, isZero, lcm, gcd } from './fraction';

export interface SubstanceInput {
  side: 'reactant' | 'product';
  // 元素 -> 每个分子原子数；charge 为净电荷；电子元素表为空
  elements: Record<string, number>;
  charge: number;
  isElectron?: boolean;
}

export type SolveStatus =
  | { kind: 'unique'; coefficients: number[] }
  | { kind: 'inconsistent'; reason: string }
  | { kind: 'nonpositive'; coefficients: number[]; reason: string }
  | { kind: 'undertermined'; dimension: number; reason: string };

// 建立守恒矩阵：每行一个守恒量（元素或电荷），每列一种物质。
// 反应物取正、生成物取负，方程为 A x = 0。
export function buildMatrix(subs: SubstanceInput[]): { rows: Fraction[][]; labels: string[] } {
  const elementSet = new Set<string>();
  for (const s of subs) Object.keys(s.elements).forEach((el) => elementSet.add(el));
  const elements = [...elementSet].sort();
  const labels = [...elements, '电荷'];
  const rows: Fraction[][] = labels.map(() => subs.map(() => fzero));
  subs.forEach((s, col) => {
    const sign = s.side === 'reactant' ? 1 : -1;
    elements.forEach((el, rowIdx) => {
      const v = s.elements[el] ?? 0;
      if (v) rows[rowIdx][col] = frac(BigInt(sign * v));
    });
    if (s.charge !== 0) rows[elements.length][col] = frac(BigInt(sign * s.charge));
  });
  return { rows, labels };
}

// 精确高斯-约当消元（bigint 有理数），返回列主元位置。
export function rref(a: Fraction[][]): number[] {
  const rows = a.length;
  const cols = a[0]?.length ?? 0;
  const pivots: number[] = [];
  let r = 0;
  for (let c = 0; c < cols && r < rows; c++) {
    let pivot = -1;
    for (let i = r; i < rows; i++) {
      if (!isZero(a[i][c])) { pivot = i; break; }
    }
    if (pivot === -1) continue;
    [a[r], a[pivot]] = [a[pivot], a[r]];
    const pv = a[r][c];
    // 归一化主元行
    for (let j = 0; j < cols; j++) a[r][j] = fdivLocal(a[r][j], pv);
    for (let i = 0; i < rows; i++) {
      if (i === r || isZero(a[i][c])) continue;
      const factor = a[i][c];
      for (let j = 0; j < cols; j++) a[i][j] = fadd(a[i][j], fmul(fneg(factor), a[r][j]));
    }
    pivots.push(c);
    r++;
  }
  return pivots;
}
function fdivLocal(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.d, a.d * b.n);
}

// 求整数矩阵 A 的零空间（有理数），返回零空间基（每个基向量长度为列数）。
export function nullSpace(matrix: Fraction[][]): Fraction[][] {
  const a = matrix.map((row) => [...row]);
  const cols = a[0]?.length ?? 0;
  const pivots = rref(a);
  const pivotSet = new Set(pivots);
  const freeCols: number[] = [];
  for (let c = 0; c < cols; c++) if (!pivotSet.has(c)) freeCols.push(c);
  return freeCols.map((free) => {
    const v: Fraction[] = Array.from({ length: cols }, () => fzero);
    v[free] = frac(1n);
    pivots.forEach((pc, r) => {
      v[pc] = fneg(a[r][free]);
    });
    return v;
  });
}

// 有理向量 -> 最简整数向量（乘分母最小公倍数，再约 gcd）
export function toPrimitiveInts(v: Fraction[]): number[] {
  let l = 1n;
  for (const x of v) l = lcm(l, x.d);
  let ints = v.map((x) => x.n * (l / x.d));
  let g = 0n;
  for (const x of ints) g = gcd(g, x);
  if (g !== 0n) ints = ints.map((x) => x / g);
  // 统一符号：首个非零为正
  const first = ints.find((x) => x !== 0n) ?? 1n;
  if (first < 0n) ints = ints.map((x) => -x);
  return ints.map((x) => Number(x));
}

export function solve(subs: SubstanceInput[]): SolveStatus {
  if (subs.length < 2) {
    return { kind: 'inconsistent', reason: '反应物和生成物至少各有一种物质' };
  }
  if (!subs.some((s) => s.side === 'reactant') || !subs.some((s) => s.side === 'product')) {
    return { kind: 'inconsistent', reason: '反应物和生成物至少各有一种物质' };
  }
  const { rows } = buildMatrix(subs);
  const basis = nullSpace(rows);
  if (basis.length === 0) {
    return {
      kind: 'inconsistent',
      reason: '守恒方程组只有零解：不存在能同时满足所有元素与电荷守恒的非零系数',
    };
  }
  if (basis.length > 1) {
    return {
      kind: 'undertermined',
      dimension: basis.length,
      reason: `守恒方程组的解空间有 ${basis.length} 个自由变量（零空间维数 ${basis.length}），配平系数不唯一，无法给出唯一的一组最简整数系数`,
    };
  }
  const coeffs = toPrimitiveInts(basis[0]);
  if (coeffs.some((x) => x <= 0)) {
    const zeroIdx = coeffs.findIndex((x) => x === 0);
    const negIdx = coeffs.findIndex((x) => x < 0);
    const reason = zeroIdx >= 0
      ? `第 ${zeroIdx + 1} 种物质的系数必须为 0，但配平要求每种物质都以正系数参与，故无可行配平`
      : `第 ${negIdx + 1} 种物质的系数必须为负（${coeffs[negIdx]}），说明它与所在一侧的守恒方向矛盾（可能应放到另一侧）`;
    return { kind: 'nonpositive', coefficients: coeffs, reason };
  }
  return { kind: 'unique', coefficients: coeffs };
}

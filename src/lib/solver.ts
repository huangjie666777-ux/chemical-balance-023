import type { ParsedFormula } from './parser'
import { Fraction, gcd } from './fraction'

export interface Species {
  /** 用户输入的原始文本 */
  raw: string
  formula: ParsedFormula
  side: 'left' | 'right'
}

export type BalanceResult =
  | { kind: 'unique'; coefficients: bigint[]; equationMatrix: string[][] }
  | { kind: 'no-solution'; reason: string }
  | { kind: 'has-nonpositive'; reason: string; sample: bigint[] }
  | { kind: 'infinite'; reason: string; dimension: number }

/**
 * 建立守恒方程 A·x = 0：
 * 列 = 各物质（保持用户顺序）；反应物取 +计数，生成物取 -计数。
 * 行 = 每个出现过的元素一行，外加电荷一行。
 */
export function buildMatrix(species: Species[]): Fraction[][] {
  const elementOrder: string[] = []
  const seen = new Set<string>()
  for (const sp of species) {
    for (const el of Object.keys(sp.formula.elements)) {
      if (!seen.has(el)) {
        seen.add(el)
        elementOrder.push(el)
      }
    }
  }
  const rows: Fraction[][] = []
  for (const el of elementOrder) {
    rows.push(
      species.map((sp) => {
        const v = sp.formula.elements[el] ?? 0n
        return new Fraction(sp.side === 'left' ? v : -v)
      }),
    )
  }
  rows.push(species.map((sp) => new Fraction(sp.side === 'left' ? sp.formula.charge : -sp.formula.charge)))
  return rows
}

/**
 * 对矩阵做高斯-若尔当消元（分数精确运算），
 * 返回零空间的一组基（基向量个数 = 列数 - 秩）。
 */
export function nullspaceBasis(matrix: Fraction[][], cols: number): Fraction[][] {
  const rows = matrix.map((r) => r.slice())
  const m = rows.length
  let r = 0
  const pivotCols: number[] = []
  for (let c = 0; c < cols && r < m; c++) {
    let pivot = -1
    for (let i = r; i < m; i++) {
      if (!rows[i][c].isZero()) {
        pivot = i
        break
      }
    }
    if (pivot === -1) continue
    const tmp = rows[r]
    rows[r] = rows[pivot]
    rows[pivot] = tmp
    const pv = rows[r][c]
    for (let j = 0; j < cols; j++) rows[r][j] = rows[r][j].div(pv)
    for (let i = 0; i < m; i++) {
      if (i === r) continue
      const f = rows[i][c]
      if (f.isZero()) continue
      for (let j = 0; j < cols; j++) rows[i][j] = rows[i][j].sub(f.mul(rows[r][j]))
    }
    pivotCols.push(c)
    r++
  }

  const freeCols: number[] = []
  const pivotSet = new Set(pivotCols)
  for (let c = 0; c < cols; c++) if (!pivotSet.has(c)) freeCols.push(c)

  return freeCols.map((fc) => {
    const v: Fraction[] = Array.from({ length: cols }, () => Fraction.zero)
    v[fc] = new Fraction(1n)
    pivotCols.forEach((pc, idx) => {
      v[pc] = rows[idx][fc].neg()
    })
    return v
  })
}

function toIntegerVector(v: Fraction[]): bigint[] {
  let lcm = 1n
  for (const f of v) lcm = (lcm * f.den) / gcd(lcm, f.den)
  return v.map((f) => f.num * (lcm / f.den))
}

function primitive(v: bigint[]): bigint[] {
  let g = 0n
  for (const x of v) g = gcd(g, x)
  if (g === 0n) return v
  return v.map((x) => x / g)
}

export function balance(species: Species[]): BalanceResult {
  if (species.length === 0) {
    return { kind: 'no-solution', reason: '两侧都没有录入物质。' }
  }
  if (!species.some((s) => s.side === 'left') || !species.some((s) => s.side === 'right')) {
    return { kind: 'no-solution', reason: '反应物和生成物两侧都必须至少有一种物质。' }
  }

  const matrix = buildMatrix(species)
  const basis = nullspaceBasis(matrix, species.length)

  if (basis.length === 0) {
    return {
      kind: 'no-solution',
      reason: '守恒方程组只有零解：不存在任何非零系数能同时满足全部元素与电荷守恒。请检查物质写法或反应本身是否成立。',
    }
  }

  if (basis.length > 1) {
    return {
      kind: 'infinite',
      dimension: basis.length,
      reason: `守恒方程组的解空间有 ${basis.length} 个自由度，存在无穷多组系数，无法确定唯一的最简配平。通常说明反应可拆成两个独立反应，或缺少约束（例如遗漏了物质）。`,
    }
  }

  const ints = primitive(toIntegerVector(basis[0]))
  const allPos = ints.every((x) => x > 0n)
  if (!allPos) {
    const reason =
      '唯一的守恒解中存在零或负系数：把负系数对应的物质移到等号另一侧才可能配平，但当前两侧划分下不能给出全为正的系数。请核对物质应放在反应物还是生成物一侧（电子 e^- 尤其要注意方向）。'
    return { kind: 'has-nonpositive', reason, sample: ints.map((x) => (x < 0n ? -x : x)) }
  }
  return {
    kind: 'unique',
    coefficients: ints,
    equationMatrix: matrix.map((row) =>
      row.map((f) => (f.den === 1n ? f.num.toString() : `${f.num}/${f.den}`)),
    ),
  }
}

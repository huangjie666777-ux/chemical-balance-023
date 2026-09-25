import { ELEMENTS } from './elements'

export type Vec = Record<string, bigint>

export interface ParsedFormula {
  /** 元素符号 -> 原子总数（全部在一个物质内累加，含结晶水各段） */
  elements: Vec
  /** 净电荷数：正数=正电荷，负数=负电荷，0=中性 */
  charge: bigint
  /** 每个元素的逐段贡献（下标乘分组后的结果），用于高亮追查 */
  contributions: Array<{ element: string; count: bigint; segment: number }>
  segmentCount: number
  isElectron: boolean
  /** 归一化显示文本（去空白） */
  normalized: string
}

export interface ParseError {
  message: string
  /** 出错位置（归一化字符串中的下标），便于定位 */
  pos: number
}

export type ParseResult =
  | { ok: true; formula: ParsedFormula }
  | { ok: false; error: ParseError }

function addVec(target: Vec, key: string, n: bigint): void {
  target[key] = (target[key] ?? 0n) + n
}

const OPEN = new Set(['(', '[', '{'])
const CLOSE = new Set([')', ']', '}'])
const MATCH: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

/**
 * 解析一个不含电荷、不含点号的公式片段（可含多层括号）。
 * 返回元素计数与每个元素的贡献列表。
 */
interface GroupResult {
  vec: Vec
  contributions: Array<{ element: string; count: bigint }>
}

function parseGroup(
  s: string,
  start: number,
  end: number,
): { result?: GroupResult; error?: ParseError } {
  const vec: Vec = {}
  const contributions: Array<{ element: string; count: bigint }> = []
  let i = start

  const emit = (v: Vec, contribs: GroupResult['contributions'], mult: bigint) => {
    for (const [k, val] of Object.entries(v)) addVec(vec, k, val * mult)
    for (const c of contribs) contributions.push({ element: c.element, count: c.count * mult })
  }

  while (i < end) {
    const ch = s[i]
    if (ch >= 'A' && ch <= 'Z') {
      let sym = ch
      let j = i + 1
      if (j < end && s[j] >= 'a' && s[j] <= 'z') {
        sym += s[j]
        j++
      }
      if (!ELEMENTS.has(sym)) {
        return { error: { message: `未知元素符号「${sym}」`, pos: i } }
      }
      const subResult = readSubscript(s, j, end)
      if (subResult.error || subResult.value === undefined) return { error: subResult.error! }
      const n = subResult.value
      i = subResult.next!
      addVec(vec, sym, n)
      contributions.push({ element: sym, count: n })
    } else if (OPEN.has(ch)) {
      const inner = findMatching(s, i, end)
      if (inner.error || inner.pos === undefined) return { error: inner.error! }
      const closePos = inner.pos
      if (closePos === i + 1) {
        return { error: { message: '空分组：括号内没有任何内容', pos: i } }
      }
      const parsed = parseGroup(s, i + 1, closePos)
      if (parsed.error) return parsed
      const subResult = readSubscript(s, closePos + 1, end)
      if (subResult.error || subResult.value === undefined) return { error: subResult.error! }
      const n = subResult.value
      i = subResult.next!
      emit(parsed.result!.vec, parsed.result!.contributions, n)
    } else if (CLOSE.has(ch)) {
      return { error: { message: `多余的闭括号「${ch}」`, pos: i } }
    } else if (ch === '^') {
      return { error: { message: '电荷标记「^」只能出现在整个化学式末尾', pos: i } }
    } else if (ch >= '0' && ch <= '9') {
      return { error: { message: '下标前缺少元素或闭括号', pos: i } }
    } else {
      return { error: { message: `无法识别的字符「${ch}」`, pos: i } }
    }
  }
  return { result: { vec, contributions } }
}

function readSubscript(
  s: string,
  j: number,
  end: number,
): { value?: bigint; next?: number; error?: ParseError } {
  if (j >= end || !(s[j] >= '0' && s[j] <= '9')) return { value: 1n, next: j }
  if (s[j] === '0') return { error: { message: '非法下标：下标必须为正整数，不能为 0', pos: j } }
  let k = j
  while (k < end && s[k] >= '0' && s[k] <= '9') k++
  return { value: BigInt(s.slice(j, k)), next: k }
}

function findMatching(
  s: string,
  openPos: number,
  end: number,
): { pos?: number; error?: ParseError } {
  const stack: string[] = [s[openPos]]
  for (let i = openPos + 1; i < end; i++) {
    const ch = s[i]
    if (OPEN.has(ch)) stack.push(ch)
    else if (CLOSE.has(ch)) {
      const top = stack.pop()
      if (top === undefined) return { error: { message: `多余的闭括号「${ch}」`, pos: i } }
      if (MATCH[ch] !== top) {
        return { error: { message: `括号不匹配：「${top}」对应的闭括号不是「${ch}」`, pos: i } }
      }
      if (stack.length === 0) return { pos: i }
    }
  }
  return { error: { message: `括号不匹配：缺少与「${s[openPos]}」配对的闭括号`, pos: openPos } }
}

function parseCharge(s: string, caretPos: number): { charge?: bigint; error?: ParseError } {
  // s[caretPos] === '^'，读到末尾
  let i = caretPos + 1
  // 合法写法：^+、^-、^2+、^3-（符号在前或在后均可，标准教材为数字在前符号在后）
  const digitsStart = i
  while (i < s.length && s[i] >= '0' && s[i] <= '9') i++
  let magnitude = 1n
  if (i > digitsStart) {
    if (s[digitsStart] === '0') {
      return { error: { message: '非法电荷：电荷量必须为正整数，不能写 0', pos: digitsStart } }
    }
    magnitude = BigInt(s.slice(digitsStart, i))
  }
  let sign = 0n
  if (s[i] === '+') sign = 1n
  else if (s[i] === '-') sign = -1n
  else {
    return { error: { message: '电荷必须以 + 或 - 结尾，例如 ^2+、^-', pos: i >= s.length ? caretPos : i } }
  }
  i++
  if (i !== s.length) {
    return { error: { message: '电荷后存在多余字符，电荷只能位于整个化学式末尾', pos: i } }
  }
  return { charge: sign * magnitude }
}

export function parseFormula(raw: string): ParseResult {
  const normalized = raw.replace(/\s+/g, '')
  if (normalized === '') {
    return { ok: false, error: { message: '物质为空', pos: 0 } }
  }
  if (normalized === 'e^-' || normalized === 'e') {
    return {
      ok: true,
      formula: {
        elements: {},
        charge: -1n,
        contributions: [],
        segmentCount: 1,
        isElectron: true,
        normalized: 'e^-',
      },
    }
  }

  let charge = 0n
  let body = normalized
  const caretPositions: number[] = []
  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i] === '^') caretPositions.push(i)
  }
  if (caretPositions.length > 1) {
    return { ok: false, error: { message: '存在多个电荷标记「^」，一个物质只能带一个电荷', pos: caretPositions[1] } }
  }
  if (caretPositions.length === 1) {
    const cp = caretPositions[0]
    const r = parseCharge(normalized, cp)
    if (r.error) return { ok: false, error: r.error }
    charge = r.charge!
    body = normalized.slice(0, cp)
    if (body === '') {
      return { ok: false, error: { message: '电荷前缺少化学式', pos: 0 } }
    }
  }

  // 点号分段（支持 ASCII '.' 与中文/中点 '·'）
  const segments = body.split(/[.·]/)
  const elements: Vec = {}
  const contributions: ParsedFormula['contributions'] = []
  let segmentIndex = 0
  for (const segRaw of segments) {
    if (segRaw === '') {
      const dotPos = nthDelimiterPos(body, segmentIndex)
      return { ok: false, error: { message: '结晶水点号两侧的物质段不能为空', pos: dotPos } }
    }
    // 段首可选的整数倍数（如 CuSO4·5H2O 中的 5），只乘本物质段
    let segStart = 0
    let segMult = 1n
    if (segRaw[0] >= '0' && segRaw[0] <= '9') {
      let k = 0
      while (k < segRaw.length && segRaw[k] >= '0' && segRaw[k] <= '9') k++
      if (segRaw[k] === undefined) {
        const offset = bodyOffsetOfSegment(body, segmentIndex)
        return { ok: false, error: { message: '段首倍数后缺少化学式', pos: offset } }
      }
      if (segRaw[0] === '0') {
        const offset = bodyOffsetOfSegment(body, segmentIndex)
        return { ok: false, error: { message: '非法倍数：段首倍数必须为正整数，不能为 0', pos: offset } }
      }
      segMult = BigInt(segRaw.slice(0, k))
      segStart = k
    }
    const parsed = parseGroup(segRaw, segStart, segRaw.length)
    if (parsed.error) {
      // 将段内位置换算为 body 中的位置
      const offset = bodyOffsetOfSegment(body, segmentIndex)
      return { ok: false, error: { message: parsed.error.message, pos: offset + parsed.error.pos } }
    }
    for (const [k, v] of Object.entries(parsed.result!.vec)) addVec(elements, k, v * segMult)
    for (const c of parsed.result!.contributions) {
      contributions.push({ element: c.element, count: c.count * segMult, segment: segmentIndex })
    }
    segmentIndex++
  }

  return {
    ok: true,
    formula: { elements, charge, contributions, segmentCount: segments.length, isElectron: false, normalized },
  }
}

function nthDelimiterPos(body: string, segmentIndex: number): number {
  let seg = 0
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '.' || body[i] === '·') {
      if (seg === segmentIndex) return i
      seg++
    }
  }
  return body.length
}

function bodyOffsetOfSegment(body: string, segmentIndex: number): number {
  let seg = 0
  for (let i = 0; i < body.length; i++) {
    if (seg === segmentIndex) return i
    if (body[i] === '.' || body[i] === '·') seg++
  }
  return 0
}

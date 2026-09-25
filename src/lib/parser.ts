import { KNOWN_ELEMENTS } from './elements';

// AST 节点。sub 为元素/分组后的下标（缺省 1）。
export type Node =
  | ({ kind: 'element'; symbol: string; sub: number } & Range)
  | ({ kind: 'group'; children: Node[]; sub: number } & Range);

interface Range { start: number; end: number }

export interface Segment {
  node: Node;          // 段内容（根为隐式 group，sub 恒为 1）
  multiplier: number;  // 点号后的段乘数，仅乘该段（如 5H2O 的 5）
  multStart: number;   // 段乘数文本区间；缺省 -1
  multEnd: number;
}

export interface ParsedFormula {
  segments: Segment[];
  charge: number;
  chargeStart: number;
  chargeEnd: number;
  isElectron: boolean;
}

export interface PositionedError {
  message: string;
  start: number; // 0-based，含
  end: number;   // 0-based，不含
}

export type ParseResult =
  | { ok: true; formula: ParsedFormula; elements: Record<string, number>; charge: number }
  | { ok: false; error: PositionedError };

export interface ElementSpan {
  element: string;
  start: number;
  end: number;
  multiplier: number; // 该符号的总贡献倍数（下标×外层分组×段乘数）
}

interface ChargeSuffix { value: number; start: number; end: number }

function isErr<T>(v: T | ParseResult): v is ParseResult {
  return typeof v === 'object' && v !== null && 'ok' in v && (v as ParseResult).ok === false;
}

export function parseSubstance(rawInput: string): ParseResult {
  const input = rawInput;
  let pos = 0;

  const err = (message: string, start: number, end: number = start + 1): ParseResult =>
    ({ ok: false, error: { message, start, end } });
  const peek = (): string => input[pos] ?? '';

  function readPositiveInt(what: string): number | ParseResult {
    const start = pos;
    let digits = '';
    while (/[0-9]/.test(peek())) { digits += peek(); pos++; }
    if (digits === '0') return err(`${what}必须为正整数，不能为 0`, start, start + 1);
    if (digits.length > 1 && digits[0] === '0') return err(`${what}不能以 0 开头`, start, pos);
    return Number(digits);
  }

  // 解析电荷后缀，调用时 input[start] === '^'
  function parseCharge(start: number): ChargeSuffix | ParseResult {
    pos = start + 1;
    let digits = '';
    const dStart = pos;
    while (/[0-9]/.test(peek())) { digits += peek(); pos++; }
    const sign = peek();
    if (sign !== '+' && sign !== '-') {
      return err('电荷格式错误：应为 ^+、^-、^2+ 或 ^2- 形式', start, input.length);
    }
    if (digits === '0') return err('电荷数值不能为 0', dStart, dStart + 1);
    if (digits.length > 1 && digits[0] === '0') return err('电荷数字不能以 0 开头', dStart, pos);
    pos++;
    if (pos !== input.length) return err('电荷只能写在整个化学式末尾', pos, input.length);
    const magnitude = digits === '' ? 1 : Number(digits);
    return { value: sign === '+' ? magnitude : -magnitude, start, end: pos };
  }

  function parseItem(): Node | ParseResult {
    const start = pos;
    const ch = peek();
    let node: Node;
    if (ch === '(') {
      pos++;
      const children: Node[] = [];
      while (peek() !== ')') {
        if (peek() === '') return err('括号不匹配：缺少右括号 “)”', start, start + 1);
        if (peek() === '.' || peek() === '·') return err('点号只能分隔完整的结晶水段，不能出现在括号内', pos);
        if (peek() === '^') return err('电荷只能写在整个化学式末尾', pos);
        const child = parseItem();
        if (isErr(child)) return child;
        children.push(child);
      }
      if (children.length === 0) return err('空分组：括号内必须包含元素', start, pos + 1);
      pos++; // 跳过 ')'，此时 pos 指向 ')' 之后
      node = { kind: 'group', children, sub: 1, start, end: pos };
    } else if (/[A-Z]/.test(ch)) {
      let symbol = ch;
      pos++;
      if (/[a-z]/.test(peek())) { symbol += peek(); pos++; }
      if (!KNOWN_ELEMENTS.has(symbol)) return err(`未知元素符号 “${symbol}”`, start, pos);
      node = { kind: 'element', symbol, sub: 1, start, end: pos };
    } else if (/[0-9]/.test(ch)) {
      return err('非法下标：数字必须紧跟在元素符号或右括号之后', pos);
    } else if (ch === ')') {
      return err('括号不匹配：存在多余的右括号 “)”', pos);
    } else if (ch === '^') {
      return err('电荷只能写在整个化学式末尾', pos);
    } else {
      return err(`非法字符 “${ch}”`, pos);
    }
    // 下标
    if (/[0-9]/.test(peek())) {
      const sub = readPositiveInt('非法下标：下标');
      if (typeof sub !== 'number') return sub;
      node.sub = sub;
      node.end = pos;
    }
    return node;
  }

  // 解析一段（点号之间的内容），入口 pos 指向段首
  function parseSegment(start: number): Node | ParseResult {
    const children: Node[] = [];
    for (;;) {
      const ch = peek();
      if (ch === '' || ch === '.' || ch === '·' || ch === '^' || ch === ')') break;
      const child = parseItem();
      if (isErr(child)) return child;
      children.push(child);
    }
    if (children.length === 0) return err('点号两侧必须有化学式内容', start, Math.min(input.length, start + 1));
    return { kind: 'group', children, sub: 1, start, end: pos };
  }

  if (input.trim() === '') return err('物质不能为空', 0, Math.max(input.length, 1));

  // 电子 e^- 特例（也接受裸 e）
  if (input[0] === 'e' && (input.length === 1 || input[1] === '^')) {
    let charge = 0;
    let chargeStart = -1;
    let chargeEnd = -1;
    if (input.length > 1) {
      const cr = parseCharge(1);
      if (isErr(cr)) return cr;
      charge = cr.value; chargeStart = cr.start; chargeEnd = cr.end;
    }
    if (charge > 0) return err('电子写作 e^-，正电荷粒子不是电子', chargeStart, chargeEnd);
    return {
      ok: true,
      formula: { segments: [], charge, chargeStart, chargeEnd, isElectron: charge === -1 },
      elements: {},
      charge,
    };
  }

  const segments: Segment[] = [];
  for (;;) {
    const segStart = pos;
    const segNode = parseSegment(segStart);
    if (isErr(segNode)) return segNode;
    let multiplier = 1;
    let multStart = -1;
    let multEnd = -1;
    if (peek() === '.' || peek() === '·') {
      // 先压入当前段（乘数 1），再解析点号后的段乘数与下一段
      segments.push({ node: segNode, multiplier: 1, multStart: -1, multEnd: -1 });
      pos++;
      if (peek() === '' ) return err('点号后缺少化学式内容', pos - 1, pos);
      if (/[0-9]/.test(peek())) {
        const mStart = pos;
        const mult = readPositiveInt('非法结晶水倍数：倍数');
        if (isErr(mult)) return mult;
        multiplier = mult; multStart = mStart; multEnd = pos;
      }
      const nextStart = pos;
      const nextNode = parseSegment(nextStart);
      if (isErr(nextNode)) return nextNode;
      segments.push({ node: nextNode, multiplier, multStart, multEnd });
      if (peek() === '.' || peek() === '·') continue;
      break;
    }
    segments.push({ node: segNode, multiplier, multStart, multEnd });
    break;
  }

  let charge = 0;
  let chargeStart = -1;
  let chargeEnd = -1;
  if (peek() === '^') {
    const cr = parseCharge(pos);
    if (isErr(cr)) return cr;
    charge = cr.value; chargeStart = cr.start; chargeEnd = cr.end;
  }
  if (peek() === ')') return err('括号不匹配：存在多余的右括号 “)”', pos);
  if (pos < input.length) return err(`非法字符 “${input[pos]}”`, pos);

  const elements: Record<string, number> = {};
  for (const seg of segments) tally(seg.node, seg.multiplier, elements);
  return {
    ok: true,
    formula: { segments, charge, chargeStart, chargeEnd, isElectron: false },
    elements,
    charge,
  };
}

function tally(node: Node, mult: number, counts: Record<string, number>): void {
  if (node.kind === 'element') {
    counts[node.symbol] = (counts[node.symbol] ?? 0) + node.sub * mult;
  } else {
    for (const child of node.children) tally(child, mult * node.sub, counts);
  }
}

// 收集每个元素符号的字符区间及最终倍数，供高亮与贡献追查使用。
export function collectElementSpans(formula: ParsedFormula): ElementSpan[] {
  const spans: ElementSpan[] = [];
  const walk = (node: Node, mult: number) => {
    if (node.kind === 'element') {
      spans.push({ element: node.symbol, start: node.start, end: node.end, multiplier: mult * node.sub });
    } else {
      for (const child of node.children) walk(child, mult * node.sub);
    }
  };
  for (const seg of formula.segments) walk(seg.node, seg.multiplier);
  return spans;
}

export function isBlankSubstance(raw: string): boolean {
  return raw.trim() === '';
}

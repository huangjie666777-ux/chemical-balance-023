import { ParsedFormula } from './parser';

export type TokenKind = 'plain' | 'element' | 'sub' | 'dot' | 'segMult' | 'charge';

export interface Token {
  kind: TokenKind;
  text: string;
  start: number; // 对应原始输入区间
  end: number;
}

const SUP: Record<string, string> = {
  '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹',
  '+':'⁺','-':'⁻',
};

function toSuperscript(s: string): string {
  return [...s].map((ch) => SUP[ch] ?? ch).join('');
}

// 下标数字区间：元素符号或右括号之后紧跟的数字（排除点号后的段乘数与电荷数字）
export function subscriptRanges(raw: string, formula: ParsedFormula): Set<number> {
  const skip = new Set<number>();
  for (const seg of formula.segments) {
    for (let i = seg.multStart; i >= 0 && i < seg.multEnd; i++) skip.add(i);
  }
  if (formula.chargeStart >= 0) {
    for (let i = formula.chargeStart; i < formula.chargeEnd; i++) skip.add(i);
  }
  const set = new Set<number>();
  for (let i = 0; i < raw.length; i++) {
    if (!/[0-9]/.test(raw[i]) || skip.has(i) || (i > 0 && /[0-9]/.test(raw[i - 1]))) continue;
    const prev = raw[i - 1] ?? '';
    if (/[a-zA-Z)]/.test(prev)) {
      let k = i;
      while (/[0-9]/.test(raw[k] ?? '')) { set.add(k); k++; }
    }
  }
  return set;
}

// 生成展示 token：下标变小、段乘数变小、电荷转 Unicode 上标、点号统一为 ·
export function tokenize(raw: string, formula: ParsedFormula): Token[] {
  const subRanges = subscriptRanges(raw, formula);
  const multRanges = new Set<number>();
  for (const seg of formula.segments) {
    for (let i = seg.multStart; i >= 0 && i < seg.multEnd; i++) multRanges.add(i);
  }
  const chargeSet = new Set<number>();
  for (let i = formula.chargeStart; i >= 0 && i < formula.chargeEnd; i++) chargeSet.add(i);

  const tokens: Token[] = [];
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '.' || ch === '·') {
      tokens.push({ kind: 'dot', text: '·', start: i, end: i + 1 });
    } else if (chargeSet.has(i)) {
      if (ch === '^') continue;
      tokens.push({ kind: 'charge', text: toSuperscript(ch), start: i, end: i + 1 });
    } else if (subRanges.has(i)) {
      tokens.push({ kind: 'sub', text: ch, start: i, end: i + 1 });
    } else if (multRanges.has(i)) {
      tokens.push({ kind: 'segMult', text: ch, start: i, end: i + 1 });
    } else {
      tokens.push({ kind: 'plain', text: ch, start: i, end: i + 1 });
    }
  }
  const out: Token[] = [];
  for (const t of tokens) {
    const last = out[out.length - 1];
    if (last && last.kind === t.kind && last.end === t.start) {
      last.text += t.text;
      last.end = t.end;
    } else {
      out.push({ ...t });
    }
  }
  return out;
}

// 复制用规范化文本（保留 ^ 电荷写法，· 统一为 .）
export function plainFormula(raw: string): string {
  return raw.replaceAll('·', '.').trim();
}

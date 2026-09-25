// 精确有理数：分子分母均为 bigint，分母恒正，构造时约分。
export interface Fraction {
  readonly n: bigint;
  readonly d: bigint;
}

export function absBig(x: bigint): bigint {
  return x < 0n ? -x : x;
}

export function gcd(a: bigint, b: bigint): bigint {
  a = absBig(a); b = absBig(b);
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

export function lcm(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n;
  return absBig(a) / gcd(a, b) * absBig(b);
}

export function frac(n: bigint, d: bigint = 1n): Fraction {
  if (d === 0n) throw new Error('分母不能为零');
  if (d < 0n) { n = -n; d = -d; }
  if (n === 0n) return { n: 0n, d: 1n };
  const g = gcd(absBig(n), d);
  return { n: n / g, d: d / g };
}

export const fzero: Fraction = { n: 0n, d: 1n };

export function fadd(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function fsub(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function fmul(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.n, a.d * b.d);
}

export function fdiv(a: Fraction, b: Fraction): Fraction {
  if (b.n === 0n) throw new Error('不能除以零');
  return frac(a.n * b.d, a.d * b.n);
}

export function fneg(a: Fraction): Fraction {
  return { n: -a.n, d: a.d };
}

export function isZero(a: Fraction): boolean {
  return a.n === 0n;
}

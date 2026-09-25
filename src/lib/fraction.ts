/** 精确有理数：BigInt 分子 / 正 BigInt 分母，始终约分。 */
export class Fraction {
  constructor(public readonly num: bigint, public readonly den: bigint = 1n) {
    if (den === 0n) throw new Error('分母不能为 0')
  }

  static zero = new Fraction(0n)

  normalize(): Fraction {
    if (this.num === 0n) return Fraction.zero
    const g = gcd(this.num < 0n ? -this.num : this.num, this.den)
    const den = this.den / g
    if (den === 1n) return new Fraction(this.num / g)
    return new Fraction(this.num / g, den)
  }

  add(o: Fraction): Fraction {
    return new Fraction(this.num * o.den + o.num * this.den, this.den * o.den).normalize()
  }

  sub(o: Fraction): Fraction {
    return new Fraction(this.num * o.den - o.num * this.den, this.den * o.den).normalize()
  }

  mul(o: Fraction): Fraction {
    return new Fraction(this.num * o.num, this.den * o.den).normalize()
  }

  div(o: Fraction): Fraction {
    if (o.num === 0n) throw new Error('不能除以 0')
    const num = this.num * o.den
    const den = this.den * o.num
    return new Fraction(den < 0n ? -num : num, den < 0n ? -den : den).normalize()
  }

  neg(): Fraction {
    return new Fraction(-this.num, this.den)
  }

  isZero(): boolean {
    return this.num === 0n
  }

  isPositive(): boolean {
    return this.num > 0n
  }

  isNegative(): boolean {
    return this.num < 0n
  }
}

export function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y !== 0n) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

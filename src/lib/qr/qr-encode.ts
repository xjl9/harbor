/**
 * Dependency-free QR Code encoder (byte mode only) plus an SVG renderer.
 *
 * A faithful port of Nayuki's public-domain QR-Code-generator (byte segment
 * path only, which is all the setup code needs - base64url text falls outside
 * QR alphanumeric mode). Kept framework-independent so it can render a code as
 * a self-contained SVG string with no npm dependency. Reference:
 * https://www.nayuki.io/page/qr-code-generator-library
 *
 * encodeQr returns null instead of throwing when the text will not fit the
 * largest version, so callers can gracefully fall back to a copyable code.
 */

export type QrEcc = "L" | "M" | "Q" | "H";

const MIN_VERSION = 1;
const MAX_VERSION = 40;

type EccSpec = { ordinal: number; formatBits: number };
const ECC: Record<QrEcc, EccSpec> = {
  L: { ordinal: 0, formatBits: 1 },
  M: { ordinal: 1, formatBits: 0 },
  Q: { ordinal: 2, formatBits: 3 },
  H: { ordinal: 3, formatBits: 2 },
};

// prettier-ignore
const ECC_CODEWORDS_PER_BLOCK: number[][] = [
  [-1,  7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
// prettier-ignore
const NUM_ERROR_CORRECTION_BLOCKS: number[][] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4,  4,  4,  4,  4,  6,  6,  6,  6,  7,  8,  8,  9,  9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5,  5,  8,  9,  9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8,  8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

function getBit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

function appendBits(val: number, len: number, bb: number[]): void {
  for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
}

function getNumRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function getNumDataCodewords(ver: number, eccOrdinal: number): number {
  return (
    Math.floor(getNumRawDataModules(ver) / 8) -
    ECC_CODEWORDS_PER_BLOCK[eccOrdinal][ver] *
      NUM_ERROR_CORRECTION_BLOCKS[eccOrdinal][ver]
  );
}

function reedSolomonMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function reedSolomonComputeDivisor(degree: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < degree - 1; i++) result.push(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = reedSolomonMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = reedSolomonMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonComputeRemainder(
  data: number[],
  divisor: number[],
): number[] {
  const result: number[] = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach(
      (coef, i) => (result[i] ^= reedSolomonMultiply(coef, factor)),
    );
  }
  return result;
}

function toUtf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

/** Byte-mode char-count bits: 8 for versions 1-9, otherwise 16. */
function byteCharCountBits(ver: number): number {
  return ver <= 9 ? 8 : 16;
}

class QrMatrix {
  readonly size: number;
  readonly modules: boolean[][] = [];
  private isFunction: boolean[][] = [];
  private readonly version: number;
  private readonly eccFormatBits: number;

  constructor(version: number, eccFormatBits: number, dataCodewords: number[]) {
    this.version = version;
    this.eccFormatBits = eccFormatBits;
    this.size = version * 4 + 17;
    for (let i = 0; i < this.size; i++) {
      this.modules.push(new Array<boolean>(this.size).fill(false));
      this.isFunction.push(new Array<boolean>(this.size).fill(false));
    }
    this.drawFunctionPatterns();
    this.drawCodewords(dataCodewords);
    this.selectAndApplyBestMask();
    this.isFunction = [];
  }

  private setFunctionModule(x: number, y: number, isDark: boolean): void {
    this.modules[y][x] = isDark;
    this.isFunction[y][x] = true;
  }

  private drawFunctionPatterns(): void {
    for (let i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);
    const pos = this.getAlignmentPatternPositions();
    const n = pos.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (!(
          (i === 0 && j === 0) ||
          (i === 0 && j === n - 1) ||
          (i === n - 1 && j === 0)
        ))
          this.drawAlignmentPattern(pos[i], pos[j]);
      }
    }
    this.drawFormatBits(0);
    this.drawVersion();
  }

  private drawFinderPattern(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size)
          this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
      }
    }
  }

  private drawAlignmentPattern(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++)
        this.setFunctionModule(
          x + dx,
          y + dy,
          Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
        );
    }
  }

  private getAlignmentPatternPositions(): number[] {
    if (this.version === 1) return [];
    const numAlign = Math.floor(this.version / 7) + 2;
    const step =
      Math.floor((this.version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) *
      2;
    const result: number[] = [6];
    for (let p = this.size - 7; result.length < numAlign; p -= step)
      result.splice(1, 0, p);
    return result;
  }

  private drawFormatBits(mask: number): void {
    const data = (this.eccFormatBits << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) this.setFunctionModule(8, i, getBit(bits, i));
    this.setFunctionModule(8, 7, getBit(bits, 6));
    this.setFunctionModule(8, 8, getBit(bits, 7));
    this.setFunctionModule(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++)
      this.setFunctionModule(14 - i, 8, getBit(bits, i));
    for (let i = 0; i < 8; i++)
      this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++)
      this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i));
    this.setFunctionModule(8, this.size - 8, true);
  }

  private drawVersion(): void {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const color = getBit(bits, i);
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunctionModule(a, b, color);
      this.setFunctionModule(b, a, color);
    }
  }

  private drawCodewords(data: number[]): void {
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  private applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invert: boolean;
        switch (mask) {
          case 0:
            invert = (x + y) % 2 === 0;
            break;
          case 1:
            invert = y % 2 === 0;
            break;
          case 2:
            invert = x % 3 === 0;
            break;
          case 3:
            invert = (x + y) % 3 === 0;
            break;
          case 4:
            invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
            break;
          case 5:
            invert = ((x * y) % 2) + ((x * y) % 3) === 0;
            break;
          case 6:
            invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
          default:
            invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
        }
        if (!this.isFunction[y][x] && invert)
          this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  private selectAndApplyBestMask(): void {
    let best = 0;
    let minPenalty = Infinity;
    for (let m = 0; m < 8; m++) {
      this.applyMask(m);
      this.drawFormatBits(m);
      const penalty = this.getPenaltyScore();
      if (penalty < minPenalty) {
        best = m;
        minPenalty = penalty;
      }
      this.applyMask(m);
    }
    this.applyMask(best);
    this.drawFormatBits(best);
  }

  private finderPenaltyCountPatterns(rh: number[]): number {
    const n = rh[1];
    const core =
      n > 0 && rh[2] === n && rh[3] === n * 3 && rh[4] === n && rh[5] === n;
    return (
      (core && rh[0] >= n * 4 && rh[6] >= n ? 1 : 0) +
      (core && rh[6] >= n * 4 && rh[0] >= n ? 1 : 0)
    );
  }

  private finderPenaltyAddHistory(run: number, rh: number[]): void {
    if (rh[0] === 0) run += this.size;
    rh.pop();
    rh.unshift(run);
  }

  private finderPenaltyTerminateAndCount(
    color: boolean,
    run: number,
    rh: number[],
  ): number {
    if (color) {
      this.finderPenaltyAddHistory(run, rh);
      run = 0;
    }
    run += this.size;
    this.finderPenaltyAddHistory(run, rh);
    return this.finderPenaltyCountPatterns(rh);
  }

  private getPenaltyScore(): number {
    let result = 0;
    for (let y = 0; y < this.size; y++) {
      let color = false;
      let run = 0;
      let rh = [0, 0, 0, 0, 0, 0, 0];
      for (let x = 0; x < this.size; x++) {
        if (this.modules[y][x] === color) {
          run++;
          if (run === 5) result += PENALTY_N1;
          else if (run > 5) result++;
        } else {
          this.finderPenaltyAddHistory(run, rh);
          if (!color)
            result += this.finderPenaltyCountPatterns(rh) * PENALTY_N3;
          color = this.modules[y][x];
          run = 1;
        }
      }
      result +=
        this.finderPenaltyTerminateAndCount(color, run, rh) * PENALTY_N3;
    }
    for (let x = 0; x < this.size; x++) {
      let color = false;
      let run = 0;
      let rh = [0, 0, 0, 0, 0, 0, 0];
      for (let y = 0; y < this.size; y++) {
        if (this.modules[y][x] === color) {
          run++;
          if (run === 5) result += PENALTY_N1;
          else if (run > 5) result++;
        } else {
          this.finderPenaltyAddHistory(run, rh);
          if (!color)
            result += this.finderPenaltyCountPatterns(rh) * PENALTY_N3;
          color = this.modules[y][x];
          run = 1;
        }
      }
      result +=
        this.finderPenaltyTerminateAndCount(color, run, rh) * PENALTY_N3;
    }
    for (let y = 0; y < this.size - 1; y++) {
      for (let x = 0; x < this.size - 1; x++) {
        const c = this.modules[y][x];
        if (
          c === this.modules[y][x + 1] &&
          c === this.modules[y + 1][x] &&
          c === this.modules[y + 1][x + 1]
        )
          result += PENALTY_N2;
      }
    }
    let dark = 0;
    for (const row of this.modules) for (const c of row) if (c) dark++;
    const total = this.size * this.size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * PENALTY_N4;
    return result;
  }
}

function addEccAndInterleave(
  version: number,
  eccOrdinal: number,
  data: number[],
): number[] {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[eccOrdinal][version];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[eccOrdinal][version];
  const rawCodewords = Math.floor(getNumRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const blocks: number[][] = [];
  const rsDiv = reedSolomonComputeDivisor(blockEccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(
      k,
      k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1),
    );
    k += dat.length;
    const ecc = reedSolomonComputeRemainder(dat, rsDiv);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks)
        result.push(block[i]);
    });
  }
  return result;
}

/** Encode text as a byte-mode QR. Returns the module grid, or null if too long. */
export function encodeQr(text: string, ecl: QrEcc = "M"): boolean[][] | null {
  const bytes = toUtf8Bytes(text);
  let ecc = ECC[ecl];

  let version = -1;
  for (let v = MIN_VERSION; v <= MAX_VERSION; v++) {
    const capacityBits = getNumDataCodewords(v, ecc.ordinal) * 8;
    const usedBits = 4 + byteCharCountBits(v) + bytes.length * 8;
    if (usedBits <= capacityBits) {
      version = v;
      break;
    }
  }
  if (version < 0) return null;

  // Boost ECC to the highest level the data still fits at this version.
  for (const spec of [ECC.M, ECC.Q, ECC.H]) {
    const usedBits = 4 + byteCharCountBits(version) + bytes.length * 8;
    if (usedBits <= getNumDataCodewords(version, spec.ordinal) * 8) ecc = spec;
  }

  const bb: number[] = [];
  appendBits(0x4, 4, bb); // byte mode
  appendBits(bytes.length, byteCharCountBits(version), bb);
  for (const b of bytes) appendBits(b, 8, bb);

  const capacityBits = getNumDataCodewords(version, ecc.ordinal) * 8;
  appendBits(0, Math.min(4, capacityBits - bb.length), bb);
  appendBits(0, (8 - (bb.length % 8)) % 8, bb);
  for (let pad = 0xec; bb.length < capacityBits; pad ^= 0xec ^ 0x11)
    appendBits(pad, 8, bb);

  const dataCodewords: number[] = new Array(bb.length / 8).fill(0);
  bb.forEach((bit, i) => (dataCodewords[i >>> 3] |= bit << (7 - (i & 7))));

  const allCodewords = addEccAndInterleave(version, ecc.ordinal, dataCodewords);
  const qr = new QrMatrix(version, ecc.formatBits, allCodewords);
  return qr.modules;
}

/**
 * Render text as a self-contained QR SVG string (theme-neutral: dark modules use
 * currentColor, light stays transparent). Returns null when the text is too long
 * to encode, so the caller can fall back to the copyable code alone.
 */
export function qrToSvg(
  text: string,
  opts: { ecc?: QrEcc; border?: number } = {},
): string | null {
  const modules = encodeQr(text, opts.ecc ?? "M");
  if (!modules) return null;
  const border = opts.border ?? 4;
  const size = modules.length + border * 2;
  let path = "";
  for (let y = 0; y < modules.length; y++) {
    for (let x = 0; x < modules.length; x++) {
      if (modules[y][x]) path += `M${x + border},${y + border}h1v1h-1z`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `shape-rendering="crispEdges" preserveAspectRatio="xMidYMid meet">` +
    `<path d="${path}" fill="currentColor"/></svg>`
  );
}

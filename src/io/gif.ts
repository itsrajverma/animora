/**
 * Minimal animated GIF89a encoder: one global palette built by median cut from
 * sampled frames, LZW-compressed frames, optional transparency.
 */

type Box = { pts: number[]; rMin: number; rMax: number; gMin: number; gMax: number; bMin: number; bMax: number };

/** 15-bit color key (5 bits per channel). */
const key15 = (r: number, g: number, b: number) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

function boxOf(pts: number[]): Box {
  const b: Box = { pts, rMin: 31, rMax: 0, gMin: 31, gMax: 0, bMin: 31, bMax: 0 };
  for (const k of pts) {
    const r = k >> 10, g = (k >> 5) & 31, bl = k & 31;
    if (r < b.rMin) b.rMin = r;
    if (r > b.rMax) b.rMax = r;
    if (g < b.gMin) b.gMin = g;
    if (g > b.gMax) b.gMax = g;
    if (bl < b.bMin) b.bMin = bl;
    if (bl > b.bMax) b.bMax = bl;
  }
  return b;
}

/** Median-cut palette (up to `max` colors) from a 15-bit color histogram. */
export function buildPalette(hist: Uint32Array, max: number): number[][] {
  const keys: number[] = [];
  for (let k = 0; k < hist.length; k++) if (hist[k]) keys.push(k);
  if (!keys.length) return [[0, 0, 0]];
  let boxes = [boxOf(keys)];
  while (boxes.length < max) {
    let best = -1, bestScore = 0;
    boxes.forEach((b, i) => {
      if (b.pts.length < 2) return;
      const span = Math.max(b.rMax - b.rMin, b.gMax - b.gMin, b.bMax - b.bMin);
      const weight = b.pts.reduce((s, k) => s + hist[k], 0);
      const score = span * Math.log2(weight + 2);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best < 0) break;
    const b = boxes[best];
    const rs = b.rMax - b.rMin, gs = b.gMax - b.gMin, bs = b.bMax - b.bMin;
    const ch = rs >= gs && rs >= bs ? 10 : gs >= bs ? 5 : 0;
    const sorted = [...b.pts].sort((x, y) => ((x >> ch) & 31) - ((y >> ch) & 31));
    // Split at the weighted median.
    const total = sorted.reduce((s, k) => s + hist[k], 0);
    let acc = 0, cut = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      acc += hist[sorted[i]];
      if (acc >= total / 2) {
        cut = i + 1;
        break;
      }
    }
    boxes = [...boxes.slice(0, best), boxOf(sorted.slice(0, cut)), boxOf(sorted.slice(cut)), ...boxes.slice(best + 1)];
  }
  return boxes.map((b) => {
    let r = 0, g = 0, bl = 0, w = 0;
    for (const k of b.pts) {
      const c = hist[k];
      r += (k >> 10) * c;
      g += ((k >> 5) & 31) * c;
      bl += (k & 31) * c;
      w += c;
    }
    const s = (v: number) => Math.min(255, Math.round((v / w) * 8.225));
    return [s(r), s(g), s(bl)];
  });
}

class ByteWriter {
  buf: number[] = [];
  byte(b: number) {
    this.buf.push(b & 255);
  }
  word(w: number) {
    this.byte(w);
    this.byte(w >> 8);
  }
  str(s: string) {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }
}

function lzw(indices: Uint8Array, minCode: number, out: ByteWriter) {
  out.byte(minCode);
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1;
  let dict = new Map<number, number>();
  let cur = 0, bits = 0;
  const block: number[] = [];
  const emit = (code: number) => {
    cur |= code << bits;
    bits += size;
    while (bits >= 8) {
      block.push(cur & 255);
      cur >>>= 8;
      bits -= 8;
      if (block.length === 255) {
        out.byte(255);
        for (const b of block) out.byte(b);
        block.length = 0;
      }
    }
  };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const c = indices[i];
    const k = (prefix << 8) | c;
    const hit = dict.get(k);
    if (hit !== undefined) {
      prefix = hit;
      continue;
    }
    emit(prefix);
    if (next < 4096) {
      dict.set(k, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      emit(clear);
      dict = new Map();
      size = minCode + 1;
      next = eoi + 1;
    }
    prefix = c;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) block.push(cur & 255);
  if (block.length) {
    out.byte(block.length);
    for (const b of block) out.byte(b);
  }
  out.byte(0);
}

export interface GifOptions {
  width: number;
  height: number;
  /** Delay per frame in seconds. */
  delay: number;
  /** 0 = loop forever. */
  loops: number;
  transparent: boolean;
}

/** Encode RGBA frames (all width × height) into a GIF. */
export function encodeGif(frames: Uint8ClampedArray[], o: GifOptions): Uint8Array<ArrayBuffer> {
  const hist = new Uint32Array(32768);
  const step = Math.max(1, Math.floor((frames.length * o.width * o.height) / 400_000));
  for (const f of frames) for (let i = 0; i < f.length; i += 4 * step) if (!o.transparent || f[i + 3] >= 128) hist[key15(f[i], f[i + 1], f[i + 2])]++;
  const reserve = o.transparent ? 1 : 0;
  const pal = buildPalette(hist, 256 - reserve);
  const colors = o.transparent ? [[0, 0, 0], ...pal] : pal;
  let bitsPer = 1;
  while (1 << bitsPer < colors.length) bitsPer++;
  const tableSize = 1 << bitsPer;
  const cache = new Int16Array(32768).fill(-1);
  const nearest = (k: number) => {
    const hit = cache[k];
    if (hit >= 0) return hit;
    const r = (k >> 10) << 3, g = ((k >> 5) & 31) << 3, b = (k & 31) << 3;
    let best = reserve, bd = Infinity;
    for (let i = reserve; i < colors.length; i++) {
      const c = colors[i];
      const d = (c[0] - r) ** 2 * 2 + (c[1] - g) ** 2 * 4 + (c[2] - b) ** 2 * 3;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    cache[k] = best;
    return best;
  };

  const w = new ByteWriter();
  w.str('GIF89a');
  w.word(o.width);
  w.word(o.height);
  w.byte(0x80 | ((bitsPer - 1) << 4) | (bitsPer - 1));
  w.byte(0);
  w.byte(0);
  for (let i = 0; i < tableSize; i++) {
    const c = colors[i] ?? [0, 0, 0];
    w.byte(c[0]);
    w.byte(c[1]);
    w.byte(c[2]);
  }
  // Netscape looping extension.
  w.byte(0x21); w.byte(0xff); w.byte(11); w.str('NETSCAPE2.0'); w.byte(3); w.byte(1); w.word(o.loops); w.byte(0);

  const delay = Math.max(2, Math.round(o.delay * 100));
  const idx = new Uint8Array(o.width * o.height);
  for (const f of frames) {
    for (let p = 0, i = 0; p < idx.length; p++, i += 4) idx[p] = o.transparent && f[i + 3] < 128 ? 0 : nearest(key15(f[i], f[i + 1], f[i + 2]));
    // Graphic control: disposal "restore to background" when transparent so frames don't pile up.
    w.byte(0x21); w.byte(0xf9); w.byte(4);
    w.byte((o.transparent ? 2 << 2 : 1 << 2) | (o.transparent ? 1 : 0));
    w.word(delay);
    w.byte(0);
    w.byte(0);
    w.byte(0x2c);
    w.word(0); w.word(0); w.word(o.width); w.word(o.height);
    w.byte(0);
    lzw(idx, Math.max(2, bitsPer), w);
  }
  w.byte(0x3b);
  return new Uint8Array(w.buf);
}

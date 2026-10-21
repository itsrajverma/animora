import type { Doc } from '../model/types';
import { exportSvg } from '../engine/render';

export function download(data: Blob | string, filename: string, type = 'application/octet-stream') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const safeName = (doc: Doc) => (doc.name || 'animation').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'animation';

export function saveProject(doc: Doc) {
  download(JSON.stringify({ app: 'animora', ...doc }, null, 1), `${safeName(doc)}.animora.json`, 'application/json');
}

export function exportAnimatedSvg(doc: Doc) {
  download(exportSvg(doc, { animated: true }), `${safeName(doc)}.svg`, 'image/svg+xml');
}

export function exportStaticSvg(doc: Doc, time: number) {
  download(exportSvg(doc, { animated: false, time }), `${safeName(doc)}-${time.toFixed(2)}s.svg`, 'image/svg+xml');
}

export const svgDataUrl = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Frame failed to render'));
    img.src = src;
  });
}

async function drawFrame(ctx: CanvasRenderingContext2D, doc: Doc, time: number, scale: number, opaque: boolean) {
  const img = await loadImage(svgDataUrl(exportSvg(doc, { animated: false, time })));
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  if (opaque) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, doc.width * scale, doc.height * scale);
}

export async function exportPng(doc: Doc, time: number, scale = 2) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(doc.width * scale);
  canvas.height = Math.round(doc.height * scale);
  await drawFrame(canvas.getContext('2d')!, doc, time, scale, false);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (blob) download(blob, `${safeName(doc)}-${time.toFixed(2)}s.png`);
}

/** Records the animation into a WebM video in real time using MediaRecorder. */
export async function exportWebm(doc: Doc, onProgress: (p: number) => void, fps = 30): Promise<void> {
  if (typeof MediaRecorder === 'undefined') throw new Error('Video recording is not supported in this browser.');
  const canvas = document.createElement('canvas');
  const scale = Math.min(2, 1920 / Math.max(doc.width, doc.height)) || 1;
  canvas.width = Math.round((doc.width * scale) / 2) * 2;
  canvas.height = Math.round((doc.height * scale) / 2) * 2;
  const ctx = canvas.getContext('2d')!;
  const stream = canvas.captureStream(fps);
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((r) => (rec.onstop = () => r()));

  await drawFrame(ctx, doc, 0, scale, true);
  rec.start();
  const times = cycleTimes(doc, fps);
  const start = performance.now();
  for (let i = 0; i < times.length; i++) {
    await drawFrame(ctx, doc, times[i], scale, true);
    onProgress((i + 1) / times.length);
    const wait = start + ((i + 1) * 1000) / fps - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  rec.stop();
  await stopped;
  download(new Blob(chunks, { type: 'video/webm' }), `${safeName(doc)}.webm`);
}

/** Frame times for one exported cycle, honoring the playback direction and speed. */
export function cycleTimes(doc: Doc, fps: number): number[] {
  const D = Math.max(0.01, doc.duration);
  const speed = Math.max(1, doc.speed || 100) / 100;
  const n = Math.max(1, Math.round((D / speed) * fps));
  const forward = Array.from({ length: n }, (_, i) => (i / n) * D);
  const back = forward.map((t) => D - t);
  switch (doc.direction) {
    case 'reverse': return back;
    case 'alternate': return [...forward, ...back];
    case 'alternate-reverse': return [...back, ...forward];
    default: return forward;
  }
}

async function renderFrames(doc: Doc, times: number[], scale: number, opaque: boolean, onProgress: (p: number) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(doc.width * scale));
  canvas.height = Math.max(1, Math.round(doc.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const out: Uint8ClampedArray[] = [];
  for (let i = 0; i < times.length; i++) {
    await drawFrame(ctx, doc, times[i], scale, opaque);
    out.push(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
    onProgress((i + 1) / times.length);
  }
  return { frames: out, canvas, ctx };
}

export async function exportGif(doc: Doc, o: { fps: number; scale: number; transparent: boolean }, onProgress: (p: number) => void) {
  const { encodeGif } = await import('./gif');
  const times = cycleTimes(doc, o.fps);
  const { frames, canvas } = await renderFrames(doc, times, o.scale, !o.transparent, (p) => onProgress(p * 0.8));
  // Let the progress bar paint before the (synchronous) encode.
  await new Promise((r) => setTimeout(r, 30));
  const bytes = encodeGif(frames, {
    width: canvas.width, height: canvas.height, delay: 1 / o.fps, loops: doc.loop ? 0 : Math.max(1, doc.iterations) - 1, transparent: o.transparent,
  });
  onProgress(1);
  download(new Blob([bytes], { type: 'image/gif' }), `${safeName(doc)}.gif`);
}

export async function exportPngSequence(doc: Doc, o: { fps: number; scale: number }, onProgress: (p: number) => void) {
  const { zip } = await import('./zip');
  const times = cycleTimes(doc, o.fps);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(doc.width * o.scale));
  canvas.height = Math.max(1, Math.round(doc.height * o.scale));
  const ctx = canvas.getContext('2d')!;
  const files: { name: string; data: Uint8Array<ArrayBuffer> }[] = [];
  const pad = String(times.length).length;
  for (let i = 0; i < times.length; i++) {
    await drawFrame(ctx, doc, times[i], o.scale, false);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (blob) files.push({ name: `${safeName(doc)}_${String(i).padStart(pad, '0')}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
    onProgress((i + 1) / times.length);
  }
  download(zip(files), `${safeName(doc)}-frames.zip`);
}

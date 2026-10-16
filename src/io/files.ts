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
  const frames = Math.max(1, Math.round(doc.duration * fps));
  const start = performance.now();
  for (let i = 0; i <= frames; i++) {
    await drawFrame(ctx, doc, Math.min(doc.duration, i / fps), scale, true);
    onProgress(i / frames);
    const wait = start + ((i + 1) * 1000) / fps - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  rec.stop();
  await stopped;
  download(new Blob(chunks, { type: 'video/webm' }), `${safeName(doc)}.webm`);
}

'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Button, Overlay } from './ui';

// Only the signed part of the pad (plus a small margin), so the signature fills the box on the report
// instead of being a small mark in a big empty picture.
function trimmed(canvas: HTMLCanvasElement) {
  const { width, height } = canvas;
  const data = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
  let top = height, left = width, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return canvas.toDataURL('image/png');
  const pad = 12;
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  const w = Math.min(width, right + pad) - left;
  const h = Math.min(height, bottom + pad) - top;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d')!.drawImage(canvas, left, top, w, h, 0, 0, w, h);
  return out.toDataURL('image/png');
}

// Full-screen signing pad (finger, stylus or mouse). Returns a PNG data URL via onSave.
export function SignaturePad({
  visible,
  title,
  header,
  onSave,
  onClose,
}: {
  visible: boolean;
  title: string;
  header?: ReactNode; // shown above the signing box, e.g. signatures already on the report
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawn = useRef(false);

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current!;
    const ratio = window.devicePixelRatio || 1;
    const fit = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000';
      drawn.current = false;
    };
    fit();
    let drawing = false;
    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const down = (e: PointerEvent) => {
      drawing = true;
      canvas.setPointerCapture(e.pointerId);
      const ctx = canvas.getContext('2d')!;
      ctx.beginPath();
      ctx.moveTo(...pos(e));
    };
    const move = (e: PointerEvent) => {
      if (!drawing) return;
      const ctx = canvas.getContext('2d')!;
      ctx.lineTo(...pos(e));
      ctx.stroke();
      drawn.current = true;
    };
    const up = () => (drawing = false);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    window.addEventListener('resize', fit);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      window.removeEventListener('resize', fit);
    };
  }, [visible]);

  if (!visible) return null;

  const clear = () => {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    drawn.current = false;
  };
  const save = () => {
    if (!drawn.current) return alert('Please sign inside the box first');
    onSave(trimmed(canvasRef.current!));
  };

  return (
    <Overlay>
      <div className="p-4">
        <div className="text-[18px] font-bold">{title}</div>
        <div className="text-muted">Sign inside the box below</div>
      </div>
      {header ? <div className="px-4 pb-3">{header}</div> : null}
      <div className="mx-4 flex-1 border border-line bg-white">
        <canvas ref={canvasRef} className="h-full w-full touch-none" />
      </div>
      <div className="mx-auto flex w-full max-w-[720px] gap-2 p-4">
        <Button variant="secondary" title="Cancel" onPress={onClose} className="flex-1" />
        <Button variant="secondary" title="Clear" onPress={clear} className="flex-1" />
        <Button title="Save" onPress={save} className="flex-1" />
      </div>
    </Overlay>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { apiText } from '@/lib/api';
import type { JobDetail } from '@/lib/types';
import { Button, Overlay, Spinner } from './ui';

// Report page width in CSS pixels (A4 at screen resolution); shrunk to fit narrow phone screens.
const PAGE_WIDTH = 820;

// The service report exactly as the customer will get it (with Before/After photos), so the
// salesman can check everything before signing. Without onSign it is view-only (other staff).
export function ReportPreview({ job, visible, onClose, onSign }: { job: JobDetail; visible: boolean; onClose: () => void; onSign?: () => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(1200);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    apiText(`/jobs/${job.id}/report.html`)
      .then((h) => alive && setHtml(h))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
      setHtml(null);
      setError(null);
    };
  }, [visible, job]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => setScale(Math.min(1, (box.clientWidth - 16) / PAGE_WIDTH));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [html]);

  if (!visible) return null;
  return (
    <Overlay>
      <div className="border-b border-line bg-white p-3">
        <div className="text-[17px] font-bold">{onSign ? 'Review report' : 'Report'} {job.job_no}</div>
        <div className="text-muted">Scroll through the report and photos{onSign ? ', then sign' : ''}. Pinch to zoom.</div>
      </div>
      <div ref={boxRef} className="flex-1 overflow-auto bg-[#d1d5db] py-2">
        {html ? (
          <div className="mx-auto bg-white shadow" style={{ width: PAGE_WIDTH * scale, height: height * scale }}>
            <iframe
              title="Service report preview"
              srcDoc={html}
              scrolling="no"
              onLoad={(e) => setHeight(e.currentTarget.contentDocument?.documentElement.scrollHeight ?? 1200)}
              style={{ width: PAGE_WIDTH, height, border: 0, transform: `scale(${scale})`, transformOrigin: '0 0' }}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            {error ? <span className="p-4 text-danger">{error}</span> : <Spinner big />}
            {!error && <span className="text-muted">Loading report and photos…</span>}
          </div>
        )}
      </div>
      <div className="mx-auto flex w-full max-w-[860px] gap-2 p-3">
        <Button variant="secondary" title="Close" onPress={onClose} className="flex-1" />
        {onSign && <Button title={job.salesman_signature ? '✍ Sign again' : '✍ Sign now'} onPress={onSign} disabled={!html} className="flex-[2]" />}
      </div>
    </Overlay>
  );
}

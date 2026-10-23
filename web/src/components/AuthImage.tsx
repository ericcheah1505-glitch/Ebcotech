'use client';

import { useEffect, useState } from 'react';
import { apiBlob } from '@/lib/api';

// Job photos need the login to load, so they are fetched with it and shown from memory.
const cache = new Map<string, Promise<string>>();

export function AuthImage({ path, className, alt = '' }: { path: string; className?: string; alt?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!cache.has(path)) cache.set(path, apiBlob(path).then((b) => URL.createObjectURL(b)));
    cache
      .get(path)!
      .then((url) => alive && setSrc(url))
      .catch(() => cache.delete(path));
    return () => {
      alive = false;
    };
  }, [path]);
  return src ? <img src={src} alt={alt} className={className} /> : <div className={`${className} animate-pulse bg-line`} />;
}

export const photoPath = (jobId: number, photoId: number) => `/jobs/${jobId}/photos/${photoId}`;

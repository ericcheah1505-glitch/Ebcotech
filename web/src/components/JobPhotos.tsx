'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { niceDateTime } from '@/lib/format';
import { shrinkPhoto } from '@/lib/photos';
import type { JobDetail, Photo, User } from '@/lib/types';
import { AuthImage, photoPath } from './AuthImage';
import { Button, Card, Field, Muted, Overlay, Title } from './ui';

type Stage = 'before' | 'after';
type Pending = { uri: string; caption: string };

const STAGES: Record<Stage, { title: string; hint: string; placeholder: string; color: string }> = {
  before: {
    title: '① Before service',
    hint: 'On arrival, before touching anything: photo the problem and the condition of the door/site.',
    placeholder: 'e.g. Sensor not detecting, bottom track bent',
    color: '#B45309',
  },
  after: {
    title: '② After service',
    hint: 'When the work is finished: photo the result and the parts fitted.',
    placeholder: 'e.g. New remote receiver installed, door tested OK',
    color: '#16A34A',
  },
};

// Job photos in two steps – Before and After service – each photo with its own description.
export function JobPhotos({ job, user, onChange }: { job: JobDetail; user: User; onChange: (job: JobDetail) => void }) {
  const [viewing, setViewing] = useState<Photo | null>(null);
  const isAdmin = user.role === 'admin';
  const open = job.status !== 'completed' && job.status !== 'cancelled';
  const canAdd = isAdmin || open;
  // Photos are the technician's evidence: only whoever took it (before the job is done) or admin.
  const canRemove = (p: Photo) => isAdmin || (open && p.uploaded_by === user.id);
  const other = job.photos.filter((p) => p.stage !== 'before' && p.stage !== 'after');

  if (!canAdd && job.photos.length === 0) return null;

  const remove = async (p: Photo) => {
    if (!confirm(`Remove this photo?\n${p.caption ?? ''}`)) return;
    try {
      onChange(await api<JobDetail>(`/jobs/${job.id}/photos/${p.id}`, { method: 'DELETE' }));
      setViewing(null);
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <Card className="gap-3">
      <Title>Photos</Title>
      {(['before', 'after'] as Stage[]).map((stage) => (
        <StageSection key={stage} job={job} stage={stage} photos={job.photos.filter((p) => p.stage === stage)} canAdd={canAdd} onChange={onChange} onView={setViewing} />
      ))}
      {other.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="font-bold text-muted">Other photos</span>
          <Thumbs job={job} photos={other} onView={setViewing} />
        </div>
      )}

      {viewing && (
        <Overlay dark>
          <div className="flex flex-1 items-center justify-center overflow-hidden">
            <AuthImage path={photoPath(job.id, viewing.id)} className="max-h-full max-w-full object-contain" />
          </div>
          <div className="mx-auto flex w-full max-w-[720px] flex-col gap-2 p-4">
            <span className="font-bold" style={{ color: viewing.stage === 'after' ? '#4ADE80' : '#FBBF24' }}>
              {viewing.stage === 'before' ? 'BEFORE SERVICE' : viewing.stage === 'after' ? 'AFTER SERVICE' : 'PHOTO'}
            </span>
            {viewing.caption ? <span className="text-[16px] text-white">{viewing.caption}</span> : null}
            <span className="text-[#aaa]">
              {viewing.uploaded_by_name ?? ''} · {niceDateTime(viewing.created_at)}
            </span>
            <div className="flex gap-2">
              {canRemove(viewing) && <Button variant="danger" title="Remove" onPress={() => remove(viewing)} className="flex-1" />}
              <Button variant="secondary" title="Close" onPress={() => setViewing(null)} className="flex-1" />
            </div>
          </div>
        </Overlay>
      )}
    </Card>
  );
}

function Thumbs({ job, photos, onView }: { job: JobDetail; photos: Photo[]; onView: (p: Photo) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2 lg:grid-cols-5">
      {photos.map((p) => (
        <button type="button" key={p.id} onClick={() => onView(p)} className="text-left">
          <AuthImage path={photoPath(job.id, p.id)} className="aspect-square w-full rounded-lg object-cover" />
          {p.caption ? <span className="line-clamp-2 text-[11px] text-muted">{p.caption}</span> : null}
        </button>
      ))}
    </div>
  );
}

// One step (Before or After): saved photos, then take/pick → describe each → save.
function StageSection({
  job,
  stage,
  photos,
  canAdd,
  onChange,
  onView,
}: {
  job: JobDetail;
  stage: Stage;
  photos: Photo[];
  canAdd: boolean;
  onChange: (job: JobDetail) => void;
  onView: (p: Photo) => void;
}) {
  const info = STAGES[stage];
  const [pending, setPending] = useState<Pending[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const picked = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const shrunk = await Promise.all([...files].slice(0, 5).map(shrinkPhoto));
      setPending((p) => [...p, ...shrunk.map((uri) => ({ uri, caption: '' }))]);
    } catch (e: any) {
      alert(`Photo not added\n${e.message}`);
    }
  };

  const save = async () => {
    if (pending.some((p) => p.caption.trim().length < 2)) return alert('Please describe every photo');
    const queue = [...pending];
    try {
      for (let i = 0; i < queue.length; i++) {
        setProgress(`Uploading ${i + 1} of ${queue.length}…`);
        onChange(await api<JobDetail>(`/jobs/${job.id}/photos`, { body: { image: queue[i].uri, stage, caption: queue[i].caption.trim() }, timeoutMs: 60000 }));
        setPending((p) => p.slice(1)); // drop each one once it is safely uploaded
      }
    } catch (e: any) {
      alert(`Not all photos were saved\n${e.message}\nThe remaining photos are still here – try Save again.`);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-l-[3px] pl-2.5" style={{ borderLeftColor: info.color }}>
      <span className="text-[15px] font-extrabold" style={{ color: info.color }}>
        {info.title} ({photos.length})
      </span>
      {canAdd && <Muted>{info.hint}</Muted>}
      {photos.length > 0 && <Thumbs job={job} photos={photos} onView={onView} />}

      {pending.map((p, i) => (
        <div key={i} className="flex items-start gap-2">
          <img src={p.uri} alt="" className="h-[72px] w-[72px] rounded-lg object-cover" />
          <div className="flex flex-1 flex-col gap-1">
            <Field
              label="Describe this photo *"
              value={p.caption}
              onChange={(t) => setPending((all) => all.map((x, j) => (j === i ? { ...x, caption: t } : x)))}
              placeholder={info.placeholder}
              multiline
            />
            {!progress && <Button small variant="secondary" title="Discard" onPress={() => setPending((all) => all.filter((_, j) => j !== i))} />}
          </div>
        </div>
      ))}

      {canAdd &&
        (progress ? (
          <Muted>{progress}</Muted>
        ) : (
          <>
            {pending.length > 0 && <Button title={`Save ${pending.length} ${stage} photo(s)`} onPress={save} />}
            <div className="flex gap-2">
              <Button small variant="secondary" title="📷 Take photo" onPress={() => cameraRef.current?.click()} className="flex-1" />
              <Button small variant="secondary" title="🖼 From gallery" onPress={() => galleryRef.current?.click()} className="flex-1" />
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (picked(e.target.files), (e.target.value = ''))} />
            <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={(e) => (picked(e.target.files), (e.target.value = ''))} />
          </>
        ))}
    </div>
  );
}

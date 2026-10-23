import { useState } from 'react';
import { Alert, Image, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { niceDateTime } from '@/lib/format';
import { photoSource, pickPhotos } from '@/lib/photos';
import type { JobDetail, User } from '@/lib/types';
import { Button, C, Card, Field, Muted, Title } from './ui';

type Photo = JobDetail['photos'][number];
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
// Printed on the report's Attachments pages under BEFORE / AFTER SERVICE.
export function JobPhotos({ job, user, onChange }: { job: JobDetail; user: User; onChange: (job: JobDetail) => void }) {
  const [viewing, setViewing] = useState<Photo | null>(null);
  const isAdmin = user.role === 'admin';
  const open = job.status !== 'completed' && job.status !== 'cancelled';
  const canAdd = isAdmin || open;
  const canRemove = (p: Photo) => isAdmin || (open && p.uploaded_by === user.id);
  const other = job.photos.filter((p) => p.stage !== 'before' && p.stage !== 'after');

  if (!canAdd && job.photos.length === 0) return null;

  const remove = (p: Photo) =>
    Alert.alert('Remove this photo?', p.caption ?? '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            onChange(await api<JobDetail>(`/jobs/${job.id}/photos/${p.id}`, { method: 'DELETE' }));
            setViewing(null);
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);

  return (
    <Card style={{ gap: 12 }}>
      <Title>Photos</Title>
      {(['before', 'after'] as Stage[]).map((stage) => (
        <StageSection
          key={stage}
          job={job}
          stage={stage}
          photos={job.photos.filter((p) => p.stage === stage)}
          canAdd={canAdd}
          onChange={onChange}
          onView={setViewing}
        />
      ))}
      {other.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: '700', color: C.muted }}>Other photos</Text>
          <Thumbs job={job} photos={other} onView={setViewing} />
        </View>
      )}

      <Modal visible={!!viewing} animationType="fade" onRequestClose={() => setViewing(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          {viewing && (
            <>
              <Image source={photoSource(job.id, viewing.id)} style={{ flex: 1 }} resizeMode="contain" />
              <View style={{ padding: 16, gap: 8 }}>
                <Text style={{ color: viewing.stage === 'after' ? '#4ADE80' : '#FBBF24', fontWeight: '700' }}>
                  {viewing.stage === 'before' ? 'BEFORE SERVICE' : viewing.stage === 'after' ? 'AFTER SERVICE' : 'PHOTO'}
                </Text>
                {viewing.caption ? <Text style={{ color: '#fff', fontSize: 16 }}>{viewing.caption}</Text> : null}
                <Text style={{ color: '#aaa' }}>
                  {viewing.uploaded_by_name ?? ''} · {niceDateTime(viewing.created_at)}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {canRemove(viewing) && (
                    <View style={{ flex: 1 }}>
                      <Button variant="danger" title="Remove" onPress={() => remove(viewing)} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Button variant="secondary" title="Close" onPress={() => setViewing(null)} />
                  </View>
                </View>
              </View>
            </>
          )}
        </SafeAreaView>
      </Modal>
    </Card>
  );
}

function Thumbs({ job, photos, onView }: { job: JobDetail; photos: Photo[]; onView: (p: Photo) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {photos.map((p) => (
        <Pressable key={p.id} onPress={() => onView(p)} style={{ width: '31%' }}>
          <Image source={photoSource(job.id, p.id)} style={{ width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: C.border }} />
          {p.caption ? (
            <Text numberOfLines={2} style={{ fontSize: 11, color: C.muted }}>
              {p.caption}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
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

  const pick = async (source: 'camera' | 'library') => {
    try {
      const images = await pickPhotos(source);
      setPending((p) => [...p, ...images.map((uri) => ({ uri, caption: '' }))]);
    } catch (e: any) {
      Alert.alert('Photo not added', e.message);
    }
  };

  const save = async () => {
    if (pending.some((p) => p.caption.trim().length < 2)) return Alert.alert('Please describe every photo');
    const queue = [...pending];
    try {
      for (let i = 0; i < queue.length; i++) {
        setProgress(`Uploading ${i + 1} of ${queue.length}…`);
        onChange(await api<JobDetail>(`/jobs/${job.id}/photos`, { body: { image: queue[i].uri, stage, caption: queue[i].caption.trim() } }));
        setPending((p) => p.slice(1)); // drop each one once it is safely uploaded
      }
    } catch (e: any) {
      Alert.alert('Not all photos were saved', `${e.message}\nThe remaining photos are still here – try Save again.`);
    } finally {
      setProgress(null);
    }
  };

  return (
    <View style={{ gap: 8, borderLeftWidth: 3, borderLeftColor: info.color, paddingLeft: 10 }}>
      <Text style={{ fontWeight: '800', fontSize: 15, color: info.color }}>
        {info.title} ({photos.length})
      </Text>
      {canAdd && <Muted>{info.hint}</Muted>}
      {photos.length > 0 && <Thumbs job={job} photos={photos} onView={onView} />}

      {pending.map((p, i) => (
        <View key={`${i}-${p.uri.length}`} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Image source={{ uri: p.uri }} style={{ width: 72, height: 72, borderRadius: 8 }} />
          <View style={{ flex: 1, gap: 4 }}>
            <Field
              label="Describe this photo *"
              value={p.caption}
              onChangeText={(t) => setPending((all) => all.map((x, j) => (j === i ? { ...x, caption: t } : x)))}
              placeholder={info.placeholder}
              multiline
            />
            {!progress && <Button small variant="secondary" title="Discard" onPress={() => setPending((all) => all.filter((_, j) => j !== i))} />}
          </View>
        </View>
      ))}

      {canAdd &&
        (progress ? (
          <Muted>{progress}</Muted>
        ) : (
          <>
            {pending.length > 0 && <Button title={`Save ${pending.length} ${stage} photo(s)`} onPress={save} />}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button small variant="secondary" title="📷 Take photo" onPress={() => pick('camera')} />
              </View>
              <View style={{ flex: 1 }}>
                <Button small variant="secondary" title="🖼 From gallery" onPress={() => pick('library')} />
              </View>
            </View>
          </>
        ))}
    </View>
  );
}

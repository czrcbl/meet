import { useRoomContext, useTranscriptions } from '@livekit/components-react';
import type { Room } from 'livekit-client';
import * as React from 'react';

const MAX_LINES = 3;
// How long a line stays up after its text last changed, then how long it takes
// to fade out before it is dropped.
const LINE_TTL_MS = 6_000;
const FADE_MS = 400;

type Transcription = ReturnType<typeof useTranscriptions>[number];

/** Local times for one segment; `text`/`final` detect when it last changed. */
type Stamp = { firstSeen: number; lastChanged: number; text: string; final: boolean };

const segmentOf = (t: Transcription) => t.streamInfo.attributes?.['lk.segment_id'] ?? t.streamInfo.id;
const isFinal = (t: Transcription) => t.streamInfo.attributes?.['lk.transcription_final'] === 'true';
/** Groups a speaker's segments into one caption line: one per transcribed track. */
const speakerKeyOf = (t: Transcription) =>
  t.streamInfo.attributes?.['lk.transcribed_track_id'] ?? t.participantInfo.identity;

/**
 * The speaker is whoever owns the transcribed track. The stream's sender is
 * the transcriber, which only matches the speaker when the SFU accepted it
 * publishing on their behalf (agent tokens), so it is just the fallback.
 */
function speakerOf(room: Room, line: Transcription): string {
  const trackSid = line.streamInfo.attributes?.['lk.transcribed_track_id'];
  if (trackSid) {
    const owner = [room.localParticipant, ...room.remoteParticipants.values()].find((p) =>
      p.trackPublications.has(trackSid),
    );
    if (owner) {
      return owner.name || owner.identity;
    }
  }
  return line.participantInfo.identity;
}

/**
 * Renders the `lk.transcription` text streams as a caption overlay.
 * `VideoConference` has no caption slot of its own, so this sits next to it
 * inside the room container.
 */
export function Captions() {
  const room = useRoomContext();
  // components-core already folds interim and final streams sharing an
  // `lk.segment_id` into one entry, so there is one item per segment here.
  const transcriptions = useTranscriptions();

  // Each line ages on its own, timed with local time rather than
  // `streamInfo.timestamp`: that carries the sender's clock, and it is bumped on
  // every interim update, so it can neither order lines stably nor age them.
  const stamps = React.useRef(new Map<string, Stamp>());
  const initialized = React.useRef(false);
  const [now, setNow] = React.useState(() => Date.now());
  // Bumped whenever the stamps change. `now` alone can miss an update that
  // lands in the same millisecond as the last one, as setting a state to the
  // value it already has skips the re-render.
  const [stampsVersion, bumpStamps] = React.useReducer((n: number) => n + 1, 0);

  React.useEffect(() => {
    const t = Date.now();
    // Segments already there on mount are history, not something just said.
    const seenAt = initialized.current ? t : -Infinity;
    initialized.current = true;
    const live = new Set<string>();
    for (const tr of transcriptions) {
      const key = segmentOf(tr);
      live.add(key);
      const final = isFinal(tr);
      const stamp = stamps.current.get(key);
      if (!stamp) {
        stamps.current.set(key, { firstSeen: seenAt, lastChanged: seenAt, text: tr.text, final });
      } else if (stamp.text !== tr.text || stamp.final !== final) {
        Object.assign(stamp, { lastChanged: t, text: tr.text, final });
      }
    }
    // The list is cleared on disconnect; forget those segments too.
    for (const key of stamps.current.keys()) {
      if (!live.has(key)) {
        stamps.current.delete(key);
      }
    }
    setNow(t);
    bumpStamps();
  }, [transcriptions]);

  // One line per speaker, showing their latest segment. Each final starts a new
  // segment, so ordering segments would move a speaker's next sentence below
  // everyone else's; the line keeps its place instead.
  const lines = React.useMemo(() => {
    const bySpeaker = new Map<string, { t: Transcription; stamp: Stamp }[]>();
    for (const t of transcriptions) {
      const stamp = stamps.current.get(segmentOf(t));
      if (!stamp || t.text.trim() === '') {
        continue;
      }
      const key = speakerKeyOf(t);
      bySpeaker.set(key, [...(bySpeaker.get(key) ?? []), { t, stamp }]);
    }

    const visible = [];
    for (const [key, segments] of bySpeaker) {
      segments.sort((a, b) => a.stamp.firstSeen - b.stamp.firstSeen);
      // The line opened with the first segment that came after everything
      // before it had already left the screen; until then it is the same line.
      let opened = -Infinity;
      let shownUntil = -Infinity;
      for (const { stamp } of segments) {
        if (stamp.firstSeen >= shownUntil) {
          opened = stamp.firstSeen;
        }
        shownUntil = Math.max(shownUntil, stamp.lastChanged + LINE_TTL_MS + FADE_MS);
      }
      const { t, stamp } = segments[segments.length - 1];
      if (now - stamp.lastChanged < LINE_TTL_MS + FADE_MS) {
        visible.push({ key, t, opened, fading: now - stamp.lastChanged >= LINE_TTL_MS });
      }
    }
    // By when the speaker's line opened, so it stays put while they keep
    // talking and others talk at once.
    return visible.sort((a, b) => a.opened - b.opened).slice(-MAX_LINES);
    // stampsVersion: the stamps live in a ref, so this is what tells the memo
    // they moved on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcriptions, now, stampsVersion]);

  // Wake up at the next point a line starts fading or is dropped, so lines go
  // away even when nothing new arrives.
  React.useEffect(() => {
    let next = Infinity;
    for (const { lastChanged } of stamps.current.values()) {
      for (const deadline of [lastChanged + LINE_TTL_MS, lastChanged + LINE_TTL_MS + FADE_MS]) {
        if (deadline > now && deadline < next) {
          next = deadline;
        }
      }
    }
    if (next === Infinity) {
      return;
    }
    const timer = setTimeout(() => setNow(Math.max(Date.now(), next)), next - Date.now());
    return () => clearTimeout(timer);
  }, [now]);

  if (lines.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(var(--lk-control-bar-height) + 1rem)',
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 'min(80ch, 90%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        padding: '0.5rem 0.75rem',
        borderRadius: 'var(--lk-border-radius)',
        // Opaque enough to hold up over bright video. The blur and the ring
        // keep the block readable even where the backdrop is busy rather than
        // bright, and the text shadow covers the case where a browser drops
        // backdrop-filter entirely.
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.12), 0 2px 12px rgba(0, 0, 0, 0.5)',
        color: 'var(--lk-fg)',
        textShadow: '0 1px 2px rgba(0, 0, 0, 0.9)',
        fontSize: '0.95rem',
        lineHeight: 1.4,
        textAlign: 'center',
        pointerEvents: 'none',
        zIndex: 10,
        // The box fades with its last line instead of lingering empty.
        opacity: lines.every((l) => l.fading) ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
      }}
    >
      {lines.map(({ key, t: line, fading }) => (
        <div
          key={key}
          style={{
            // Dim a segment until the transcriber marks it final.
            opacity: fading ? 0 : isFinal(line) ? 1 : 0.6,
            transition: `opacity ${FADE_MS}ms ease-out`,
          }}
        >
          {/* --lk-fg4 is near-white, so weight rather than colour separates
              the speaker from what they said. */}
          <span style={{ color: 'var(--lk-fg4)', fontWeight: 600 }}>
            {speakerOf(room, line)}:{' '}
          </span>
          {line.text}
        </div>
      ))}
    </div>
  );
}

import { useTranscriptions } from '@livekit/components-react';
import * as React from 'react';

const MAX_LINES = 3;
const HIDE_AFTER_MS = 10_000;

/**
 * Renders the `lk.transcription` text streams as a caption overlay.
 * `VideoConference` has no caption slot of its own, so this sits next to it
 * inside the room container.
 */
export function Captions() {
  const transcriptions = useTranscriptions();

  const lines = React.useMemo(() => {
    // Interim and final results arrive as separate text streams sharing an
    // `lk.segment_id`; keep the newest stream per segment so a line is
    // refined in place instead of repeating.
    const bySegment = new Map<string, (typeof transcriptions)[number]>();
    for (const t of transcriptions) {
      const key = t.streamInfo.attributes?.['lk.segment_id'] ?? t.streamInfo.id;
      const seen = bySegment.get(key);
      if (!seen || seen.streamInfo.timestamp <= t.streamInfo.timestamp) {
        bySegment.set(key, t);
      }
    }
    return Array.from(bySegment.values())
      .sort((a, b) => a.streamInfo.timestamp - b.streamInfo.timestamp)
      .slice(-MAX_LINES);
  }, [transcriptions]);

  // Changes whenever the visible text does, including an interim line being
  // refined in place. The idle timer runs off this and local time rather than
  // `streamInfo.timestamp`, which carries the sender's clock.
  const signature = lines.map((l) => `${l.streamInfo.id}:${l.text}`).join('|');
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!signature) {
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), HIDE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [signature]);

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
        // Kept mounted while hidden so the fade can play, and so the last
        // lines are still there to fade back in on the next segment.
        opacity: visible ? 1 : 0,
        transition: 'opacity 400ms ease-out',
      }}
    >
      {lines.map((line) => (
        <div
          key={line.streamInfo.id}
          style={{
            // Dim a segment until the transcriber marks it final.
            opacity: line.streamInfo.attributes?.['lk.transcription_final'] === 'true' ? 1 : 0.6,
          }}
        >
          {/* --lk-fg4 is near-white, so weight rather than colour separates
              the speaker from what they said. */}
          <span style={{ color: 'var(--lk-fg4)', fontWeight: 600 }}>
            {line.participantInfo.identity}:{' '}
          </span>
          {line.text}
        </div>
      ))}
    </div>
  );
}

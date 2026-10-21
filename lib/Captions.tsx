import { useTranscriptions } from '@livekit/components-react';
import * as React from 'react';

const MAX_LINES = 3;

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
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        color: 'var(--lk-fg)',
        fontSize: '0.95rem',
        lineHeight: 1.4,
        textAlign: 'center',
        pointerEvents: 'none',
        zIndex: 10,
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
          <span style={{ color: 'var(--lk-fg4)' }}>{line.participantInfo.identity}: </span>
          {line.text}
        </div>
      ))}
    </div>
  );
}

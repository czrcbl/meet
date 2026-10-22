import { generateRoomId } from '@/lib/client-utils';
import { HomeClient } from './HomeClient';
import styles from '../styles/Home.module.css';

// Render per request so LIVEKIT_URL comes from the runtime env, not the build,
// and every visitor gets a fresh room code.
export const dynamic = 'force-dynamic';

export default function Page() {
  // Server-only env, read here and handed down to prefill the Custom tab.
  const defaultServerUrl = process.env.LIVEKIT_URL ?? '';
  // Generated here rather than in the client: a random value made during
  // render would differ between the server HTML and hydration.
  const initialRoomCode = generateRoomId();

  return (
    <>
      <main className={styles.main} data-lk-theme="default">
        <div className="header">
          <img src="/images/livekit-meet-home.svg" alt="LiveKit Meet" width="360" height="45" />
          <h2>
            Open source video conferencing app built on{' '}
            <a href="https://github.com/livekit/components-js?ref=meet" rel="noopener">
              LiveKit&nbsp;Components
            </a>
            ,{' '}
            <a href="https://livekit.io/cloud?ref=meet" rel="noopener">
              LiveKit&nbsp;Cloud
            </a>{' '}
            and Next.js.
          </h2>
        </div>
        <HomeClient defaultServerUrl={defaultServerUrl} initialRoomCode={initialRoomCode} />
      </main>
      <footer data-lk-theme="default">
        Hosted on{' '}
        <a href="https://livekit.io/cloud?ref=meet" rel="noopener">
          LiveKit Cloud
        </a>
        . Source code on{' '}
        <a href="https://github.com/livekit/meet?ref=meet" rel="noopener">
          GitHub
        </a>
        .
      </footer>
    </>
  );
}

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useState } from 'react';
import { encodePassphrase, generateRoomId, randomString } from '@/lib/client-utils';
import styles from '../styles/Home.module.css';

function Tabs(props: React.PropsWithChildren<{}>) {
  const searchParams = useSearchParams();
  const tabIndex = searchParams?.get('tab') === 'custom' ? 1 : 0;

  const router = useRouter();
  function onTabSelected(index: number) {
    const tab = index === 1 ? 'custom' : 'meeting';
    router.push(`/?tab=${tab}`);
  }

  let tabs = React.Children.map(props.children, (child, index) => {
    return (
      <button
        className="lk-button"
        onClick={() => {
          if (onTabSelected) {
            onTabSelected(index);
          }
        }}
        aria-pressed={tabIndex === index}
      >
        {/* @ts-ignore */}
        {child?.props.label}
      </button>
    );
  });

  return (
    <div className={styles.tabContainer}>
      <div className={styles.tabSelect}>{tabs}</div>
      {/* @ts-ignore */}
      {props.children[tabIndex]}
    </div>
  );
}

/**
 * Accepts a bare code or a pasted meeting link, since people will share
 * whichever they have at hand.
 */
function parseRoomCode(input: string): string {
  const value = input.trim();
  const match = value.match(/\/rooms\/([^/?#]+)/);
  return (match ? decodeURIComponent(match[1]) : value).toLowerCase();
}

/**
 * The room code is the room name. It is what gets shared rather than a token:
 * a token carries a single identity, so everyone who joins with the code gets
 * their own one from /api/connection-details once they pick a name.
 *
 * LiveKit only creates the room when the first person connects, so the code
 * can be shown up front and shared before anyone has entered.
 */
function RoomTab(props: { label: string; initialRoomCode: string }) {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState(props.initialRoomCode);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [e2ee, setE2ee] = useState(false);
  const [sharedPassphrase, setSharedPassphrase] = useState(randomString(64));

  const goToRoom = (code: string) => {
    const path = `/rooms/${encodeURIComponent(code)}`;
    router.push(e2ee ? `${path}#${encodePassphrase(sharedPassphrase)}` : path);
  };

  const newCode = () => {
    setRoomCode(generateRoomId());
    setCopied(false);
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard needs a secure context; the code stays on screen to copy by hand.
    }
  };

  const onJoin: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const formData = new FormData(event.target as HTMLFormElement);
    const code = parseRoomCode(String(formData.get('roomCode') ?? ''));
    if (!code) {
      setJoinError('Enter a room code.');
      return;
    }
    goToRoom(code);
  };

  return (
    <div className={styles.tabContent}>
      <p style={{ margin: 0 }}>Your room code. Share it with the people you want to join:</p>
      <div className={styles.roomCode}>{roomCode}</div>
      <div className={styles.row}>
        <button className="lk-button" onClick={copyCode}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button className="lk-button" onClick={newCode}>
          New code
        </button>
      </div>
      <button className="lk-button" onClick={() => goToRoom(roomCode)}>
        Start meeting
      </button>

      <div className={styles.divider}>or join a room</div>

      <form onSubmit={onJoin} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div className={styles.row}>
          <input
            id="roomCode"
            name="roomCode"
            type="text"
            placeholder="Room code, e.g. ab12-cd34"
            autoComplete="off"
            onChange={() => setJoinError(null)}
            style={{ flex: 2 }}
          />
          <button className="lk-button" type="submit">
            Join
          </button>
        </div>
        {joinError && <p style={{ margin: 0, color: 'var(--lk-danger)' }}>{joinError}</p>}
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'row', gap: '1rem' }}>
          <input
            id="use-e2ee"
            type="checkbox"
            checked={e2ee}
            onChange={(ev) => setE2ee(ev.target.checked)}
          ></input>
          <label htmlFor="use-e2ee">Enable end-to-end encryption</label>
        </div>
        {e2ee && (
          <div style={{ display: 'flex', flexDirection: 'row', gap: '1rem' }}>
            <label htmlFor="passphrase">Passphrase</label>
            <input
              id="passphrase"
              type="password"
              value={sharedPassphrase}
              onChange={(ev) => setSharedPassphrase(ev.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function CustomConnectionTab(props: { label: string; defaultServerUrl: string }) {
  const router = useRouter();

  const [e2ee, setE2ee] = useState(false);
  const [sharedPassphrase, setSharedPassphrase] = useState(randomString(64));

  const onSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const formData = new FormData(event.target as HTMLFormElement);
    const serverUrl = formData.get('serverUrl');
    const token = formData.get('token');
    if (e2ee) {
      router.push(
        `/custom/?liveKitUrl=${serverUrl}&token=${token}#${encodePassphrase(sharedPassphrase)}`,
      );
    } else {
      router.push(`/custom/?liveKitUrl=${serverUrl}&token=${token}`);
    }
  };
  return (
    <form className={styles.tabContent} onSubmit={onSubmit}>
      <p style={{ marginTop: 0 }}>
        Connect LiveKit Meet with a custom server using LiveKit Cloud or LiveKit Server.
      </p>
      <input
        id="serverUrl"
        name="serverUrl"
        type="url"
        placeholder="LiveKit Server URL: wss://*.livekit.cloud"
        defaultValue={props.defaultServerUrl}
        required
      />
      <textarea
        id="token"
        name="token"
        placeholder="Token"
        required
        rows={5}
        style={{ padding: '1px 2px', fontSize: 'inherit', lineHeight: 'inherit' }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'row', gap: '1rem' }}>
          <input
            id="use-e2ee"
            type="checkbox"
            checked={e2ee}
            onChange={(ev) => setE2ee(ev.target.checked)}
          ></input>
          <label htmlFor="use-e2ee">Enable end-to-end encryption</label>
        </div>
        {e2ee && (
          <div style={{ display: 'flex', flexDirection: 'row', gap: '1rem' }}>
            <label htmlFor="passphrase">Passphrase</label>
            <input
              id="passphrase"
              type="password"
              value={sharedPassphrase}
              onChange={(ev) => setSharedPassphrase(ev.target.value)}
            />
          </div>
        )}
      </div>

      <hr
        style={{ width: '100%', borderColor: 'rgba(255, 255, 255, 0.15)', marginBlock: '1rem' }}
      />
      <button
        style={{ paddingInline: '1.25rem', width: '100%' }}
        className="lk-button"
        type="submit"
      >
        Connect
      </button>
    </form>
  );
}

export function HomeClient(props: { defaultServerUrl: string; initialRoomCode: string }) {
  return (
    <Suspense fallback="Loading">
      <Tabs>
        <RoomTab label="Meeting" initialRoomCode={props.initialRoomCode} />
        <CustomConnectionTab label="Custom" defaultServerUrl={props.defaultServerUrl} />
      </Tabs>
    </Suspense>
  );
}

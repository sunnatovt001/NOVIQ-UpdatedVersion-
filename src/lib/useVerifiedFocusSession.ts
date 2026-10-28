import { useEffect, type RefObject } from 'react';
import { updateStudySessionState } from './verifiedProgress';

// The timer remains local and responsive. Lost heartbeats can only reduce
// verified time; they cannot turn paused/offline time into confirmed XP.
export function useVerifiedFocusSession(id: RefObject<string | undefined>, running: boolean, localOnly: boolean, busy: boolean, onError: (message: string) => void) {
  useEffect(() => {
    const sessionId = id.current;
    if (!sessionId || localOnly || busy || !running) return;
    let live = true;
    const send = (state: 'resume' | 'heartbeat') => {
      void updateStudySessionState(sessionId, state).catch(() => {
        if (live) onError('XP verification is pending. Your timer is still running.');
      });
    };
    send('resume');
    const timer = window.setInterval(() => send('heartbeat'), 30000);
    return () => {
      live = false;
      window.clearInterval(timer);
      void updateStudySessionState(sessionId, 'pause').catch(() => undefined);
    };
  }, [id, running, localOnly, busy, onError]);
}

import { useEffect, useId, useRef, useState } from 'react';

export function TelegramLoginWidget({ onProof, errorText }: { onProof: (proof: Record<string, unknown>) => void; errorText: string }) {
  const host = useRef<HTMLDivElement>(null), callback = useRef(onProof);
  callback.current = onProof;
  const id = `noviqTelegram${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [enabled, setEnabled] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let disposed = false;
    const callbacks = window as unknown as Record<string, unknown>;
    callbacks[id] = (proof: Record<string, unknown>) => { if (!disposed) callback.current(proof); };
    void fetch('/api/auth/telegram-config', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) }).then(async response => {
      if (!response.ok) throw new Error('Unavailable');
      const config = await response.json();
      if (disposed || config.enabled !== true) return;
      if (typeof config.botUsername !== 'string' || !/^[A-Za-z0-9_]{5,32}$/.test(config.botUsername)) throw new Error('Invalid bot');
      setEnabled(true);
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22'; script.async = true;
      script.setAttribute('data-telegram-login', config.botUsername);
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-onauth', `window.${id}(user)`);
      script.onerror = () => { if (!disposed) setFailed(true); };
      // No request-access=write: login does not request permission to send messages.
      host.current?.appendChild(script);
    }).catch(() => { if (!disposed) setFailed(true); });
    const node = host.current;
    return () => { disposed = true; controller.abort(); delete callbacks[id]; node?.replaceChildren(); };
  }, [id]);
  return <div className="max-w-full space-y-2">
    {enabled ? <p>Telegram</p> : null}<div ref={host} aria-label="Telegram login" />
    {failed ? <p role="alert">{errorText}</p> : null}
  </div>;
}

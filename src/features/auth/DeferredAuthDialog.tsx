import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { createPortal } from "react-dom";
import type { AuthMode } from "./AuthDialog";
import { useLocale } from "@/src/contexts/LocaleContext";
import { getAuthCopy } from "./authCopy";
import { getRecoveryCopy } from "@/src/lib/recoveryCopy";
import { withDeadline } from "@/src/lib/asyncRequest";
import { useDialogFocus } from "@/src/lib/useDialogFocus";
import { useBodyScrollLock } from "@/src/lib/useBodyScrollLock";
import { PageBoundary } from "@/src/components/RoutePage";

type Props = {mode: AuthMode; onClose: () => void; onModeChange: (mode: AuthMode) => void};
function PendingAuth({failed, onRetry, onClose}: {failed: boolean; onRetry: () => void; onClose: () => void}) {
  const panel = useRef<HTMLDivElement>(null);
  const {locale} = useLocale();
  const copy = getRecoveryCopy();
  useDialogFocus(true,panel,onClose);
  useBodyScrollLock(true);
  useEffect(() => {
    const root=document.getElementById('root');
    if (!root) return;
    const original=root.inert;root.inert=true;
    return () => {root.inert=original;};
  },[]);
  return createPortal(<div className="noviq-modal-backdrop z-[200]">
    <div className="noviq-modal-positioner noviq-modal-sm">
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="auth-loading-title" tabIndex={-1} className="noviq-modal-panel rounded-2xl border border-[#D8DEE7] bg-white p-6 text-[#14213D]">
        <h2 id="auth-loading-title" className="text-xl font-bold">{failed ? copy.title : copy.loading}</h2>
        {failed && <p role="alert" className="mt-4 text-sm leading-6">{copy.retryHelp}</p>}
        {failed && <button type="button" onClick={onRetry} className="mt-5 min-h-11 rounded-xl border border-[#D8DEE7] px-4">{copy.retry}</button>}
        {failed && <button type="button" onClick={()=>window.location.reload()} className="ml-3 min-h-11 underline">{copy.reloadApp}</button>}
        <button type="button" onClick={onClose} className="mt-5 block min-h-11 w-full rounded-xl bg-[#14213D] px-4 font-semibold text-white">{getAuthCopy(locale).close}</button>
      </div>
    </div>
  </div>,document.body);
}
export function DeferredAuthDialog(props: Props) {
  const opener = useRef(document.activeElement as HTMLElement | null);
  const [attempt,setAttempt]=useState(0);
  const [Dialog,setDialog]=useState<ComponentType<Props>|null>(null);
  const [failed,setFailed]=useState(false);
  useEffect(()=>()=>{queueMicrotask(()=>{if(opener.current?.isConnected)opener.current.focus();});},[]);
  useEffect(()=>{
    let active=true;
    setDialog(null);setFailed(false);
    withDeadline(import('./AuthDialog'),15000).then(module=>{
      if(active)setDialog(()=>module.AuthDialog);
    }).catch(()=>{if(active)setFailed(true);});
    return ()=>{active=false;};
  },[attempt]);
  const retry=()=>setAttempt(value=>value+1);
  const fallback=<PendingAuth failed={failed} onRetry={retry} onClose={props.onClose}/>;
  return Dialog ? <PageBoundary key={attempt} retry={retry} fallback={<PendingAuth failed onRetry={retry} onClose={props.onClose}/>}><Dialog {...props}/></PageBoundary> : fallback;
}

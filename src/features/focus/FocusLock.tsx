import {useEffect,useRef,useState} from 'react';

// Called directly from Start/Resume so browsers retain the user gesture.
export function requestFocusFullscreen(){
  const zone=document.querySelector<HTMLElement>('[data-focus-zone]');
  if(!zone?.querySelector<HTMLInputElement>('[data-focus-lock]')?.checked)return;
  zone.dataset.focusExpanded='true';
  zone.dispatchEvent(new Event('focus-expanded'));
  if(document.fullscreenElement===zone)return;
  // Phones without the Fullscreen API use the same expanded workspace.
  const fallback=()=>zone.dispatchEvent(new Event('focus-fullscreen-fallback'));
  if(!zone.requestFullscreen){fallback();return;}
  try{void zone.requestFullscreen({navigationUI:'hide'}).catch(fallback);}catch{fallback();}
}
export function FocusLock({running,mode,locale,onToggle}:{running:boolean;mode:string;locale:string;time:number;task:string;busy:boolean;error:string;onToggle:()=>void;onFinish:()=>void}){
  const [enabled,setEnabled]=useState(true),[full,setFull]=useState(false),[expanded,setExpanded]=useState(false),[message,setMessage]=useState('');
  const host=useRef<HTMLDivElement>(null),wasFull=useRef(false),active=useRef(running);active.current=running;
  const pause=useRef(onToggle);pause.current=onToggle;
  const text=(en:string,uz:string,ru:string)=>locale==='uz'?uz:locale==='ru'?ru:en;
  useEffect(()=>{
    const zone=host.current?.closest<HTMLElement>('[data-focus-zone]');
    const stop=()=>{if(active.current){active.current=false;pause.current();}};
    const collapse=()=>{if(zone)delete zone.dataset.focusExpanded;setExpanded(false);};
    const changed=()=>{const current=document.fullscreenElement===zone;setFull(current);if(wasFull.current&&!current){stop();collapse();setMessage(text('Session paused. Resume when you are ready.','Sessiya pauzada. Tayyor bo‘lganda davom eting.','Сессия приостановлена. Продолжите, когда будете готовы.'));}wasFull.current=current;};
    const enter=()=>{setExpanded(true);setMessage('');};
    const fallback=()=>setMessage(text('Focus view is expanded. Your browser keeps its own controls visible.','Focus ekranga yoyildi. Brauzer o‘z boshqaruvlarini ko‘rsatishi mumkin.','Focus развёрнут. Элементы браузера могут оставаться видимыми.'));
    const hidden=()=>{if(document.hidden&&zone?.dataset.focusExpanded==='true'){stop();setMessage(text('Session paused while you were away.','Boshqa sahifaga o‘tilganda sessiya pauza qilindi.','При переходе с этой страницы сессия приостановлена.'));}};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!document.fullscreenElement&&zone?.dataset.focusExpanded==='true'){stop();collapse();}};
    document.addEventListener('fullscreenchange',changed);document.addEventListener('visibilitychange',hidden);document.addEventListener('keydown',escape);zone?.addEventListener('focus-expanded',enter);zone?.addEventListener('focus-fullscreen-fallback',fallback);
    return()=>{if(zone){delete zone.dataset.focusExpanded;zone.dataset.focusLockActive='false';}document.removeEventListener('fullscreenchange',changed);document.removeEventListener('visibilitychange',hidden);document.removeEventListener('keydown',escape);zone?.removeEventListener('focus-expanded',enter);zone?.removeEventListener('focus-fullscreen-fallback',fallback);if(document.fullscreenElement===zone)void document.exitFullscreen().catch(()=>{});};
  },[locale]);
  const release=()=>{const zone=host.current?.closest<HTMLElement>('[data-focus-zone]');stopRunning();if(zone)delete zone.dataset.focusExpanded;setExpanded(false);setMessage('');if(document.fullscreenElement===zone)void document.exitFullscreen().catch(()=>{});};
  const stopRunning=()=>{if(active.current){active.current=false;pause.current();}};
  useEffect(()=>{if(mode!=='focus'){const zone=host.current?.closest<HTMLElement>('[data-focus-zone]');if(zone)delete zone.dataset.focusExpanded;setExpanded(false);setMessage('');if(document.fullscreenElement===zone)void document.exitFullscreen().catch(()=>{});}},[mode]);
  return <div ref={host} className="focus-lock-controls">
    <label><input data-focus-lock type="checkbox" checked={enabled} onChange={e=>{setEnabled(e.target.checked);if(!e.target.checked)release();}}/>{text('Lock-in during focus sessions','Focus sessiyasida Lock-in','Режим концентрации во время сессии')}</label>
    {expanded&&<button type="button" onClick={release}>{full?text('Exit fullscreen','Fullscreen’dan chiqish','Выйти из полноэкранного режима'):text('Exit lock-in','Lock-in’dan chiqish','Выйти из Lock-in')}</button>}
    {message&&<p role="status">{message}</p>}
  </div>;
}

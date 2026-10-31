import {useEffect,useRef,useState} from 'react';

// Must be invoked synchronously by the student's Start/Resume click.
export function requestFocusFullscreen(){
  const zone=document.querySelector<HTMLElement>('[data-focus-zone]');
  if(!zone?.querySelector<HTMLInputElement>('[data-focus-lock]')?.checked || document.fullscreenElement)return;
  const failed=()=>zone.dispatchEvent(new Event('focus-fullscreen-error'));
  if(!zone.requestFullscreen){failed();return;}
  void zone.requestFullscreen({navigationUI:'hide'}).catch(failed);
}
export function FocusLock({running,mode,locale,onToggle}:{running:boolean;mode:string;locale:string;time:number;task:string;busy:boolean;error:string;onToggle:()=>void;onFinish:()=>void}){
  const [enabled,setEnabled]=useState(true),[full,setFull]=useState(false),[message,setMessage]=useState(''),[locked,setLocked]=useState(false),[extension,setExtension]=useState({installed:false,active:false});
  const host=useRef<HTMLDivElement>(null),wasFull=useRef(false),active=useRef(running);active.current=running;
  const pause=useRef(onToggle);pause.current=onToggle;
  const text=(en:string,uz:string,ru:string)=>locale==='uz'?uz:locale==='ru'?ru:en;
  useEffect(()=>{
    const zone=host.current?.closest<HTMLElement>('[data-focus-zone]');
    const changed=()=>{const current=document.fullscreenElement===zone;setFull(current);if(current){setLocked(true);if(zone)zone.dataset.focusLockActive='true';}if(wasFull.current&&!current){if(active.current){active.current=false;pause.current();}setMessage(text('Fullscreen ended. Session paused.','Fullscreen yopildi. Sessiya pauzada.','Полноэкранный режим закрыт. Сессия приостановлена.'));}wasFull.current=current;};
    const failed=()=>setMessage(text('Fullscreen is unavailable in this browser. Use Chrome on desktop or F11.','Bu brauzerda fullscreen ishlamadi. Kompyuterda Chrome yoki F11 dan foydalaning.','Полноэкранный режим недоступен. Используйте Chrome на компьютере или F11.'));
    const hidden=()=>{if(document.hidden&&wasFull.current&&active.current){active.current=false;pause.current();setMessage(text('You left Focus. Session paused.','Focus’dan chiqdingiz. Sessiya pauzada.','Вы покинули Focus. Сессия приостановлена.'));}};
    const connected=(event:Event)=>{const detail=(event as CustomEvent).detail;setExtension({installed:detail?.installed===true,active:detail?.active===true});};window.addEventListener('noviq-focus-extension',connected);window.dispatchEvent(new Event('noviq-focus-probe'));
    document.addEventListener('fullscreenchange',changed);document.addEventListener('visibilitychange',hidden);zone?.addEventListener('focus-fullscreen-error',failed);
    return()=>{if(zone)zone.dataset.focusLockActive='false';window.removeEventListener('noviq-focus-extension',connected);document.removeEventListener('fullscreenchange',changed);document.removeEventListener('visibilitychange',hidden);zone?.removeEventListener('focus-fullscreen-error',failed);if(document.fullscreenElement===zone)void document.exitFullscreen().catch(()=>{});};
  },[locale]);
  const release=()=>{setLocked(false);const zone=host.current?.closest<HTMLElement>('[data-focus-zone]');if(zone)zone.dataset.focusLockActive='false';if(document.fullscreenElement===zone)void document.exitFullscreen().catch(()=>{});else if(active.current)pause.current();};
  useEffect(()=>{if(mode!=='focus'){setLocked(false);const zone=host.current?.closest<HTMLElement>('[data-focus-zone]');if(zone)zone.dataset.focusLockActive='false';if(document.fullscreenElement===zone)void document.exitFullscreen().catch(()=>{});}},[mode]);
  return <div ref={host} className="mb-4 flex flex-wrap items-center gap-3 text-sm">
    <label className="flex min-h-11 items-center gap-3 font-semibold"><input data-focus-lock type="checkbox" checked={enabled} onChange={e=>{setEnabled(e.target.checked);if(!e.target.checked)release();}}/>{text('Lock-in during focus sessions','Focus sessiyasida Lock-in','Режим концентрации во время сессии')}</label>
    {locked&&<button type="button" className="min-h-11 rounded-xl border px-4" onClick={release}>{full?text('Exit fullscreen','Fullscreen’dan chiqish','Выйти из полноэкранного режима'):text('Exit lock-in','Lock-in’dan chiqish','Выйти из Lock-in')}</button>}
    <p role="status" className="w-full">{extension.installed?(extension.active?text('Other websites are blocked.','Boshqa saytlar bloklangan.','Другие сайты заблокированы.'):text('Blocking extension connected.','Bloklash kengaytmasi ulangan.','Расширение подключено.')):text('Website blocking needs the NOVIQ extension.','Saytlarni bloklash uchun NOVIQ kengaytmasi kerak.','Для блокировки сайтов нужно расширение NOVIQ.')} {!extension.installed&&<a className="underline" href="/noviq-focus-extension.zip" download>{text('Download extension','Kengaytmani yuklash','Скачать расширение')}</a>}</p>
    {message&&<p role="status">{message}</p>}
    <p className="w-full text-slate-500">{text('Fullscreen hides browser tabs. Leaving Focus pauses the timer; blocking other websites requires a browser extension.','Fullscreen brauzer tablarini yashiradi. Focus’dan chiqish taymerni pauza qiladi; boshqa saytlarni bloklash uchun brauzer kengaytmasi kerak.','Полноэкранный режим скрывает вкладки. При выходе таймер ставится на паузу; блокировка сайтов требует расширения.')}</p>
  </div>;
}

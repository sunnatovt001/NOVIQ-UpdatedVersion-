import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {formatTime} from '@/src/lib/utils';

export function FocusLock({running,mode,time,task,locale,busy,error,onToggle,onFinish}:{running:boolean;mode:string;time:number;task:string;locale:string;busy:boolean;error:string;onToggle:()=>void;onFinish:()=>void}){
  const [enabled,setEnabled]=useState(true),[open,setOpen]=useState(false),[away,setAway]=useState(false);
  const dialog=useRef<HTMLDivElement>(null);
  const uz=locale==='uz',ru=locale==='ru';
  const text=(en:string,uzText:string,ruText:string)=>uz?uzText:ru?ruText:en;
  useEffect(()=>{if(enabled&&running&&mode==='focus')setOpen(true);if(mode!=='focus')setOpen(false);},[enabled,running,mode]);
  const exit=()=>{if(window.confirm(text('Leave lock-in? Your timer will pause.','Lock-in rejimidan chiqasizmi? Taymer pauza qilinadi.','Выйти из режима? Таймер будет приостановлен.'))){if(running)onToggle();setOpen(false);setEnabled(false);}};
  useEffect(()=>{
    if(!open)return;
    setAway(false);
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const visibility=()=>{if(document.hidden)setAway(true);};
    document.addEventListener('visibilitychange',visibility);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('visibilitychange',visibility);previous?.focus();};
  },[open]);
  const eligible=1500-time>=1200;
  return <>
    <label className="mb-4 flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> {text('Lock-in during focus sessions','Focus sessiyasida Lock-in','Режим концентрации во время сессии')}</label>
    {open&&createPortal(<div ref={dialog} role="dialog" aria-modal="true" aria-label="Focus Lock-in" className="fixed inset-0 z-[99999] flex flex-col items-center justify-center gap-6 overflow-auto bg-slate-950 p-6 text-center text-white" onKeyDown={e=>{
      if(e.key==='Escape'){e.preventDefault();exit();}
      if(e.key==='Tab'){const buttons=dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');if(!buttons?.length)return;const first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
    }}>
      <button type="button" onClick={exit} className="absolute right-4 top-4 min-h-11 rounded-xl border border-slate-500 px-4">{text('Exit lock-in','Lock-in’dan chiqish','Выйти')}</button>
      <p className="text-sm uppercase tracking-widest text-blue-300">Focus Zone · Lock-in</p>
      <h2 className="max-w-xl text-2xl font-semibold">{task||text('One task at a time','Diqqat — bitta vazifada','Одна задача за раз')}</h2>
      <p className="font-mono text-7xl tabular-nums" aria-label={text('Time remaining','Qolgan vaqt','Осталось времени')}>{formatTime(time)}</p>
      {error&&<p role="alert" className="max-w-md text-amber-200">{error}</p>}
      {away&&<p role="status" className="max-w-md text-amber-200">{text('Welcome back. Return your attention to your task.','Qaytdingiz. Diqqatni vazifaga qaytaramiz.','Вы вернулись. Продолжим работу над задачей.')}</p>}
      <p className="max-w-md text-sm text-slate-300">{text('Before 20 minutes: incomplete, no XP. Only verified active time counts.','20 daqiqagacha: tugallanmagan, XP berilmaydi. Faqat tasdiqlangan faol vaqt hisoblanadi.','До 20 минут: не завершено, без XP. Учитывается только подтверждённое активное время.')}</p>
      <div className="flex flex-wrap justify-center gap-4"><button type="button" disabled={busy} onClick={onToggle} className="min-h-12 rounded-xl bg-blue-600 px-6">{running?text('Pause','Pauza','Пауза'):text('Resume','Davom etish','Продолжить')}</button><button type="button" disabled={busy} onClick={onFinish} className="min-h-12 rounded-xl border border-slate-500 px-6">{eligible?text('Finish session','Sessiyani tugatish','Завершить сессию'):text('End incomplete session','Tugallanmagan deb yakunlash','Завершить как неполную')}</button></div>
    </div>,document.body)}
  </>;
}

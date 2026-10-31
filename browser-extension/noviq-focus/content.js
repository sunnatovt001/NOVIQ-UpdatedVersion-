(()=>{
  const ORIGIN='https://noviqupdated.vercel.app';
  const app=location.origin===ORIGIN;
  let overlay,previousOverflow,previousFocus,previousActive;
  const send=async message=>{try{return await chrome.runtime.sendMessage(message);}catch{return null;}};
  function display(active){
    if(app){window.dispatchEvent(new CustomEvent('noviq-focus-extension',{detail:{installed:true,active:Boolean(active)}}));return;}
    if(active&&!overlay){
      document.querySelectorAll('video,audio').forEach(media=>media.pause());
      previousFocus=document.activeElement;previousOverflow=document.documentElement.style.overflow;
      overlay=document.createElement('div');overlay.dataset.noviqFocusShield='true';overlay.style.cssText='all:initial;position:fixed;inset:0;z-index:2147483647;background:#020617;display:grid;place-items:center;color:white;font:18px system-ui';
      const shadow=overlay.attachShadow({mode:'closed'}),box=document.createElement('section');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','NOVIQ Focus Lock');box.style.cssText='text-align:center;padding:24px;max-width:600px';
      const title=document.createElement('h1');title.textContent='NOVIQ Focus davom etyapti';
      const text=document.createElement('p');text.textContent='Boshqa saytlar vaqtincha bloklangan. Focus sahifasiga qayting yoki u yerda Lock-in’dan chiqing. / Other websites are paused during Focus.';
      const button=document.createElement('button');button.textContent='Focus’ga qaytish / Return to Focus';button.style.cssText='padding:16px;border:0;border-radius:12px;background:#2563eb;color:white;font:inherit';button.onclick=()=>void send({type:'NOVIQ_FOCUS_RETURN'});
      box.append(title,text,button);shadow.append(box);document.documentElement.append(overlay);document.documentElement.style.overflow='hidden';button.focus();
      overlay.addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();button.focus();}});
    }else if(!active&&overlay){overlay.remove();overlay=null;document.documentElement.style.overflow=previousOverflow||'';previousFocus?.focus?.();}
  }
  chrome.runtime.onMessage.addListener(message=>{if(message?.type==='NOVIQ_FOCUS_STATE')display(message.active);});
  async function sync(){
    if(app){
      const zone=document.querySelector('[data-focus-zone]');
      const active=zone?.dataset.focusLockActive==='true'&&zone.querySelector('[data-focus-lock]')?.checked===true;
      const reply=await send({type:'NOVIQ_FOCUS_SYNC',active:Boolean(active)});
      if(reply&&!reply.error)display(reply.active);else window.dispatchEvent(new CustomEvent('noviq-focus-extension',{detail:{installed:false,active:false}}));
    }else{const reply=await send({type:'NOVIQ_FOCUS_STATUS'});display(Boolean(reply&&!reply.error&&reply.active));}
  }
  if(app){
    const observer=new MutationObserver(()=>{const zone=document.querySelector('[data-focus-zone]'),active=Boolean(zone?.dataset.focusLockActive==='true'&&zone.querySelector('[data-focus-lock]')?.checked);if(active!==previousActive){previousActive=active;void sync();}});
    observer.observe(document.documentElement,{attributes:true,childList:true,subtree:true,attributeFilter:['data-focus-lock-active']});
    window.addEventListener('noviq-focus-probe',()=>void sync());
    document.addEventListener('change',event=>{if(event.target.matches?.('[data-focus-lock]'))void sync();});
  }
  void sync();setInterval(()=>void sync(),15000);
})();

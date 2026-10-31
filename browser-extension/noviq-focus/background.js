const ORIGIN='https://noviqupdated.vercel.app';
const RULE=71001,LEASE=45000;
let serial=Promise.resolve();
const queued=work=>{const result=serial.then(work);serial=result.catch(()=>{});return result;};
const isFocus=url=>{try{const u=new URL(url);return u.origin===ORIGIN&&(u.pathname==='/focus'||u.hash.split('?')[0]==='#/focus');}catch{return false;}};
async function status(){const {focus}=await chrome.storage.session.get('focus');return focus?.expiresAt>Date.now()?focus:null;}
async function publish(focus){
  await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[RULE],addRules:focus?[{
    id:RULE,priority:1,action:{type:'redirect',redirect:{extensionPath:'/blocked.html'}},
    condition:{regexFilter:'^https?://',excludedRequestDomains:['noviqupdated.vercel.app'],resourceTypes:['main_frame']},
  }]:[]});
  await chrome.storage.session.set({focus});
  const tabs=await chrome.tabs.query({});
  await Promise.all(tabs.map(tab=>chrome.tabs.sendMessage(tab.id,{type:'NOVIQ_FOCUS_STATE',active:Boolean(focus)}).catch(()=>{})));
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  queued(async()=>{
    if(message?.type==='NOVIQ_FOCUS_STATUS')return {active:Boolean(await status())};
    if(message?.type==='NOVIQ_FOCUS_RETURN'){
      const focus=await status();if(focus){await chrome.tabs.update(focus.tabId,{active:true});if(Number.isInteger(focus.windowId))await chrome.windows.update(focus.windowId,{focused:true});}return {active:Boolean(focus)};
    }
    if(message?.type!=='NOVIQ_FOCUS_SYNC'||(message.active===true?!isFocus(sender.tab?.url):!sender.tab?.url?.startsWith(ORIGIN+'/'))||sender.frameId!==0)throw new Error('Untrusted sender');
    const current=await status();
    if(message.active===true){
      if(current&&current.tabId!==sender.tab.id)return {active:true,owned:false};
      const next={tabId:sender.tab.id,windowId:sender.tab.windowId,expiresAt:Date.now()+LEASE};
      if(!current)await publish(next);else await chrome.storage.session.set({focus:next});
      return {active:true,owned:true};
    }
    if(current?.tabId===sender.tab.id)await publish(null);
    return {active:Boolean(await status()),owned:false};
  }).then(reply,()=>reply({error:true}));return true;
});
chrome.tabs.onRemoved.addListener(id=>void queued(async()=>{const focus=await status();if(focus?.tabId===id)await publish(null);}));
chrome.tabs.onUpdated.addListener((id,change)=>{if(change.url&&!isFocus(change.url))void queued(async()=>{const focus=await status();if(focus?.tabId===id)await publish(null);});});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='noviq-focus-lease')void queued(async()=>{if(!await status())await publish(null);});});
chrome.alarms.create('noviq-focus-lease',{periodInMinutes:0.5});
void queued(async()=>{const focus=await status();await publish(focus);});

import {useEffect,useRef,useState} from 'react';
import {Sparkles} from 'lucide-react';
import {membershipCall,useMembership} from '@/src/features/pro/MembershipContext';
import {aiPlanningSource,planningContext,reviewAiPlan,type PlanningStyle} from './aiPlanning';
import type {SmartPlan,FocusReceipt} from './smartPlannerModel';
export function PlannerAiPanel({plan,receipts,locale,disabled,onReview,onSettings}:{plan:SmartPlan;receipts:FocusReceipt[];locale:string;disabled:boolean;onReview:(plan:SmartPlan,warnings:string[])=>void;onSettings:()=>void}){
  const member=useMembership(),pro=member.access.entitled;
  const [style,setStyle]=useState<PlanningStyle>('hybrid'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[replan,setReplan]=useState(false);
  const serial=useRef(0),pending=useRef(false);
  const fingerprint=JSON.stringify([plan,receipts,locale,pro,disabled,style,replan]);
  const latest=useRef(fingerprint);latest.current=fingerprint;
  useEffect(()=>()=>{serial.current++;},[]);
  const t=(en:string,uz:string,ru:string)=>locale==='uz'?uz:locale==='ru'?ru:en;
  const generate=async()=>{
    if(pending.current||disabled)return;
    const id=++serial.current,base=fingerprint;pending.current=true;setBusy(true);setError('');
    try{
      const context=planningContext(aiPlanningSource(plan,receipts,pro,replan),receipts,style,pro);
      const response=await membershipCall<{text?:string;scheduleTier?:string}>('generateAiResponse',{feature:'planner',plannerMode:'schedule',planningStyle:style,replanAi:replan&&pro,retries:0,contents:JSON.stringify({...context,language:locale})});
      if(id!==serial.current)return;
      if(latest.current!==base){setError(t('Your plan changed. Generate a fresh draft.','Jadvalingiz o‘zgardi. Yangi taklif yarating.','План изменился. Создайте новый черновик.'));return;}
      if(!response.text)throw new Error('empty');
      const result=reviewAiPlan(plan,receipts,response.text,pro&&response.scheduleTier==='pro',Math.ceil(Date.now()/60000)*60000,replan);
      if(!result.added){setError(t('No complete study task fits the remaining time. Adjust your availability or goals and try again.','Qolgan vaqtga to‘liq o‘quv vazifasi sig‘madi. Bo‘sh vaqt yoki maqsadlarni aniqlashtiring.','В оставшееся время не помещается целое задание. Уточните свободное время или цели.'));return;}
      onReview(result.plan,[result.summary,t(`${result.added} AI tasks proposed. Your own tasks and time blocks are preserved.`,`${result.added} ta AI vazifasi taklif qilindi. O‘z vazifalaringiz va band vaqtlaringiz saqlandi.`,`${result.added} заданий предложено ИИ. Ваши задачи и занятое время сохранены.`),...(result.omitted?[t(`${result.omitted} suggestions did not fit and were omitted.`,`${result.omitted} ta taklif vaqtga sig‘magani uchun qo‘shilmadi.`,`${result.omitted} предложений не поместилось и не было добавлено.`)]:[])]);
      void member.refresh();
    }catch(e){if(id!==serial.current)return;const code=String((e as {code?:string})?.code||'');setError(code.includes('resource-exhausted')?t('AI request limit reached. Try again later.','AI so‘rov limiti tugadi. Keyinroq urinib ko‘ring.','Лимит ИИ исчерпан. Попробуйте позже.'):t('AI could not create a valid plan. Your saved plan is unchanged. Try again.','AI to‘g‘ri reja tuza olmadi. Saqlangan rejangiz o‘zgarmadi. Qayta urinib ko‘ring.','ИИ не смог составить корректный план. Сохранённый план не изменён. Повторите попытку.'));}
    finally{pending.current=false;if(id===serial.current)setBusy(false);}
  };
  return <section className="sp-ai-planning sp-panel" aria-labelledby="sp-ai-title">
    <div className="sp-section-heading"><div><span className="sp-eyebrow">{pro?'PRO AI':'FREE AI'}</span><h2 id="sp-ai-title"><Sparkles size={18} aria-hidden="true"/> {t('Your plans, with AI support','Sizning rejangiz + AI yordami','Ваш план с поддержкой ИИ')}</h2></div><button className="sp-button" onClick={onSettings} disabled={disabled||busy}>{t('My schedule & busy time','Jadvalim va band vaqtlar','Моё расписание и занятость')}</button></div>
    <p>{t('Your schedule comes first. AI adds realistic study tasks only in the time you make available. Review every change before saving.','Avval sizning jadvalingiz. AI faqat siz ajratgan bo‘sh vaqtga mos o‘quv vazifalarini taklif qiladi. Saqlashdan oldin barcha o‘zgarishlarni ko‘rasiz.','Ваше расписание в приоритете. ИИ предлагает задания только на указанное свободное время. Все изменения сохраняются после вашего подтверждения.')}</p>
    <div className="sp-choices" role="group" aria-label={t('AI planning style','AI rejalash usuli','Режим ИИ-планирования')}>
      <button type="button" className="sp-choice" aria-pressed={style==='hybrid'} disabled={busy} onClick={()=>setStyle('hybrid')}>{t('My plan + AI support','Mening rejam + AI yordam','Мой план + помощь ИИ')}</button>
      <button type="button" className="sp-choice" aria-pressed={style==='self'} disabled={busy} onClick={()=>setStyle('self')}>{t('AI-led self-study','AI bilan mustaqil ta’lim','Самообучение с ИИ')}</button>
    </div>
    <p className="sp-muted">{style==='self'?t('AI builds study steps from your subjects, goals and materials. Your busy time stays protected.','AI fan, maqsad va materiallaringiz asosida o‘quv qadamlarini tuzadi. Band vaqtlaringiz himoyalanadi.','ИИ создаёт учебные шаги по предметам, целям и материалам. Занятое время защищено.'):t('Your tasks stay as written. AI suggests complementary practice and review.','Vazifalaringiz qanday yozilgan bo‘lsa shunday qoladi. AI qo‘shimcha mashq va takrorlash taklif qiladi.','Ваши задачи остаются без изменений. ИИ добавляет практику и повторение.')}</p>
    <p className="sp-muted">{pro?t('Pro: a detailed 7-day draft and replanning of unstarted AI tasks.','Pro: 7 kunlik batafsil taklif va boshlanmagan AI vazifalarini qayta rejalash.','Pro: подробный план на 7 дней и пересмотр неначатых задач ИИ.'):t('Free: a short draft for today. Pro adds a detailed weekly plan and AI replanning.','Free: bugun uchun qisqa taklif. Pro haftalik batafsil reja va AI qayta rejalashini qo‘shadi.','Free: краткий план на сегодня. Pro добавляет подробный недельный план и перепланирование.')}</p>
    {pro&&<label className="sp-checkbox"><input type="checkbox" checked={replan} disabled={busy} onChange={e=>setReplan(e.target.checked)}/>{t('Replace unstarted AI tasks in this draft','Taklifda boshlanmagan AI vazifalarini yangilash','Обновить неначатые задачи ИИ в черновике')}</label>}
    <button type="button" className="sp-button sp-primary" disabled={disabled||busy||!plan.subjects.some(s=>!s.paused)} onClick={()=>void generate()}>{busy?t('Creating draft…','Taklif tayyorlanmoqda…','Создаём черновик…'):t('Create AI plan draft','AI reja taklifini yaratish','Создать черновик плана ИИ')}</button>
    {error&&<p role="alert" className="sp-warning">{error}</p>}
  </section>;
}

import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from '@/src/lib/dataStore';
import { Award, Brain, Check, ChevronDown, Flame, Layers, LockKeyhole, Sparkles, Target, Timer, Trophy } from 'lucide-react';
import { useLocale } from '@/src/contexts/LocaleContext';
import { db } from '@/src/lib/firebase';
import { ACHIEVEMENTS } from '@/src/lib/levels';
import { useXpSummary } from './useXpSummary';
import './progression.css';

type Ledger = { id:string;source:string;xpDelta:number;dayKey:string };
const achievementNames = {
  uz: ['Birinchi qadamlar','Birinchi fokus','Fokus quruvchisi','Fokus ustasi','Chuqur mehnat elitasi','Marafon o‘quvchisi','Birinchi eslash','Eslash quruvchisi','Xotira qo‘riqchisi','Xotira afsonasi','7 kunlik muntazamlik','30 kunlik muntazamlik','Maqsad boshlovchisi','Maqsad qo‘riqchisi','Maqsad chempioni','Muvozanatli o‘quvchi'],
  ru: ['Первые шаги','Первый фокус','Развитие фокуса','Мастер фокуса','Элита глубокой работы','Учебный марафон','Первое припоминание','Развитие памяти','Хранитель памяти','Легенда памяти','7 дней подряд','30 дней подряд','Первые цели','Хранитель целей','Чемпион целей','Сбалансированное обучение'],
};

export function ProgressionPanel({ details = false }: { details?: boolean }) {
  const {user,profile,progress,status}=useXpSummary();
  const {locale}=useLocale();
  const tr=(en:string,uz:string,ru:string)=>locale==='uz'?uz:locale==='ru'?ru:en;
  const [filter,setFilter]=useState('all'),[historyOpen,setHistoryOpen]=useState(false);
  const [history,setHistory]=useState<{owner:string;events:Ledger[];status:'loading'|'ready'|'unavailable'}>({owner:'',events:[],status:'loading'});
  useEffect(()=>{
    if(!user||!historyOpen)return;
    let stop:(()=>void)|undefined,live=true;
    const connect=()=>{
      stop?.();
      stop=onSnapshot(query(collection(db,'users',user.uid,'progressEvents'),orderBy('processedAt','desc'),limit(10)),snapshot=>{
        if(live)setHistory({owner:user.uid,events:snapshot.docs.map(d=>({...d.data(),id:d.id} as Ledger)).filter(e=>Number.isFinite(e.xpDelta)),status:'ready'});
      },()=>{if(live)setHistory({owner:user.uid,events:[],status:'unavailable'});});
    };
    connect();window.addEventListener('online',connect);
    return ()=>{live=false;stop?.();window.removeEventListener('online',connect);};
  },[user?.uid,historyOpen]);
  useEffect(()=>{if(window.location.hash==='#achievements')document.getElementById('achievements')?.scrollIntoView({block:'start'});},[]);
  if(!details||!user||!profile)return null;
  const achievements=progress?.achievements||{},counters=progress?.counters||{};
  const known=progress!==null||status==='ready';
  const unlockedCount=ACHIEVEMENTS.filter(item=>achievements[item.id]).length;
  const items=ACHIEVEMENTS.filter(item=>filter==='all'||(known&&(filter==='unlocked'?!!achievements[item.id]:!achievements[item.id])));
  const requirement=(metric:string,target:number)=>{
    if(metric==='focusSeconds')return tr(`${target/3600} hours of focus`,`${target/3600} soat fokus`,`${target/3600} часов фокуса`);
    if(metric==='longFocusSessions')return tr('Focus for 25 minutes','25 daqiqa fokus','25 минут фокуса');
    if(metric==='recallBlocks')return tr('Review 10 distinct cards','10 xil kartani takrorlang','Повторите 10 разных карточек');
    if(metric==='uniqueRecallCards')return tr(`Review ${target} distinct cards`,`${target} xil kartani takrorlang`,`Повторите ${target} разных карточек`);
    if(metric==='bestStreak')return tr(`Study ${target} days in a row`,`${target} kun ketma-ket o‘qing`,`Учитесь ${target} дней подряд`);
    if(metric==='goalDays')return tr(`Complete ${target} daily goals`,`${target} kunlik maqsadni bajaring`,`Выполните ${target} дневных целей`);
    if(metric==='balancedDays')return tr(`${target} days: 10m focus + 10 cards`,`${target} kun: 10 daqiqa fokus + 10 karta`,`${target} дней: 10 мин фокуса + 10 карточек`);
    return tr('Complete your first study activity','Birinchi mashg‘ulotni yakunlang','Завершите первое занятие');
  };
  const events=history.owner===user.uid?history.events:[];
  return <section id="achievements" aria-label={tr('XP and achievements','XP va yutuqlar','XP и достижения')} className="noviq-progression achievements-panel">
    <header className="achievements-heading"><div><span className="achievements-eyebrow"><Sparkles size={14} aria-hidden="true"/>{tr('Your milestones','Sizning marralaringiz','Ваши успехи')}</span><h2>{tr('Achievements','Yutuqlar','Достижения')}</h2><p>{tr('Study milestones unlock badges and bonus XP.','O‘qish marralari badgelar va bonus XP beradi.','Учебные достижения открывают значки и бонусный XP.')}</p></div><span className="achievements-count"><Trophy size={20} aria-hidden="true"/><strong>{known?unlockedCount:'—'}<small>/{ACHIEVEMENTS.length}</small></strong><span>{tr('unlocked','ochilgan','открыто')}</span></span></header>
    <div className="achievement-filters" role="group" aria-label={tr('Filter achievements','Yutuqlarni filtrlash','Фильтр достижений')}>{[['all',tr('All','Barchasi','Все')],['unlocked',tr('Unlocked','Ochilgan','Открытые')],['locked',tr('Locked','Qulflangan','Закрытые')]].map(([value,label])=><button key={value} type="button" aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div>
    <div className="achievement-grid">{items.map(item=>{
      const index=ACHIEVEMENTS.indexOf(item),unlocked=achievements[item.id];
      const earned=Math.max(0,Math.min(item.target,counters[item.metric]||0));
      const title=locale==='en'?item.name:achievementNames[locale][index];
      const Icon=item.metric.includes('Focus')||item.metric==='focusSeconds'?Timer:item.metric==='bestStreak'?Flame:item.metric==='goalDays'?Target:item.metric==='balancedDays'?Layers:item.metric.includes('recall')||item.metric==='uniqueRecallCards'?Brain:Award;
      const tier=item.tier==='Bronze'?tr('Bronze','Bronza','Бронза'):item.tier==='Silver'?tr('Silver','Kumush','Серебро'):item.tier==='Gold'?tr('Gold','Oltin','Золото'):tr('Platinum','Platina','Платина');
      const amount=item.metric==='focusSeconds'?`${(earned/3600).toFixed(1)}/${item.target/3600} h`:`${earned}/${item.target}`;
      return <article key={item.id} className="achievement-card" data-tier={item.tier.toLowerCase()} data-unlocked={known?!!unlocked:'unknown'} aria-label={`${title} · ${known?(unlocked?tr('Unlocked','Ochilgan','Открыто'):tr('Locked','Qulflangan','Закрытые')):tr('Sync pending','Sinxronlash kutilmoqda','Ожидается синхронизация')}`}>
        <div className="achievement-top"><span className="achievement-emblem"><Icon size={26} strokeWidth={1.7} aria-hidden="true"/>{!known?null:unlocked?<i><Check size={11} aria-hidden="true"/></i>:<i className="achievement-lock"><LockKeyhole size={10} aria-hidden="true"/></i>}</span><span className="achievement-reward">+{item.xp} XP</span></div>
        <span className="achievement-tier">{tier}</span><h3>{title}</h3><p>{requirement(item.metric,item.target)}</p>
        <div className="achievement-progress"><progress aria-label={title} value={known?(unlocked?item.target:earned):undefined} max={item.target}/><span>{!known?'—':unlocked?tr('Unlocked','Ochilgan','Открыто'):amount}</span></div>
      </article>;
    })}</div>
    {!items.length&&<p className="achievement-empty">{!known?tr('Badges will sync when connected.','Ulanish tiklanganda badgelar yangilanadi.','Значки обновятся после подключения.'):tr('Your next milestone is waiting. Keep studying to unlock a badge.','Keyingi marrangiz sizni kutmoqda. Badge ochish uchun o‘qishda davom eting.','Следующая цель ждёт вас. Продолжайте учиться, чтобы открыть значок.')}</p>}
    <details className="achievement-history" onToggle={event=>setHistoryOpen(event.currentTarget.open)}><summary>{tr('XP history','XP tarixi','История XP')}<ChevronDown size={16} aria-hidden="true"/></summary>
      {historyOpen&&(history.status==='loading'||history.owner!==user.uid?<p>{tr('Loading…','Yuklanmoqda…','Загрузка…')}</p>:history.status==='unavailable'?<p>{tr('History is temporarily unavailable. Your XP is preserved.','Tarix vaqtincha mavjud emas. XP saqlangan.','История временно недоступна. Ваш XP сохранён.')}</p>:events.length?<ul>{events.map(entry=><li key={entry.id}><span>{entry.dayKey} · {entry.source==='focus'?tr('Focus','Fokus','Фокус'):entry.source==='recall'?tr('Review','Takrorlash','Повторение'):tr('Study reward','O‘qish mukofoti','Награда за учёбу')}</span><strong>+{entry.xpDelta} XP</strong></li>)}</ul>:<p>{tr('Rewards from your next study session will appear here.','Keyingi mashg‘ulot mukofotlari shu yerda ko‘rinadi.','Здесь появятся награды за следующее занятие.')}</p>)}
    </details>
  </section>;
}

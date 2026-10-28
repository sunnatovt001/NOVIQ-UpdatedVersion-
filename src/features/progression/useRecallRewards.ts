import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useLocale } from '@/src/contexts/LocaleContext';
import { startRecallSession, submitRecallAttempt, type XpReceipt } from '@/src/lib/verifiedProgress';
import { loadLocalData, saveLocalData } from '@/src/lib/localStore';
import { isReadOnlyAudit } from '@/src/lib/auditMode';
import type { Session, Attempt } from '@/src/features/flashcards/model';

type Pending = { proofId: string; cardId: string; answer: string };
export function useRecallRewards(session: Session) {
  const { user } = useAuth(), { locale } = useLocale();
  const key = `noviq:${user?.uid}:recall-xp:${session.id}`;
  const proof = useRef<string | null>(null), tail = useRef(Promise.resolve()), live = useRef(true);
  const [status, setStatus] = useState(''), [retryable, setRetryable] = useState(false);
  const tr = useCallback((en: string, uz: string, ru: string) => locale === 'uz' ? uz : locale === 'ru' ? ru : en, [locale]);
  const receipts = useRef(new Map<string, XpReceipt>());
  const run = useCallback(() => {
    tail.current = tail.current.catch(() => undefined).then(async () => {
      const queued = loadLocalData<Pending[]>(key, []);
      if (!queued.length) return;
      if (live.current) setStatus(tr('XP pending verification…','XP tasdig‘i kutilmoqda…','Ожидается подтверждение XP…'));
      for (const item of queued) {
        try {
          const receipt = await submitRecallAttempt(item.proofId,item.cardId,item.answer);
          receipts.current.set(receipt.eventId || item.cardId,receipt);
          saveLocalData(key,loadLocalData<Pending[]>(key,[]).filter(row => row.cardId !== item.cardId));
          if(live.current) {
            const total = [...receipts.current.values()].reduce((sum,r) => sum+r.xpDelta,0);
            setStatus(`${tr('Verified','Tasdiqlandi','Подтверждено')} +${total} XP · ${receipt.capReached ? tr('Daily recall XP cap reached.','Kunlik eslash XP chegarasiga yetildi.','Дневной лимит XP за карточки достигнут.') : tr('10 distinct active cards = 15 XP.','10 ta turli faol karta = 15 XP.','10 уникальных активных карточек = 15 XP.')}`);
            setRetryable(false);
          }
        } catch {
          if(live.current) { setStatus(tr('Review saved. XP is not confirmed; retry verification.','Takrorlash saqlandi. XP tasdiqlanmadi; qayta urinib ko‘ring.','Повторение сохранено. XP не подтверждён; повторите проверку.')); setRetryable(true); }
          break;
        }
      }
    });
  },[key,tr]);
  useEffect(() => {
    live.current = true;
    if (session.mode === 'classic' || isReadOnlyAudit) {
      setStatus(tr('Flipping and self-rating do not earn XP.','Kartani aylantirish va o‘zini baholash XP bermaydi.','Переворот и самооценка не дают XP.'));
      return;
    }
    let cancelled = false;
    void startRecallSession(session).then(id => { if(!cancelled) {proof.current = id; run();} }).catch(() => {
      if(!cancelled) setStatus(tr('Device practice · 0 verified XP. Start a new online review to qualify.','Qurilmadagi mashq · 0 tasdiqlangan XP. Yangi onlayn takrorlashni boshlang.','Практика на устройстве · 0 подтверждённых XP. Начните новое повторение онлайн.'));
    });
    const online = () => run(); window.addEventListener('online',online);
    return () => { cancelled = true; live.current = false; proof.current = null; window.removeEventListener('online',online); };
  },[session.id,run,tr]);
  const record = (attempt: Attempt) => {
    if (!proof.current || !navigator.onLine || attempt.mode === 'classic' || !attempt.answer.trim()) return;
    const queued = loadLocalData<Pending[]>(key,[]);
    if (!queued.some(row => row.cardId === attempt.cardId)) saveLocalData(key,[...queued,{proofId:proof.current,cardId:attempt.cardId,answer:attempt.answer}]);
    run();
  };
  return {status,retryable,retry:run,record};
}

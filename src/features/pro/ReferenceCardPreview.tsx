import React, { useEffect, useId, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCw } from 'lucide-react';
import { useLocale } from '@/src/contexts/LocaleContext';
import type { Card } from '@/src/features/flashcards/model';

export function ReferenceCardPreview({ cards, deckId }: { cards: Card[]; deckId: string }) {
  const [index, setIndex] = useState(0), [back, setBack] = useState(false);
  const { locale } = useLocale();
  const contentId = useId();
  const uz = locale === 'uz', ru = locale === 'ru';
  useEffect(() => { setIndex(0); setBack(false); }, [deckId]);
  const current = Math.min(index, Math.max(0, cards.length - 1)), card = cards[current];
  if (!card) return null;
  return <div className="pro-card-preview" role="group" tabIndex={0} aria-label={uz ? 'Kartochka ko‘rinishi' : ru ? 'Просмотр карточек' : 'Flashcard preview. Use arrow keys to navigate.'} onKeyDown={event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      setIndex(Math.max(0, Math.min(cards.length - 1, current + (event.key === 'ArrowRight' ? 1 : -1))));
      setBack(false);
    }
  }}>
    <button className={`pro-preview-face ${back ? 'is-back' : ''}`} type="button" onClick={() => setBack(v => !v)} aria-describedby={contentId} aria-label={uz ? 'Kartochkani aylantirish' : ru ? 'Перевернуть карточку' : 'Flip preview card'}>
      <div className="pro-preview-flipper">
        {[false, true].map(answer => <div key={String(answer)} className={`pro-preview-side ${answer ? 'pro-preview-answer' : ''}`} aria-hidden={answer !== back}>
          <span className="pro-preview-label">{answer ? (uz ? 'Javob' : ru ? 'Ответ' : 'Answer') : (uz ? 'Savol' : ru ? 'Вопрос' : 'Question')}<RotateCw size={17}/></span>
          <span className="pro-preview-content" id={answer === back ? contentId : undefined} aria-live={answer === back ? 'polite' : undefined}>{answer ? card.back : card.front}</span>
          <small>{uz ? 'Aylantirish uchun bosing' : ru ? 'Нажмите, чтобы перевернуть' : 'Click to flip'}</small>
        </div>)}
      </div>
    </button>
    <div className="pro-preview-controls"><button type="button" disabled={current === 0} onClick={() => { setIndex(current - 1); setBack(false); }} aria-label={uz ? 'Oldingi kartochka' : ru ? 'Предыдущая карточка' : 'Previous preview card'}><ArrowLeft size={21}/></button><span aria-live="polite">{current + 1} / {cards.length}</span><button type="button" disabled={current >= cards.length - 1} onClick={() => { setIndex(current + 1); setBack(false); }} aria-label={uz ? 'Keyingi kartochka' : ru ? 'Следующая карточка' : 'Next preview card'}><ArrowRight size={21}/></button></div>
  </div>;
}

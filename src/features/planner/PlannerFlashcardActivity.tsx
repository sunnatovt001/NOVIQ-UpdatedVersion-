import type { FlashcardItem } from "./plannerTypes";
import { cn } from "@/src/lib/utils";

interface Props {
  cards: FlashcardItem[];
  reviewedCards: string[];
  answerLabel: string;
  questionLabel: string;
  onReview: (cardId: string) => void;
}

export const PlannerFlashcardActivity = ({ cards, reviewedCards, answerLabel, questionLabel, onReview }: Props) => (
<div className="grid gap-4 sm:grid-cols-2">
                  {cards.map((card) => {
                    const reviewed = reviewedCards.includes(
                      card.id,
                    );
                    return (
                      <button
                        key={card.id}
                        type="button"
                        aria-pressed={reviewed}
                        onClick={() =>
                          onReview(card.id)
                        }
                        className={cn(
                          "min-h-36 rounded-[1.25rem] border p-5 text-left transition",
                          reviewed
                            ? "border-[var(--noviq-accent)] bg-[var(--noviq-soft)]"
                            : "border-[var(--noviq-border)] bg-[var(--noviq-bg)] hover:border-[var(--noviq-accent)]",
                        )}
                      >
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--noviq-muted)]">
                          {reviewed ? answerLabel : questionLabel}
                        </p>
                        <p className="mt-3 text-base font-black text-[var(--noviq-text)]">
                          {reviewed ? card.back : card.front}
                        </p>
                      </button>
                    );
                  })}
                </div>
);

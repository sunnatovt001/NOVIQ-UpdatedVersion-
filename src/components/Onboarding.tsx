import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertCircle, LockKeyhole } from 'lucide-react';
import { useLocale } from '@/src/contexts/LocaleContext';
import { getOnboardingCopy, onboardingOptionValue } from '@/src/features/onboarding/onboardingCopy';
import { getOnboardingDesignCopy, onboardingSteps } from '@/src/features/onboarding/onboardingConfig';
import { emptyOnboardingAnswers, validOnboardingAnswers, type OnboardingAnswers } from '@/src/features/onboarding/onboardingState';
import { OnboardingLayout, OnboardingStepper, OnboardingOptionCard, OnboardingActions } from '@/src/features/onboarding/OnboardingUI';
export type { OnboardingAnswers } from '@/src/features/onboarding/onboardingState';

export function Onboarding({ onComplete, initialAnswers }: {
  onComplete: (answers: OnboardingAnswers) => void | Promise<void>; initialAnswers?: OnboardingAnswers;
}) {
  const { locale } = useLocale(), copy = getOnboardingCopy(locale), design = getOnboardingDesignCopy(locale);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(() => ({ ...emptyOnboardingAnswers(), ...initialAnswers }));
  const [saving, setSaving] = useState(false), [failed, setFailed] = useState(false);
  const lock = useRef(false), mounted = useRef(true), heading = useRef<HTMLHeadingElement>(null);
  const reduceMotion = useReducedMotion(), groupId = useId();
  const question = onboardingSteps[step], Icon = question.icon;
  const selected = answers[question.id];
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function advance(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !selected) return;
    setFailed(false);
    if (step < 2) { setStep(value => value + 1); return; }
    if (!validOnboardingAnswers(answers)) return;
    lock.current = true; setSaving(true);
    try { await onComplete(answers); }
    catch { if (mounted.current) setFailed(true); }
    finally { if (mounted.current) { lock.current = false; setSaving(false); } }
  }
  return <OnboardingLayout copy={design}>
    <OnboardingStepper step={step} labels={copy.eyebrows} />
    <form onSubmit={advance} aria-busy={saving} className="ob-form">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: reduceMotion ? 0 : 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -10 }} transition={{ duration: reduceMotion ? 0 : 0.18 }} onAnimationComplete={() => { if (step > 0) heading.current?.focus(); }}>
          <div className="ob-question"><span className="ob-question-icon"><Icon size={30} strokeWidth={2} aria-hidden="true" /></span><div>
            <p className="ob-step-caption">{copy.step.replace('{current}', String(step + 1)).replace('{total}', '3')}</p>
            <h2 ref={heading} tabIndex={-1} id={`${groupId}-title`}>{copy.titles[step]}</h2>
            <p id={`${groupId}-hint`}>{design.hints[step]}</p>
          </div></div>
          <fieldset className="ob-options" aria-labelledby={`${groupId}-title`} aria-describedby={`${groupId}-hint`} disabled={saving}>
            {copy.options[step].map((label, index) => {
              const value = onboardingOptionValue(step, index);
              return <OnboardingOptionCard key={value} value={value} label={label} description={design.descriptions[step][index]} name={`${groupId}-${question.id}`} index={index} icon={question.icons[index]} selected={selected === value} disabled={saving} onSelect={value => { if (!lock.current) { setAnswers(current => ({ ...current, [question.id]: value })); setFailed(false); } }} />;
            })}
          </fieldset>
        </motion.div>
      </AnimatePresence>
      {failed && <div role="alert" className="ob-save-error"><AlertCircle size={18} aria-hidden="true" /><p>{copy.failed}</p></div>}
      <OnboardingActions step={step} canContinue={Boolean(selected)} saving={saving} onBack={() => { if (!lock.current) { setFailed(false); setStep(value => Math.max(0, value - 1)); } }} copy={design} />
      <p className="ob-footer" role="status" aria-live="polite">{saving ? design.saving : <><LockKeyhole size={12} aria-hidden="true" />{design.privacy}</>}</p>
    </form>
  </OnboardingLayout>;
}

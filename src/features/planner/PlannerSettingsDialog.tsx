import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, X } from "lucide-react";
import {
  EXAM_OPTIONS,
  PLANNER_INPUT_CLASS,
} from "@/src/features/planner/plannerConfig";
import type {
  EnergyProfile,
  ExamMode,
  PlannerForm,
} from "@/src/features/planner/plannerTypes";
import { cn } from "@/src/lib/utils";
import { useLocale } from "@/src/contexts/LocaleContext";

type PlannerSettingsDialogProps = {
  open: boolean;
  form: PlannerForm;
  hasMission: boolean;
  weakAreasInvalid: boolean;
  validationMessage: string;
  weakAreasInputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onFormChange: (patch: Partial<PlannerForm>) => void;
  onModeChange: (mode: ExamMode) => void;
  onSectionScoreChange: (section: string, value: string) => void;
  onSubmit: () => void;
};

export const PlannerSettingsDialog = ({
  open,
  form,
  hasMission,
  weakAreasInvalid,
  validationMessage,
  weakAreasInputRef,
  onClose,
  onFormChange,
  onModeChange,
  onSectionScoreChange,
  onSubmit,
}: PlannerSettingsDialogProps) => {
  const { t } = useLocale();
  const modeConfig = EXAM_OPTIONS[form.mode];

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          className="noviq-modal-backdrop z-[190]"
        >
          <div className="noviq-modal-positioner noviq-modal-lg">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="planner-settings-title"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="noviq-modal-panel CustomScrollbar rounded-[1.5rem] border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-[#0F172A] sm:rounded-[1.75rem] sm:p-6"
            >
              <div className="mb-5 flex items-start justify-between gap-4 sm:mb-6">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--noviq-accent)]">
                    {t("planner.settings")}
                  </p>
                  <h3
                    id="planner-settings-title"
                    className="mt-1 text-xl font-black sm:mt-2 sm:text-2xl"
                  >
                    {t("planner.shapePlan")}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t("planner.closeSettings")}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] hover:text-[#0F172A]"
                >
                  <X size={18} />
                </button>
              </div>

              <div
                className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2"
                aria-label={t("planner.examType")}
              >
                {(Object.keys(EXAM_OPTIONS) as ExamMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onModeChange(mode)}
                    className={cn(
                      "min-h-11 shrink-0 snap-start rounded-2xl border px-4 text-xs font-black transition",
                      form.mode === mode
                        ? "border-[var(--noviq-accent)] bg-[var(--noviq-soft)] text-[var(--noviq-accent)]"
                        : "border-[#E2E8F0] bg-white text-[#64748B]",
                    )}
                  >
                    {EXAM_OPTIONS[mode].label}
                  </button>
                ))}
              </div>

              <div className="mt-4 grid gap-4 sm:mt-5 sm:grid-cols-2">
                <label>
                  <span className="mb-2 block text-xs font-black text-[#64748B]">
                    {t("planner.goal")}
                  </span>
                  <input
                    value={form.goal}
                    onChange={(event) =>
                      onFormChange({ goal: event.target.value })
                    }
                    className={PLANNER_INPUT_CLASS}
                  />
                </label>
                {(form.mode === "school" || form.mode === "entrance") && (
                  <label>
                    <span className="mb-2 block text-xs font-black text-[#64748B]">
                      {t("planner.subject")}
                    </span>
                    <input
                      value={form.schoolSubject}
                      onChange={(event) =>
                        onFormChange({ schoolSubject: event.target.value })
                      }
                      className={PLANNER_INPUT_CLASS}
                    />
                  </label>
                )}
                <label>
                  <span className="mb-2 block text-xs font-black text-[#64748B]">
                    {t("planner.currentScore")}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={form.currentScore}
                    min={modeConfig.min}
                    max={modeConfig.max}
                    step={modeConfig.step}
                    onChange={(event) =>
                      onFormChange({ currentScore: event.target.value })
                    }
                    className={PLANNER_INPUT_CLASS}
                  />
                </label>
                <label>
                  <span className="mb-2 block text-xs font-black text-[#64748B]">
                    {t("planner.targetScore")}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={form.targetScore}
                    min={modeConfig.min}
                    max={modeConfig.max}
                    step={modeConfig.step}
                    onChange={(event) =>
                      onFormChange({ targetScore: event.target.value })
                    }
                    className={PLANNER_INPUT_CLASS}
                  />
                </label>
                <label>
                  <span className="mb-2 block text-xs font-black text-[#64748B]">
                    {t("planner.examDate")}
                  </span>
                  <input
                    type="date"
                    value={form.examDate}
                    onChange={(event) =>
                      onFormChange({ examDate: event.target.value })
                    }
                    className={PLANNER_INPUT_CLASS}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label>
                    <span className="mb-2 block text-xs font-black text-[#64748B]">
                      {t("planner.hoursDay")}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={form.hoursPerDay}
                      min={0.5}
                      max={12}
                      step={0.5}
                      onChange={(event) =>
                        onFormChange({ hoursPerDay: event.target.value })
                      }
                      className={PLANNER_INPUT_CLASS}
                    />
                  </label>
                  <label>
                    <span className="mb-2 block text-xs font-black text-[#64748B]">
                      {t("planner.daysWeek")}
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={form.daysPerWeek}
                      min={1}
                      max={7}
                      step={1}
                      onChange={(event) =>
                        onFormChange({ daysPerWeek: event.target.value })
                      }
                      className={PLANNER_INPUT_CLASS}
                    />
                  </label>
                </div>
                <label>
                  <span className="mb-2 block text-xs font-black text-[#64748B]">
                    {t("planner.bestTime")}
                  </span>
                  <select
                    value={form.energyProfile}
                    onChange={(event) =>
                      onFormChange({
                        energyProfile: event.target.value as EnergyProfile,
                      })
                    }
                    className={PLANNER_INPUT_CLASS}
                  >
                    <option value="morning">{t("planner.morning")}</option>
                    <option value="balanced">{t("planner.flexible")}</option>
                    <option value="night">{t("planner.evening")}</option>
                  </select>
                </label>
              </div>

              <label className="mt-5 block">
                <span className="mb-2 block text-xs font-black text-[#64748B]">
                  {t("planner.weakAreas")} <span className="text-[var(--noviq-danger)]">*</span>
                </span>
                <input
                  ref={weakAreasInputRef}
                  required
                  aria-invalid={weakAreasInvalid}
                  aria-describedby={
                    weakAreasInvalid ? "planner-weak-areas-error" : undefined
                  }
                  value={form.weakTopics}
                  onChange={(event) =>
                    onFormChange({ weakTopics: event.target.value })
                  }
                  placeholder={t("planner.weakPlaceholder")}
                  className={cn(
                    PLANNER_INPUT_CLASS,
                    weakAreasInvalid &&
                      "border-[var(--noviq-danger-border)] focus:border-[var(--noviq-danger)] focus:ring-[var(--noviq-danger-bg)]",
                  )}
                />
                {weakAreasInvalid && (
                  <p
                    id="planner-weak-areas-error"
                    className="mt-2 text-xs font-bold text-[var(--noviq-danger)]"
                  >
                    {validationMessage}
                  </p>
                )}
              </label>

              <details className="group mt-5 rounded-2xl border border-[#E2E8F0] bg-white">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-black text-[#334155]">
                  {t("planner.sectionScores")}
                  <ChevronDown
                    size={18}
                    className="transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="grid gap-3 border-t border-[#E2E8F0] p-4 sm:grid-cols-2">
                  {modeConfig.sections.map((section) => (
                    <label key={section.name}>
                      <span className="mb-2 block text-xs font-black text-[#64748B]">
                        {section.name}
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={form.sectionScores[section.name] || ""}
                        step={form.mode === "ielts" ? 0.5 : 1}
                        onChange={(event) =>
                          onSectionScoreChange(section.name, event.target.value)
                        }
                        className={PLANNER_INPUT_CLASS}
                      />
                    </label>
                  ))}
                </div>
              </details>

              <div className="sticky bottom-0 -mx-4 mt-5 border-t border-[#E2E8F0] bg-[#F8FAFC]/95 px-4 pb-1 pt-4 backdrop-blur sm:-mx-6 sm:px-6">
                <button
                  type="button"
                  onClick={onSubmit}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--noviq-accent)] px-6 text-sm font-black text-white hover:bg-[var(--noviq-accent-hover)] sm:ml-auto sm:w-auto"
                >
                  {hasMission ? t("planner.savePlan") : t("planner.createStudyPlan")}
                </button>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

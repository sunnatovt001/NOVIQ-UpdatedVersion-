import React, { useState } from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import {
  ArrowRight,
  Check,
  CreditCard,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import {
  getSubscription,
  isPro,
  PAYMENT_METHODS,
  PRO_PRICING,
  recordCheckout,
  recordSubscriptionChangeRequest,
} from "@/src/lib/subscription";
import type { BillingCycle, PaymentProvider } from "@/src/types";
import { getAppErrorMessage } from "@/src/lib/errors";
import { useLocale, type AppLocale } from "@/src/contexts/LocaleContext";
import { formatPricingCopy, getPricingCopy } from "@/src/features/pricing/pricingCopy";

const formatDate = (value: string | undefined, locale: AppLocale, fallback: string) => {
  if (!value) return fallback;
  const dateLocale = locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : "en-US";
  return new Date(value).toLocaleDateString(dateLocale, { month: "short", day: "numeric", year: "numeric" });
};

export const Pricing = ({ setActiveTab }: { setActiveTab: (tab: string) => void }) => {
  const { profile, user, updateLocalProfile } = useAuth();
  const { locale } = useLocale();
  const copy = getPricingCopy(locale);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [provider, setProvider] = useState<PaymentProvider>("click");
  const [checkoutStatus, setCheckoutStatus] = useState("");
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const subscription = getSubscription(profile);
  const activePro = isPro(profile);

  const activatePro = async () => {
    if (!user) return;

    setIsCheckingOut(true);
    setCheckoutStatus("");

    const amount = PRO_PRICING[billingCycle].amount;
    try {
      const checkout = await recordCheckout({ userId: user.uid, billingCycle, provider, amount });
      updateLocalProfile({
        settings: { ...(profile?.settings || {}), preferredPaymentProvider: provider },
      });
      setCheckoutStatus(copy.openingPayment);
      window.location.assign(checkout.checkoutUrl);
    } catch (error) {
      console.warn("Checkout record failed", error);
      setCheckoutStatus(getAppErrorMessage(error));
    } finally {
      setIsCheckingOut(false);
    }
  };

  const cancelRenewal = async () => {
    if (!user) return;
    try {
      const result = await recordSubscriptionChangeRequest({
        userId: user.uid,
        action: "cancel_renewal",
        subscription,
      });
      setCheckoutStatus(result.syncStatus === "synced"
        ? copy.cancellationCreated
        : copy.cancellationLocal);
    } catch (error) {
      console.warn("Cancel subscription request failed", error);
      setCheckoutStatus(copy.cancellationRetry);
    }
  };

  return (
    <div className="space-y-6 pb-16 text-slate-950 dark:text-slate-50">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-700 dark:text-blue-300">{copy.eyebrow}</p>
            <h1 className="mt-3 max-w-3xl font-display text-4xl font-black tracking-tight sm:text-5xl">
              {copy.title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
              {copy.subtitle}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{copy.currentPlan}</p>
            <p className="mt-2 text-xl font-black">{activePro ? "NOVIQ Pro" : copy.freePlan}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              {activePro ? formatPricingCopy(copy.renews, { date: formatDate(subscription.currentPeriodEnd, locale, copy.noRenewal) }) : copy.freeForever}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
        <article className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black">{copy.freePlan}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{copy.freeDescription}</p>
            </div>
            <p className="text-2xl font-black">0 UZS</p>
          </div>

          <div className="mt-6 grid gap-3">
            {copy.freeFeatures.map((feature) => (
              <div key={feature} className="flex items-center gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <Check size={17} className="shrink-0 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                {feature}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("dashboard")}
            className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            {copy.continueFree}
          </button>
        </article>

        <article className="relative rounded-3xl border-2 border-blue-300 bg-white p-6 dark:border-blue-500/50 dark:bg-slate-900">
          <div className="absolute right-5 top-5 rounded-lg bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
            {copy.recommended}
          </div>

          <div className="pr-28">
            <h2 className="text-2xl font-black">{copy.proPlan}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{copy.proDescription}</p>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">
                {(["monthly", "yearly"] as BillingCycle[]).map((cycle) => (
                  <button
                    key={cycle}
                    type="button"
                    onClick={() => setBillingCycle(cycle)}
                    aria-pressed={billingCycle === cycle}
                    className={cn(
                      "min-h-11 rounded-xl px-4 py-2 text-sm font-black transition-colors",
                      billingCycle === cycle ? "bg-white text-slate-950 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                    )}
                  >
                    {cycle === "monthly" ? copy.monthly : copy.yearly}
                  </button>
                ))}
              </div>

              <div className="mt-5 flex items-end gap-2">
                <p className="text-4xl font-black tracking-tight">{PRO_PRICING[billingCycle].label.split(" / ")[0]}</p>
                <p className="pb-1 text-sm font-bold text-slate-500 dark:text-slate-400">/ {billingCycle === "monthly" ? copy.month : copy.year}</p>
              </div>

              <div className="mt-6 grid gap-3">
                {copy.proFeatures.map((feature) => (
                  <div key={feature} className="flex items-center gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    <Check size={17} className="shrink-0 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                    {feature}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-blue-700 dark:bg-slate-900 dark:text-blue-300">
                  <ShieldCheck size={20} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{copy.checkout}</p>
                  <p className="text-sm font-bold text-slate-950 dark:text-white">{copy.checkoutDescription}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-2">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setProvider(method.id)}
                    aria-pressed={provider === method.id}
                    className={cn(
                      "flex min-h-12 items-center justify-between rounded-2xl border px-4 text-left text-sm font-black transition-colors",
                      provider === method.id
                        ? "border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-500/10 dark:text-blue-200"
                        : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <CreditCard size={17} aria-hidden="true" />
                      {method.label}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{method.region === "Uzbekistan" ? copy.uzbekistan : copy.international}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={activatePro}
                disabled={isCheckingOut}
                aria-busy={isCheckingOut}
                className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCheckingOut && <LoaderCircle size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {activePro ? copy.updateBilling : copy.upgrade}
                {!isCheckingOut && <ArrowRight size={17} aria-hidden="true" />}
              </button>

              {activePro && (
                <button
                  type="button"
                  onClick={cancelRenewal}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
                >
                  <X size={16} aria-hidden="true" />
                  {copy.cancelRenewal}
                </button>
              )}

              {checkoutStatus && (
                <p role="status" className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                  {checkoutStatus}
                </p>
              )}
            </div>
          </div>
        </article>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
              <Sparkles size={20} aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-lg font-black">{copy.paymentMethods}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{copy.paymentDescription}</p>
            </div>
          </div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{copy.uzsBilling}</p>
        </div>
      </section>
    </div>
  );
};

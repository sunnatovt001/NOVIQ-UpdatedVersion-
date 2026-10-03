import React, { useState } from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import {
  ArrowRight,
  Check,
  CreditCard,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import {
  FREE_FEATURES,
  getPlanLabel,
  getSubscription,
  isPro,
  PAYMENT_METHODS,
  PRO_FEATURES,
  PRO_PRICING,
  recordCheckout,
  recordSubscriptionChangeRequest,
} from "@/src/lib/subscription";
import type { BillingCycle, PaymentProvider } from "@/src/types";
import { getAppErrorMessage } from "@/src/lib/errors";

const formatDate = (value?: string) => {
  if (!value) return "No renewal date";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

export const Pricing = ({ setActiveTab }: { setActiveTab: (tab: string) => void }) => {
  const { profile, user, updateLocalProfile } = useAuth();
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
      setCheckoutStatus("Opening secure payment. Pro activates after verified payment.");
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
        ? "Cancellation request created. Billing status updates after verification."
        : "Cancellation request saved on this device. It will be sent when sync succeeds.");
    } catch (error) {
      console.warn("Cancel subscription request failed", error);
      setCheckoutStatus("Cancellation request saved on this device. Cloud sync will retry automatically.");
    }
  };

  return (
    <div className="space-y-6 pb-16 text-[#111827]">
      <section className="rounded-[2rem] border border-[#E5E7EB] bg-white p-6 shadow-[0_20px_70px_rgba(17,24,39,0.06)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#3F7D58]">Noviq Billing</p>
            <h1 className="mt-3 max-w-3xl font-display text-4xl font-black tracking-tight sm:text-5xl">
              Simple pricing for exam preparation.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[#6B7280]">
              Free covers the core academic workflow. Pro adds unlimited AI evaluation and exam intelligence for IELTS, SAT, HSK, CEFR, school subjects, and university entrance prep.
              {" "}AI usage is subject to a daily fair-use allowance and request-rate limits.
            </p>
          </div>

          <div className="rounded-2xl border border-[#E5E7EB] bg-[#FAFAF8] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#6B7280]">Current plan</p>
            <p className="mt-2 text-xl font-black">{getPlanLabel(profile)}</p>
            <p className="mt-1 text-xs font-semibold text-[#6B7280]">
              {activePro ? `Renews ${formatDate(subscription.currentPeriodEnd)}` : "Free forever"}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
        <article className="rounded-[2rem] border border-[#E5E7EB] bg-white p-6 shadow-[0_20px_70px_rgba(17,24,39,0.05)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black">Free Plan</h2>
              <p className="mt-2 text-sm leading-6 text-[#6B7280]">Core study operating system for daily academic progress.</p>
            </div>
            <p className="text-2xl font-black">0 UZS</p>
          </div>

          <div className="mt-6 grid gap-3">
            {FREE_FEATURES.slice(0, 7).map((feature) => (
              <div key={feature} className="flex items-center gap-3 text-sm font-semibold text-[#374151]">
                <Check size={17} className="text-[#3F7D58]" />
                {feature}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("dashboard")}
            className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white px-5 text-sm font-black text-[#111827] transition hover:bg-[#FAFAF8]"
          >
            Continue Free
          </button>
        </article>

        <article className="relative rounded-[2rem] border border-[#3F7D58]/35 bg-white p-6 shadow-[0_24px_80px_rgba(17,24,39,0.08)]">
          <div className="absolute right-5 top-5 rounded-full bg-[#F0FDF4] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#3F7D58]">
            Most Popular
          </div>

          <div className="pr-28">
            <h2 className="text-2xl font-black">Pro Plan</h2>
            <p className="mt-2 text-sm leading-6 text-[#6B7280]">Unlimited AI tools for serious exam preparation.</p>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <div className="inline-flex rounded-2xl border border-[#E5E7EB] bg-[#FAFAF8] p-1">
                {(["monthly", "yearly"] as BillingCycle[]).map((cycle) => (
                  <button
                    key={cycle}
                    type="button"
                    onClick={() => setBillingCycle(cycle)}
                    className={cn(
                      "rounded-xl px-4 py-2 text-sm font-black capitalize transition",
                      billingCycle === cycle ? "bg-white text-[#111827] shadow-sm" : "text-[#6B7280] hover:text-[#111827]"
                    )}
                  >
                    {cycle}
                  </button>
                ))}
              </div>

              <div className="mt-5 flex items-end gap-2">
                <p className="text-4xl font-black tracking-tight">{PRO_PRICING[billingCycle].label.split(" / ")[0]}</p>
                <p className="pb-1 text-sm font-bold text-[#6B7280]">/ {billingCycle === "monthly" ? "month" : "year"}</p>
              </div>

              <div className="mt-6 grid gap-3">
                {PRO_FEATURES.slice(0, 7).map((feature) => (
                  <div key={feature} className="flex items-center gap-3 text-sm font-semibold text-[#374151]">
                    <Check size={17} className="text-[#3F7D58]" />
                    {feature}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-[#E5E7EB] bg-[#FAFAF8] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#3F7D58]">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#6B7280]">Checkout</p>
                  <p className="text-sm font-bold text-[#111827]">One step. Secure payment method.</p>
                </div>
              </div>

              <div className="mt-5 grid gap-2">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setProvider(method.id)}
                    className={cn(
                      "flex min-h-12 items-center justify-between rounded-2xl border px-4 text-left text-sm font-black transition",
                      provider === method.id
                        ? "border-[#3F7D58] bg-[#F0FDF4] text-[#2F6145]"
                        : "border-[#E5E7EB] bg-white text-[#374151] hover:border-[#3F7D58]/40"
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <CreditCard size={17} />
                      {method.label}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9CA3AF]">{method.region}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={activatePro}
                disabled={isCheckingOut}
                className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#3F7D58] px-5 text-sm font-black text-white transition hover:bg-[#2F6145] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {activePro ? "Update Pro Billing" : "Upgrade to Pro"}
                <ArrowRight size={17} />
              </button>

              {activePro && (
                <button
                  type="button"
                  onClick={cancelRenewal}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-5 text-sm font-bold text-[#6B7280] transition hover:bg-[#FAFAF8] hover:text-[#111827]"
                >
                  <X size={16} />
                  Cancel renewal
                </button>
              )}

              {checkoutStatus && (
                <p className="mt-4 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-semibold text-[#374151]">
                  {checkoutStatus}
                </p>
              )}
            </div>
          </div>
        </article>
      </section>

      <section className="rounded-[1.75rem] border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_50px_rgba(17,24,39,0.04)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F0FDF4] text-[#3F7D58]">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black">Supported payment methods</h3>
              <p className="mt-1 text-sm text-[#6B7280]">Click, Payme, Visa / Mastercard. No unnecessary checkout steps.</p>
            </div>
          </div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#6B7280]">UZS billing</p>
        </div>
      </section>
    </div>
  );
};

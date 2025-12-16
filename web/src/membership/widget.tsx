import { useState } from "react";
import { callTool, openExternal, sendFollowUpMessage } from "../lib/bridge";
import { useWidgetProps } from "../lib/hooks";
import type { MembershipWidgetProps } from "../lib/types";

function parseToolJson(result: string): { structuredContent?: any } {
  try {
    return JSON.parse(result || "{}");
  } catch {
    return {};
  }
}

export function MembershipWidget() {
  const props = useWidgetProps<MembershipWidgetProps>() ?? { view: "paywall", message: "" };
  const [liveProps, setLiveProps] = useState<MembershipWidgetProps | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const viewProps = liveProps ?? props;

  const startCheckout = async (plan: "plus" | "lifetime", billingInterval?: "monthly" | "yearly") => {
    setIsBusy(true);
    setError(null);
    try {
      const resp = await callTool(
        "moneko.start_checkout",
        plan === "plus" ? { plan, billingInterval: billingInterval || "monthly" } : { plan }
      );
      const parsed = parseToolJson(resp.result);
      const url = parsed?.structuredContent?.url ? String(parsed.structuredContent.url) : null;
      if (!url) throw new Error("Missing checkout URL.");
      openExternal(url);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to start checkout.");
    } finally {
      setIsBusy(false);
    }
  };

  const openPortal = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const resp = await callTool("moneko.open_billing_portal", {});
      const parsed = parseToolJson(resp.result);
      const url = parsed?.structuredContent?.url ? String(parsed.structuredContent.url) : null;
      if (!url) throw new Error("Missing portal URL.");
      openExternal(url);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to open billing portal.");
    } finally {
      setIsBusy(false);
    }
  };

  const refresh = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const resp = await callTool("moneko.subscription_status", {});
      const parsed = parseToolJson(resp.result);
      if (parsed?.structuredContent) {
        setLiveProps(parsed.structuredContent as MembershipWidgetProps);
      }
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to refresh membership.");
    } finally {
      setIsBusy(false);
    }
  };

  const openApp = async () => {
    await sendFollowUpMessage("Open the Moneko app dashboard.");
  };

  const subscription = viewProps.subscription || null;

  return (
    <div className="membership" role="article" aria-label="Moneko membership">
      <header className="membership-header">
        <h1 className="membership-title">Membership</h1>
        <p className="membership-subtitle">
          {viewProps.view === "member"
            ? "You’re subscribed. Manage billing or open the app."
            : "Start a 30-day free trial (eligible accounts) or subscribe to unlock Moneko inside ChatGPT."}
        </p>
      </header>

      {viewProps.message && <div className="membership-message">{viewProps.message}</div>}
      {error && (
        <div className="form-error" role="alert" aria-live="polite">
          {error}
        </div>
      )}

      {viewProps.view === "member" ? (
        <div className="membership-card">
          <div className="membership-row">
            <span className="membership-label">Plan</span>
            <span className="membership-value">{subscription?.plan || "—"}</span>
          </div>
          <div className="membership-row">
            <span className="membership-label">Status</span>
            <span className="membership-value">{subscription?.status || "—"}</span>
          </div>
          <div className="membership-actions">
            <button className="btn btn-primary" type="button" onClick={openApp} disabled={isBusy}>
              Open app
            </button>
            <button className="btn btn-secondary" type="button" onClick={openPortal} disabled={isBusy}>
              Billing portal
            </button>
            <button className="btn btn-secondary" type="button" onClick={refresh} disabled={isBusy}>
              Refresh
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="plans">
            <div className="plan plan-featured">
              <div className="plan-badge">Best value</div>
              <div className="plan-name">Plus Annual</div>
              <div className="plan-price">$49 / year</div>
              <div className="plan-note">Includes a 30-day free trial if eligible.</div>
              <button className="btn btn-primary" type="button" onClick={() => startCheckout("plus", "yearly")} disabled={isBusy}>
                Start trial
              </button>
            </div>
            <div className="plan">
              <div className="plan-name">Plus Monthly</div>
              <div className="plan-price">$7.99 / month</div>
              <div className="plan-note">Try free for 30 days if eligible.</div>
              <button className="btn btn-secondary" type="button" onClick={() => startCheckout("plus", "monthly")} disabled={isBusy}>
                Subscribe
              </button>
            </div>
            <div className="plan">
              <div className="plan-name">Lifetime</div>
              <div className="plan-price">$149 one-time</div>
              <div className="plan-note">Founder plan. No recurring billing.</div>
              <button className="btn btn-secondary" type="button" onClick={() => startCheckout("lifetime")} disabled={isBusy}>
                Buy lifetime
              </button>
            </div>
          </div>

          <div className="membership-actions">
            <button className="btn btn-secondary" type="button" onClick={refresh} disabled={isBusy}>
              {isBusy ? "…" : "I’ve subscribed — refresh"}
            </button>
            <button className="btn btn-secondary" type="button" onClick={openApp} disabled={isBusy}>
              Open app
            </button>
          </div>
        </>
      )}
    </div>
  );
}

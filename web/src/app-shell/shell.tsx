import { useEffect, useMemo, useState } from "react";
import { callTool, openExternal, requestDisplayMode, sendFollowUpMessage } from "../lib/bridge";
import { useOpenAiGlobal, useTheme, useWidgetProps } from "../lib/hooks";
import type {
  AppShellToolOutput,
  BudgetStatusCardProps,
  CategoryBreakdownChartProps,
  ExpenseTableCompactProps,
  MembershipWidgetProps,
} from "../lib/types";

interface Tab {
  id: NonNullable<AppShellToolOutput["tab"]>;
  label: string;
  requiresSubscription: boolean;
}

const TABS: Tab[] = [
  { id: "overview", label: "Overview", requiresSubscription: true },
  { id: "transactions", label: "Transactions", requiresSubscription: true },
  { id: "categories", label: "Categories", requiresSubscription: true },
  { id: "budget", label: "Budget", requiresSubscription: true },
  { id: "insights", label: "Insights", requiresSubscription: true },
  { id: "membership", label: "Membership", requiresSubscription: false },
];

function startOfMonthUtcIso(): string {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return start.toISOString().slice(0, 10);
}

function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseToolJson(result: string): {
  structuredContent?: any;
  contentText?: string;
  isError?: boolean;
} {
  try {
    const parsed = JSON.parse(result || "{}");
    const content = Array.isArray(parsed?.content) ? parsed.content : [];
    const contentText = content
      .map((c: any) => (c && c.type === "text" ? String(c.text || "") : ""))
      .filter(Boolean)
      .join("\n");
    return {
      structuredContent: parsed?.structuredContent,
      contentText,
      isError: Boolean(parsed?.isError),
    };
  } catch {
    return {};
  }
}

async function supabasePasswordGrant(cfg: { supabaseUrl: string; supabaseAnonKey: string }, email: string, password: string) {
  const url = String(cfg.supabaseUrl).replace(/\/+$/, "") + "/auth/v1/token?grant_type=password";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: cfg.supabaseAnonKey,
      Authorization: `Bearer ${cfg.supabaseAnonKey}`,
    },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text || "{}");
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = (data && (data.msg || data.error_description || data.error)) || "Authentication failed";
    throw new Error(String(msg));
  }
  return data;
}

async function supabaseSignUp(cfg: { supabaseUrl: string; supabaseAnonKey: string }, email: string, password: string) {
  const url = String(cfg.supabaseUrl).replace(/\/+$/, "") + "/auth/v1/signup";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: cfg.supabaseAnonKey,
      Authorization: `Bearer ${cfg.supabaseAnonKey}`,
    },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text || "{}");
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = (data && (data.msg || data.error_description || data.error)) || "Sign up failed";
    throw new Error(String(msg));
  }
  return data;
}

export function AppShell() {
  const theme = useTheme();
  const toolOutput = useWidgetProps<AppShellToolOutput>() ?? {};
  const widgetState = useOpenAiGlobal("widgetState") as any;

  const [tab, setTab] = useState<NonNullable<AppShellToolOutput["tab"]>>(
    (widgetState && widgetState.tab) || toolOutput.tab || "overview"
  );

  const [authMode, setAuthMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [isAuthBusy, setIsAuthBusy] = useState(false);

  const [membership, setMembership] = useState<MembershipWidgetProps | null>(null);
  const [isRefreshingGate, setIsRefreshingGate] = useState(false);

  const [summary, setSummary] = useState<CategoryBreakdownChartProps | null>(null);
  const [transactions, setTransactions] = useState<ExpenseTableCompactProps | null>(null);
  const [budget, setBudget] = useState<BudgetStatusCardProps | null>(null);
  const [categories, setCategories] = useState<string[] | null>(null);
  const [insightsText, setInsightsText] = useState<string | null>(null);

  const supabaseCfg = useMemo(() => {
    const supabaseUrl = String(toolOutput.supabaseUrl || "").trim();
    const supabaseAnonKey = String(toolOutput.supabaseAnonKey || "").trim();
    if (!supabaseUrl || !supabaseAnonKey) return null;
    return { supabaseUrl, supabaseAnonKey };
  }, [toolOutput.supabaseUrl, toolOutput.supabaseAnonKey]);

  const isAuthed = Boolean(toolOutput.authenticated) || Boolean(membership);
  const isSubscribed = Boolean(toolOutput.subscription?.subscribed) || Boolean(membership && membership.view === "member");

  const setTabPersisted = (next: NonNullable<AppShellToolOutput["tab"]>) => {
    setTab(next);
    try {
      if (window.openai?.setWidgetState) {
        window.openai.setWidgetState({ ...(widgetState || {}), tab: next });
      }
    } catch {
      // ignore
    }
  };

  const refreshAuthAndMembership = async () => {
    setIsRefreshingGate(true);
    setAuthError(null);
    try {
      const authResp = await callTool("moneko.auth_status", {});
      const authParsed = parseToolJson(authResp.result);
      const authed = Boolean(authParsed.structuredContent?.authenticated);
      if (!authed) {
        setMembership(null);
        setAuthSuccess(null);
        return;
      }
      const memResp = await callTool("moneko.subscription_status", {});
      const memParsed = parseToolJson(memResp.result);
      setMembership(memParsed.structuredContent as MembershipWidgetProps);
    } catch (e: any) {
      setAuthError(e?.message ? String(e.message) : "Failed to refresh session.");
    } finally {
      setIsRefreshingGate(false);
    }
  };

  const loadOverview = async () => {
    const startDate = startOfMonthUtcIso();
    const endDate = todayUtcIso();
    const resp = await callTool("get_summary", { range: { startDate, endDate } });
    const parsed = parseToolJson(resp.result);
    setSummary(parsed.structuredContent as CategoryBreakdownChartProps);
  };

  const loadTransactions = async () => {
    const startDate = startOfMonthUtcIso();
    const endDate = todayUtcIso();
    const resp = await callTool("moneko.list_expenses", { startDate, endDate, limit: 50 });
    const parsed = parseToolJson(resp.result);
    setTransactions(parsed.structuredContent as ExpenseTableCompactProps);
  };

  const loadBudget = async () => {
    const date = todayUtcIso();
    const resp = await callTool("moneko.get_budget", { date });
    const parsed = parseToolJson(resp.result);
    setBudget(parsed.structuredContent as BudgetStatusCardProps);
  };

  const loadCategories = async () => {
    const resp = await callTool("list_categories", {});
    const parsed = parseToolJson(resp.result);
    const list = Array.isArray(parsed.structuredContent?.categories) ? parsed.structuredContent.categories : [];
    setCategories(list.map((v: any) => String(v)));
  };

  const loadInsights = async () => {
    const resp = await callTool("financial_insight", {});
    const parsed = parseToolJson(resp.result);
    setInsightsText(parsed.contentText || null);
    setSummary(parsed.structuredContent as CategoryBreakdownChartProps);
  };

  useEffect(() => {
    // On first mount, refresh membership state (so the app shell works even if opened without toolOutput.subscription).
    void refreshAuthAndMembership();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isSubscribed) return;
    // Preload overview/budget once subscribed.
    void (async () => {
      try {
        await Promise.all([summary ? Promise.resolve() : loadOverview(), budget ? Promise.resolve() : loadBudget()]);
      } catch {
        // ignore; each page handles its own errors
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubscribed]);

  const gate = membership ?? (toolOutput.subscription?.subscribed === false ? ({ view: "paywall", message: "Upgrade to continue." } as MembershipWidgetProps) : null);

  const canUseTab = (t: Tab) => {
    if (!t.requiresSubscription) return true;
    return isSubscribed;
  };

  const ensureUsableTab = (next: NonNullable<AppShellToolOutput["tab"]>) => {
    const def = TABS.find((t) => t.id === next) ?? TABS[0];
    if (canUseTab(def)) return next;
    return "membership";
  };

  useEffect(() => {
    const normalized = ensureUsableTab(tab);
    if (normalized !== tab) setTabPersisted(normalized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubscribed]);

  const onRequestFullscreen = async () => {
    await requestDisplayMode("fullscreen");
  };

  const onAuthSubmit = async () => {
    setIsAuthBusy(true);
    setAuthError(null);
    setAuthSuccess(null);
    try {
      if (!supabaseCfg) {
        throw new Error("Missing Supabase configuration. Ask Moneko to open the app again.");
      }
      const cleanEmail = email.trim();
      const cleanPassword = password.trim();
      if (!cleanEmail || !cleanPassword) {
        throw new Error("Please enter your email and password.");
      }

      const data =
        authMode === "sign_in"
          ? await supabasePasswordGrant(supabaseCfg, cleanEmail, cleanPassword)
          : await supabaseSignUp(supabaseCfg, cleanEmail, cleanPassword);

      const accessToken = data?.access_token || data?.session?.access_token;
      if (!accessToken) {
        setAuthSuccess("Account created. Check your email to confirm, then sign in here.");
        return;
      }

      await callTool("moneko.set_auth_session", { access_token: accessToken });
      setPassword("");
      setAuthSuccess("Signed in. Checking membership…");
      await refreshAuthAndMembership();
      setTabPersisted("overview");
    } catch (e: any) {
      setAuthError(e?.message ? String(e.message) : "Authentication failed.");
    } finally {
      setIsAuthBusy(false);
    }
  };

  const onStartCheckout = async (plan: "plus" | "lifetime", billingInterval?: "monthly" | "yearly") => {
    setAuthError(null);
    try {
      const resp = await callTool("moneko.start_checkout", plan === "plus" ? { plan, billingInterval: billingInterval || "monthly" } : { plan });
      const parsed = parseToolJson(resp.result);
      const url = parsed.structuredContent?.url ? String(parsed.structuredContent.url) : null;
      if (!url) throw new Error("Missing checkout URL.");
      openExternal(url);
    } catch (e: any) {
      setAuthError(e?.message ? String(e.message) : "Failed to start checkout.");
    }
  };

  const onOpenBillingPortal = async () => {
    setAuthError(null);
    try {
      const resp = await callTool("moneko.open_billing_portal", {});
      const parsed = parseToolJson(resp.result);
      const url = parsed.structuredContent?.url ? String(parsed.structuredContent.url) : null;
      if (!url) throw new Error("Missing portal URL.");
      openExternal(url);
    } catch (e: any) {
      setAuthError(e?.message ? String(e.message) : "Failed to open billing portal.");
    }
  };

  const onSignOut = async () => {
    setAuthError(null);
    setAuthSuccess(null);
    try {
      await callTool("moneko.clear_auth_session", {});
      setMembership(null);
      setSummary(null);
      setTransactions(null);
      setBudget(null);
      setCategories(null);
      setInsightsText(null);
      setTabPersisted("overview");
    } catch (e: any) {
      setAuthError(e?.message ? String(e.message) : "Failed to sign out.");
    }
  };

  const onAskChatToOpenMembership = async () => {
    await sendFollowUpMessage("Show my Moneko membership and upgrade options.");
  };

  const renderAuth = () => (
    <div className="app-card app-auth" role="article" aria-label="Sign in to Moneko">
      <div className="app-card-header">
        <div className="app-title">Sign in to Moneko</div>
        <div className="app-subtitle">Use your Moneko account to save and view your data in this ChatGPT chat.</div>
      </div>

      {authError && (
        <div className="form-error" role="alert" aria-live="polite">
          {authError}
        </div>
      )}
      {authSuccess && (
        <div className="form-success" role="status" aria-live="polite">
          {authSuccess}
        </div>
      )}

      <div className="app-form">
        <label className="app-label">
          Email
          <input className="app-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="app-label">
          Password
          <input
            className="app-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={authMode === "sign_in" ? "current-password" : "new-password"}
          />
        </label>

        <button className="btn btn-primary" type="button" onClick={onAuthSubmit} disabled={isAuthBusy}>
          {isAuthBusy ? "Working…" : authMode === "sign_in" ? "Sign in" : "Create account"}
        </button>

        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => setAuthMode((m) => (m === "sign_in" ? "sign_up" : "sign_in"))}
          disabled={isAuthBusy}
        >
          {authMode === "sign_in" ? "Create an account" : "I already have an account"}
        </button>

        <div className="app-hint">
          {supabaseCfg ? (
            <>This sign-in happens inside the widget. Your password is sent directly to Supabase Auth.</>
          ) : (
            <>Missing Supabase configuration. Ask Moneko to open the app again.</>
          )}
        </div>
      </div>
    </div>
  );

  const renderPaywall = () => (
    <div className="app-card" role="article" aria-label="Upgrade to Moneko Plus">
      <div className="app-card-header">
        <div className="app-title">Unlock Moneko in ChatGPT</div>
        <div className="app-subtitle">
          Start a 30-day free trial (eligible accounts) or subscribe now. Checkout opens on moneko.io.
        </div>
      </div>

      {authError && (
        <div className="form-error" role="alert" aria-live="polite">
          {authError}
        </div>
      )}

      <div className="plans">
        <div className="plan plan-featured">
          <div className="plan-badge">Best value</div>
          <div className="plan-name">Plus Annual</div>
          <div className="plan-price">$49 / year</div>
          <div className="plan-note">Includes a 30-day free trial if eligible.</div>
          <button className="btn btn-primary" type="button" onClick={() => onStartCheckout("plus", "yearly")}>
            Start trial
          </button>
        </div>
        <div className="plan">
          <div className="plan-name">Plus Monthly</div>
          <div className="plan-price">$7.99 / month</div>
          <div className="plan-note">Try free for 30 days if eligible.</div>
          <button className="btn btn-secondary" type="button" onClick={() => onStartCheckout("plus", "monthly")}>
            Subscribe
          </button>
        </div>
        <div className="plan">
          <div className="plan-name">Lifetime</div>
          <div className="plan-price">$149 one-time</div>
          <div className="plan-note">Founder plan. No recurring billing.</div>
          <button className="btn btn-secondary" type="button" onClick={() => onStartCheckout("lifetime")}>
            Buy lifetime
          </button>
        </div>
      </div>

      <div className="paywall-actions">
        <button className="btn btn-secondary" type="button" onClick={refreshAuthAndMembership} disabled={isRefreshingGate}>
          {isRefreshingGate ? "Refreshing…" : "I’ve subscribed — refresh"}
        </button>
        <button className="btn btn-secondary" type="button" onClick={onAskChatToOpenMembership}>
          Open membership in chat
        </button>
      </div>
    </div>
  );

  const renderOverview = () => {
    const startDate = startOfMonthUtcIso();
    const endDate = todayUtcIso();
    const primary = summary?.breakdown?.[0];
    const totals = primary?.totals || [];
    const bento = totals
      .slice()
      .sort((a, b) => (b.share || 0) - (a.share || 0))
      .slice(0, 6);

    return (
      <div className="page">
        <div className="page-header">
          <div className="page-title">This month</div>
          <div className="page-subtitle">
            {startDate} → {endDate}
          </div>
        </div>

        <div className="grid">
          <div className="card">
            <div className="card-title">Top spending</div>
            <div className="bento" role="list" aria-label="Top categories">
              {bento.length === 0 ? (
                <div className="muted">No data yet. Try logging an expense.</div>
              ) : (
                bento.map((t) => (
                  <div
                    key={t.category}
                    className="bento-tile"
                    style={{ gridRowEnd: `span ${Math.max(1, Math.round((t.share || 0) * 6))}` }}
                    role="listitem"
                  >
                    <div className="bento-name">{t.category}</div>
                    <div className="bento-amount">{t.amountMajor.toFixed(2)}</div>
                    <div className="bento-share">{Math.round((t.share || 0) * 100)}%</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Budget pacing</div>
            {budget ? (
              <>
                <div className="kpi">{budget.remainingTodayMajor.toFixed(2)} remaining today</div>
                <div className="muted">
                  Daily budget {budget.dailyBudgetMajor.toFixed(2)} • Spent {budget.spentToDateMajor.toFixed(2)}
                </div>
              </>
            ) : (
              <button className="btn btn-secondary" type="button" onClick={() => void loadBudget()}>
                Load budget
              </button>
            )}
          </div>

          <div className="card">
            <div className="card-title">Quick actions</div>
            <div className="quick-actions">
              <button className="btn btn-primary" type="button" onClick={() => setTabPersisted("transactions")}>
                View transactions
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setTabPersisted("budget")}>
                Edit budget
              </button>
              <button className="btn btn-secondary" type="button" onClick={onRequestFullscreen}>
                Fullscreen
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTransactions = () => (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Transactions</div>
        <div className="page-subtitle">Edit and delete transactions. Changes sync to your account.</div>
      </div>

      <div className="card">
        {transactions ? (
          <div className="tx-list" role="list" aria-label="Transactions list">
            {transactions.rows.map((r) => (
              <div className="tx-row" key={r.id} role="listitem">
                <div className="tx-main">
                  <div className="tx-desc">{r.description || "—"}</div>
                  <div className="tx-meta">
                    <span>{r.category}</span>
                    <span>•</span>
                    <span>{r.date}</span>
                  </div>
                </div>
                <div className="tx-amt">
                  {new Intl.NumberFormat(undefined, { style: "currency", currency: r.currency }).format(r.amountMajor)}
                </div>
              </div>
            ))}
            <div className="muted">For edit/delete, open the dedicated Transactions widget from chat.</div>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => void sendFollowUpMessage("Show my recent transactions list with edit/delete controls.")}
            >
              Open full table
            </button>
          </div>
        ) : (
          <button className="btn btn-primary" type="button" onClick={() => void loadTransactions()}>
            Load transactions
          </button>
        )}
      </div>
    </div>
  );

  const renderCategories = () => (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Categories</div>
        <div className="page-subtitle">Your category list for logging expenses.</div>
      </div>
      <div className="card">
        {categories ? (
          <div className="pill-grid" role="list" aria-label="Category list">
            {categories.map((c) => (
              <div className="pill" key={c} role="listitem">
                {c}
              </div>
            ))}
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => void sendFollowUpMessage("Show my categories and let me add new ones.")}
            >
              Manage categories
            </button>
          </div>
        ) : (
          <button className="btn btn-primary" type="button" onClick={() => void loadCategories()}>
            Load categories
          </button>
        )}
      </div>
    </div>
  );

  const renderBudget = () => (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Budget</div>
        <div className="page-subtitle">Check pacing, then update your daily budget from chat.</div>
      </div>
      <div className="card">
        {budget ? (
          <>
            <div className="kpi">
              {new Intl.NumberFormat(undefined, { style: "currency", currency: budget.currency }).format(budget.remainingTodayMajor)}{" "}
              remaining today
            </div>
            <div className="muted">
              Daily budget{" "}
              {new Intl.NumberFormat(undefined, { style: "currency", currency: budget.currency }).format(budget.dailyBudgetMajor)} •
              Month projection{" "}
              {new Intl.NumberFormat(undefined, { style: "currency", currency: budget.currency }).format(budget.projectedMonthRemainingMajor)}
            </div>
            <div className="quick-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => void sendFollowUpMessage("Set my daily budget to $15 starting today.")}
              >
                Update budget
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => void loadBudget()}>
                Refresh
              </button>
            </div>
          </>
        ) : (
          <button className="btn btn-primary" type="button" onClick={() => void loadBudget()}>
            Load budget
          </button>
        )}
      </div>
    </div>
  );

  const renderInsights = () => (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Insights</div>
        <div className="page-subtitle">A quick monthly snapshot with next steps.</div>
      </div>
      <div className="card">
        <button className="btn btn-primary" type="button" onClick={() => void loadInsights()}>
          Generate snapshot
        </button>
        {insightsText && <pre className="insight-pre">{insightsText}</pre>}
      </div>
    </div>
  );

  const renderMembership = () => (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Membership</div>
        <div className="page-subtitle">Manage billing or upgrade your plan.</div>
      </div>
      <div className="card">
        {gate?.subscription ? (
          <div className="muted">
            Plan: <strong>{gate.subscription.plan}</strong> • Status: <strong>{gate.subscription.status}</strong>
          </div>
        ) : (
          <div className="muted">Membership details not loaded yet.</div>
        )}
        <div className="quick-actions">
          <button className="btn btn-secondary" type="button" onClick={refreshAuthAndMembership} disabled={isRefreshingGate}>
            {isRefreshingGate ? "Refreshing…" : "Refresh status"}
          </button>
          <button className="btn btn-secondary" type="button" onClick={onOpenBillingPortal} disabled={!isSubscribed}>
            Billing portal
          </button>
          <button className="btn btn-secondary" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
        {!isSubscribed && <div className="muted">Upgrade required to use budgeting features inside ChatGPT.</div>}
        {!isSubscribed && renderPaywall()}
      </div>
    </div>
  );

  const renderContent = () => {
    if (!isAuthed) return renderAuth();
    if (!isSubscribed) return renderPaywall();

    switch (tab) {
      case "overview":
        return renderOverview();
      case "transactions":
        return renderTransactions();
      case "categories":
        return renderCategories();
      case "budget":
        return renderBudget();
      case "insights":
        return renderInsights();
      case "membership":
        return renderMembership();
    }
  };

  return (
    <div className={`app-shell ${theme}`} role="application" aria-label="Moneko app">
      <div className="app-bg" aria-hidden="true" />
      <header className="app-topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            M
          </div>
          <div className="brand-text">
            <div className="brand-name">Moneko</div>
            <div className="brand-tagline">{isSubscribed ? "Budgeting inside ChatGPT" : "Start your free trial"}</div>
          </div>
        </div>
        <div className="top-actions">
          <button className="btn btn-secondary btn-compact" type="button" onClick={refreshAuthAndMembership} disabled={isRefreshingGate}>
            {isRefreshingGate ? "…" : "Refresh"}
          </button>
          <button className="btn btn-secondary btn-compact" type="button" onClick={onRequestFullscreen}>
            Fullscreen
          </button>
        </div>
      </header>

      {isAuthed && (
        <nav className="tabs" role="tablist" aria-label="Moneko navigation">
          {TABS.map((t) => {
            const disabled = !canUseTab(t);
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                className={`tab ${active ? "active" : ""}`}
                role="tab"
                aria-selected={active}
                aria-disabled={disabled}
                disabled={disabled}
                onClick={() => setTabPersisted(t.id)}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
      )}

      <main className="app-main">{renderContent()}</main>
    </div>
  );
}

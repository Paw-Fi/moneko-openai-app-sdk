/**
 * AppShell Component
 *
 * DESIGN GUIDELINES COMPLIANCE:
 * ✅ Mobile-first responsive layout (max-width wrapper)
 * ✅ Sticky navigation tabs
 * ✅ System font stack & Apple-like aesthetic
 * ✅ Smooth transitions for tab switching
 * ✅ Dark mode support via Tailwind
 * ✅ Semantic HTML structure (main, nav, header)
 * ✅ Accessible touch targets
 */

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

// Import Refactored Components
import { BudgetStatusCard } from "../components/BudgetStatusCard";
import { CategoryBreakdownChart } from "../components/CategoryBreakdownChart";
import { ExpenseTableCompact } from "../components/ExpenseTableCompact";

// Shadcn UI Components
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";

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

  // Data States
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

  const [supabaseCfgStable, setSupabaseCfgStable] = useState<typeof supabaseCfg>(null);
  useEffect(() => {
    if (supabaseCfg) setSupabaseCfgStable(supabaseCfg);
  }, [supabaseCfg]);

  const supabaseCfgForAuth = supabaseCfgStable ?? supabaseCfg;

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
    void refreshAuthAndMembership();
  }, []);

  useEffect(() => {
    if (!isSubscribed) return;
    void (async () => {
      try {
        await Promise.all([summary ? Promise.resolve() : loadOverview(), budget ? Promise.resolve() : loadBudget()]);
      } catch {
        // ignore
      }
    })();
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
  }, [isSubscribed]);

  const onRequestFullscreen = async () => {
    await requestDisplayMode("fullscreen");
  };

  const onAuthSubmit = async () => {
    setIsAuthBusy(true);
    setAuthError(null);
    setAuthSuccess(null);
    try {
      if (!supabaseCfgForAuth) {
        throw new Error("Missing Supabase configuration. Ask Moneko to open the app again.");
      }
      const cleanEmail = email.trim();
      const cleanPassword = password.trim();
      if (!cleanEmail || !cleanPassword) {
        throw new Error("Please enter your email and password.");
      }

      const data =
        authMode === "sign_in"
          ? await supabasePasswordGrant(supabaseCfgForAuth, cleanEmail, cleanPassword)
          : await supabaseSignUp(supabaseCfgForAuth, cleanEmail, cleanPassword);

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

  // --- RENDERERS ---

  const renderAuth = () => (
    <Card className="mx-auto w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Sign in to Moneko</CardTitle>
        <CardDescription>
          Use your Moneko account to save and view your data in this ChatGPT chat.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {authError && (
          <Alert variant="destructive">
            <AlertDescription>{authError}</AlertDescription>
          </Alert>
        )}
        {authSuccess && (
          <Alert className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400">
            <AlertDescription>{authSuccess}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={authMode === "sign_in" ? "current-password" : "new-password"}
            />
          </div>

          <Button 
            className="w-full"
            onClick={onAuthSubmit} 
            disabled={isAuthBusy}
          >
            {isAuthBusy ? "Working…" : authMode === "sign_in" ? "Sign in" : "Create account"}
          </Button>

          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setAuthMode((m) => (m === "sign_in" ? "sign_up" : "sign_in"))}
            disabled={isAuthBusy}
          >
            {authMode === "sign_in" ? "Create an account" : "I already have an account"}
          </Button>

          <div className="text-xs text-center text-muted-foreground mt-4">
            {supabaseCfgForAuth ? (
              <>This sign-in happens inside the widget. Your password is sent directly to Supabase Auth.</>
            ) : (
              <>Missing Supabase configuration. Ask Moneko to open the app again.</>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderPaywall = () => (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Unlock Moneko in ChatGPT</CardTitle>
        <CardDescription className="max-w-lg mx-auto">
          Start a 30-day free trial (eligible accounts) or subscribe now. Checkout opens on moneko.io.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {authError && (
            <Alert variant="destructive">
            <AlertDescription>{authError}</AlertDescription>
            </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="relative flex flex-col justify-between rounded-lg border-2 border-primary bg-background p-6 shadow-sm">
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2" variant="default">
              Best value
            </Badge>
            <div className="space-y-2">
              <h3 className="font-bold">Plus Annual</h3>
              <div className="text-2xl font-bold">$49 <span className="text-sm font-normal text-muted-foreground">/ year</span></div>
              <p className="text-xs text-muted-foreground">Includes a 30-day free trial if eligible.</p>
            </div>
            <Button className="mt-4 w-full" onClick={() => onStartCheckout("plus", "yearly")}>
              Start trial
            </Button>
          </div>
          
          <div className="flex flex-col justify-between rounded-lg border bg-background p-6 shadow-sm">
            <div className="space-y-2">
              <h3 className="font-bold">Plus Monthly</h3>
              <div className="text-2xl font-bold">$7.99 <span className="text-sm font-normal text-muted-foreground">/ mon</span></div>
              <p className="text-xs text-muted-foreground">Try free for 30 days if eligible.</p>
            </div>
            <Button variant="outline" className="mt-4 w-full" onClick={() => onStartCheckout("plus", "monthly")}>
              Subscribe
            </Button>
          </div>

          <div className="flex flex-col justify-between rounded-lg border bg-background p-6 shadow-sm">
            <div className="space-y-2">
              <h3 className="font-bold">Lifetime</h3>
              <div className="text-2xl font-bold">$149 <span className="text-sm font-normal text-muted-foreground">one-time</span></div>
              <p className="text-xs text-muted-foreground">Founder plan. No recurring billing.</p>
            </div>
            <Button variant="outline" className="mt-4 w-full" onClick={() => onStartCheckout("lifetime")}>
              Buy lifetime
            </Button>
          </div>
        </div>

        <div className="flex justify-center gap-4 pt-4 border-t items-center">
          <Button variant="link" onClick={refreshAuthAndMembership} disabled={isRefreshingGate}>
             {isRefreshingGate ? "Refreshing…" : "I’ve subscribed — refresh"}
          </Button>
          <div className="w-px h-4 bg-border my-auto"></div>
          <Button variant="link" onClick={onAskChatToOpenMembership}>
             Open membership in chat
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderOverview = () => {
    const startDate = startOfMonthUtcIso();
    const endDate = todayUtcIso();

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight">This month</h2>
          <p className="text-sm text-muted-foreground">
            {startDate} → {endDate}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Top Spending / Breakdown Widget */}
          <div className="lg:col-span-2">
            {summary ? (
              <CategoryBreakdownChart {...summary} />
            ) : (
               <div className="flex h-64 w-full items-center justify-center rounded-xl bg-muted/20 border border-border/50 animate-pulse text-muted-foreground text-sm">
                 <p>Loading summary...</p>
                 <Button variant="link" onClick={() => void loadOverview()}>Retry</Button>
               </div>
            )}
          </div>

          {/* Budget Pacing */}
          <div className="space-y-6">
             {budget ? (
               <BudgetStatusCard {...budget} />
             ) : (
                <Card className="text-center p-6">
                   <CardContent className="pt-6">
                    <Button onClick={() => void loadBudget()}>Load Budget</Button>
                   </CardContent>
                </Card>
             )}
          </div>
          
          <Card className="p-6">
             <CardHeader className="p-0 mb-4">
                <CardTitle className="text-lg">Quick actions</CardTitle>
             </CardHeader>
             <CardContent className="p-0 flex flex-col gap-2">
                <Button onClick={() => setTabPersisted("transactions")}>
                   View transactions
                </Button>
                <Button variant="outline" onClick={() => setTabPersisted("budget")}>
                   Edit budget
                </Button>
                 <Button variant="outline" onClick={onRequestFullscreen}>
                   Fullscreen
                </Button>
             </CardContent>
          </Card>
        </div>
      </div>
    );
  };
  
  const renderTransactions = () => (
    <div className="space-y-4 h-[calc(100vh-140px)] flex flex-col">
       <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Transactions</h2>
        <p className="text-sm text-muted-foreground">Edit and delete transactions. Changes sync to your account.</p>
      </div>
      
      <div className="flex-1 overflow-hidden rounded-xl border bg-card shadow-sm relative">
         {transactions ? (
            <ExpenseTableCompact {...transactions} />
         ) : (
            <div className="flex h-full items-center justify-center">
               <Button onClick={() => void loadTransactions()}>
                  Load transactions
               </Button>
            </div>
         )}
      </div>
    </div>
  );

  const renderCategories = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Categories</h2>
        <p className="text-sm text-muted-foreground">Your category list for logging expenses.</p>
      </div>
      <Card>
        <CardContent className="p-6">
        {categories ? (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2" role="list" aria-label="Category list">
              {categories.map((c) => (
                <Badge key={c} variant="secondary">
                  {c}
                </Badge>
              ))}
            </div>
            <Button
              variant="outline"
              onClick={() => void sendFollowUpMessage("Show my categories and let me add new ones.")}
            >
              Manage categories
            </Button>
          </div>
        ) : (
          <Button onClick={() => void loadCategories()}>
            Load categories
          </Button>
        )}
        </CardContent>
      </Card>
    </div>
  );

  const renderBudget = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Budget</h2>
        <p className="text-sm text-muted-foreground">Check pacing, then update your daily budget from chat.</p>
      </div>
      <div className="max-w-md mx-auto">
        {budget ? (
           <BudgetStatusCard {...budget} />
        ) : (
          <Card className="text-center p-6">
             <CardContent className="pt-6">
                <Button onClick={() => void loadBudget()}>
                Load budget
                </Button>
             </CardContent>
          </Card>
        )}
      </div>
        {/* Helper buttons if needed */}
         <div className="flex justify-center gap-2">
            <Button
                 onClick={() => void sendFollowUpMessage("Set my daily budget to $15 starting today.")}
               >
                 Update budget
            </Button>
            <Button variant="outline" onClick={() => void loadBudget()}>
                 Refresh
           </Button>
         </div>
    </div>
  );

  const renderInsights = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Insights</h2>
        <p className="text-sm text-muted-foreground">A quick monthly snapshot with next steps.</p>
      </div>
      <Card>
        <CardContent className="p-6 space-y-4">
            <Button onClick={() => void loadInsights()}>
            Generate snapshot
            </Button>
            {insightsText && <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground bg-muted p-4 rounded-lg overflow-auto">{insightsText}</pre>}
        </CardContent>
      </Card>
      {summary && <CategoryBreakdownChart {...summary} />}
    </div>
  );

  const renderMembership = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Membership</h2>
        <p className="text-sm text-muted-foreground">Manage billing or upgrade your plan.</p>
      </div>
      <Card>
        <CardContent className="p-6 space-y-6">
        {gate?.subscription ? (
          <div className="text-sm text-muted-foreground">
            Plan: <strong className="text-foreground">{gate.subscription.plan}</strong> • Status: <strong className="text-foreground">{gate.subscription.status}</strong>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Membership details not loaded yet.</div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={refreshAuthAndMembership} disabled={isRefreshingGate}>
            {isRefreshingGate ? "Refreshing…" : "Refresh status"}
          </Button>
          <Button variant="outline" onClick={onOpenBillingPortal} disabled={!isSubscribed}>
            Billing portal
          </Button>
          <Button variant="outline" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
        {!isSubscribed && <div className="text-sm text-amber-600 dark:text-amber-400">Upgrade required to use budgeting features inside ChatGPT.</div>}
        {!isSubscribed && renderPaywall()}
        </CardContent>
      </Card>
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
    <div className={`min-h-screen bg-background font-sans text-foreground antialiased ${theme}`} role="application" aria-label="Moneko app">
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">M</div>
                <div className="hidden sm:block">
                    <div className="text-sm font-semibold leading-none">Moneko</div>
                    <div className="text-[10px] text-muted-foreground">{isSubscribed ? "Budgeting AI" : "Start trial"}</div>
                </div>
            </div>
            
            <div className="flex items-center gap-2">
               <Button variant="ghost" size="icon" className="rounded-full" onClick={refreshAuthAndMembership} disabled={isRefreshingGate} title="Refresh">
                   <svg className={`h-4 w-4 ${isRefreshingGate ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
               </Button>
               <Button variant="ghost" size="icon" className="rounded-full" onClick={onRequestFullscreen} title="Fullscreen">
                   <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
               </Button>
            </div>
        </div>
      </header>

      {isAuthed && (
        <nav className="sticky top-14 z-30 w-full border-b bg-background">
          <div className="container flex h-10 items-center overflow-x-auto px-1 no-scrollbar">
            {TABS.map((t) => {
              const disabled = !canUseTab(t);
              const active = tab === t.id;
              return (
                <Button
                  key={t.id}
                  variant={active ? "default" : "ghost"}
                  size="sm"
                  className={`rounded-sm px-3 py-1.5 h-auto text-sm font-medium ${active ? "bg-background text-foreground shadow-sm hover:bg-background" : "text-muted-foreground hover:text-foreground"} ${disabled ? "pointer-events-none opacity-50" : ""}`}
                  onClick={() => setTabPersisted(t.id)}
                  disabled={disabled}
                >
                  {t.label}
                </Button>
              );
            })}
          </div>
        </nav>
      )}

      <main className="container p-4 md:p-6 pb-20 max-w-5xl mx-auto">{renderContent()}</main>
    </div>
  );
}

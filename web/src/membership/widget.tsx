import { useState } from "react";
import { callTool, openExternal, sendFollowUpMessage } from "../lib/bridge";
import { useWidgetProps } from "../lib/hooks";
import type { MembershipWidgetProps } from "../lib/types";

// Shadcn UI Components
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Alert, AlertDescription } from "../components/ui/alert";

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
    <Card className="mx-auto w-full max-w-2xl" role="article" aria-label="Moneko membership">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Membership</CardTitle>
        <CardDescription className="max-w-lg mx-auto">
          {viewProps.view === "member"
            ? "You’re subscribed. Manage billing or open the app."
            : "Start a 30-day free trial (eligible accounts) or subscribe to unlock Moneko inside ChatGPT."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {viewProps.message && <div className="text-sm text-center text-muted-foreground bg-muted p-2 rounded-md">{viewProps.message}</div>}
        {error && (
            <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
            </Alert>
        )}

        {viewProps.view === "member" ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center text-sm border-b pb-2">
              <span className="text-muted-foreground">Plan</span>
              <span className="font-medium text-foreground">{subscription?.plan || "—"}</span>
            </div>
            <div className="flex justify-between items-center text-sm border-b pb-2">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium text-foreground">{subscription?.status || "—"}</span>
            </div>
            <div className="flex flex-wrap gap-2 justify-center pt-2">
              <Button onClick={openApp} disabled={isBusy}>
                Open app
              </Button>
              <Button variant="outline" onClick={openPortal} disabled={isBusy}>
                Billing portal
              </Button>
              <Button variant="outline" onClick={refresh} disabled={isBusy}>
                Refresh
              </Button>
            </div>
          </div>
        ) : (
          <>
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
                <Button className="mt-4 w-full" onClick={() => startCheckout("plus", "yearly")} disabled={isBusy}>
                  Start trial
                </Button>
              </div>
              
              <div className="flex flex-col justify-between rounded-lg border bg-background p-6 shadow-sm">
                <div className="space-y-2">
                  <h3 className="font-bold">Plus Monthly</h3>
                  <div className="text-2xl font-bold">$7.99 <span className="text-sm font-normal text-muted-foreground">/ mon</span></div>
                  <p className="text-xs text-muted-foreground">Try free for 30 days if eligible.</p>
                </div>
                <Button variant="outline" className="mt-4 w-full" onClick={() => startCheckout("plus", "monthly")} disabled={isBusy}>
                  Subscribe
                </Button>
              </div>

              <div className="flex flex-col justify-between rounded-lg border bg-background p-6 shadow-sm">
                <div className="space-y-2">
                  <h3 className="font-bold">Lifetime</h3>
                  <div className="text-2xl font-bold">$149 <span className="text-sm font-normal text-muted-foreground">one-time</span></div>
                  <p className="text-xs text-muted-foreground">Founder plan. No recurring billing.</p>
                </div>
                <Button variant="outline" className="mt-4 w-full" onClick={() => startCheckout("lifetime")} disabled={isBusy}>
                  Buy lifetime
                </Button>
              </div>
            </div>

            <div className="flex justify-center gap-4 pt-4 border-t items-center">
              <Button variant="link" onClick={refresh} disabled={isBusy}>
                {isBusy ? "Refreshing…" : "I’ve subscribed — refresh"}
              </Button>
              <div className="w-px h-4 bg-border my-auto"></div>
              <Button variant="link" onClick={openApp} disabled={isBusy}>
                Open app
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// OpenAI Apps SDK Type Definitions
// Based on official OpenAI Apps SDK examples

export type Theme = "light" | "dark";

export type SafeAreaInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type SafeArea = {
  insets: SafeAreaInsets;
};

export type DeviceType = "mobile" | "tablet" | "desktop" | "unknown";

export type UserAgent = {
  device: { type: DeviceType };
  capabilities: {
    hover: boolean;
    touch: boolean;
  };
};

export type DisplayMode = "pip" | "inline" | "fullscreen";

export type RequestDisplayMode = (args: { mode: DisplayMode }) => Promise<{
  mode: DisplayMode;
}>;

export type CallToolResponse = {
  result: string;
};

export type CallTool = (
  name: string,
  args: Record<string, unknown>
) => Promise<CallToolResponse>;

export type UnknownObject = Record<string, unknown>;

export type OpenAiGlobals<
  ToolInput = UnknownObject,
  ToolOutput = UnknownObject,
  ToolResponseMetadata = UnknownObject,
  WidgetState = UnknownObject
> = {
  // visuals
  theme: Theme;
  userAgent: UserAgent;
  locale: string;

  // layout
  maxHeight: number;
  displayMode: DisplayMode;
  safeArea: SafeArea;

  // state
  toolInput: ToolInput;
  toolOutput: ToolOutput | null;
  toolResponseMetadata: ToolResponseMetadata | null;
  widgetState: WidgetState | null;
  setWidgetState: (state: WidgetState) => Promise<void>;
};

type API = {
  callTool: CallTool;
  sendFollowUpMessage: (args: { prompt: string }) => Promise<void>;
  openExternal(payload: { href: string }): void;
  requestDisplayMode: RequestDisplayMode;
};

export const SET_GLOBALS_EVENT_TYPE = "openai:set_globals";

export class SetGlobalsEvent extends CustomEvent<{
  globals: Partial<OpenAiGlobals>;
}> {
  readonly type = SET_GLOBALS_EVENT_TYPE;
}

declare global {
  interface Window {
    openai: API & OpenAiGlobals;
    __OPENAI_STRUCTURED_CONTENT__?: {
      component: string;
      props: Record<string, unknown>;
    };
  }

  interface WindowEventMap {
    [SET_GLOBALS_EVENT_TYPE]: SetGlobalsEvent;
  }
}

// Moneko Widget Props Types (from transform.ts in Section B)

export interface BudgetStatusCardProps {
  date: string;
  currency: string;
  dailyBudgetMajor: number;
  spentToDateMajor: number;
  remainingTodayMajor: number;
  projectedMonthRemainingMajor: number;
  daysInMonth: number;
  dayApplied: number;
  risk: {
    projectedNegative: boolean;
  };
  guestInfo: {
    isGuest: boolean;
    canClaim: boolean;
  };
}

export interface ExpenseRow {
  id: string;
  date: string;
  description: string;
  category: string;
  amountMajor: number;
  currency: string;
}

export interface ExpenseTableCompactProps {
  rows: ExpenseRow[];
  window: {
    startDate: string | null;
    endDate: string | null;
    currency: string | null;
  };
}

export interface CategoryTotal {
  category: string;
  amountMajor: number;
  share: number;
}

export interface CategoryBreakdown {
  currency: string;
  totalAmountMajor: number;
  totals: CategoryTotal[];
}

export interface CategoryBreakdownChartProps {
  timeWindow: {
    startDate?: string;
    endDate?: string;
  };
  breakdown: CategoryBreakdown[];
}

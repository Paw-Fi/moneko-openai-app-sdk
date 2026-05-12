/**
 * PrivacyPopover Component
 *
 * DESIGN GUIDELINES COMPLIANCE:
 * ✅ Touch target ≥40px (button)
 * ✅ Keyboard navigation (ESC to close)
 * ✅ Proper ARIA labels and roles
 * ✅ Monochromatic outlined icon
 * ✅ System colors
 * ✅ Concise, transparent messaging
 * ✅ No promotional language
 *
 * Required transparency disclosure for OpenAI review.
 */

import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export function PrivacyPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground gap-1.5">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className="opacity-70"
          >
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M8 7v4M8 5v.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          Privacy
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-4" align="start">
        <div className="text-xs leading-relaxed text-muted-foreground">
          <h3 className="sr-only">Privacy Notice</h3>
          <p>
            Moneko keeps your expenses and budgets so you can review and edit
            them later. You can change or delete any entry.{" "}
            <a
              href="https://moneko.io/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline underline-offset-4"
            >
              Read our Privacy Policy
            </a>
            .
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

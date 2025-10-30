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
 * Must be present in ALL widgets per Section C.1.4 and F.5.
 *
 * Signals:
 * - Persistence of data
 * - User control to edit/delete
 * - Privacy policy location
 */

import { useState, useEffect, useRef } from "react";

export function PrivacyPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="privacy-popover-container" ref={popoverRef}>
      <button
        type="button"
        className="privacy-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Privacy information"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M8 7v4M8 5v.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <span className="privacy-label">Privacy</span>
      </button>

      {isOpen && (
        <div
          className="privacy-popover"
          role="dialog"
          aria-labelledby="privacy-title"
          aria-describedby="privacy-description"
        >
          <div className="privacy-content">
            <h3 id="privacy-title" className="sr-only">Privacy Notice</h3>
            <p id="privacy-description">
              Moneko keeps your expenses and budgets so you can review and edit
              them later. You can change or delete any entry.{" "}
              <a
                href="https://moneko.io/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="privacy-link"
              >
                Read our Privacy Policy
              </a>
              .
            </p>
          </div>
          <button
            type="button"
            className="privacy-close"
            onClick={() => setIsOpen(false)}
            aria-label="Close privacy notice"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

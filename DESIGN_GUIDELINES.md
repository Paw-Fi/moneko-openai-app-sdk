# OpenAI Apps SDK Design Guidelines

**Source**: https://developers.openai.com/apps-sdk/concepts/design-guidelines

This document provides detailed design guidelines for building OpenAI Apps SDK widgets, extracted from the official OpenAI documentation. All developers working on Moneko widgets must follow these guidelines.

---

## Core Design Principles

### 1. Conversational
- Seamlessly integrate with ChatGPT's interface
- Feel like a natural extension of the conversation
- Avoid disrupting conversational flow
- Design for time-bound, action-oriented tasks

### 2. Intelligent (Context-Aware)
- Respond to user intent and conversation context
- Provide relevant information based on chat history
- Dynamically adapt to user needs
- Anticipate next steps without being intrusive

### 3. Simple
- Focus on essential functionality
- Minimize cognitive load
- Reduce complexity in interactions
- Clear, concise content and UI

### 4. Responsive
- Work across all device types (desktop, tablet, mobile)
- Adapt to different screen sizes gracefully
- Fast loading and interaction
- Smooth transitions and animations

### 5. Accessible
- WCAG 2.1 AA compliance minimum
- Support for assistive technologies
- Keyboard navigation
- Proper semantic HTML and ARIA labels

---

## Good Use Cases vs. Avoid

### ✅ RECOMMENDED Use Cases

**Quick, Actionable Tasks:**
- Booking services (restaurants, appointments, travel)
- Ordering food or products
- Checking availability or status
- Tracking deliveries or shipments
- Making reservations
- Quick calculations or lookups
- Simple data visualization
- Form submissions
- Status updates

**Characteristics of Good Use Cases:**
- Single-purpose or narrowly focused
- Time-sensitive actions
- Clear start and end points
- Benefit from conversational context
- Provide immediate value

### ❌ AVOID

**Inappropriate Use Cases:**
- Long-form content reading (articles, documentation)
- Complex multi-step workflows spanning multiple sessions
- Advertisements or promotional content
- Duplicating ChatGPT system functions (e.g., custom chat interfaces)
- Displaying sensitive information (passwords, full credit card numbers)
- Content that requires extensive scrolling
- Overly complex data tables or charts
- Full application replicas

**Why These Are Problematic:**
- Break conversational flow
- Create cognitive overload
- Compete with ChatGPT's primary interface
- Security and privacy concerns
- Poor user experience in conversational context

---

## Display Modes

### 1. Inline Mode

**Purpose**: Lightweight, single-purpose widgets that appear in conversation flow

**Best Practices:**
- **Maximum 2 primary actions** per widget
- **No nested scrolling** (no scrollable areas within widget)
- **Auto-fit content** (widget height adjusts to content)
- Use for quick information display or simple interactions
- Keep content concise and scannable

**Examples:**
- Status cards (budget status, order status)
- Simple charts (pie chart, bar chart)
- Quick forms (1-3 fields)
- Confirmation dialogs

**Design Constraints:**
- Height: Auto-fit (no fixed height)
- Width: Adapts to conversation width
- Actions: ≤2 primary buttons
- Scrolling: None (expand if needed)

### 2. Fullscreen Mode

**Purpose**: Immersive experiences for more complex tasks

**Best Practices:**
- Use for multi-step workflows
- Maintain conversational context
- System composer (chat input) always present at bottom
- Allow easy exit back to conversation
- Provide clear navigation within fullscreen view

**Examples:**
- Multi-step booking flows
- Detailed forms (>3 fields)
- Complex data tables with filtering
- Image galleries or media viewers

**Design Constraints:**
- Takes over full viewport
- System composer always visible
- Back/close navigation required
- Maintain context breadcrumbs

### 3. Picture-in-Picture (PiP)

**Purpose**: Persistent floating window for parallel activities

**Best Practices:**
- For tasks that benefit from staying visible
- Updates dynamically with conversation
- Resizable and draggable by user
- Non-intrusive positioning
- Can be minimized or closed easily

**Examples:**
- Live tracking (delivery, status)
- Timer or countdown
- Music player controls
- Real-time notifications

**Design Constraints:**
- Floating overlay
- User-controlled position
- Minimal footprint when collapsed
- Clear controls for resize/close

---

## Visual Design Guidelines

### 1. Color

**System Colors:**
- **Use system colors** for backgrounds, borders, text
- Inherit light/dark mode automatically from ChatGPT
- Follow platform conventions

**Brand Accents:**
- Brand colors allowed for **accents only** (buttons, highlights, icons)
- Do not override system background colors
- Maintain sufficient contrast (WCAG AA: 4.5:1 for text, 3:1 for UI elements)

**Avoid:**
- Custom gradients or patterns for backgrounds
- Overly colorful designs that clash with ChatGPT's minimal aesthetic
- Brand colors for primary backgrounds

**Example:**
```css
/* Good */
background-color: var(--color-bg);  /* System color */
border-color: var(--color-border);  /* System color */
color: var(--brand-primary);        /* Brand accent for button */

/* Bad */
background: linear-gradient(blue, purple);  /* Custom gradient */
background-color: #FF6B6B;                  /* Brand background */
```

### 2. Typography

**System Fonts:**
- **Use platform-native system fonts** only
- Do not load custom fonts
- Inherit system font sizing
- Respect user's system font preferences

**Font Sizing:**
- Limit font size variation (max 3-4 sizes)
- Use relative units (rem, em) not absolute (px)
- Follow platform type scale

**Hierarchy:**
- Clear visual hierarchy with size and weight
- Limit to 2-3 font weights (regular, medium, bold)

**Example:**
```css
/* Good */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui;
font-size: 1rem;    /* System base size */
font-size: 1.5rem;  /* Heading */

/* Bad */
font-family: "Custom Font", serif;
font-size: 17px;    /* Absolute sizing */
```

### 3. Spacing

**System Grid:**
- Use consistent spacing units (8px grid recommended)
- Follow platform spacing conventions
- Maintain visual hierarchy with spacing

**Padding & Margins:**
- Consistent padding around elements
- Use spacing to create visual grouping
- Generous touch targets (≥40px for interactive elements)

**Example:**
```css
/* Good - 8px grid system */
--space-xs: 0.25rem;  /* 4px */
--space-sm: 0.5rem;   /* 8px */
--space-md: 1rem;     /* 16px */
--space-lg: 1.5rem;   /* 24px */
--space-xl: 2rem;     /* 32px */

padding: var(--space-md);
margin-bottom: var(--space-lg);

/* Bad - arbitrary values */
padding: 13px;
margin: 7px 19px 11px 5px;
```

### 4. Icons & Imagery

**Icons:**
- **Use monochromatic, outlined icons**
- Consistent icon style throughout
- Icons should be clear at small sizes (16px, 20px, 24px)
- Use system icon libraries when possible

**Images:**
- Follow enforced aspect ratios
- Provide proper alt text
- Optimize for web (compressed, appropriate format)
- Lazy load images when possible

**Avoid:**
- **No embedded logos in text responses**
- Complex, multi-color icons
- Large, unoptimized images
- Decorative images without purpose

**Example:**
```jsx
/* Good */
<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
  <path stroke="currentColor" strokeWidth="1.5" d="..." />
</svg>

/* Bad */
<img src="logo.png" alt="" />  /* No alt text */
<svg>
  <path fill="red" />           /* Multi-color */
  <path fill="blue" />
</svg>
```

---

## Tone & Content Guidelines

### 1. Concise Content
- Keep text short and scannable
- Use bullet points for lists
- Avoid long paragraphs
- Front-load important information

### 2. Context-Driven
- Tailor content to conversation context
- Reference previous conversation when relevant
- Avoid generic, one-size-fits-all messaging

### 3. Avoid Promotional Language
- No marketing speak or sales pitches
- Focus on utility and value
- Be transparent about what the tool does
- Don't oversell capabilities

### 4. Transparent Purpose
- Clearly state what the widget does
- Explain why information is needed
- Provide context for actions
- Set clear expectations

### 5. Clear Value Proposition
- Communicate benefit immediately
- Show don't tell (use visuals)
- Make next steps obvious
- Reduce friction to value

**Examples:**

```
✅ Good:
"Your daily budget: €30. You've spent €18.50 today. At this pace, you'll
have ~€120 left by month end."

❌ Bad:
"Discover amazing insights about your spending habits with our revolutionary
AI-powered budgeting platform! Sign up now to unlock premium features!"
```

---

## Accessibility Requirements

### WCAG 2.1 AA Compliance

**Color Contrast:**
- Text contrast: ≥4.5:1 (normal text), ≥3:1 (large text 18pt+)
- UI elements contrast: ≥3:1 (buttons, borders, icons)
- Test with contrast checker tools

**Alt Text:**
- Provide descriptive alt text for all images
- Mark decorative images with `alt=""`
- Include context in alt text, not just description

**Text Resizing:**
- Support text resize up to 200%
- Use relative units (rem, em)
- Test with browser zoom

**Keyboard Navigation:**
- All interactive elements keyboard accessible
- Logical tab order
- Visible focus indicators
- No keyboard traps

**Semantic HTML:**
- Use proper HTML5 elements (`<button>`, `<nav>`, `<main>`, etc.)
- ARIA labels where needed (`aria-label`, `aria-describedby`)
- Proper heading hierarchy (`<h1>` → `<h2>` → `<h3>`)

**Screen Readers:**
- Test with VoiceOver (macOS/iOS), NVDA (Windows), TalkBack (Android)
- Ensure meaningful read order
- Announce dynamic content changes (`aria-live`)

**Example:**
```html
<!-- Good -->
<button
  type="button"
  aria-label="Delete expense: Coffee, €3.80"
  class="btn-icon"
>
  <svg aria-hidden="true">...</svg>
</button>

<!-- Bad -->
<div onclick="deleteExpense()">
  <img src="delete.png" />
</div>
```

---

## Key Recommendations Summary

### Design for Conversation, Not Replication
- Don't try to recreate full applications
- Focus on conversational micro-interactions
- Complement ChatGPT, don't compete with it

### Prioritize User Intent
- Understand what user is trying to accomplish
- Reduce steps to value
- Anticipate common next actions

### Maintain System Trust
- Be transparent about capabilities and limitations
- Handle errors gracefully with clear messaging
- Respect user privacy and data

### Progressive Disclosure
- Show essential information first
- Reveal complexity only when needed
- Use expandable sections for details

### Test Across Contexts
- Test in different conversation contexts
- Test on mobile, tablet, desktop
- Test with different user inputs
- Test with assistive technologies

---

## Moneko-Specific Application

### How Moneko Widgets Apply These Guidelines

**BudgetStatusCard:**
- ✅ Inline mode (quick status check)
- ✅ ≤2 primary actions ("Adjust Budget", "Save in Moneko")
- ✅ System colors with brand accent (blue for primary buttons)
- ✅ Concise, context-driven content
- ✅ Touch targets ≥40px
- ✅ Conditional phrasing ("at this pace")

**CategoryBreakdownChart:**
- ✅ Inline mode (visual data summary)
- ✅ Local SVG visualization (no external chart APIs)
- ✅ Monochromatic icons, system fonts
- ✅ Progressive disclosure (overview → details)
- ✅ Accessible color contrast in charts

**ExpenseTableCompact:**
- ✅ Inline/Fullscreen hybrid (starts inline, expands if needed)
- ✅ Responsive table (desktop: table, mobile: cards)
- ✅ Clear actions (edit, delete) with confirmation
- ✅ Keyboard navigation
- ✅ ARIA labels for row actions

### Anti-Patterns Avoided

❌ No nested scrolling (all widgets auto-fit or use fullscreen)
❌ No promotional language (clear, utility-focused)
❌ No custom fonts (system fonts only)
❌ No sensitive data display (amounts shown, but no full account details)
❌ No advertisement banners (upsells are contextual and value-driven)

---

## Checklist for Developers

Before submitting a widget for review:

- [ ] Widget has clear, single purpose
- [ ] ≤2 primary actions in inline mode
- [ ] No nested scrolling
- [ ] System colors used (brand colors for accents only)
- [ ] System fonts only (no custom font loading)
- [ ] WCAG 2.1 AA contrast ratios met
- [ ] Touch targets ≥40px
- [ ] Keyboard navigation works
- [ ] ARIA labels present
- [ ] Alt text for images
- [ ] Tested at 375px width (mobile)
- [ ] Tested with VoiceOver/NVDA
- [ ] Content is concise and context-driven
- [ ] No promotional language
- [ ] Transparent about purpose
- [ ] Graceful error handling
- [ ] CSP headers present
- [ ] Privacy disclosure included

---

## Resources

- **Official Guidelines**: https://developers.openai.com/apps-sdk/concepts/design-guidelines
- **WCAG 2.1 AA**: https://www.w3.org/WAI/WCAG21/quickref/
- **Contrast Checker**: https://webaim.org/resources/contrastchecker/
- **System Fonts**: https://systemfontstack.com/

---

**Last Updated**: 2025-10-30
**Version**: 1.0
**Status**: Official reference for Moneko widget development

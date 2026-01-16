# Candiq.AI Design Guidelines

## Design Approach

**Selected Framework**: Modern SaaS Productivity (Linear + Notion influence) with Material Design principles for data-heavy components

**Justification**: Candiq.AI is a utility-focused, information-dense professional tool requiring clarity, efficiency, and real-time data visualization. This approach balances sophisticated UI with professional credibility.

---

## Typography System

**Font Stack**: 
- Primary: Inter (via Google Fonts CDN) - UI, body text, data
- Monospace: JetBrains Mono - timestamps, technical data

**Hierarchy**:
- Hero/Page Titles: text-3xl md:text-4xl, font-semibold, tracking-tight
- Section Headers: text-xl md:text-2xl, font-semibold
- Card/Component Titles: text-lg, font-medium
- Body/Primary Text: text-base, font-normal
- Secondary/Meta Text: text-sm, text-opacity-60
- Captions/Timestamps: text-xs, font-mono

---

## Spacing System

**Tailwind Primitives**: Use units of **2, 4, 6, 8, 12, 16**

- Tight spacing (within components): p-2, gap-2
- Standard spacing (between elements): p-4, gap-4, space-y-4
- Section spacing: p-6 to p-8
- Page/Container margins: px-12, py-16

---

## Layout Architecture

### Dashboard/Project Management Pages
- **Container**: max-w-7xl mx-auto px-8 py-12
- **Grid System**: grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
- **Project Cards**: Elevated cards with subtle borders, p-6, rounded-lg, hover transitions
- **Top Navigation**: Full-width sticky header with logo left, user menu right, h-16

### Interview Cockpit (3-Column Desktop Layout)
**Left Sidebar** (w-80):
- Role/candidate info card at top
- Timer component (prominent, always visible)
- Live transcript box (flex-1, scrollable, text-sm)

**Center Panel** (flex-1, min-w-0):
- **Suggestion Box** (top, h-48): 2 AI-generated questions, dismissible chips, gradient border accent
- **Screening Questions** (bottom, flex-1): Scrollable checklist with expandable rubrics, checkbox interactions

**Right Sidebar** (w-96):
- **Notes Section** (top, h-64): Textarea with auto-save indicator
- **Competency Ratings** (bottom): 5-point scale sliders per competency with labels

**Status Indicators**:
- Audio status badge (top-right, always visible)
- Recording banner (sticky top, full-width, blurred background)
- AI state indicator near suggestions ("Listening..." / "Thinking...")

### Report View
- **Container**: max-w-4xl mx-auto
- **Header Section**: Candidate name, role, interview date, overall recommendation badge
- **Content Sections**: Stacked vertically with clear section dividers, py-8 spacing
- **Competency Grid**: 2-column grid on desktop, cards with score visualization
- **Evidence List**: Timeline-style layout with connecting lines

---

## Component Library

### Navigation
- **Top Bar**: Horizontal layout, logo (text-xl font-bold), nav links (text-sm), user dropdown (right-aligned)
- **Breadcrumbs**: text-sm with "/" separators, truncate long names

### Cards & Containers
- **Project Card**: p-6, rounded-lg, border, hover:shadow-md transition
- **Data Card** (cockpit): p-4, rounded-md, border-l-4 accent
- **Stat Card**: Centered number (text-3xl font-bold), label below (text-sm)

### Forms & Inputs
- **Text Input**: px-4 py-2, rounded-md, border, focus:ring-2, w-full
- **Textarea**: Same as text input, min-h-32
- **File Upload**: Dashed border dropzone, p-8, text-center, hover state
- **Checkbox/Radio**: Material Design style, 20px size, rounded corners
- **Select Dropdown**: Native styling enhanced with chevron icon

### Buttons
- **Primary**: px-6 py-2.5, rounded-md, font-medium, text-sm
- **Secondary**: Same sizing, border variant
- **Icon Button**: p-2, rounded-md, square
- **Chip/Tag**: px-3 py-1, rounded-full, text-xs, dismissible with × icon

### Data Display
- **Transcript Entry**: flex row, avatar circle (w-8 h-8), timestamp (text-xs mono), text bubble
- **Question Card**: Expandable accordion, question text (font-medium), rubric in collapsed content
- **Competency Rating**: Horizontal slider with labeled ticks (1-5), current value badge
- **Status Badge**: px-2 py-1, rounded-full, text-xs, uppercase tracking-wide

### Modals & Overlays
- **Confirmation Dialog**: max-w-md, p-6, centered, backdrop blur
- **Toast Notifications**: Fixed bottom-right, stacked, auto-dismiss, slide-in animation

### Real-time Components
- **Audio Waveform**: SVG bars, h-12, animated pulse on active
- **Timer Display**: text-2xl font-mono, tabular numbers
- **AI Thinking Indicator**: Animated dots (3 dots pulsing)
- **Live Badge**: Pulsing dot + "LIVE" text, px-3 py-1

---

## Responsive Behavior

**Desktop-First** (this is desktop-only app):
- Show full 3-column layout on ≥1280px
- On <1280px: Show warning overlay "Please use desktop browser"
- Mobile: Full-screen message, no functionality

---

## Accessibility Standards

- All interactive elements: focus:ring-2, focus:outline-none
- Form labels: Always paired with inputs, text-sm font-medium
- Icon-only buttons: Include aria-label
- Status messages: Use aria-live regions for transcript/suggestions
- Keyboard navigation: Tab order follows visual hierarchy
- Color contrast: Ensure all text meets WCAA AA minimum

---

## Animation Guidelines

**Minimal & Purposeful Only**:
- Page transitions: None (instant)
- Card hover: subtle shadow lift (transition-shadow duration-200)
- Button states: No animations beyond native browser defaults
- Live indicators: Gentle pulse (AI thinking, recording badge)
- Toast/Modal entry: Simple fade-in (duration-150)

**Avoid**: Scroll animations, parallax, elaborate transitions

---

## Images & Icons

**Icons**: Heroicons (via CDN) - use outline variant for navigation/actions, solid for status indicators

**Images**:
1. **Dashboard/Marketing Pages**: 
   - Hero section optional - if used, illustration of interview scenario (illustration style, not photo)
   - Feature explanations: UI mockup screenshots with subtle shadow

2. **Cockpit Interface**: NO decorative images - purely functional UI

3. **Report View**: 
   - Company logo placeholder (if available)
   - Candidate avatar placeholder (circular, initials fallback)
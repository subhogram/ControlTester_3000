# Design Guidelines: Chat-First Agentic AI Interface

## Design Approach

**System Selected:** Custom design inspired by ChatGPT and Linear
- Rationale: Utility-focused productivity tool requiring clarity, efficiency, and information hierarchy
- Reference products: ChatGPT (conversation patterns), Linear (clean UI), Claude (file handling)
- Core principle: Maximum clarity with minimum visual noise - the content (chat) is the hero

## Typography

**Font Stack:**
- Primary: Inter (via Google Fonts CDN)
- Monospace: JetBrains Mono (for code blocks in chat)

**Hierarchy:**
- Chat messages: text-base (16px), font-normal
- User input: text-base (16px)
- Headings (Settings page): text-2xl font-semibold
- Labels/metadata: text-sm text-gray-600
- Model selector/buttons: text-sm font-medium

## Layout System

**Spacing Primitives:** Use Tailwind units of 2, 3, 4, 6, 8
- Component padding: p-4, p-6
- Section gaps: gap-4, gap-6
- Margins: m-2, m-4, m-8

**Chat Layout Structure:**
```
┌─────────────────────────────────────┐
│  [Model ▾] [Settings] [User Avatar] │ ← Header: h-16, px-6
├─────────────────────────────────────┤
│                                     │
│  Chat Messages Area                 │ ← flex-1, overflow-y-auto
│  (Scrollable, max-w-3xl centered)   │
│                                     │
├─────────────────────────────────────┤
│  [File Preview] [TOD] [TOE]         │ ← Only when file uploaded
├─────────────────────────────────────┤
│  [📎] [Input Field...] [Send →]     │ ← Fixed bottom, p-4
└─────────────────────────────────────┘
```

**Settings Page Layout:**
- Simple centered form: max-w-2xl mx-auto
- Vertical stack with generous spacing (space-y-8)

## Component Library

### Header Bar
- Fixed top, full width
- Three sections: Left (Model dropdown), Center (empty), Right (Settings icon + User avatar)
- Height: h-16
- Border bottom: subtle separator
- Icons: Heroicons (outline style)

### Chat Messages
- Maximum width: max-w-3xl, centered
- User messages: Right-aligned, rounded-2xl, px-4 py-3
- AI messages: Left-aligned, rounded-2xl, px-4 py-3
- Timestamp: text-xs below each message
- Gap between messages: space-y-6
- Avatar: 32px circle for both user and AI

### File Upload Area (When Active)
- Compact horizontal bar above input
- Shows filename with remove (×) button
- TOD and TOE buttons side-by-side: px-4 py-2, rounded-lg
- Border: dashed border when empty, solid when file present

### Input Field
- Full-width container with max-w-3xl centered
- Rounded-2xl border
- Multi-line textarea: min-h-[52px], max-h-[200px]
- Attachment icon (📎) on left
- Send button on right (arrow icon)
- Padding: p-3

### Model Dropdown
- Clean select element styled as button
- Shows current model name with chevron
- Dropdown menu appears below: rounded-lg, py-2
- Each option: px-4 py-2

### User Menu
- Avatar button (40px circle)
- Dropdown appears below-right
- Single item: "Logout" with icon
- Width: w-48

### Settings Page
- Page title: text-3xl font-bold, mb-8
- RAG Upload section:
  - Drop zone: Dashed border, rounded-xl, p-12, text-center
  - File list below: Each file in card with remove button
  - Upload button: Primary style, px-6 py-3

## Interactions

**Animations:** Minimal - only use:
- Smooth scroll in chat area
- Fade-in for new messages (200ms)
- Dropdown menu slide-down (150ms)

**Button States:**
- Default: Clean, minimal
- Hover: Slight opacity change (hover:opacity-80)
- Active: No special state needed
- Disabled: opacity-50, cursor-not-allowed

## Icons

**Library:** Heroicons (outline style) via CDN
- Send: arrow-up-circle
- Attachment: paper-clip
- Settings: cog-6-tooth
- Logout: arrow-right-on-rectangle
- Model selector: chevron-down
- File remove: x-mark

## Accessibility

- Maintain ARIA labels for all interactive elements
- Keyboard navigation: Tab through all controls, Enter to send message
- Focus states: ring-2 ring-offset-2 on all interactive elements
- Screen reader text for icon-only buttons

## Images

**No hero images needed** - This is a utility interface where the chat content is primary. The interface should be clean and distraction-free with no decorative imagery.
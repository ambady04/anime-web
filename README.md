# KIXO — Glassmorphism Movie & Series Streaming UI

KIXO is a premium, high-fidelity Glassmorphism-style movie streaming web application. The design is inspired by modern sleek dark user interfaces (like Apple TV+ and neon-noir cinema lounges), featuring rich translucency, glowing border accents, and dynamic micro-animations.

---

## Key Features

- 🎭 **Glassmorphism Design System**: Clean, transparent card layouts with `backdrop-filter: blur(20px)`, subtle red borders (`#E31C25` theme color), responsive grid arrangements, and customized high-contrast scrollbars.
- 📱 **Responsive Multi-Device Layout**: Fully adaptive navigation containing a desktop header and a convenient mobile bottom navigation bar.
- 🔍 **Rich Category Explorer**: A discovery view organized by genres (Action, Comedy, Drama, etc.) and curated Collections (Anime Hits, Blockbuster Movies, Korean Dramas).
- 🎬 **Custom Widescreen Video Player HUD**: Complete with a floating glass panel, volume sliders, multiple playback speeds, audio dub stream selectors, and error recovery fallbacks.
- ⚙️ **Advanced Player Controls**:
  - **Single & Double-Click Actions**: Differentiates screen single-clicks (play/pause) from double-clicks (fullscreen) using a click-delay debounce timer.
  - **Resolution Selector**: Features an "Auto" mode with dynamic resolution indicator (e.g. `Auto (720p)`) alongside direct resolution lock settings.
  - **High-Contrast Dropdown Backgrounds**: Solid black gradient backgrounds for Quality, Subtitles, Speed, Audio, and Screen size settings panels to prevent light scene bleed-through.
  - **Auto-Play & skip controls**: Automatically triggers next episode playback on video end, with skip buttons displaying boundaries checking.
  - **Display aspect ratio adjustments**: Quick toggle selectors mapping container styles (`contain`, `fill`, `cover`).
  - **Hotkeys**: Full window shortcuts support (`Space` for play/pause, `F` for fullscreen, `M` for mute, `Arrows` for seek/volume).
  - **Click-outside & Idle Auto-close**: Click outside of active dropdown menus to automatically shut them down.
- 🔐 **Inspect Guard Protection**: Features built-in timing-based DevTools detection and right-click restriction to protect premium assets and clear the browser Network tab instantly upon inspection attempts.
- 💾 **Local History & Watchlist**: Integrated local storage tracking to bookmark titles, track watched episodes in real-time, and resume playback exactly where you left off ("Continue Watching").

---

## Technology Stack

- **Core Framework**: [Next.js 16 (App Router)](https://nextjs.org)
- **Styling**: Tailwind CSS & Modern Custom Glassmorphic Utilities
- **Icons**: Lucide React
- **Animations**: Framer Motion

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or the mapped local port) in your browser to view the application.

### 3. Build for Production
```bash
npm run build
npm run start
```

# KIXO — Glassmorphism Movie & Series Streaming UI

KIXO is a premium, high-fidelity Glassmorphism-style movie streaming web application. The design is inspired by modern sleek dark user interfaces (like Apple TV+ and neon-noir cinema lounges), featuring rich translucency, glowing border accents, and dynamic micro-animations.

---

## Key Features

- 🎭 **Glassmorphism Design System**: Clean, transparent card layouts with `backdrop-filter: blur(20px)`, subtle red borders (`#E31C25` theme color), and responsive grid arrangements.
- 📱 **Responsive Multi-Device Layout**: Fully adaptive navigation containing a desktop header and a convenient mobile bottom navigation bar.
- 🔍 **Rich Category Explorer**: A discovery view organized by genres (Action, Comedy, Drama, etc.) and curated Collections (Anime Hits, Blockbuster Movies, Korean Dramas).
- 🎬 **Custom Video Player HUD**: Complete with responsive scrubber, volume sliders, multiple playback speeds, audio dub stream selectors, and error recovery fallbacks.
- 🔐 **Inspect Guard Protection**: Features built-in timing-based DevTools detection and right-click restriction to protect premium assets and clear the browser Network tab instantly upon inspection attempts.
- 💾 **Local History & Watchlist**: Integrated local storage tracking to bookmark titles and resume playback exactly where you left off ("Continue Watching").

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

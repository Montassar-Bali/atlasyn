# ATLASYN Insight

ATLASYN Insight is a cinematic business-intelligence prototype built around a “Living Business Universe.” A persistent WebGL scene turns ERP, CRM, finance, customer, and inventory signals into one scroll-driven executive narrative, while accessible DOM controls retain exact values and complete workflows.

## Experience

- Five scroll chapters: executive command, revenue journey, customer network, inventory world, and AI priority briefing
- Persistent Three.js scene with a health core, data orbits, revenue terrain, customer nodes, inventory cells, and decision beacons
- Compact floating navigation with responsive mobile navigation and chapter progress
- Exact revenue-point inspection, customer selection, inventory selection, risk filters, and search
- Evidence-rich AI Copilot with working prompts, source chips, calculations, recommendations, file staging, and keyboard focus management
- Downloadable branded executive PDF, document staging, share controls, notifications, and interaction feedback
- WebGL detection, lazy-loaded 3D runtime, tab-visibility pause, bounded pixel ratio, reduced-motion support, and a semantic 2D fallback

## Stack

- React 18, TypeScript, and Vite
- Three.js, `@react-three/fiber`, and `@react-three/drei`
- GSAP ScrollTrigger for the single scroll choreography
- Lucide React and PDF-Lib
- Custom responsive CSS using ATLASYN design tokens

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Validate and build

```bash
npm run typecheck
npm run build
npm run preview
```

The production bundle is written to `dist/`. The WebGL runtime is split into a lazy experience chunk so non-command pages and mobile fallbacks do not pay its full startup cost.

## Architecture

`CommandCenter` owns one mutable scroll-progress reference. GSAP ScrollTrigger updates it without producing React renders; `SceneController` reads it inside the render loop and eases the camera, lighting, and pre-mounted scene groups between chapters. Exact business information stays in semantic HTML alongside the canvas, so keyboard, touch, reduced-motion, and WebGL-fallback users receive the same meaning.

The official logo remains at `public/atlasyn-logo.png` and is used directly in navigation, the session intro, and generated reports.

## Demo limitations

All companies, metrics, forecasts, confidence scores, dates, alerts, and report content are fictional data. The Copilot routes prompts to predefined evidence-backed demo answers in the browser; it does not call an LLM or production data source. Uploads are staged locally and are not persisted or processed. Production use would require authenticated APIs, tenant isolation, validated analytics, secured connectors, audit logging, and durable document processing.

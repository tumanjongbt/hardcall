# Hardcall — Brand System v2 (locked direction)

**Name:** Hardcall  
**Hero tagline:** the call that shapes your orbit.  
**Hero surface:** celestial map banner (nebula void + four path orbits → one decision star)  
**Promise:** live salary, debt, and automation odds before you enroll  
**Tone:** cosmic high-stakes, blunt, data-backed — student mouth, parent-credible

## Color (celestial stakes)

| Token | Hex | Use |
| --- | --- | --- |
| `void` | `#05010A` | backgrounds |
| `nebula` | `#5B2CFF` | atmospheric accent, glows |
| `corona` | `#FFB020` | CTA, decision star, tagline |
| `accretion` | `#FF4FBF` | optional hot accent |
| `signal` | `#2EE6A6` | live telemetry blips |
| `paper` | `#F5F2EA` | primary text on dark |
| `mute` | `#8B8794` | secondary text |

Do **not** put `hardcall` in schema, auth, routes, or status enums. Product/marketing only.

## Type

| Role | Primary | Fallback | Notes |
| --- | --- | --- | --- |
| Display / logo | **Unbounded** ExtraBold | `"Unbounded", "Syne", system-ui, sans-serif` | wordmark, hero |
| Alt display | **Oxanium** Bold / **Chakra Petch** Bold | sci-fi HUD variants | secondary lockups |
| UI / body | **DM Sans** | `"DM Sans", Inter, system-ui, sans-serif` | app chrome |
| Data / mono | **IBM Plex Mono** or **JetBrains Mono** | ui-monospace | ROI numbers |

Wordmark: `HARDCALL` all caps in display; `Hardcall` in prose. Tagline: lowercase italic energy in corona amber.

## Locked assets

- Hero banner: celestial map — HARDCALL + tagline + four orbits (degree / trade / cc / apprentice) into one decision star. File: `dashboard/public/banner-celestial.png` (source lockup: `hardcall-banner-celestial.png`)
- Primary mark: crop of that same celestial map (decision star + orbits). File: `dashboard/public/logo.png` (source mark: `hardcall-logo.png`)
- Favicon / apple-touch: same celestial-map crop (`dashboard/public/favicon.png`, `dashboard/public/apple-touch-icon.png`)
- Do **not** ship alternate circular logo options (black-hole event-horizon, supernova starburst, protostar spiral) or the old geometric amber H.

Masthead lockup is the celestial-map mark + HARDCALL wordmark text + corona tagline. No logo picker. No unused alternate logo PNGs in `public/` or docs.

## Voice

- yes: orbit, hard call, gravity, four paths → one call, live odds  
- no: soft “journey,” brochure advisor speak

<div align="center">
  <img src="docs/icon.png" alt="Score Card" width="96" height="96" />
  <h1>Score Card</h1>
  <p><em>Rubric-driven interview scorecard that builds a ready-to-paste AI prompt for the recruiter update</em></p>
  <p><a href="https://score-card-bheng.vercel.app">Live</a> &middot; <a href="https://github.com/bunlongheng/score-card">Repo</a> &middot; <a href="https://bunlongheng.com/projects?name=score-card">Portfolio</a></p>
  <img src="docs/social-preview.png" alt="Score Card - preview" width="820" />
</div>

---

<div align="center">

# Score Card

Technical-interview scorecard - a built-in rubric of 14 categories and 56 topics, 1-5 sliders per category, a quiz-style drill-down per topic with strong-signal/red-flag cues, and a one-click prompt generator for an AI-written recruiter summary.

![Score Card](screenshot.png)

**[Try it live](https://score-card-bheng.vercel.app)**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-149eca?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss)

</div>

## Features

- **Built-in rubric** - `data.json` ships 14 categories (Authentication, Front End, Backend, Architecture, Leadership, Storage, Security, Performance, Testing, Infrastructure, Deployment, Tooling, Growth, Communication) x 4 topics each, every topic pre-written with a follow-up question, an expected answer, and 3-4 strong signals / red flags.
- **1-5 scoring per category** - click a number to score; a live circular badge shows earned/total and a color tier (red / amber / green) that pops confetti on a tier change.
- **Topic drill-down** - click any topic pill to open its question, expected answer, and strong-signal/red-flag panels side by side, with a 60-second built-in timer that resets per topic and flashes when it expires.
- **Know it / don't know it** - mark each topic during the drill-down; marking "knows it" fires a heart-shaped confetti burst and feeds the recruiter-summary prompt.
- **Rubric Q&A browser** - a separate modal lists every question, answer, and strong signal from `data.json` in one scroll, for prep before the interview starts.
- **Recruiter-summary prompt generator** - builds a structured prompt from the candidate's scores, notes, and per-topic know/don't-know evidence, then opens it in a "paste into AI" modal with a word/token estimate and a copy button. It does not call an AI API itself - you paste the prompt into Claude, ChatGPT, or any LLM you already use.
- **Candidate tag badges** - optional recruiter / type / location / country / project / team / manager tags, picked from a config panel and rendered under the notes field.
- **Notes editor** - line-numbered textarea that tracks the active line and syncs scroll position.
- **Row textures** - double-click a category row to cycle its background texture (stripes, crosshatch, carbon, veil).
- **Export as PNG** - `html2canvas` rasterizes the full page (dark background) into a downloadable, timestamped PNG.
- **Local persistence** - candidate, scores, notes, topic evidence, and tag selections are saved to `localStorage` and restored on reload; a "reset" wipes everything for the next interview.

## How it works

Score Card is a single client component (`app/page.tsx`) rendered from a static rubric (`app/data.json`) - there is no backend, no database, and no auth. `next.config.ts` sets `output: "export"`, so the whole app builds to static HTML/JS and deploys as a static site.

```mermaid
flowchart LR
    Data[app/data.json rubric] --> UI[PowerScorecard client component]
    UI -->|scores, notes, tags, evidence| LS[(localStorage)]
    LS -->|on load| UI
    UI -->|Generate recruiter update| Prompt[Build prompt string]
    Prompt --> Modal[Paste-into-AI modal + copy button]
    UI -->|Download| PNG[html2canvas snapshot]
```

The `@anthropic-ai/sdk` dependency exists for building an AI-agnostic prompt (word/token estimate only) - the app never holds an API key or calls a model directly, which is also why it can ship as a fully static export.

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router), static export |
| UI | React 19, TypeScript (strict) |
| Styling | Tailwind CSS 3 |
| Icons | lucide-react |
| PNG export | html2canvas |
| Persistence | Browser `localStorage` (no database) |
| Hosting | Vercel |

## Getting started

```bash
git clone https://github.com/bunlongheng/score-card.git
cd score-card
npm install
npm run dev
```

Open http://localhost:4000.

| Script | Description |
|--------|-------------|
| `npm run dev` | Dev server on port 4000 |
| `npm run build` | Static export build (`output: "export"`) |
| `npm run start` | Serve the production build |

## Design decisions

| Decision | Why |
|----------|-----|
| No AI API call, prompt-only | Keeps the app a static export with zero secrets and zero server - the prompt is built client-side and pasted into whichever AI tool you already have open. |
| `localStorage` instead of a database | Single-interviewer, single-session tool - no accounts, no sync needed, nothing to host. |
| Static export (`output: "export"`) | The whole app is one client page; no server-rendered routes means it can be hosted anywhere as plain static files. |
| Practical max is 4/5 per category, not 5/5 | A perfect 5 is rare in real interviews, so the color tiers (red/amber/green) and recruiter-summary tier are computed against a 4-point ceiling to stay realistic. |

## License

[MIT](LICENSE) (c) Bunlong Heng

---

<p align="center">
  <sub>Built by <a href="https://bunlongheng.com">Bunlong Heng</a> &middot; <a href="https://bunlongheng.com/projects/score-card">See it in my portfolio &rarr;</a></sub>
</p>

---

<div align="center">

<a href="https://bunlongheng.com"><img src="https://img.shields.io/badge/-bunlongheng.com-3A3A3C?style=for-the-badge&amp;labelColor=2A2A2C&amp;logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y%2BmAAADAFBMVEXx8vLq6v%2F19fX09PT8%2Ff309PT5%2BfnAwMBMaXHx8vL19fX5%2Bfny8vL09PT39%2Ff6%2Bfn6%2Bvr09PTx8fH4%2BPn%2F8vLy8%2FP09PTz8%2FPy8vL%2F%2F%2F%2Fz9PTz9PP19fby8vP19PXz8%2FT19%2Fb08%2FTx8vLy8vL09vby8%2FL29vf19fTv8PDz9vb7%2Bvn%2F%2Ff%2F9%2Ff3w8vH29fb%2F%2FP339%2Ff5%2Bfn59%2Ff19PT09PR7rao3VF3%2F%2Fv8AKDR6sqsBV1vv8fL4%2BPiux8b8%2Bvq90NDy8%2FR%2BlpppnZyZqrACLTxclZJSkI9en5ssZ2luqaUAeWgqbW4BX1gCfG0%2Fa3QaVG0MN0UKNUKUpKsGpYMAKjoRQ1UDf3AQRloJqIgEm32d0cUBg3ElbnQIln8eVWgrmIdP0KzF5d5s2acdfHwppJCP5MMXl4Tz8%2FLv8%2FP39%2FiewL5%2BqahYf4IrTFZkk5KlxsREiIYAHiqDnKFmnJowc3IdVllvpKK7zc3D2tnk5%2BmuycdwpKKuub2yv8Ly%2B%2FkAMT7z%2Bvjq7e09gH93q6kGdWpGgoJZmJSlw8M7c3WwyceTw76w1M8mYmpFfX8lW2AFOEpGiYhxqqRrqaRb2rdIsZ8AVE91jpU7d3t3saqBoKhako4AWVEcUlg3aWwDupAHb2YwmIkPP1ERSVA7WmZ8tq8HT14oZW%2BYuLsMl3wQT10ROksENUc8Z3MJSGVLh4dqpJ%2BXr7U51awUgHM4v6ad1MkPuJZAiowVd3IEhnZH0aoYrI05p5sDtYwkzZ8EPViYxsRel5USbHAIgmwIM0gQamzU4uF2malQi4oWQFQ1zaYrp4UXlYwfiHoyxqFE1q4qeX4yn5JIxKkdrX1b1rAbWGvd5Oh91sRijpomsJEVc3Ukc34dqIcwuJVKwZIXkoQZcXlNv5g%2BqZUZvpNl2rPG9N0WkIoNqouW4sVPwp%2BM0b6h0ssfq4d%2F1r8hpo%2Fh9e4AamUjnI9avaBixqgklYWSwL4xtItUxplYl5qZ58mq78wMgnYXfnlOmJaR1L%2Bj78ny9fS%2FrXQPAAAAFXRSTlP7Brvx%2FsJhAgD87r4U72C4uGH8vhRDodYHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAC6UlEQVQokS2Sd3BUVRSHb0KS3QRCiZw5t%2By9j33zXjZkyUs2uekhEAi9dwRCL4JUEQRFAQUs9A4WOopKU0GpFoqCBZUivaqoFKkWLIS5GX7%2FfnPO78yZj%2Fj8UTViK6HggvNgSGuluEZRKbZqlN9H%2FFWiWUzIFQK5fhjOIRTDoqv4ia86S4q3KSByHdSqIhxofBKr5iNxLMm2bQqWVkorJ%2BAkO46nkQJhceSRmCTDvKJIJBLJzMxMLU6POJ4eBPF1KpNEbdt2Cms4LCcnZ%2FX6D3d%2BsKJJ7VSlNLoqgbjUtmkKKxlVmpf3bsFXW3d1b77gueJAQIPQBCilkMKemNi23Ts9T35%2FaMe2rsvmTypylGUFCSIYWJLXrm2nUwOPfNO5w%2B73Okxnjqe0JigQEL3JizoeONr%2F2u99vju4fd1rdZnyspQmnGvAUBprWNqz348%2FhXN%2F6P1%2By4Uvs%2FJkpRQRwpJBRVn7vf16Dfitz5XevQqWt3yalXtKaRIUQmglWfsu5y7%2BMrDs0TMftWo1ZVy64xioOVpcIdt8%2Fvqvf9%2F859KJsrLmrzA%2BOKC0IkFEtJza7JOfr%2FYd0P9G98tdOxe0Hp9qJrOIBgDuOeEtp%2F%2B4d%2FvWX%2F%2F9u%2B%2FtlaUTmOWZg7SQEEyuFe52%2BML9O3cZO%2F5xl06zn2VcadOJUqJTzt7a82XfP7sx9vmGNm1m1MstV4IHCVAAoTLqL1372ddn%2Fz%2B2v%2FWq12c1fSpsaeQWAZAANntxzuI3e3zbo8XGpm%2FMnNqiXrh%2BljaPd6UUabkjps19tdGnX2zKb9b4pTFDCzOMLmYtpW5h%2BpCRTeYtyV%2BT36zx808OL4xYGoFrkqDTbJpSXLdRgwbPZL%2BQnT129OOPFVEEsAMJpHKdeKMJgJSAiALdjJANQKnRJI4R6boAKEwLCiGoBBegQjBftQo1KQWOlplFKSV9qGaF1NpAE7QQESTlMSy6pp%2F4%2FFFVYxMNRBTaiM0tkImxNaL8vgfDR8gvoYRaxgAAAABJRU5ErkJggg%3D%3D" alt="bunlongheng.com"></a>
<a href="https://www.linkedin.com/in/bunlongheng/"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn"></a>
<a href="https://www.instagram.com/ibunlong/"><img src="https://img.shields.io/badge/Instagram-C13584?style=for-the-badge&logo=instagram&logoColor=white" alt="Instagram"></a>
<a href="mailto:bheng.code@gmail.com"><img src="https://img.shields.io/badge/Email-2E7D32?style=for-the-badge&logo=gmail&logoColor=white" alt="Email"></a>

<br>

Built by **[Bunlong](https://bunlongheng.com)** &nbsp;&middot;&nbsp; [more apps](https://bunlongheng.com/projects)

</div>

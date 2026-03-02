# Score Card

> Interview score card — structured rubric for technical interviews, powered by AI feedback.

**Live → [score-card-bheng.netlify.app](https://score-card-bheng.netlify.app)**

![Screenshot](screenshot.png)

---

## Features

- **Structured rubric** — score candidates across categories like System Design, Security, Performance, Architecture, and more
- **1–5 scoring** — per-category sliders with visual feedback
- **AI feedback** — Claude generates written feedback based on your scores and notes
- **Candidate notes** — attach free-text notes and badges per category
- **Interview timer** — built-in countdown timer per section
- **Export PNG** — save the completed score card as an image
- **Persistent** — scores saved to localStorage, survives refresh
- **Row textures** — customizable background textures (stripes, crosshatch, carbon, veil)
- **Dark UI**

## Usage

1. Enter candidate name
2. Score each category (1–5)
3. Add notes per section
4. Run the AI feedback generator
5. Export as PNG

## Stack

- Next.js 15 · React 19 · TypeScript
- Claude API (Anthropic SDK) for AI feedback
- Tailwind CSS · Netlify

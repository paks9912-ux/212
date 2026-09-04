# AI CONSTRUCTION CONTROL — DEMO / MVP

AI-powered construction project monitoring for a road-construction company.

> **Know what is happening on every project before the problem becomes expensive.**

Open `index.html` in any browser. No build step, no dependencies, no backend.
All content is clearly marked **DEMO DATA** — fictional projects, people, materials and equipment.

## The demo script (2 minutes)

1. **Overview** — 5 objects, 1 critical, alerts panel on the right. The director sees the decision list first.
2. **Reports → PROCESS REPORT** — a foreman's Telegram voice message (simulated) is turned into structured data:
   `Analyzing report… → Extracting data… → Updating project… → Calculating forecast… → DONE`
3. The report lands in **OBJECT №03**: progress goes to 67 %, rate 850 m²/day, forecast slips to **+13 days**.
4. **Object detail** — plan vs fact, forecast card, "Why is the project delayed?", recommended actions
   (`Mark as resolved` works), 14 days of daily reports (click one to expand).
5. **SIMULATE NEW REPORT** — a worse day arrives: progress, average rate, forecast, risk, alerts and
   AI insights all recompute, and a toast reports the movement (e.g. `+13 d → +14 d`).
6. **Materials → CREATE PROCUREMENT REQUEST**, **Equipment**, **Team**, **AI Insights**.
7. **View as** — Director / Foreman / Procurement / Equipment Manager change the navigation and the pages.

## Where the logic lives (`index.html`, single file, sectioned)

| Section | What it is |
| --- | --- |
| `1. DATA MODEL` (`const DB`) | projects, dailyReports, materials, equipment, tasks, team, inbox, requests |
| `2. FORECAST LOGIC` (`compute()`) | plan/fact, deviation, rates, forecast date, delay, risk — plain JavaScript, no "AI" |
| `alerts()` / `insights()` | derived from the same data, never hard-coded |
| `3. UI LAYER` | router + one function per page, re-renders from `DB` on every change |
| `5. DEMO INTERACTIONS` | `processReport()`, `simulateNewReport()`, `createRequest()` |

Forecast formula (also shown in **Settings**):

```
remainingVolume        = totalVolume − actualCompletedVolume
averageDailyProduction = mean production of the last 7 daily reports
forecastDays           = remainingVolume ÷ averageDailyProduction
forecastCompletionDate = lastReportedDay + forecastDays
delayDays              = forecastCompletionDate − plannedCompletionDate
risk                   = normal ≤ 2 d < warning ≤ 7 d < critical
```

## Where to plug in the real system later

Every seam is marked in the code with a comment tag:

| Tag | Location | Replaces |
| --- | --- | --- |
| `[INTEGRATION:TELEGRAM]` | `DB.inbox`, `DB.dailyReports` | Telegram Bot API — incoming foreman messages |
| `[INTEGRATION:STT]` | `DB.inbox` items | Speech-to-Text for voice messages |
| `[INTEGRATION:CLAUDE]` | `processReport()`, `insights()`, "Why is the project delayed?" | Claude API — text → structured JSON, cause analysis, recommendations |
| `[INTEGRATION:N8N]` | `processReport()`, `createRequest()` | n8n webhooks orchestrating the chain |
| `[INTEGRATION:DB]` | `const DB`, `applyReport()`, task/request mutations | PostgreSQL / Supabase |
| `[INTEGRATION:STORAGE]` | daily report records | site photo / file storage |

The maths in `compute()` stays server-side JavaScript/SQL — AI is only used for parsing text and explaining causes.

## Notes on the demo dataset

Object №03 is internally consistent: 120,000 m², 120-day plan (1,000 m²/day), start 10 Jun 2026,
planned completion 08 Oct 2026, 14 days of daily reports whose sum reproduces the stated 67 % actual
progress and the 850 m²/day 7-day average. Every other figure on screen is computed from those inputs.

`kyoto.html` is an unrelated earlier page kept from the repository history.

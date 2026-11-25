# Changelog

## Unreleased

- Hiding amounts also hides them in the notification after an entry.
- Errors from `fin` are shown in the panel's language; a ledger error names the first Beancount problem.
- After an entry the panel always refreshes, even if a background refresh was running.
- A backslash in a description no longer makes the entry fail.
- `fin` writes ledger files in one step and keeps their permissions; `fin prices` is checked by Beancount; unexpected errors still answer in JSON; `fin review` refuses a month that does not exist.
- `FIN_TODAY=YYYY-MM-DD` runs `fin` as of that day; the contract test uses it, so it no longer fails when the calendar month changes.

## 0.3.1

- The bar starts with an icon that grows with everything you have earned and never goes back: a sprout, then coins at 100 000, gold at 1 000 000, a diamond at 10 000 000. The tooltip names the level and the next one; reaching a new level says so in the win notification.

## 0.3.0

- **Growth** comes first: this month's income as a race against a monthly goal broken into stages with an even-pace mark, or against the same day of last month and the best month.
- Where the money comes from: every source of income against last month.
- Lifetime milestones from 10 000 to 30 000 000, and what this month adds to the freedom ladder ("adds 1.2 months of reserve; about 2.5 such months to the next step").
- Wins get one desktop notification each: a stage, the goal, a record month, three months of growth, a second source of income, a lifetime milestone. Nothing for falling behind.
- Set the goal from the entry line: `goal 500000`, `goal 7000 usd`, `goal off` (stored in the ledger as `fin-param`, so goals keep their history).
- The bar shows income and the goal by default (`105k · 70%`); `barShows: freedom` brings back the ladder step.

## 0.2.1

- Every step of the ladder is listed by name, with what it asks for; hover a later step to see what it gives.
- The language setting also works when the shell loads plugins through qs:// URLs.

## 0.2.0

- Help inside the panel (? button or F1): the entry line with clickable examples, the keys, and buttons to your notes in Obsidian, Fava and this guide.
- A new ledger gets a start card instead of dashes.
- The current step says how much is left, for example “305 960 ₽ to go”.
- Notes about the ledger are compact: two at most, the rest behind “and N more”.
- A `language` setting shows the panel in another language than the desktop, for example finances in Russian on an English Omarchy.
- `fin status` adds `txCount`, `docs` and `have`/`need` for each step (schema 1, additive).

## 0.1.0

- First release: freedom ladder in the bar, one-line entry with preview and undo, runway, savings rate, income from assets, six months of cash flow, the business this month with a tax reserve, and an action of the week.
- Everything goes through a local `fin` command (`status --json`, `add`, `undo`, `week`); a reference `fin` for Beancount ships in `cli/`.

# Changelog

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

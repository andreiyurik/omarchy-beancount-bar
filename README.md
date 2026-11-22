# Beancount Bar

Your [Beancount](https://github.com/beancount/beancount) ledger in the [Omarchy](https://omarchy.org) bar: a freedom ladder, runway, savings rate and one-line entry with undo. It runs a small local command, `fin`. No network, no keys, no server: the ledger stays plain text in your own folder.

This is an unofficial plugin and is not affiliated with the Beancount or Fava projects.

| Freedom | Month |
| --- | --- |
| ![Freedom](docs/freedom.png) | ![Month](docs/month.png) |

## What you get

- **In the bar:** the step of the freedom ladder you are on and how far along it is, for example `1 · 44%`. A dot means entries wait to be sorted. Never red: being early on the ladder is not a failure.
- **Freedom ladder:** 0 no debt with interest → 1 reserve of 6 months → 2 reserve of 12 months → 3 assets pay 25% of spending → 4 assets pay the fixed costs → 5 freedom capital (a year of spending divided by a 3.5% withdrawal rate). The numbers come from your ledger, not from the plugin.
- **Four numbers:** net worth, runway, savings rate against your goal, income from assets per month.
- **Month:** six months of income and spending, or business revenue and costs; the business this month with a tax reserve; one action of the week with a counter.
- **One-line entry:** type, check the preview, press Enter. Undo from the panel or the notification.
- **Fava** one click away as a web app.

## Install

```sh
omarchy plugin add https://github.com/andreiyurik/omarchy-beancount-bar
omarchy plugin enable andreiyurik.beancount-bar right
```

Then point the plugin at a `fin` command (widget settings → `fin command`). The plugin ships a reference one in `cli/`:

```sh
ln -s ~/.config/omarchy/plugins/andreiyurik.beancount-bar/cli/fin ~/.local/bin/fin
```

`fin` reads the ledger from `~/finance/ledger/main.bean`; set `FIN_ROOT` to use another folder.

It needs [uv](https://docs.astral.sh/uv/), which fetches Beancount 3.2.3 on first run. `cli/example/` is a starting ledger with the account layout the reference `fin` expects; copy it and replace the made-up entries.

The Omarchy shell does not read your shell profile. If your ledger is not in `~/finance`, give the setting a small wrapper script that exports `FIN_ROOT` and runs `fin`.

## One-line entry

```
AMOUNT [CURRENCY] description [@from] [>category] [#tag] [yesterday]
```

| Line | Means |
| --- | --- |
| `450 coffee` | spending; category and account as last time for “coffee” |
| `1,5k something new` | unknown: goes to `Expenses:Uncategorized` with a `!` flag, to sort later |
| `+120k client #ип` | income of the business (the tag is set in the ledger) |
| `2000 hosting #ип >Tools` | `>` picks a category; with the business tag, business accounts win |
| `12 usd hosting`, `$12 hosting` | another currency |
| `450 coffee @cash yesterday` | `@` picks the account by its `short:` alias or name |
| `week 10 client offers` | sets the action of the week; ↑ and ↓ count it |

Every entry goes to `ledger/inbox.bean` and is checked by Beancount before it stays. If the ledger would break, nothing is written.

Keys: Enter saves, Tab switches Freedom and Month, Esc closes, ↑/↓ on an empty line count the action of the week, middle click on the bar refreshes.

## The `fin` contract

The plugin calls only these, with arguments as a list, never through a shell. Any program that answers them works, so you can wrap hledger or anything else.

| Call | Answer (JSON on stdout, `"schema": 1`) |
| --- | --- |
| `fin status --json` | numbers, ladder, months, warnings, week, and `entry` (accounts with `short` aliases, history of descriptions) |
| `fin add --json -- "<line>"` | `{"ok": true, "entry": {id, date, amount, currency, narration, account, source, income}}` |
| `fin undo --json <id>` | `{"ok": true, "narration": ...}` |
| `fin week --json -- <target> <text…>` / `+1` / `-1` / `clear` | `{"ok": true, "week": {...}}` |

On failure: exit code 1 and `{"schema": 1, "ok": false, "error": "<code>", "message": "..."}`. The exact fields are in `cli/fin.py` (`status()`), and `tests/contract.test.js` runs the panel's preview and `fin.py` on the same lines.

## Optional hotkey

Add to `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + ALT + M", "Finance panel", "omarchy-shell shell toggle andreiyurik.beancount-bar")
```

## Privacy

- Nothing leaves your computer. The plugin starts `fin` and reads what it prints.
- The eye button hides amounts, for screen sharing. The choice is kept in `~/.config/beancount-bar/hide-amounts`.
- Text from the ledger is always shown as plain text.

## Why it looks like this

The ladder, the single action of the week and the absence of red follow research on goals rather than games: visible progress toward the next step (goal-gradient, Kivetz, Urminsky and Zheng, 2006), one concrete intention (Gollwitzer, 1999), and no daily score to check (myopic loss aversion, Benartzi and Thaler, 1995). These informed the design; they are not proof that it works for you. Points, streaks and badges are left out on purpose.

## Tests

```sh
node tests/model.test.js      # parsing and formatting
node tests/project.test.js    # catalogs, plain text, theme colors, no shell
node tests/contract.test.js   # the panel and fin.py read lines the same way (needs uv)
node tests/render.js out/     # renders the panel offscreen with Omarchy's shell (local only)
```

## License

MIT

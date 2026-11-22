"""fin — одна команда для личных финансов.

  fin check                   проверить журнал и правила конституции
  fin report                  net worth, норма сбережений, runway, лестница свободы
  fin add 450 кофе @нал       быстрый ввод одной строкой (подробно: fin add --help)
  fin undo                    отменить последний быстрый ввод
  fin week 10 предложений     действие недели; fin week +1 / -1 / clear
  fin prices                  дописать курсы ЦБ РФ (USD, EUR) на последнюю дату
  fin review [ГГГГ-ММ]        создать заметку обзора месяца (по умолчанию — прошлый)
  fin status --json           всё для панели Omarchy одним JSON (контракт schema 1)
  fin fava                    открыть Fava на http://localhost:5000

--json у check, add, undo, week, status — машинный вывод для плагина.
"""

import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.request
import uuid
import xml.etree.ElementTree as ET
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from pathlib import Path

from beancount import loader
from beancount.core import data, prices

def configure(root):
    """Пути журнала от корня репозитория (тесты подставляют временную копию)."""
    global ROOT, LEDGER, MAIN, INBOX, PRICES, REVIEWS, WEEK
    ROOT = Path(root)
    LEDGER = ROOT / "ledger"
    MAIN, INBOX, PRICES = LEDGER / "main.bean", LEDGER / "inbox.bean", LEDGER / "prices.bean"
    REVIEWS, WEEK = ROOT / "20 Обзоры", ROOT / "state" / "week.json"


configure(os.environ.get("FIN_ROOT") or Path(__file__).resolve().parent.parent)
BASE = "RUB"
SCHEMA = 1
DAYS_PER_MONTH = Decimal("30.44")
SYMBOLS = {"₽": "RUB", "$": "USD", "€": "EUR"}
DATE_WORDS = {"вчера": 1, "yesterday": 1, "позавчера": 2}


class FinError(Exception):
    """Ошибка для пользователя: key — для перевода в плагине, text — по-русски."""

    def __init__(self, key, text, **extra):
        super().__init__(text)
        self.key, self.text, self.extra = key, text, extra


# ---------- загрузка ----------

def load():
    entries, errors, _ = loader.load_file(str(MAIN))
    return entries, errors


def error_lines(errors):
    out = []
    for e in errors:
        src = e.source or {}
        name = Path(src.get("filename", "?")).name
        out.append(f"{name}:{src.get('lineno', '?')}: {e.message}")
    return out


def load_ok():
    entries, errors = load()
    if errors:
        raise FinError("ledger", "Журнал с ошибками:\n" + "\n".join(error_lines(errors)),
                       messages=error_lines(errors))
    return entries


def params(entries, today):
    """Последнее значение каждого fin-param на сегодня."""
    result = {}
    for e in entries:
        if isinstance(e, data.Custom) and e.type == "fin-param" and e.date <= today:
            result[e.values[0].value] = e.values[1].value
    return result


def dec(p, key, default):
    return Decimal(str(p.get(key, default)))


class Converter:
    """Перевод в рубли: напрямую или через USD (например, USDT → USD → RUB)."""

    def __init__(self, entries):
        self.pm = prices.build_price_map(entries)
        self.missing = set()

    def rate(self, cur, date):
        if cur == BASE:
            return Decimal(1)
        _, r = prices.get_price(self.pm, (cur, BASE), date)
        if r is not None:
            return r
        _, r1 = prices.get_price(self.pm, (cur, "USD"), date)
        _, r2 = prices.get_price(self.pm, ("USD", BASE), date)
        if r1 is not None and r2 is not None:
            return r1 * r2
        self.missing.add(cur)
        return None

    def rub(self, amount, date):
        r = self.rate(amount.currency, date)
        return amount.number * r if r is not None else Decimal(0)


# ---------- расчёт метрик ----------

def groups(account):
    """В какие суммы попадает проводка по счёту доходов/расходов."""
    if account.startswith("Income:"):
        g = ["income"]
        if account.startswith(("Income:Passive:", "Income:Streams:")):
            g.append("asset_income")
        if account.startswith(("Income:Business:", "Income:Streams:")):
            g.append("biz_revenue")
        return g
    if account.startswith(("Expenses:Business:", "Expenses:Streams:")):
        g = ["biz_exp"]  # расходы бизнеса и продуктов — не расходы на жизнь
        if account.startswith("Expenses:Streams:"):
            g.append("stream_exp")
        if account == "Expenses:Business:Taxes":
            g.append("biz_tax")
        return g
    g = ["living"]
    if account.startswith("Expenses:Fixed:"):
        g.append("fixed")
    return g


def month_key(d):
    return f"{d.year}-{d.month:02d}"


def last_months(today, n):
    y, m, out = today.year, today.month, []
    for _ in range(n):
        out.append(f"{y}-{m:02d}")
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    return list(reversed(out))


def metrics(entries, today):
    conv = Converter(entries)
    p = params(entries, today)
    txns = [e for e in entries if isinstance(e, data.Transaction) and e.date <= today]
    first = min((t.date for t in txns), default=today)

    balances = defaultdict(lambda: defaultdict(Decimal))
    win90, win365, ytd, mtd = (defaultdict(Decimal) for _ in range(4))
    by_month = defaultdict(lambda: defaultdict(Decimal))
    start90 = max(today - dt.timedelta(days=90), first)
    start365 = max(today - dt.timedelta(days=365), first)
    unprocessed = 0

    for t in txns:
        uncategorized = any(x.account.endswith(":Uncategorized") for x in t.postings)
        if t.flag == "!" or uncategorized:
            unprocessed += 1
        for x in t.postings:
            balances[x.account][x.units.currency] += x.units.number
            if not x.account.startswith(("Income:", "Expenses:")):
                continue
            v = conv.rub(x.units, t.date)
            for key in groups(x.account):
                if t.date >= start90:
                    win90[key] += v
                if t.date >= start365:
                    win365[key] += v
                if t.date.year == today.year:
                    ytd[key] += v
                if t.date.year == today.year and t.date.month == today.month:
                    mtd[key] += v
                by_month[month_key(t.date)][key] += v

    def bal(prefix):
        total = Decimal(0)
        for acc, cur_map in balances.items():
            if acc.startswith(prefix):
                for cur, n in cur_map.items():
                    r = conv.rate(cur, today)
                    if r is not None:
                        total += n * r
        return total

    m90 = max(Decimal((today - start90).days), Decimal(1)) / DAYS_PER_MONTH
    m365 = max(Decimal((today - start365).days), Decimal(1)) / DAYS_PER_MONTH

    living = win90["living"] / m90
    fixed = win90["fixed"] / m90
    # Доход «на руки»: все доходы минус расходы бизнеса и продуктов.
    income = (-win90["income"] - win90["biz_exp"]) / m90
    asset_income = (-win365["asset_income"] - win365["stream_exp"]) / m365

    liquid, invest, crypto = bal("Assets:Liquid"), bal("Assets:Invest"), bal("Assets:Crypto")
    business, reserved = bal("Assets:Business"), bal("Assets:Reserved:Tax")
    net_worth = bal("Assets:") + bal("Liabilities:")

    tax_rate = dec(p, "tax-rate", 0)
    tax_need = max(-ytd["biz_revenue"] * tax_rate - ytd["biz_tax"], Decimal(0))

    m = {
        "today": today, "data_days": (today - first).days, "params": p,
        "net_worth": net_worth, "liquid": liquid, "invest": invest, "crypto": crypto,
        "business": business, "tax_reserved": reserved, "tax_need": tax_need, "tax_rate": tax_rate,
        "debt": bal("Liabilities:Debt"),
        "living": living, "fixed": fixed, "income": income, "asset_income": asset_income,
        "savings_rate": (income - living) / income if income > 0 else None,
        "runway": liquid / living if living > 0 else None,
        "biz_month": {"revenue": -mtd["biz_revenue"], "expenses": mtd["biz_exp"],
                      "profit": -mtd["biz_revenue"] - mtd["biz_exp"]},
        "months": [{"month": k,
                    "income": -by_month[k]["income"] - by_month[k]["biz_exp"],
                    "living": by_month[k]["living"],
                    "biz_revenue": -by_month[k]["biz_revenue"],
                    "biz_expenses": by_month[k]["biz_exp"]} for k in last_months(today, 6)],
        "unprocessed": unprocessed, "missing_prices": sorted(conv.missing),
    }
    m["ladder"] = ladder(m, p)
    m["warnings"] = warnings(m, p)
    return m


def ladder(m, p):
    """Лестница свободы: [{key, done, progress 0..1 | None, ...параметры для подписи}]."""
    def ratio(have, need):
        if need <= 0:
            return None
        return min(have / need, Decimal(1))

    living = m["living"]
    wr = dec(p, "withdrawal-rate", "0.035")
    months_min, months_target = dec(p, "reserve-months-min", 6), dec(p, "reserve-months-target", 12)
    share3 = dec(p, "streams-share-step3", "0.25")
    fi_capital = living * 12 / wr if living > 0 else Decimal(0)
    steps = [
        {"key": "no-debt", "progress": Decimal(1) if m["debt"] >= 0 else Decimal(0)},
        {"key": "reserve-min", "months": months_min, "progress": ratio(m["liquid"], living * months_min)},
        {"key": "reserve-target", "months": months_target, "progress": ratio(m["liquid"], living * months_target)},
        {"key": "asset-share", "share": share3, "progress": ratio(m["asset_income"], living * share3)},
        {"key": "asset-fixed", "progress": ratio(m["asset_income"], m["fixed"])},
        {"key": "freedom", "capital": fi_capital,
         "progress": ratio(m["liquid"] + m["invest"] + m["crypto"], fi_capital)},
    ]
    for s in steps:
        s["done"] = s["progress"] is not None and s["progress"] >= 1
    return steps


def warnings(m, p):
    w = []
    limit = p.get("crypto-max-share")
    if limit is not None and m["net_worth"] > 0 and m["crypto"] / m["net_worth"] > limit:
        w.append({"key": "crypto-limit", "share": m["crypto"] / m["net_worth"], "limit": Decimal(str(limit))})
    gap = m["tax_need"] - m["tax_reserved"]
    if gap > 0:
        w.append({"key": "tax-gap", "amount": gap})
    if m["unprocessed"]:
        w.append({"key": "unprocessed", "count": m["unprocessed"]})
    if m["missing_prices"]:
        w.append({"key": "missing-price", "currencies": m["missing_prices"]})
    if m["data_days"] < 60:
        w.append({"key": "little-data", "days": m["data_days"]})
    return w


# ---------- быстрый ввод ----------

def open_accounts(entries):
    """[{name, short}] открытых и не закрытых счетов."""
    closed = {e.account for e in entries if isinstance(e, data.Close)}
    out = []
    for e in entries:
        if isinstance(e, data.Open) and e.account not in closed:
            out.append({"name": e.account, "short": str(e.meta.get("short", ""))})
    return out


def history(entries, limit=400):
    """Описание (в нижнем регистре) → счёт категории и счёт денег из последней такой операции."""
    seen = {}
    for t in entries:
        if not isinstance(t, data.Transaction) or len(t.postings) != 2 or not t.narration:
            continue
        cat = [x.account for x in t.postings if x.account.startswith(("Expenses:", "Income:"))]
        money = [x.account for x in t.postings if x.account.startswith(("Assets:", "Liabilities:"))]
        if len(cat) == 1 and len(money) == 1 and not cat[0].endswith(":Uncategorized"):
            seen[t.narration.strip().lower()] = {"account": cat[0], "source": money[0], "date": t.date}
    items = sorted(seen.items(), key=lambda kv: kv[1]["date"], reverse=True)[:limit]
    return {k: {"account": v["account"], "source": v["source"]} for k, v in items}


def match_account(query, accounts, roots, prefer=None):
    """Счёт по короткому имени (short), последней части имени или уникальной подстроке.
    prefer — корень, который выигрывает при неоднозначности (для #ип — счета бизнеса)."""
    q = query.lower()
    pool = [a for a in accounts if a["name"].startswith(roots)]
    if prefer:
        preferred = [a for a in pool if a["name"].startswith(prefer) and q in a["name"].lower()]
        if preferred:
            pool = preferred
    exact = [a for a in pool if a["short"].lower() == q]
    if exact:
        return exact[0]["name"]
    leaf = [a for a in pool if a["name"].split(":")[-1].lower() == q]
    if len(leaf) == 1:
        return leaf[0]["name"]
    found = [a for a in pool if q in a["name"].lower()]
    if len(found) == 1:
        return found[0]["name"]
    if not found:
        raise FinError("unknown-account", f"Нет счёта «{query}».", query=query)
    raise FinError("ambiguous-account", f"«{query}» подходит к нескольким счетам: "
                   + ", ".join(a["name"] for a in found[:4]), query=query)


AMOUNT_RE = re.compile(r"^(\+?)([$€₽]?)(\d+(?:[.,]\d{1,2})?)([кkКK]?)([$€₽]?)$")


def parse_entry(line, today, accounts, hist, p, currencies):
    """Строка «450 кофе @нал >EatingOut #ип вчера» → словарь операции. Правила — в README плагина."""
    tokens = line.split()
    if not tokens:
        raise FinError("empty", "Пустая строка.")
    mo = AMOUNT_RE.match(tokens[0])
    if not mo:
        if re.match(r"^\+?[$€₽]?\d", tokens[0]):
            raise FinError("bad-amount", f"Не понимаю сумму «{tokens[0]}».", amount=tokens[0])
        raise FinError("amount-first", "Сначала сумма: «450 кофе».")
    income = mo.group(1) == "+"
    amount = Decimal(mo.group(3).replace(",", "."))
    if mo.group(4):
        amount *= 1000
    if amount <= 0:
        raise FinError("bad-amount", f"Не понимаю сумму «{tokens[0]}».", amount=tokens[0])
    currency = SYMBOLS.get(mo.group(2) or mo.group(5), BASE)
    rest = tokens[1:]
    if rest and rest[0].upper() in currencies and not (mo.group(2) or mo.group(5)):
        currency = rest[0].upper()
        rest = rest[1:]

    btag = str(p.get("business-tag", "ип")).lower()
    business, source_q, account_q, offset, words = False, None, None, 0, []
    for tok in rest:
        low = tok.lower()
        if low.startswith("#") and low[1:] == btag:
            business = True
        elif low.startswith("@") and len(tok) > 1:
            source_q = tok[1:]
        elif low.startswith(">") and len(tok) > 1:
            account_q = tok[1:]
        elif low in DATE_WORDS:
            offset = DATE_WORDS[low]
        else:
            words.append(tok)
    narration = " ".join(words).replace('"', "'").strip()
    if not narration:
        raise FinError("name-missing", "Нужно описание: «450 кофе».")

    known = hist.get(narration.lower())
    cat_root = "Income:" if income else "Expenses:"
    if account_q:
        prefer = (cat_root + "Business:") if business else None
        account = match_account(account_q, accounts, (cat_root,), prefer)
    elif known and known["account"].startswith(cat_root):
        account = known["account"]
    elif business:
        account = "Income:Business:Revenue" if income else "Expenses:Business:Other"
    else:
        account = "Income:Uncategorized" if income else "Expenses:Uncategorized"

    if source_q:
        source = match_account(source_q, accounts, ("Assets:", "Liabilities:"))
    elif known and known["account"] == account:
        source = known["source"]
    elif business:
        source = str(p.get("default-business-account", "Assets:Business:Checking"))
    else:
        source = str(p.get("default-account", "Assets:Liquid:Cash"))

    return {
        "date": (today - dt.timedelta(days=offset)).isoformat(),
        "flag": "!" if account.endswith(":Uncategorized") else "*",
        "narration": narration, "amount": amount, "currency": currency,
        "account": account, "source": source, "income": income, "business": business,
    }


def entry_text(e, fin_id):
    sign = -1 if e["income"] else 1
    return (f'\n{e["date"]} {e["flag"]} "{e["narration"]}"\n'
            f'  finid: "{fin_id}"\n'
            f'  {e["account"]}  {sign * e["amount"]} {e["currency"]}\n'
            f'  {e["source"]}\n')


def add_entry(line, today=None):
    today = today or dt.date.today()
    entries = load_ok()
    p = params(entries, today)
    currencies = {e.currency for e in entries if isinstance(e, data.Commodity)}
    e = parse_entry(line, today, open_accounts(entries), history(entries), p, currencies)
    fin_id = dt.datetime.now().strftime("%Y%m%dT%H%M%S-") + uuid.uuid4().hex[:6]
    before = INBOX.read_text(encoding="utf-8")
    INBOX.write_text(before + entry_text(e, fin_id), encoding="utf-8")
    _, errors = load()
    if errors:
        INBOX.write_text(before, encoding="utf-8")  # откат: журнал не портим
        raise FinError("ledger", "Не записано:\n" + "\n".join(error_lines(errors)),
                       messages=error_lines(errors))
    e["id"] = fin_id
    return e


def undo_entry(fin_id=None):
    lines = INBOX.read_text(encoding="utf-8").split("\n")
    marks = [i for i, s in enumerate(lines) if re.match(r'^\s+finid: "([^"]+)"$', s)]
    if fin_id:
        marks = [i for i in marks if f'"{fin_id}"' in lines[i]]
    if not marks:
        raise FinError("nothing-to-undo", "Нечего отменять: в inbox нет быстрых записей.")
    i = marks[-1]
    start, end = i - 1, i + 1
    while end < len(lines) and lines[end].startswith("  "):
        end += 1
    header = lines[start]
    if start > 0 and lines[start - 1].strip() == "":
        start -= 1
    removed = re.search(r'"(.*)"', header)
    before = "\n".join(lines)
    INBOX.write_text("\n".join(lines[:start] + lines[end:]), encoding="utf-8")
    _, errors = load()
    if errors:
        INBOX.write_text(before, encoding="utf-8")
        raise FinError("ledger", "Не отменено:\n" + "\n".join(error_lines(errors)))
    return {"narration": removed.group(1) if removed else ""}


# ---------- действие недели ----------

def iso_week(d):
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def week_read(today):
    try:
        w = json.loads(WEEK.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(w, dict) or not w.get("text"):
        return None
    if w.get("week") != iso_week(today):  # новая неделя: то же действие, счётчик с нуля
        w = {**w, "week": iso_week(today), "done": 0}
    return {"text": str(w["text"])[:200], "target": int(w.get("target", 1)),
            "done": int(w.get("done", 0)), "week": w["week"]}


def week_write(w):
    WEEK.parent.mkdir(exist_ok=True)
    tmp = WEEK.with_suffix(".tmp")
    tmp.write_text(json.dumps(w, ensure_ascii=False), encoding="utf-8")
    tmp.replace(WEEK)


def week_cmd(words, today):
    w = week_read(today)
    if not words:
        return w
    head = words[0]
    if head == "clear":
        WEEK.unlink(missing_ok=True)
        return None
    if re.fullmatch(r"[+-]\d+", head):
        if not w:
            raise FinError("no-week", "Сначала задайте действие: fin week 10 предложений клиентам.")
        w["done"] = max(0, min(w["done"] + int(head), 999))
        week_write(w)
        return w
    if not head.isdigit() or len(words) < 2 or not 1 <= int(head) <= 999:
        raise FinError("week-format", "Формат: fin week 10 предложений клиентам.")
    w = {"text": " ".join(words[1:])[:200], "target": int(head), "done": 0, "week": iso_week(today)}
    week_write(w)
    return w


# ---------- вывод ----------

def jsonable(x):
    if isinstance(x, Decimal):
        return float(round(x, 4))
    if isinstance(x, (dt.date, dt.datetime)):
        return x.isoformat()
    if isinstance(x, dict):
        return {k: jsonable(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [jsonable(v) for v in x]
    return x


def emit(obj):
    print(json.dumps(jsonable({"schema": SCHEMA, **obj}), ensure_ascii=False))


def status(today):
    entries = load_ok()
    m = metrics(entries, today)
    p = m["params"]
    return {
        "date": today, "currency": BASE, "dataDays": m["data_days"],
        "netWorth": m["net_worth"], "liquid": m["liquid"], "invest": m["invest"], "crypto": m["crypto"],
        "business": m["business"], "income": m["income"], "living": m["living"], "fixed": m["fixed"],
        "savingsRate": m["savings_rate"], "savingsTarget": dec(p, "pay-yourself-first", 0),
        "runway": m["runway"], "assetIncome": m["asset_income"],
        "ladder": m["ladder"],
        "tax": {"rate": m["tax_rate"], "need": m["tax_need"], "reserved": m["tax_reserved"]},
        "bizMonth": m["biz_month"], "months": m["months"],
        "unprocessed": m["unprocessed"], "warnings": m["warnings"],
        "week": week_read(today),
        "entry": {"businessTag": str(p.get("business-tag", "ип")),
                  "defaultAccount": str(p.get("default-account", "Assets:Liquid:Cash")),
                  "defaultBusinessAccount": str(p.get("default-business-account", "Assets:Business:Checking")),
                  "currencies": sorted({e.currency for e in entries if isinstance(e, data.Commodity)}),
                  "accounts": open_accounts(entries), "history": history(entries)},
    }


def rub(x):
    return f"{x:,.0f} ₽".replace(",", " ")


def pct(x):
    return "—" if x is None else f"{x * 100:.0f}%"


LADDER_RU = {
    "no-debt": "0. Нет долгов под проценты",
    "reserve-min": "1. Подушка {months} мес.",
    "reserve-target": "2. Подушка {months} мес. (runway на свой проект)",
    "asset-share": "3. Доход от активов ≥ {share_pct} расходов",
    "asset-fixed": "4. Доход от активов ≥ обязательных расходов",
    "freedom": "5. Капитал свободы {capital_rub}",
}

WARN_RU = {
    "crypto-limit": lambda w: f"⚠ Крипта {pct(w['share'])} net worth — больше лимита {pct(w['limit'])}.",
    "tax-gap": lambda w: f"⚠ В налоговой копилке не хватает {rub(w['amount'])} (правило 3).",
    "unprocessed": lambda w: f"⚠ Не разобрано операций: {w['count']} (Fava → Query → «Не разобрано»).",
    "missing-price": lambda w: f"⚠ Нет курса для: {', '.join(w['currencies'])} — суммы не учтены.",
    "little-data": lambda w: f"⚠ Данных {w['days']} дн. (меньше 60) — средние пока приблизительные.",
}


def step_name(s):
    return LADDER_RU[s["key"]].format(months=s.get("months", ""), share_pct=pct(s.get("share")),
                                      capital_rub=rub(s.get("capital", 0)))


def bar(prog, width=20):
    filled = int(prog * width)
    return "█" * filled + "░" * (width - filled)


def report_text(today):
    m = metrics(load_ok(), today)
    p = m["params"]
    runway = "—" if m["runway"] is None else f"{m['runway']:.1f} мес."
    lines = [
        f"Финансы на {today}  (данных за {m['data_days']} дн.)", "",
        f"Net worth             {rub(m['net_worth'])}",
        f"  ликвидные           {rub(m['liquid'])}",
        f"  инвестиции          {rub(m['invest'])}",
        f"  крипта              {rub(m['crypto'])}",
        f"  ИП                  {rub(m['business'])}   (налоговая копилка {rub(m['tax_reserved'])} из {rub(m['tax_need'])})",
        f"Доход в месяц         {rub(m['income'])}",
        f"Расходы в месяц       {rub(m['living'])}   (обязательные {rub(m['fixed'])})",
        f"Норма сбережений      {pct(m['savings_rate'])}   (цель ≥ {pct(dec(p, 'pay-yourself-first', 0))})",
        f"Runway                {runway}",
        f"Доход от активов/мес  {rub(m['asset_income'])}",
        f"ИП в этом месяце      выручка {rub(m['biz_month']['revenue'])}, прибыль {rub(m['biz_month']['profit'])}",
        "", "Лестница свободы:",
    ]
    current_found = False
    for s in m["ladder"]:
        prog = s["progress"]
        if prog is None:
            mark, tail = "·", "нет данных"
        elif s["done"]:
            mark, tail = "✓", ""
        else:
            mark = " " if current_found else "→"
            tail = f"{bar(prog)} {prog * 100:.0f}%"
            current_found = True
        lines.append(f"  {mark} {step_name(s)}  {tail}".rstrip())
    if m["warnings"]:
        lines += [""] + [WARN_RU[w["key"]](w) for w in m["warnings"]]
    return "\n".join(lines)


# ---------- команды ----------

def cmd_check(a):
    m = metrics(load_ok(), dt.date.today())
    if a.json:
        return emit({"ok": True, "warnings": m["warnings"]})
    w = [x for x in m["warnings"] if x["key"] != "little-data"]
    print("Журнал в порядке." if not w else "Журнал в порядке, но:")
    for x in w:
        print(WARN_RU[x["key"]](x))


def cmd_report(a):
    print(report_text(dt.date.today()))


def cmd_status(a):
    emit(status(dt.date.today()))


def cmd_add(a):
    line = " ".join(a.words)
    if not line and not a.json:
        line = input("Строка (450 кофе @нал >EatingOut #ип вчера): ").strip()
    e = add_entry(line)
    if a.json:
        return emit({"ok": True, "entry": e})
    sign = "+" if e["income"] else "−"
    print(f'Записано: {e["date"]} {sign}{e["amount"]} {e["currency"]} «{e["narration"]}» '
          f'{e["source"]} → {e["account"]}' + ("  [! разобрать]" if e["flag"] == "!" else ""))


def cmd_undo(a):
    r = undo_entry(a.id)
    if a.json:
        return emit({"ok": True, **r})
    print(f"Отменено: «{r['narration']}»")


def cmd_week(a):
    w = week_cmd(a.words, dt.date.today())
    if a.json:
        return emit({"ok": True, "week": w})
    print("Действие недели не задано." if not w else f"{w['text']}: {w['done']} / {w['target']}")


def cmd_prices(a):
    with urllib.request.urlopen("https://www.cbr.ru/scripts/XML_daily.asp", timeout=20) as r:
        root = ET.fromstring(r.read(2_000_000))
    d = dt.datetime.strptime(root.attrib["Date"], "%d.%m.%Y").date()
    text = PRICES.read_text(encoding="utf-8")
    added = []
    for v in root.findall("Valute"):
        cur = v.findtext("CharCode")
        if cur not in ("USD", "EUR"):
            continue
        try:
            rate = Decimal(v.findtext("VunitRate").replace(",", "."))
        except (AttributeError, InvalidOperation):
            continue
        if f"{d} price {cur} " not in text:
            added.append(f"{d} price {cur} {rate} {BASE}")
    if added:
        with PRICES.open("a", encoding="utf-8") as f:
            f.write("\n".join(added) + "\n")
    print("\n".join(added) if added else f"Курсы ЦБ на {d} уже есть.")


def cmd_review(a):
    today = dt.date.today()
    if a.month:
        y, mo = map(int, a.month.split("-"))
    else:
        prev = today.replace(day=1) - dt.timedelta(days=1)
        y, mo = prev.year, prev.month
    end = dt.date(y + mo // 12, mo % 12 + 1, 1) - dt.timedelta(days=1)
    REVIEWS.mkdir(exist_ok=True)
    path = REVIEWS / f"{y}-{mo:02d}.md"
    if path.exists():
        raise FinError("exists", f"Уже есть: {path} — не перезаписываю.")
    template = (ROOT / "templates" / "Обзор месяца.md").read_text(encoding="utf-8")
    body = template.replace("{{month}}", f"{y}-{mo:02d}").replace("{{report}}", report_text(min(end, today)))
    path.write_text(body, encoding="utf-8")
    print(f"Создан {path}\nДальше: в Claude Code «разбери месяц {y}-{mo:02d}», допишите вывод и одно действие.")


def cmd_fava(a):
    os.execvp("fava", ["fava", str(MAIN), "-p", "5000"])


def main(argv=None):
    ap = argparse.ArgumentParser(prog="fin", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def cmd(name, fn, json_flag=False, **kw):
        s = sub.add_parser(name, **kw)
        if json_flag:
            s.add_argument("--json", action="store_true")
        s.set_defaults(fn=fn)
        return s

    cmd("check", cmd_check, True)
    cmd("report", cmd_report)
    cmd("status", cmd_status, True)
    s = cmd("add", cmd_add, True, formatter_class=argparse.RawDescriptionHelpFormatter, description=(
        "Одна строка: СУММА [ВАЛЮТА] описание [@откуда] [>категория] [#ип] [вчера|позавчера]\n"
        "  450 кофе                 расход наличными; категория — как в прошлый раз «кофе»\n"
        "  +120к клиент Альфа #ип   доход ИП на расчётный счёт\n"
        "  12 usd хостинг #ип >Tools\n"
        "  1200 такси @тинькофф вчера\n"
        "Без известной категории — Uncategorized с флагом «!», разобрать на сверке."))
    s.add_argument("words", nargs="*")
    s = cmd("undo", cmd_undo, True)
    s.add_argument("id", nargs="?")
    s = cmd("week", cmd_week, True)
    s.add_argument("words", nargs="*")
    cmd("prices", cmd_prices)
    s = cmd("review", cmd_review)
    s.add_argument("month", nargs="?", help="ГГГГ-ММ")
    cmd("fava", cmd_fava)
    a = ap.parse_args(argv)
    try:
        a.fn(a)
    except FinError as err:
        if getattr(a, "json", False):
            emit({"ok": False, "error": err.key, "message": err.text, **err.extra})
        else:
            print(err.text, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

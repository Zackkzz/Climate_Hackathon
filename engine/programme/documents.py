"""Printable documents: self-contained HTML (inline CSS, A4 print styles, no external assets).

Wording follows docs/policy-australia.md, Route A: a service charge collected by a community housing provider, not a
loan to the tenant. Each document carries the example notice. Documents are rendered from the live records when
asked for; the ``documents`` table records when each was issued (and supersedes a tenant disclosure after a tenancy
change).
"""
from __future__ import annotations

import html
from typing import Any

from . import audit, auth, clock, db
from . import deal as D
from . import service as S
from .auth import NO_PERSONAL, Principal
from .errors import bad, forbidden, not_found

NOTICE = "Example document produced by a prototype. Not legal or financial advice."
KINDS = {
    "tenant_disclosure": ("Your flat's energy upgrade: what it costs and what you save", True),
    "owner_agreement": ("Owner agreement: upgrade and service charge", False),
    "funder_term_sheet": ("Funder term sheet", False),
    "charge_schedule": ("Charge schedule for your flat", True),
    "commissioning_certificate": ("Commissioning certificate", False),
    "mv_report": ("Measured savings report", False),
}
ROLES_FOR = {
    "tenant_disclosure": {"manager", "owner", "tenant"},
    "charge_schedule": {"manager", "owner", "tenant"},
    "owner_agreement": {"manager", "owner", "funder", "government"},
    "funder_term_sheet": {"manager", "owner", "funder", "government"},
    "commissioning_certificate": {"manager", "owner", "installer", "funder", "government", "tenant"},
    "mv_report": {"manager", "owner", "funder", "government"},
}


def e(x: Any) -> str:
    return html.escape("" if x is None else str(x))


def money(x: Any, cents: bool = True) -> str:
    if x is None:
        return "-"
    x = float(x)
    return f"${x:,.2f}" if cents else f"${x:,.0f}"


def month_label(m: str | None) -> str:
    if not m:
        return "-"
    names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
             "November", "December"]
    return f"{names[int(m[5:7]) - 1]} {m[:4]}"


# ------------------------------------------------------------------------------------------- records

def record(pid: int, kind: str, flat_id: int | None = None, tenancy_id: int | None = None) -> None:
    if flat_id is not None:
        db.ex("UPDATE documents SET superseded = 1 WHERE project_id = ? AND kind = ? AND flat_id = ?",
              (pid, kind, flat_id))
    else:
        db.ex("UPDATE documents SET superseded = 1 WHERE project_id = ? AND kind = ? AND flat_id IS NULL", (pid, kind))
    db.insert("documents", project_id=pid, kind=kind, flat_id=flat_id, tenancy_id=tenancy_id,
              generated_at=clock.now_iso())


def record_offer_documents(pid: int, kinds: tuple[str, ...] = ("tenant_disclosure", "owner_agreement",
                                                                 "funder_term_sheet", "charge_schedule")) -> None:
    for k in kinds:
        if KINDS[k][1]:
            for f in S.flats_of(pid):
                if f["consent"] == "declined" and k == "charge_schedule":
                    continue
                t = S.active_tenancy(f["id"])
                record(pid, k, f["id"], t["id"] if t else None)
        else:
            record(pid, k)


def url(pid: int, kind: str, flat_id: int | None = None) -> str:
    return f"/api/programme/documents/{pid}/{kind}.html" + (f"?flat_id={flat_id}" if flat_id else "")


def list_documents(p: Principal, pid: int) -> list[dict]:
    pr = S.get_project(pid)
    S.check_project(p, pr)
    out = []
    for d in db.q("SELECT * FROM documents WHERE project_id = ? AND superseded = 0 ORDER BY id", (pid,)):
        if p.role not in ROLES_FOR[d["kind"]]:
            continue
        if p.role == "tenant" and d["flat_id"] not in (None, p.flat_id):
            continue
        title = KINDS[d["kind"]][0]
        if d["flat_id"]:
            f = S.get_flat(d["flat_id"])
            title += f" (unit {f['unit']})" if p.role not in NO_PERSONAL else ""
        out.append({"kind": d["kind"], "title": title, "flat_id": d["flat_id"], "url": url(pid, d["kind"], d["flat_id"]),
                    "generated_at": d["generated_at"]})
    return out


# ------------------------------------------------------------------------------------------- page shell

CSS = """
@page { size: A4; margin: 16mm 15mm; }
* { box-sizing: border-box; }
body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #1b1f24; background: #fff; margin: 0;
       font-size: 11pt; line-height: 1.45; }
main { max-width: 190mm; margin: 0 auto; padding: 12mm 8mm; }
.notice { border: 2px solid #8a4b00; background: #fff6e8; color: #5a3200; padding: 6px 10px; font-weight: 600;
          font-size: 10pt; margin-bottom: 14px; }
h1 { font-size: 19pt; margin: 4px 0 2px; line-height: 1.2; }
h2 { font-size: 13pt; margin: 18px 0 6px; border-bottom: 1px solid #c9d1d9; padding-bottom: 3px; }
.sub { color: #4a5560; margin: 0 0 10px; }
.figs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 10px 0; }
.fig { border: 1px solid #c9d1d9; border-radius: 6px; padding: 8px 10px; }
.fig b { display: block; font-size: 15pt; }
.fig span { font-size: 9.5pt; color: #4a5560; }
table { border-collapse: collapse; width: 100%; font-size: 9.5pt; margin: 6px 0; }
th, td { border: 1px solid #c9d1d9; padding: 3px 6px; text-align: left; vertical-align: top; }
th { background: #eef2f5; }
td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
ul { margin: 4px 0 8px 18px; padding: 0; }
.small { font-size: 9pt; color: #4a5560; }
.ok { color: #1a6b2f; font-weight: 600; } .warn { color: #8a4b00; font-weight: 600; }
.sig { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 24px; }
.sig div { border-top: 1px solid #1b1f24; padding-top: 4px; font-size: 9.5pt; }
footer { margin-top: 20px; border-top: 1px solid #c9d1d9; padding-top: 6px; font-size: 8.5pt; color: #4a5560; }
@media print { main { padding: 0; } h2 { break-after: avoid; } table, .fig { break-inside: avoid; }
  .notice { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
"""


def page(title: str, subtitle: str, body: str, ref: str) -> str:
    return (f"<!doctype html><html lang=\"en-AU\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" "
            f"content=\"width=device-width, initial-scale=1\"><title>{e(title)}</title><style>{CSS}</style></head>"
            f"<body><main><div class=\"notice\" role=\"note\">{NOTICE}</div><h1>{e(title)}</h1>"
            f"<p class=\"sub\">{subtitle}</p>{body}<footer>{NOTICE} Organisations, people and meter numbers in this "
            f"demonstration are fictional examples. Reference {e(ref)}. Printed {e(clock.today())}.</footer>"
            f"</main></body></html>")


def figs(items: list[tuple[str, str]]) -> str:
    return "<div class=\"figs\">" + "".join(f"<div class=\"fig\"><b>{e(v)}</b><span>{e(k)}</span></div>"
                                              for k, v in items) + "</div>"


def table(head: list[str], rows: list[list[Any]], num_cols: set[int] = frozenset()) -> str:
    h = "".join(f"<th{' class=n' if i in num_cols else ''}>{e(x)}</th>" for i, x in enumerate(head))
    b = "".join("<tr>" + "".join(f"<td{' class=n' if i in num_cols else ''}>{e(x)}</td>" for i, x in enumerate(r))
                + "</tr>" for r in rows)
    return f"<table><thead><tr>{h}</tr></thead><tbody>{b}</tbody></table>"


# ------------------------------------------------------------------------------------------- shared facts

def _facts(pr: dict) -> dict:
    prog = S.programme()
    fin = S.finance_for(pr)
    dl = pr.get("deal") or {}
    provider = auth.org_obj(pr["owner_org_id"]) or {"name": "the housing provider"}
    contact = (db.q1("SELECT contact_json FROM orgs WHERE id = ?", (pr["owner_org_id"],)) or {}).get("contact") or {}
    term_end = pr["charge_end"] or (pr.get("schedule") or {}).get("end")
    return {"prog": prog, "fin": fin, "deal": dl, "provider": provider, "contact": contact, "term_end": term_end,
            "installed": [i["label"] for i in _installed(pr)]}


def _installed(pr: dict) -> list[dict]:
    pkg = pr["package"] or {}
    return [{"key": k, "label": S.ITEM_LABELS[k]} for k in S.ITEM_LABELS if pkg.get(k)]


def _verified_for_flat(pid: int, fid: int) -> dict | None:
    for r in reversed(db.q("SELECT * FROM mv_runs WHERE project_id = ? ORDER BY id", (pid,))):
        for b in r["data"]["by_flat"]:
            if b["flat_id"] == fid and b.get("result"):
                return {"run_on": r["data"]["run_on"], "period": r["data"]["period"], **b["result"],
                        "source": r["data"]["source"]}
    return None


# ------------------------------------------------------------------------------------------- documents

def tenant_disclosure(pr: dict, f: dict, p: Principal) -> str:
    x = _facts(pr)
    g = D.group(x["deal"], f["position"]) if x["deal"] else {}
    t = S.active_tenancy(f["id"])
    saving_m = (g.get("saving_per_year") or 0) / 12
    charge = f["charge_per_month"] if f["charge_status"] in ("active", "paused", "ended") else \
        (f["offered_charge"] if f["offered_charge"] is not None else g.get("charge_per_month", 0))
    net = saving_m - charge
    share = x["fin"]["savings_share_to_charge"]
    contact = x["contact"]
    v = _verified_for_flat(pr["id"], f["id"])
    from .ledger import current_data_consent
    dc = current_data_consent(f["id"])
    who = e(t["tenant_name"]) if t else "the tenant"
    start = month_label(pr["charge_start"]) if pr["charge_start"] else "the month after the work is finished"
    roof = "on the roof of your building" if (pr["package"] or {}).get("cool_roof") else ""
    body = figs([("Service charge each month", money(charge)), ("Expected saving on energy bills each month",
                                                                  money(saving_m)),
                 ("Expected to be better off each month", money(net))])
    body += f"""
<p>This sheet is for <b>{who}</b>, unit {e(f['unit'])}, {e(pr['label'])}. Meter {e(f['meter_id'])}.
Please read it before you agree. It takes about two minutes.</p>
<h2>1. What is installed</h2><ul>{''.join(f'<li>{e(i)}{" " + roof if "roof" in i.lower() and roof else ""}</li>' for i in x['installed'])}</ul>
<p>{e(x['provider']['name'])} owns the equipment. You do not pay anything upfront.</p>
<h2>2. What you pay</h2>
<ul><li>A service charge of <b>{money(charge)} a month</b>, collected by {e(x['provider']['name'])} with your rent.</li>
<li>It starts in {e(start)} and ends in {e(month_label(x['term_end']))} at the latest. It is not a loan to you, and you
do not owe the rest of the cost if you leave.</li>
<li>Your energy bills still come from your own retailer as now.</li></ul>
<h2>3. What you are expected to save</h2>
<p>The model expects your energy bills to fall by about <b>{money(saving_m)} a month</b>. After the charge you are
expected to be about <b>{money(net)} a month</b> better off. This is an estimate: real savings depend on how you use
your home and on energy prices.</p>
{f'<p>Checked against real meter readings for {e(v["period"]["from"])} to {e(v["period"]["to"])}: your verified saving was <b>{money(v.get("verified_saving_per_month"))} a month</b> (readings: {e(v["source"])}).</p>' if v else ''}
<h2>4. What is guaranteed</h2>
<ul><li>The charge is never more than {share:.0%} of the expected saving, so you keep at least {1 - share:.0%}.</li>
<li>Your charge can never go above the {money(f['offered_charge'] if f['offered_charge'] is not None else charge)} in your offer.</li>
<li>Each year your savings are checked against real meter readings. If they are lower than expected, your charge is
lowered and anything you overpaid is refunded from a reserve fund.</li>
<li>Your rent will not go up because of this upgrade. <span class="small">(Provider policy; how this is enforced is to confirm.)</span></li>
<li>Your power cannot be cut off because of this charge.</li></ul>
<h2>5. If something breaks</h2>
<p>Report it to {e(x['provider']['name'])} ({e(contact.get('phone', 'phone on your lease'))}) or in the Meterwise tenant page.
From the month you report it, <b>you pay no charge</b> until it is fixed. Repairs under warranty cost you nothing. The
paused months are not added to the end.</p>
<h2>6. If you move out</h2>
<p>The charge stays with the flat's meter, not with you. You pay only up to the date you leave, and any balance is
settled then; you do not carry a debt with you. The next tenant is given this sheet before they sign.</p>
<h2>7. Your meter data</h2>
<p>Agreeing to the upgrade does <b>not</b> mean agreeing to share your meter data. Separately, you can let the
programme use your <b>monthly electricity and gas totals</b> to check your savings. You can withdraw that at any time
in the tenant page or by asking {e(x['provider']['name'])}. Without it, savings are checked using estimates only.
Status for this flat: <b>{'consent given' + (' until ' + e(dc['expires_on']) if dc and dc['expires_on'] else '') if dc else 'no consent given'}</b>.</p>
<h2>8. How to complain</h2>
<ol><li>Contact {e(x['provider']['name'])}: {e(contact.get('email', 'see your lease'))}, {e(contact.get('phone', ''))}.</li>
<li>If you are not happy with the answer, for tenancy matters contact NSW Fair Trading or apply to the NSW Civil and
Administrative Tribunal (NCAT).</li>
<li>For problems with your energy retailer's bill, contact the Energy and Water Ombudsman NSW (EWON).</li></ol>
<p class="small">Your consent: {e(f['consent'])}{(' on ' + e(f['consent_on'])) if f['consent_on'] else ''}.
Disclosure given: {e((t or {}).get('disclosed_on') or (t or {}).get('start_date') or '-')}.</p>"""
    return page(KINDS["tenant_disclosure"][0], f"Unit {e(f['unit'])}, {e(pr['label'])}", body,
                f"P{pr['id']}-F{f['id']}-T{t['id'] if t else 0}")


def charge_schedule_doc(pr: dict, f: dict, p: Principal) -> str:
    from .ledger import balance
    sched = pr.get("schedule") or {}
    grp = next((g for g in sched.get("groups", []) if g["position"] == f["position"]), None)
    rows = []
    if grp:
        for r in grp["rows"]:
            rows.append([r["n"], r["month"], money(r["charge"]), money(r["reserve"]), money(r["interest"]),
                         money(r["principal"]), money(r["balance"])])
    entries = db.q("SELECT * FROM ledger WHERE flat_id = ? ORDER BY id", (f["id"],))
    if p.role == "tenant":
        entries = [x for x in entries if x["tenancy_id"] == p.tenancy_id]
    led = [[x["month"], x["kind"].replace("_", " "), money(x["amount"]), money(x["balance_after"]), x["note"]]
           for x in entries[-24:]]
    body = figs([("Current charge each month", money(f["charge_per_month"])),
                 ("Charge period", f"{sched.get('start', '-')} to {sched.get('end', '-')}"),
                 ("Owing now", money(balance(f["id"])))])
    body += ("<p>The schedule shows how each month's charge is split. Part goes to the programme reserve; the rest pays "
             "interest and the cost of the equipment for this flat. "
             + ("This schedule is provisional until the start month is set." if sched.get("provisional") else "")
             + (f" Your charge was lowered after a savings check to {money(f['charge_per_month'])}; the rows show the "
                "original schedule the funder is repaid on." if grp and f["charge_per_month"] < grp["charge_per_month"] - 0.005 else "")
             + "</p>")
    body += "<h2>Recent account entries</h2>" + (table(["Month", "Entry", "Amount", "Balance", "Note"], led, {2, 3})
                                                 if led else "<p>No entries yet.</p>")
    body += "<h2>Full schedule</h2>" + (table(["#", "Month", "Charge", "To reserve", "Interest", "Principal", "Balance"],
                                              rows, {2, 3, 4, 5, 6}) if rows else "<p>No schedule yet.</p>")
    return page(KINDS["charge_schedule"][0], f"Unit {e(f['unit'])}, {e(pr['label'])}. Meter {e(f['meter_id'])}", body,
                f"P{pr['id']}-F{f['id']}")


def owner_agreement(pr: dict, p: Principal) -> str:
    x = _facts(pr)
    dl = x["deal"]
    fin = x["fin"]
    c = S.consent_state(pr)
    items = table(["Item", "Cost", "Rebates", "Net", "Priced from"],
                  [[i["label"], money(i["capex"], False), money(i["rebate"], False), money(i["net_capex"], False),
                    i["priced_from"]] for i in dl.get("items", [])], {1, 2, 3})
    res = pr.get("owner_resolution")
    body = figs([("Net cost after rebates", money(dl.get("net_capex"), False)),
                 ("Repaid by service charges", money(dl.get("financed"), False)),
                 ("Funding gap (grant or owner)", money(dl.get("funding_gap"), False))])
    body += f"""
<p>Between <b>{e(x['provider']['name'])}</b> (the owner) and <b>{e(x['prog']['name'])}</b> (the programme), for
<b>{e(pr['label'])}</b> ({len(S.flats_of(pr['id']))} flats). Delivery route: a service charge collected by the owner
(Route A). It is not a loan to tenants.</p>
<h2>1. The work</h2>{items}
<h2>2. Who pays</h2><ul>
<li>The programme pays the installer. The owner pays nothing upfront and owns the equipment.</li>
<li>Tenants who agree pay a monthly service charge, collected by the owner with rent and passed to the programme
monthly. Total across the block: {money(dl.get('charge_per_month_building'))} a month.</li>
<li>Grant allocated: {money(pr['grant_allocated'], False)}. Owner contribution: {money(pr['owner_contribution'], False)}.</li>
<li>Term: {fin['term_years']} years at {fin['cost_of_capital']:.1%}. {fin['reserve']:.0%} of each charge goes to a reserve.</li></ul>
<h2>3. The owner agrees to</h2><ul>
<li>Give site access for the audit, installation and fault repairs.</li>
<li>Collect the charge with rent, record payments and tenancy changes in the programme system.</li>
<li>Give every new tenant the tenant disclosure before they sign a lease.</li>
<li>Not raise the rent because of the upgrade (the owner paid nothing for it).</li>
<li>Not seek disconnection of any supply because of this charge.</li>
<li>Report faults promptly. A flat's charge pauses from the month a fault is reported until it is fixed.</li></ul>
<h2>4. Tenants who decline</h2>
<p>A tenant who declines gets no charge and no work inside their flat. Building-wide work goes ahead if at least
{pr['consent_threshold']:.0%} of flats agree; the declined flats' share is carried by the programme, not by other
tenants. Currently {c['tenants_agreed']} agreed, {c['tenants_declined']} declined, {c['tenants_pending']} not yet answered.</p>
<h2>5. Savings checks</h2>
<p>Each year the programme compares meter readings with what the flats would have used without the upgrade. If a
flat's verified saving does not support its charge, the charge is lowered and overpayments are refunded from the
reserve. Meter data is used only with each tenant's separate consent.</p>
<h2>6. Open points to confirm</h2><ul>
<li>Whether the service charge can sit alongside rent in the lease without counting as a rent increase.</li>
<li>Insurance of the equipment during the term, and what happens if the block is redeveloped.</li></ul>
{f'<p>Owners corporation resolution: meeting {e(res["meeting_date"])}, {e(res["votes_for"])} for, {e(res["votes_against"])} against ({e(res["kind"])} resolution).</p>' if res else ''}
<div class="sig"><div>For the owner: {e(pr['owner_signed_by'] or '')} {('signed ' + e(pr['owner_signed_on'])) if pr['owner_signed_on'] else '(not yet signed)'}</div>
<div>For the programme</div></div>"""
    return page(KINDS["owner_agreement"][0], e(pr["label"]), body, f"P{pr['id']}-OA")


def funder_term_sheet(pr: dict, p: Principal) -> str:
    from .ledger import arrears_of
    x = _facts(pr)
    dl = x["deal"]
    fin = x["fin"]
    flats = S.flats_of(pr["id"])
    billed = db.q1("SELECT COALESCE(SUM(amount),0) AS s FROM ledger l JOIN flats f ON f.id = l.flat_id WHERE "
                   "f.project_id = ? AND l.kind IN ('charge','pause_credit')", (pr["id"],))["s"]
    paid = -db.q1("SELECT COALESCE(SUM(amount),0) AS s FROM ledger l JOIN flats f ON f.id = l.flat_id WHERE "
                  "f.project_id = ? AND l.kind = 'payment'", (pr["id"],))["s"]
    runs = db.q("SELECT * FROM mv_runs WHERE project_id = ? ORDER BY id", (pr["id"],))
    last = runs[-1]["data"] if runs else None
    body = figs([("Capital provided", money(dl.get("financed"), False)), ("Cost of capital", f"{fin['cost_of_capital']:.1%}"),
                 ("Term", f"{fin['term_years']} years")])
    body += f"""
<p>Project: <b>{e(pr['label'])}</b>, stage {e(S.STAGE_LABELS[pr['stage']])}. Route A: service charges collected by
{e(x['provider']['name'])}. Tenant names are not shown in this sheet.</p>
<h2>Terms</h2>{table(['Term', 'Value'], [
        ['Net cost after rebates', money(dl.get('net_capex'), False)],
        ['Capital repaid by charges', money(dl.get('financed'), False)],
        ['Grant (covers the funding gap)', money(dl.get('grant_used'), False)],
        ['Owner contribution', money(dl.get('owner_used'), False)],
        ['Charges per month, whole block', money(dl.get('charge_per_month_building'))],
        ['Reserve share of each charge', f"{fin['reserve']:.0%}"],
        ['Charge period', f"{pr['charge_start'] or 'not yet set'} to {pr['charge_end'] or '-'}"],
        ['Flats taking part', f"{dl.get('flats_participating', 0)} of {dl.get('flats_total', len(flats))}"]])}
<h2>Protections that limit repayment</h2><ul>
<li>Each charge is capped at {fin['savings_share_to_charge']:.0%} of the flat's modelled saving and never above the offered charge.</li>
<li>Charges pause while equipment is faulty. The reserve pays the funder's share for those months; the term is not extended.</li>
<li>After each annual savings check, charges not supported by verified savings are reduced. Overpayments are refunded from the reserve. Future repayments fall accordingly.</li>
<li>Balances of departing tenants are written off and covered by the reserve. Arrears never lead to disconnection.</li></ul>
<h2>Performance to date</h2>{table(['Measure', 'Value'], [
        ['Billed (after pauses)', money(billed)], ['Collected', money(paid)],
        ['Arrears', money(sum(arrears_of(f['id']) for f in flats))],
        ['Latest savings check', f"{last['period']['from']} to {last['period']['to']}: realisation {last['realisation_rate']:.0%}, "
                                 f"{len(last['true_ups'])} true-ups ({last['source']} readings)" if last else 'None yet']])}
<h2>Risks</h2><ul><li>Savings may be lower than modelled (US evidence: about half of Kansas participants saved enough to cover the charge).</li>
<li>Legal status of the charge under tenancy and credit law is to confirm.</li><li>Equipment life: term is kept within 80% of the shortest equipment life where possible.</li></ul>"""
    return page(KINDS["funder_term_sheet"][0], e(pr["label"]), body, f"P{pr['id']}-FTS")


def commissioning_certificate(pr: dict, p: Principal) -> str:
    wo = S.work_order(pr["id"])
    if not wo:
        raise not_found("A work order for this project")
    inst = auth.org_obj(wo["installer_org_id"]) or {"name": "-"}
    rows = [[c["label"], "Done" if c["done"] else "Not done", c["by"] or "", (c["at"] or "")[:10]] for c in wo["checklist"]]
    done = all(c["done"] for c in wo["checklist"])
    body = figs([("Installer", inst["name"]), ("Completed", wo["completed_on"] or "Not yet"),
                 ("Warranty", f"{wo['warranty_years']} years")])
    body += (f"<p>Block: <b>{e(pr['label'])}</b>. Work order {wo['id']}, scheduled start {e(wo['scheduled_start'])}.</p>"
             f"<p class=\"{'ok' if done else 'warn'}\">{'Every checklist item is done.' if done else 'Some checklist items are not done yet: this is not yet a certificate.'}</p>"
             + table(["Check", "Status", "By", "Date"], rows)
             + "<p class=\"small\">Installed: " + e(", ".join(i["label"] for i in _installed(pr))) + ".</p>"
             + "<div class=\"sig\"><div>Installer</div><div>Programme office</div></div>")
    return page(KINDS["commissioning_certificate"][0], e(pr["label"]), body, f"P{pr['id']}-CC")


def mv_report(pr: dict, p: Principal) -> str:
    runs = db.q("SELECT * FROM mv_runs WHERE project_id = ? ORDER BY id", (pr["id"],))
    if not runs:
        raise not_found("A measured-savings run for this project")
    d = runs[-1]["data"]
    sim = d["source"] in ("simulated", "mixed")
    rows = []
    hide = p.role in NO_PERSONAL
    for i, b in enumerate(d["by_flat"]):
        if hide:
            b = dict(b, unit=f"Flat {i + 1}")
        r = b.get("result")
        if not r:
            rows.append([b["unit"], "-", "-", "-", "-", b.get("reason", "")])
            continue
        rows.append([b["unit"], money(r.get("modelled_saving_per_month")), money(r.get("verified_saving_per_month")),
                     f"{(r.get('realisation_rate') or 0):.0%}", r.get("confidence", ""),
                     (r.get("true_up") or {}).get("action", "none").replace("_", " ")])
    tu = [["-" if hide else t["unit"], money(t["old_charge"]), money(t["new_charge"]), money(t["refund"])] for t in d["true_ups"]]
    method = next((b["result"].get("method") for b in d["by_flat"] if b.get("result")), "")
    body = figs([("Verified saving per flat each month", money(d["verified_saving_per_month"])),
                 ("Share of modelled saving achieved", f"{(d['realisation_rate'] or 0):.0%}"),
                 ("Refunded from the reserve", money(d["reserve_drawn"]))])
    body += (f"<p>Block <b>{e(pr['label'])}</b>. Period {e(d['period']['from'])} to {e(d['period']['to'])}, checked "
             f"{e(d['run_on'])}. Flats checked: {d['flats_verified']}; skipped for missing readings: {d.get('flats_skipped', 0)}."
             f" Bill-neutral on verified savings: {d['bill_neutral_flats']}.</p>"
             + (f"<p class=\"warn\">Readings in this report are SIMULATED for the demonstration ({e(d['source'])}). They are not measured data.</p>" if sim else "")
             + f"<h2>Method</h2><p>{e(method)}</p><h2>By flat</h2>"
             + table(["Unit", "Modelled saving", "Verified saving", "Achieved", "Confidence", "True-up"], rows, {1, 2, 3})
             + "<h2>True-ups applied</h2>"
             + (table(["Unit", "Old charge", "New charge", "Refund"], tu, {1, 2, 3}) if tu else "<p>None needed.</p>")
             + "<p class=\"small\">Rule: each tenant keeps at least the agreed share of the verified saving. If the charge "
               "is above that by more than the measurement uncertainty, it is reduced and the difference for months "
               "already billed is refunded from the reserve. Tenant names are not shown.</p>")
    return page(KINDS["mv_report"][0], e(pr["label"]), body, f"P{pr['id']}-MV{runs[-1]['id']}")


def render(p: Principal, pid: int, kind: str, flat_id: int | None) -> str:
    if kind not in KINDS:
        raise not_found(f"Document kind '{kind}'")
    if p.role not in ROLES_FOR[kind]:
        raise forbidden(f"The {p.role} role cannot open this document.")
    pr = S.get_project(pid)
    S.check_project(p, pr)
    if pr["stage"] in ("screened", "audit") and kind != "commissioning_certificate":
        raise not_found("This document (it is generated when the offer is issued)")
    if KINDS[kind][1]:
        if flat_id is None:
            if p.role == "tenant":
                flat_id = p.flat_id
            else:
                raise bad("This document is per flat: add ?flat_id=")
        f = S.get_flat(flat_id)
        if f["project_id"] != pid:
            raise not_found(f"Flat {flat_id} in project {pid}")
        if p.role == "tenant" and f["id"] != p.flat_id:
            raise forbidden("You can only open your own flat's documents.")
        if p.role != "tenant":
            audit.log("personal_data.read", pid, {"what": kind, "flat_id": flat_id})
        return tenant_disclosure(pr, f, p) if kind == "tenant_disclosure" else charge_schedule_doc(pr, f, p)
    return {"owner_agreement": owner_agreement, "funder_term_sheet": funder_term_sheet,
            "commissioning_certificate": commissioning_certificate, "mv_report": mv_report}[kind](pr, p)

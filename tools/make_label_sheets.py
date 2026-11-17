#!/usr/bin/env python3
"""Labelling-sheet generator (N-4). Protocol: docs/REVIEW_PROTOCOL.md.

Needs: python3 and openpyxl (pip install -r tools/requirements.txt).

    make_label_sheets.py findings    --findings results/findings.csv --out results/sheets/findings.xlsx
    make_label_sheets.py transitions --tests    results/triage.csv   --out results/sheets/transitions.xlsx
    make_label_sheets.py second      --sheet <completed primary sheet>.xlsx --out <second sheet>.xlsx
                                     [--keys sample.csv]

Rows are ordered by app, then key (NOT by round) so nobody anchors on "the fix worked".

INPUT: findings.csv  (one row per finding per checkpoint; rows in checkpoint order,
                      or add an integer `order` column)
    required: app, key, tool, rule, severity, path, line, checkpoint
    optional: snippet  (code at the flagged line; left empty if missing)
INPUT: tests.csv     (one row per pass->fail transition, from triage.csv)
    required: app, checkpoint, previous_checkpoint, test, first_error
    optional: boot_status  (rows whose value is not "ok" are skipped: rounds that did
                            not boot get no labels)

OUTPUT sheets have a dropdown (data validation) on the label column that rejects
anything except the allowed labels.

`second` copies a primary sheet with the label and note cleared (first label hidden)
for the second rater. With --keys, only the rows listed in sample.csv are kept:
sample.csv has the same identifying columns as the sheet (findings: app,key;
transitions: app,checkpoint,test). Drawing the seeded 20% sample is N-8, not here.
"""
import argparse
import csv
import sys
from collections import OrderedDict

try:
    from openpyxl import Workbook, load_workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.worksheet.datavalidation import DataValidation
except ImportError:  # pragma: no cover
    sys.exit("openpyxl is required: pip install -r tools/requirements.txt")

FINDING_LABELS = ["true", "false", "unsure"]
TRANSITION_LABELS = ["real_break", "broken_test", "unsure"]

FINDING_COLUMNS = ["app", "key", "tool", "rule", "severity", "example_location",
                   "code_snippet", "checkpoints", "label", "note"]
TRANSITION_COLUMNS = ["app", "checkpoint", "test", "first_error_line", "diff_command",
                      "label", "note"]

FINDING_REQUIRED = ["app", "key", "tool", "rule", "severity", "path", "line", "checkpoint"]
TRANSITION_REQUIRED = ["app", "checkpoint", "previous_checkpoint", "test", "first_error"]

SHEETS = {
    "findings": {"columns": FINDING_COLUMNS, "labels": FINDING_LABELS, "id": ["app", "key"]},
    "transitions": {"columns": TRANSITION_COLUMNS, "labels": TRANSITION_LABELS, "id": ["app", "checkpoint", "test"]},
}
WIDTHS = {"app": 12, "key": 34, "tool": 10, "rule": 34, "severity": 10, "example_location": 34,
          "code_snippet": 60, "checkpoints": 28, "checkpoint": 22, "test": 30,
          "first_error_line": 50, "diff_command": 60, "label": 14, "note": 40}


def read_csv(path, required):
    with open(path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        missing = [c for c in required if c not in (reader.fieldnames or [])]
        if missing:
            sys.exit(f"{path}: missing required column(s): {', '.join(missing)}")
        return list(reader)


def first_line(text):
    for line in (text or "").splitlines():
        if line.strip():
            return line.strip()
    return ""


def build_findings(rows):
    """One row per unique (app, key); checkpoints joined in order of appearance."""
    if rows and "order" in rows[0]:
        rows = sorted(rows, key=lambda r: int(r.get("order") or 0))
    groups = OrderedDict()
    for r in rows:
        gk = (r["app"], r["key"])
        g = groups.get(gk)
        cp = r["checkpoint"]
        if g is None:
            loc = r["path"] + (f":{r['line']}" if r.get("line") else "")
            groups[gk] = {
                "app": r["app"], "key": r["key"], "tool": r["tool"], "rule": r["rule"],
                "severity": r["severity"], "example_location": loc,
                "code_snippet": r.get("snippet", "") or "", "checkpoints": [cp],
                "label": "", "note": "",
            }
        elif cp not in g["checkpoints"]:
            g["checkpoints"].append(cp)
    out = []
    for g in groups.values():
        g["checkpoints"] = ", ".join(g["checkpoints"])
        out.append(g)
    out.sort(key=lambda g: (g["app"], g["key"]))  # by app, then key; never by round
    return out


def build_transitions(rows):
    out = []
    for r in rows:
        if r.get("boot_status") not in (None, "", "ok"):
            continue  # a round that did not boot gets no label
        out.append({
            "app": r["app"],
            "checkpoint": r["checkpoint"],
            "test": r["test"],
            "first_error_line": first_line(r["first_error"]),
            "diff_command": f"git -C apps/{r['app']} diff {r['previous_checkpoint']} {r['checkpoint']}",
            "label": "", "note": "",
        })
    out.sort(key=lambda t: (t["app"], t["test"], t["checkpoint"]))
    return out


def write_sheet(path, kind, rows):
    spec = SHEETS[kind]
    cols = spec["columns"]
    wb = Workbook()
    ws = wb.active
    ws.title = kind
    ws.append(cols)
    for c in range(1, len(cols) + 1):
        cell = ws.cell(row=1, column=c)
        cell.font = Font(bold=True)
        cell.fill = PatternFill("solid", fgColor="DDDDDD")
        ws.column_dimensions[cell.column_letter].width = WIDTHS.get(cols[c - 1], 20)
    for r in rows:
        ws.append([r.get(c, "") for c in cols])
    wrap = Alignment(wrap_text=True, vertical="top")
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = wrap
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    label_col = cols.index("label") + 1
    letter = ws.cell(row=1, column=label_col).column_letter
    last = max(len(rows) + 1, 2)
    dv = DataValidation(type="list", formula1='"' + ",".join(spec["labels"]) + '"',
                        allow_blank=True, showErrorMessage=True,
                        errorTitle="Not an allowed label",
                        error="Choose one of: " + ", ".join(spec["labels"]))
    ws.add_data_validation(dv)
    dv.add(f"{letter}2:{letter}{max(last, 1000)}")  # room for the whole sheet
    wb.save(path)


def read_sheet(path):
    wb = load_workbook(path)
    ws = wb.active
    kind = ws.title
    if kind not in SHEETS:
        sys.exit(f"{path}: sheet name {kind!r} is not one of {list(SHEETS)}")
    header = [c.value for c in ws[1]]
    if header != SHEETS[kind]["columns"]:
        sys.exit(f"{path}: unexpected columns {header}")
    rows = []
    for values in ws.iter_rows(min_row=2, values_only=True):
        if all(v in (None, "") for v in values):
            continue
        rows.append({h: ("" if v is None else v) for h, v in zip(header, values)})
    return kind, rows


def make_second(rows, kind, keys_path=None):
    ids = SHEETS[kind]["id"]
    if keys_path:
        keep = {tuple(r[c] for c in ids) for r in read_csv(keys_path, ids)}
        rows = [r for r in rows if tuple(r[c] for c in ids) in keep]
        found = {tuple(r[c] for c in ids) for r in rows}
        missing = keep - found
        if missing:
            sys.exit(f"sample lists {len(missing)} row(s) not in the sheet, e.g. {sorted(missing)[0]}")
    out = []
    for r in rows:
        r = dict(r)
        r["label"] = ""  # first label hidden
        r["note"] = ""
        out.append(r)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("findings")
    f.add_argument("--findings", required=True)
    f.add_argument("--out", required=True)
    t = sub.add_parser("transitions")
    t.add_argument("--tests", required=True)
    t.add_argument("--out", required=True)
    s = sub.add_parser("second")
    s.add_argument("--sheet", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--keys")
    args = ap.parse_args(argv)

    if args.cmd == "findings":
        rows = build_findings(read_csv(args.findings, FINDING_REQUIRED))
        write_sheet(args.out, "findings", rows)
    elif args.cmd == "transitions":
        rows = build_transitions(read_csv(args.tests, TRANSITION_REQUIRED))
        write_sheet(args.out, "transitions", rows)
    else:
        kind, rows = read_sheet(args.sheet)
        rows = make_second(rows, kind, args.keys)
        write_sheet(args.out, kind, rows)
    print(f"wrote {len(rows)} row(s) to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

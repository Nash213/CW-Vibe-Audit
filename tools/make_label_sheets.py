#!/usr/bin/env python3
"""Labelling-sheet generator (N-4). Protocol: docs/REVIEW_PROTOCOL.md.

Reads the files that `tools/ingest.py` and `tools/transitions.py` write, and builds
spreadsheets for the people who label. Needs python3 and openpyxl
(pip install -r tools/requirements.txt).

    make_label_sheets.py findings    --findings results/findings.csv [--raw results/raw]
                                     --out results/sheets/findings.xlsx
    make_label_sheets.py transitions --triage results/triage.csv
                                     --out results/sheets/transitions.xlsx
    make_label_sheets.py second      --sheet <completed primary sheet>.xlsx
                                     --out <second-rater sheet>.xlsx [--keys sample.csv]

Rows are ordered by app, then key (NOT by round), so nobody anchors on "the fix worked".

findings.csv (Wuth): checkpoint_id, tool, rule, key, path, line, severity
    checkpoint_id looks like  g1/DCBA/r2  (app/chain/round). Only tool = semgrep and
    gitleaks are reviewed; npm-audit and ac (access probe) rows are skipped, as the
    protocol says. One sheet row per unique (app, key); the example location is the
    EARLIEST checkpoint where the key appears.
    Code snippets are read from --raw (results/raw/<app>/<chain>/r<k>/semgrep.json +
    semgrep.code.json, gitleaks.json); without --raw the snippet column stays empty.
    Gitleaks matches are shown with the secret replaced by [REDACTED].
    Cut rule (protocol section 3): if the number of unique Semgrep keys over all apps
    is above --cut-threshold (default 400), only Semgrep keys with severity ERROR or
    WARNING are put on the sheet. All Gitleaks keys are always kept. The decision uses
    only the count; the script prints it.

triage.csv (Wuth): checkpoint_id, app, chain, round, test_id, prev_checkpoint_id,
    prev_adjacent, error_first_line, cause_guess
    One sheet row per pass->fail transition. The diff command uses git tags: round 0
    is `baseline`, other rounds are `<chain>-r<k>`.

`second` copies a primary sheet with label and note cleared (first label hidden) for
the second rater. With --keys, only rows listed in sample.csv are kept (findings: app,key;
transitions: app,checkpoint,test). Drawing the seeded 20% sample is N-8, not here.
"""
import argparse
import csv
import json
import os
import sys
from collections import OrderedDict
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from keys import normalise_code, stable_hash  # noqa: E402  (Wuth's key rules)

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
                      "prev_adjacent", "label", "note"]

FINDING_REQUIRED = ["checkpoint_id", "tool", "rule", "key", "path", "line", "severity"]
TRIAGE_REQUIRED = ["checkpoint_id", "app", "chain", "round", "test_id",
                   "prev_checkpoint_id", "prev_adjacent", "error_first_line"]

REVIEWED_TOOLS = ("semgrep", "gitleaks")  # npm-audit and ac are not reviewed
KEPT_WHEN_CUT = ("ERROR", "WARNING")
SNIPPET_MAX = 800

SHEETS = {
    "findings": {"columns": FINDING_COLUMNS, "labels": FINDING_LABELS, "id": ["app", "key"]},
    "transitions": {"columns": TRANSITION_COLUMNS, "labels": TRANSITION_LABELS,
                    "id": ["app", "checkpoint", "test"]},
}
WIDTHS = {"app": 10, "key": 40, "tool": 10, "rule": 38, "severity": 10, "example_location": 34,
          "code_snippet": 60, "checkpoints": 28, "checkpoint": 22, "test": 26,
          "first_error_line": 50, "diff_command": 56, "prev_adjacent": 12,
          "label": 14, "note": 40}


# ---------------------------------------------------------------- input ---

def read_csv(path, required):
    with open(path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        missing = [c for c in required if c not in (reader.fieldnames or [])]
        if missing:
            sys.exit(f"{path}: missing required column(s): {', '.join(missing)}")
        return list(reader)


def split_checkpoint(checkpoint_id):
    """'g1/DCBA/r2' -> ('g1', 'DCBA', 2)."""
    try:
        app, chain, rnd = checkpoint_id.split("/")
        return app, chain, int(rnd.removeprefix("r"))
    except ValueError:
        sys.exit(f"bad checkpoint_id {checkpoint_id!r}: expected app/chain/r<round>")


def tag_for(chain, rnd):
    return "baseline" if rnd == 0 else f"{chain}-r{rnd}"


def first_line(text):
    for line in (text or "").splitlines():
        if line.strip():
            return line.strip()
    return ""


def clip(text):
    text = text.strip("\n")
    return text if len(text) <= SNIPPET_MAX else text[:SNIPPET_MAX] + " ..."


# ------------------------------------------------------------- snippets ---

def _load_json(path):
    try:
        text = Path(path).read_text(encoding="utf-8").strip()
        return json.loads(text) if text else None
    except (OSError, ValueError):
        return None


def snippet_for(raw_dir, checkpoint_id, tool, key):
    """Code behind a finding, from the raw scan files. Empty string if unavailable."""
    if not raw_dir:
        return ""
    app, chain, rnd = split_checkpoint(checkpoint_id)
    folder = Path(raw_dir) / app / chain / f"r{rnd}"
    if tool == "semgrep":
        report = _load_json(folder / "semgrep.json") or {}
        code = _load_json(folder / "semgrep.code.json") or []
        results = report.get("results") or []
        if len(code) != len(results):
            return ""
        for r, matched in zip(results, code):
            if f"semgrep:{r['check_id']}:{stable_hash(normalise_code(matched))}" == key:
                return clip(matched)
    elif tool == "gitleaks":
        for r in _load_json(folder / "gitleaks.json") or []:
            if f"gitleaks:{r['RuleID']}:{stable_hash(r['Secret'])}" == key:
                match = r.get("Match", "")
                return clip(match.replace(r["Secret"], "[REDACTED]") if r["Secret"] else match)
    return ""


# ---------------------------------------------------------------- build ---

def build_findings(rows, raw_dir=None, cut_threshold=400, log=print):
    """One row per unique (app, key), from the earliest checkpoint where it appears."""
    reviewed = [r for r in rows if r["tool"] in REVIEWED_TOOLS]
    skipped = len(rows) - len(reviewed)

    groups = OrderedDict()
    for r in reviewed:
        app, chain, rnd = split_checkpoint(r["checkpoint_id"])
        gk = (app, r["key"])
        g = groups.setdefault(gk, {"app": app, "key": r["key"], "tool": r["tool"], "occ": []})
        g["occ"].append((rnd, chain, r))

    sem_keys = {gk for gk, g in groups.items() if g["tool"] == "semgrep"}
    cut = len(sem_keys) > cut_threshold
    log(f"unique Semgrep keys over all apps: {len(sem_keys)} (cut threshold {cut_threshold})")
    if cut:
        log("  above the threshold: only ERROR and WARNING Semgrep keys go on the sheet; "
            "the paper must say INFO was left out")
    else:
        log("  not above the threshold: all Semgrep keys are reviewed")
    log(f"unique Gitleaks keys: {sum(1 for g in groups.values() if g['tool'] == 'gitleaks')} "
        "(always all reviewed)")
    if skipped:
        log(f"skipped {skipped} npm-audit / access-probe row(s): not reviewed by protocol")

    out, missing_snippets = [], 0
    for (app, key), g in groups.items():
        g["occ"].sort(key=lambda o: (o[0], o[1]))  # earliest round first
        rnd0, chain0, first = g["occ"][0]
        if cut and g["tool"] == "semgrep" and first["severity"] not in KEPT_WHEN_CUT:
            continue
        cps, seen = [], set()
        for rnd, chain, _ in g["occ"]:
            cp = f"{chain}/r{rnd}"
            if cp not in seen:
                seen.add(cp)
                cps.append(cp)
        snippet = snippet_for(raw_dir, first["checkpoint_id"], g["tool"], key)
        if raw_dir and not snippet:
            missing_snippets += 1
        out.append({
            "app": app, "key": key, "tool": g["tool"], "rule": first["rule"],
            "severity": first["severity"],
            "example_location": first["path"] + (f":{first['line']}" if first["line"] else ""),
            "code_snippet": snippet, "checkpoints": ", ".join(cps),
            "label": "", "note": "",
        })
    if missing_snippets:
        log(f"warning: no code snippet found for {missing_snippets} key(s) in {raw_dir}")
    out.sort(key=lambda r: (r["app"], r["key"]))  # by app, then key; never by round
    return out


def build_transitions(rows):
    out = []
    for r in rows:
        app, chain, rnd = split_checkpoint(r["checkpoint_id"])
        papp, pchain, prnd = split_checkpoint(r["prev_checkpoint_id"])
        out.append({
            "app": app,
            "checkpoint": r["checkpoint_id"],
            "test": r["test_id"],
            "first_error_line": first_line(r["error_first_line"]),
            "diff_command": f"git -C apps/{app} diff {tag_for(pchain, prnd)} {tag_for(chain, rnd)}",
            "prev_adjacent": r["prev_adjacent"],
            "label": "", "note": "",
            "_order": (rnd, chain),
        })
    out.sort(key=lambda t: (t["app"], t["test"], t["_order"]))
    for t in out:
        del t["_order"]
    return out


# ---------------------------------------------------------------- sheets ---

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

    letter = ws.cell(row=1, column=cols.index("label") + 1).column_letter
    dv = DataValidation(type="list", formula1='"' + ",".join(spec["labels"]) + '"',
                        allow_blank=True, showErrorMessage=True,
                        errorTitle="Not an allowed label",
                        error="Choose one of: " + ", ".join(spec["labels"]))
    ws.add_data_validation(dv)
    dv.add(f"{letter}2:{letter}{max(len(rows) + 1, 1000)}")
    Path(path).parent.mkdir(parents=True, exist_ok=True)
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
    f.add_argument("--raw")
    f.add_argument("--cut-threshold", type=int, default=400)
    f.add_argument("--out", required=True)
    t = sub.add_parser("transitions")
    t.add_argument("--triage", required=True)
    t.add_argument("--out", required=True)
    s = sub.add_parser("second")
    s.add_argument("--sheet", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--keys")
    args = ap.parse_args(argv)

    if args.cmd == "findings":
        rows = build_findings(read_csv(args.findings, FINDING_REQUIRED), args.raw, args.cut_threshold)
        write_sheet(args.out, "findings", rows)
    elif args.cmd == "transitions":
        rows = build_transitions(read_csv(args.triage, TRIAGE_REQUIRED))
        write_sheet(args.out, "transitions", rows)
    else:
        kind, rows = read_sheet(args.sheet)
        rows = make_second(rows, kind, args.keys)
        write_sheet(args.out, kind, rows)
    print(f"wrote {len(rows)} row(s) to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

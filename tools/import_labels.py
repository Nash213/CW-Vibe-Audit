#!/usr/bin/env python3
"""Labels import: completed labelling sheets -> results/labels.csv (protocol: docs/REVIEW_PROTOCOL.md).

    python tools/import_labels.py [--findings results/sheets/findings.xlsx]
                                  [--findings-second <second-rater findings sheet>.xlsx]
                                  [--transitions results/sheets/transitions.xlsx]
                                  [--transitions-second <second-rater transitions sheet>.xlsx]
                                  [--resolutions results/resolutions.csv]
                                  [--out results/labels.csv]

Sheets are the ones tools/make_label_sheets.py writes (primary) and its `second` mode
writes (second rater, 20% sample). Give at least one primary sheet. A kind whose primary
sheet is not given keeps its rows from the existing labels.csv, so findings and
transitions can be imported on different days.

labels.csv: app, kind, key_or_test, checkpoint_id, label1, rater1, label2, rater2, final, note
  kind = finding         key_or_test = the finding key,  checkpoint_id empty
  kind = test_transition key_or_test = the test id,      checkpoint_id = the failing checkpoint

`final` (the only column the analysis reads):
  1. a row in --resolutions for that item wins: an unsure resolved, or a disagreement
     between the two raters settled after discussion (protocol sections 3 and 6);
  2. otherwise, with a second label: final = the label when both raters agree;
  3. otherwise: final = label1.
  `unsure`, a blank label, or an unresolved disagreement leave final empty, so the
  item stays out of the tables. label1 and label2 are always the raters' own first
  labels, kept for agreement.

resolutions.csv: app, kind, key_or_test, checkpoint_id, final, note.

Agreement: for every item with both labels, prints n, raw percent agreement and
Cohen's kappa per kind (kappa next to percent, as the protocol requires).
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_label_sheets import read_sheet  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
LABEL_COLS = ["app", "kind", "key_or_test", "checkpoint_id", "label1", "rater1",
              "label2", "rater2", "final", "note"]
RES_COLS = ["app", "kind", "key_or_test", "checkpoint_id", "final", "note"]

# sheet kind -> labels.csv kind, final labels, all sheet labels, default raters
KINDS = {
    "findings": {"kind": "finding", "final": ("true", "false"),
                 "raters": ("Nazrul", "Faris")},
    "transitions": {"kind": "test_transition", "final": ("real_break", "broken_test"),
                    "raters": ("Jarred", "Wuth")},
}


class LabelError(SystemExit):
    pass


def item_id(sheet_kind: str, r: dict) -> tuple[str, str, str]:
    """(app, key_or_test, checkpoint_id) for a sheet row."""
    if sheet_kind == "findings":
        return (str(r["app"]), str(r["key"]), "")
    return (str(r["app"]), str(r["test"]), str(r["checkpoint"]))


def norm(label) -> str:
    return str(label or "").strip().lower()


def load(path: Path, want: str) -> dict[tuple[str, str, str], dict]:
    kind, rows = read_sheet(path)
    if kind != want:
        raise LabelError(f"{path}: is a {kind!r} sheet, expected {want!r}")
    allowed = set(KINDS[want]["final"]) | {"unsure", ""}
    out = {}
    for r in rows:
        i = item_id(kind, r)
        lab = norm(r.get("label"))
        if lab not in allowed:
            raise LabelError(f"{path}: {i}: label {r.get('label')!r} is not one of "
                               f"{sorted(allowed - {''})}")
        if i in out:
            raise LabelError(f"{path}: {i} appears twice")
        out[i] = {"label": lab, "note": str(r.get("note") or "").strip()}
    return out


def read_resolutions(path: Path | None) -> dict[tuple[str, str, str, str], dict]:
    if not path or not path.exists():
        return {}
    with path.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    out = {}
    for r in rows:
        k = (r["kind"].strip(), r["app"].strip(), r["key_or_test"].strip(),
             r.get("checkpoint_id", "").strip())
        finals = next((v["final"] for v in KINDS.values() if v["kind"] == k[0]), None)
        if finals is None:
            raise LabelError(f"{path}: unknown kind {k[0]!r}")
        if norm(r["final"]) not in finals:
            raise LabelError(f"{path}: {k}: final {r['final']!r} must be one of {finals}")
        out[k] = {"final": norm(r["final"]), "note": (r.get("note") or "").strip()}
    return out


def merge(sheet_kind: str, first: dict, second: dict | None, resolutions: dict,
          raters: tuple[str, str]) -> tuple[list[dict], set]:
    spec = KINDS[sheet_kind]
    second = second or {}
    extra = set(second) - set(first)
    if extra:
        raise LabelError(f"second {sheet_kind} sheet has {len(extra)} item(s) not on the "
                           f"primary sheet, e.g. {sorted(extra)[0]}")
    rows, used = [], set()
    for (app, key, cp) in sorted(first):
        l1 = first[(app, key, cp)]
        l2 = second.get((app, key, cp))
        res_key = (spec["kind"], app, key, cp)
        res = resolutions.get(res_key)
        if res:
            used.add(res_key)
            final = res["final"]
        elif l2 is not None and l2["label"]:
            final = l1["label"] if l1["label"] == l2["label"] else ""
        else:
            final = l1["label"]
        if final not in spec["final"]:
            final = ""
        notes = [l1["note"]]
        if l2 is not None and l2["note"]:
            notes.append(f"2nd: {l2['note']}")
        if res and res["note"]:
            notes.append(f"resolved: {res['note']}")
        has2 = l2 is not None and bool(l2["label"])
        rows.append({
            "app": app, "kind": spec["kind"], "key_or_test": key, "checkpoint_id": cp,
            "label1": l1["label"], "rater1": raters[0] if l1["label"] else "",
            "label2": l2["label"] if has2 else "", "rater2": raters[1] if has2 else "",
            "final": final, "note": "; ".join(n for n in notes if n),
        })
    return rows, used


def agreement(rows: list[dict]) -> tuple[int, float | None, float | None]:
    """n, raw percent agreement, Cohen's kappa over rows with both labels."""
    pairs = [(r["label1"], r["label2"]) for r in rows if r["label1"] and r["label2"]]
    n = len(pairs)
    if not n:
        return 0, None, None
    po = sum(a == b for a, b in pairs) / n
    c1, c2 = Counter(a for a, _ in pairs), Counter(b for _, b in pairs)
    pe = sum(c1[k] * c2[k] for k in set(c1) | set(c2)) / (n * n)
    kappa = None if pe == 1 else (po - pe) / (1 - pe)
    return n, po, kappa


def read_existing(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--findings", type=Path)
    ap.add_argument("--findings-second", type=Path)
    ap.add_argument("--transitions", type=Path)
    ap.add_argument("--transitions-second", type=Path)
    ap.add_argument("--findings-raters", nargs=2, default=KINDS["findings"]["raters"],
                    metavar=("PRIMARY", "SECOND"))
    ap.add_argument("--transitions-raters", nargs=2, default=KINDS["transitions"]["raters"],
                    metavar=("PRIMARY", "SECOND"))
    ap.add_argument("--resolutions", type=Path, default=ROOT / "results" / "resolutions.csv")
    ap.add_argument("--out", type=Path, default=ROOT / "results" / "labels.csv")
    a = ap.parse_args(argv)

    if not a.findings and not a.transitions:
        ap.error("give --findings and/or --transitions (a primary sheet)")
    if a.findings_second and not a.findings:
        ap.error("--findings-second needs --findings")
    if a.transitions_second and not a.transitions:
        ap.error("--transitions-second needs --transitions")

    resolutions = read_resolutions(a.resolutions)
    existing = read_existing(a.out)
    out_rows, used = [], set()
    for sheet_kind, primary, second, raters in (
            ("findings", a.findings, a.findings_second, a.findings_raters),
            ("transitions", a.transitions, a.transitions_second, a.transitions_raters)):
        kind = KINDS[sheet_kind]["kind"]
        if not primary:
            kept = [r for r in existing if r.get("kind") == kind]
            out_rows += kept
            print(f"{kind}: no sheet given, kept {len(kept)} row(s) from {a.out}")
            continue
        first = load(primary, sheet_kind)
        sec = load(second, sheet_kind) if second else None
        rows, u = merge(sheet_kind, first, sec, resolutions, tuple(raters))
        used |= u
        out_rows += rows

        labelled = sum(bool(r["label1"]) for r in rows)
        unsure = sum(r["label1"] == "unsure" for r in rows)
        final = Counter(r["final"] for r in rows if r["final"])
        disagree = sum(bool(r["label1"] and r["label2"]) and r["label1"] != r["label2"]
                       and not r["final"] for r in rows)
        print(f"{kind}: {len(rows)} item(s), {labelled} labelled by {raters[0]}, "
              f"{unsure} unsure, {len(rows) - labelled} blank")
        print(f"  final: {dict(sorted(final.items()))}; "
              f"{len(rows) - sum(final.values())} without a final label"
              + (f" ({disagree} unresolved disagreement(s))" if disagree else ""))
        n, po, kappa = agreement(rows)
        if n:
            print(f"  agreement {raters[0]} vs {raters[1]}: n={n}, "
                  f"percent={po:.1%}, kappa=" + ("n/a" if kappa is None else f"{kappa:.2f}"))

    for kind in sorted({r.get("kind", "") for r in existing}
                       - {v["kind"] for v in KINDS.values()} - {""}):
        out_rows += [r for r in existing if r.get("kind") == kind]

    given = {KINDS[k]["kind"] for k, p in (("findings", a.findings),
                                            ("transitions", a.transitions)) if p}
    stale = [k for k in resolutions if k[0] in given and k not in used]
    if stale:
        raise LabelError(f"{a.resolutions}: {len(stale)} resolution(s) match no sheet item, "
                           f"e.g. {stale[0]}")

    a.out.parent.mkdir(parents=True, exist_ok=True)
    with a.out.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=LABEL_COLS, lineterminator="\n", extrasaction="ignore")
        w.writeheader()
        w.writerows(out_rows)
    print(f"wrote {len(out_rows)} row(s) to {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

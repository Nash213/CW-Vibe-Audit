"""Ingest: results/raw/ -> checkpoints.csv, findings.csv, tests.csv.

Rules (plan Section 7.3, Wuth-2):
  - Reads only the raw folder. Never reads labels (the analysis joins them later).
  - Idempotent: rebuilds every CSV from scratch, sorted deterministically, never appends.
  - D7: a checkpoint that did not boot gets no findings rows and all its tests not_run.
  - Failing access-probe tests (ids like AC2-tasks) become findings with tool=ac and
    key ac:<app>:<id>. A probe that is not_run is reported but is not a finding.

Raw layout per checkpoint, results/raw/<app>/<chain>/r<k>/ :
  written by tools/boot_and_test.sh (Faris):
    stage  boot_status  commit  notes  timings.log  playwright.json
  written by the scan step (Wuth):
    semgrep.json  semgrep.code.json  gitleaks.json  npm-audit/<folder>.json
  written by the agent runner (Jarred), rounds >= 1:
    agent.json
  optional:
    tests_version

Usage:
  python tools/ingest.py [--raw results/raw] [--out results]
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from keys import (  # noqa: E402
    Finding,
    ac_finding,
    gitleaks_findings,
    npm_audit_findings,
    semgrep_findings,
)
from parse_playwright import TestRow, parse_report  # noqa: E402

CHECKPOINT_COLS = [
    "checkpoint_id", "app", "chain", "round", "request", "commit", "model", "steps",
    "tokens_in", "tokens_out", "boot", "tests_version", "tests_total", "tests_pass",
    "tests_fail", "tests_flaky", "assessed_on", "notes",
]
FINDING_COLS = ["checkpoint_id", "tool", "rule", "key", "path", "line", "severity"]
TEST_COLS = ["checkpoint_id", "test_id", "status", "error_first_line"]

BOOT_VALUES = {"ok", "fail", "lint_blocked"}
ROUND_DIR = re.compile(r"^r(\d+)$")


@dataclass
class Checkpoint:
    app: str
    chain: str
    round: int
    folder: Path
    row: dict[str, Any] = field(default_factory=dict)
    findings: list[Finding] = field(default_factory=list)
    tests: list[TestRow] | None = None  # None = no report (crash or did not boot)

    @property
    def id(self) -> str:
        return f"{self.app}/{self.chain}/r{self.round}"


# --- small readers ---------------------------------------------------------


def _text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return ""


def _json(path: Path) -> Any:
    text = _text(path)
    return json.loads(text) if text else None


def _first(d: dict[str, Any], *names: str) -> Any:
    for n in names:
        if d.get(n) not in (None, ""):
            return d[n]
    return ""


def request_for(chain: str, rnd: int) -> str:
    """Request applied at round k of chain DCBA (or DCBA-rep): the k-th letter."""
    order = chain.split("-")[0]
    if rnd == 0:
        return ""
    if rnd > len(order):
        raise ValueError(f"round r{rnd} beyond chain {chain}")
    return order[rnd - 1]


# --- per checkpoint --------------------------------------------------------


def scan_findings(folder: Path) -> tuple[list[Finding], list[str]]:
    """Findings from the three scanners. Missing or broken reports become notes."""
    out: list[Finding] = []
    notes: list[str] = []

    sem = folder / "semgrep.json"
    if sem.exists():
        try:
            code = _json(folder / "semgrep.code.json")
            if code is None:
                notes.append("semgrep: no semgrep.code.json, findings not keyed")
            else:
                out += semgrep_findings(sem, code=code)
        except (ValueError, KeyError) as e:
            notes.append(f"semgrep: {e}")
    else:
        notes.append("semgrep: no report")

    gl = folder / "gitleaks.json"
    if gl.exists():
        try:
            out += gitleaks_findings(gl)
        except (ValueError, KeyError) as e:
            notes.append(f"gitleaks: {e}")
    else:
        notes.append("gitleaks: no report")

    npm_dir = folder / "npm-audit"
    reports = sorted(npm_dir.glob("*.json")) if npm_dir.is_dir() else []
    if not reports:
        notes.append("npm-audit: no report")
    for rep in reports:
        sub = "" if rep.stem == "root" else rep.stem.replace("__", "/") + "/"
        try:
            out += [replace(f, path=f"{sub}node_modules/{f.path}") for f in npm_audit_findings(rep)]
        except (ValueError, KeyError, AttributeError) as e:
            notes.append(f"npm-audit {rep.name}: {e}")

    return out, notes


def read_checkpoint(cp: Checkpoint) -> None:
    f = cp.folder
    notes = [line for line in _text(f / "notes").splitlines() if line.strip()]

    boot = _text(f / "boot_status")
    if boot not in BOOT_VALUES:
        raise ValueError(f"{cp.id}: boot_status is {boot!r}, expected one of {sorted(BOOT_VALUES)}")

    agent = _json(f / "agent.json") or {}
    tokens = agent.get("tokens") if isinstance(agent.get("tokens"), dict) else {}

    timings = _text(f / "timings.log")
    assessed_on = timings[:10] if re.match(r"\d{4}-\d{2}-\d{2}", timings) else ""

    cp.row = {
        "checkpoint_id": cp.id,
        "app": cp.app,
        "chain": cp.chain,
        "round": cp.round,
        "request": _first(agent, "request") or request_for(cp.chain, cp.round),
        "commit": _text(f / "commit"),
        "model": _first(agent, "model", "model_id"),
        "steps": _first(agent, "steps"),
        "tokens_in": _first(agent, "tokens_in") or _first(tokens, "in", "input", "prompt"),
        "tokens_out": _first(agent, "tokens_out") or _first(tokens, "out", "output", "completion"),
        "boot": boot,
        "tests_version": _text(f / "tests_version"),
        "assessed_on": assessed_on,
    }

    if boot != "ok":  # D7: no findings, tests not_run
        cp.row["notes"] = "; ".join(notes)
        return

    found, scan_notes = scan_findings(f)
    notes += scan_notes

    pw = f / "playwright.json"
    if pw.exists() and pw.stat().st_size > 0:
        cp.tests = parse_report(pw)
        found += [ac_finding(cp.app, t.test_id) for t in cp.tests
                  if t.is_access_probe and t.status == "fail"]
    else:
        notes.append("tests: no playwright report")

    cp.findings = found
    cp.row["notes"] = "; ".join(notes)


def discover(raw: Path) -> tuple[list[Checkpoint], list[str]]:
    """Every finished checkpoint folder under raw/, plus warnings for unfinished ones."""
    cps: list[Checkpoint] = []
    skipped: list[str] = []
    for app_dir in sorted(p for p in raw.iterdir() if p.is_dir()):
        for chain_dir in sorted(p for p in app_dir.iterdir() if p.is_dir()):
            for r_dir in sorted(p for p in chain_dir.iterdir() if p.is_dir()):
                m = ROUND_DIR.match(r_dir.name)
                if not m:
                    continue
                cp = Checkpoint(app_dir.name, chain_dir.name, int(m.group(1)), r_dir)
                if _text(r_dir / "stage") != "done":
                    skipped.append(cp.id)
                    continue
                cps.append(cp)
    cps.sort(key=lambda c: (c.app, c.chain, c.round))
    return cps, skipped


# --- whole run ------------------------------------------------------------


def ingest(raw: Path, out: Path) -> dict[str, Any]:
    cps, skipped = discover(raw)
    for cp in cps:
        read_checkpoint(cp)

    # Every test id ever seen for an app; checkpoints without a report get not_run rows.
    catalogue: dict[str, set[str]] = {}
    for cp in cps:
        for t in cp.tests or []:
            catalogue.setdefault(cp.app, set()).add(t.test_id)

    checkpoint_rows, finding_rows, test_rows = [], [], []
    for cp in cps:
        tests = cp.tests
        if tests is None:
            tests = [TestRow(t, "not_run", "") for t in sorted(catalogue.get(cp.app, ()))]
        counts = {s: sum(1 for t in tests if t.status == s) for s in ("pass", "fail", "flaky")}
        cp.row.update(
            tests_total=len(tests),
            tests_pass=counts["pass"],
            tests_fail=counts["fail"],
            tests_flaky=counts["flaky"],
        )
        checkpoint_rows.append(cp.row)
        test_rows += [
            {"checkpoint_id": cp.id, "test_id": t.test_id, "status": t.status,
             "error_first_line": t.error_first_line}
            for t in tests
        ]
        finding_rows += [
            {"checkpoint_id": cp.id, "tool": f.tool, "rule": f.rule, "key": f.key,
             "path": f.path, "line": "" if f.line is None else f.line, "severity": f.severity}
            for f in cp.findings
        ]

    finding_rows.sort(key=lambda r: (r["checkpoint_id"], r["tool"], r["key"], r["path"], str(r["line"])))
    test_rows.sort(key=lambda r: (r["checkpoint_id"], r["test_id"]))

    out.mkdir(parents=True, exist_ok=True)
    _write(out / "checkpoints.csv", CHECKPOINT_COLS, checkpoint_rows)
    _write(out / "findings.csv", FINDING_COLS, finding_rows)
    _write(out / "tests.csv", TEST_COLS, test_rows)

    return {
        "checkpoints": len(checkpoint_rows),
        "findings": len(finding_rows),
        "tests": len(test_rows),
        "skipped_unfinished": skipped,
    }


def _write(path: Path, cols: list[str], rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in cols})


def main(argv: list[str] | None = None) -> int:
    root = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--raw", type=Path, default=root / "results" / "raw")
    ap.add_argument("--out", type=Path, default=root / "results")
    args = ap.parse_args(argv)

    summary = ingest(args.raw, args.out)
    print(f"checkpoints {summary['checkpoints']}, findings {summary['findings']}, "
          f"tests {summary['tests']} -> {args.out}")
    for cid in summary["skipped_unfinished"]:
        print(f"skipped (stage is not done): {cid}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

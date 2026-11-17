"""Finding keys: identify the same finding across rounds of a chain.

Rules (plan Section 2.5):
  - Semgrep:   rule id + hash of the matched code with all whitespace removed.
               The code is read from our own checkout (lines start..end), never
               from Semgrep's own "lines" field, which some versions blank out.
  - Gitleaks:  rule id + hash of the secret. The key never contains the secret.
  - npm audit: package + advisory URL, one key per advisory *object* in `via`
               (plain strings in `via` only point at another package).
  - Tests and access probes: their identifier (test:<app>:<id>, ac:<app>:<id>).

The same key can occur more than once in one checkpoint, so keys are always
counted with a multiset (collections.Counter), never a set.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

HASH_LEN = 16  # hex chars of SHA-256 kept in a key
_WS = re.compile(r"\s+")


@dataclass(frozen=True)
class Finding:
    """One finding instance; mirrors a findings.csv row minus checkpoint_id."""

    tool: str  # semgrep | gitleaks | npm-audit | ac
    rule: str
    key: str
    path: str
    line: int | None
    severity: str


def stable_hash(text: str) -> str:
    """SHA-256 of `text`, truncated. Stable across runs (unlike built-in hash())."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:HASH_LEN]


def normalise_code(code: str) -> str:
    """Remove all whitespace so re-indenting or re-wrapping keeps the key."""
    return _WS.sub("", code)


def _load(report: Any) -> Any:
    """Accept a parsed report, a JSON string, or a path to a JSON file."""
    if isinstance(report, Path):
        text = report.read_text(encoding="utf-8").strip()
        return json.loads(text) if text else None
    if isinstance(report, str):
        text = report.strip()
        return json.loads(text) if text else None
    return report


def _read_lines(checkout: Path, rel_path: str, start: int, end: int) -> str:
    file = checkout / rel_path
    lines = file.read_text(encoding="utf-8", errors="replace").splitlines()
    return "\n".join(lines[start - 1 : end])


# --- Semgrep ---------------------------------------------------------------


def semgrep_findings(report: Any, checkout: Path | str) -> list[Finding]:
    """Findings from Semgrep JSON output, keyed on rule id + normalised code."""
    data = _load(report) or {}
    checkout = Path(checkout)
    out: list[Finding] = []
    for r in data.get("results") or []:
        rule = r["check_id"]
        path = r["path"]
        start = int(r["start"]["line"])
        end = int(r["end"]["line"])
        code = normalise_code(_read_lines(checkout, path, start, end))
        out.append(
            Finding(
                tool="semgrep",
                rule=rule,
                key=f"semgrep:{rule}:{stable_hash(code)}",
                path=path,
                line=start,
                severity=str((r.get("extra") or {}).get("severity", "")),
            )
        )
    return out


# --- Gitleaks --------------------------------------------------------------


def gitleaks_findings(report: Any) -> list[Finding]:
    """Findings from Gitleaks JSON output. A null/empty report means none."""
    data = _load(report)
    if not data:
        return []
    out: list[Finding] = []
    for r in data:
        rule = r["RuleID"]
        out.append(
            Finding(
                tool="gitleaks",
                rule=rule,
                key=f"gitleaks:{rule}:{stable_hash(r['Secret'])}",
                path=r.get("File", ""),
                line=r.get("StartLine"),
                severity="",
            )
        )
    return out


# --- npm audit -------------------------------------------------------------


def npm_audit_findings(report: Any) -> list[Finding]:
    """Findings from `npm audit --json` (npm 7+). Only advisory objects count."""
    data = _load(report) or {}
    out: list[Finding] = []
    for package, vuln in sorted((data.get("vulnerabilities") or {}).items()):
        for via in vuln.get("via") or []:
            if not isinstance(via, dict):
                continue  # a string just points at another vulnerable package
            url = via.get("url") or str(via.get("source", ""))
            out.append(
                Finding(
                    tool="npm-audit",
                    rule=url,
                    key=f"npm-audit:{package}:{url}",
                    path=package,
                    line=None,
                    severity=str(via.get("severity") or vuln.get("severity", "")),
                )
            )
    return out


# --- Tests and access probes ----------------------------------------------


def test_key(app: str, test_id: str) -> str:
    return f"test:{app}:{test_id}"


def ac_key(app: str, test_id: str) -> str:
    return f"ac:{app}:{test_id}"


test_key.__test__ = False  # stop pytest collecting this helper as a test


def ac_finding(app: str, test_id: str) -> Finding:
    """A failing access-probe test becomes a finding with tool=ac."""
    return Finding(
        tool="ac", rule=test_id, key=ac_key(app, test_id), path="", line=None, severity=""
    )


# --- Counting --------------------------------------------------------------


def count_keys(findings: Iterable[Finding]) -> Counter[str]:
    """Multiset of keys. Never use a set: duplicates are real instances."""
    return Counter(f.key for f in findings)

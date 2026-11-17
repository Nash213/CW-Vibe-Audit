"""Parse a Playwright JSON report into test rows (plan Section 7.3, Wuth-3).

  - status: expected -> pass, unexpected -> fail, flaky -> flaky, skipped -> not_run.
    Any other value stops the program; it never passes silently.
  - test id: the first word of the test title (T04, TA, AC2-tasks).
  - error_first_line: first line of the last attempt's error.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

STATUS_MAP = {
    "expected": "pass",
    "unexpected": "fail",
    "flaky": "flaky",
    "skipped": "not_run",
}


class UnknownStatus(ValueError):
    pass


@dataclass(frozen=True)
class TestRow:
    test_id: str
    status: str  # pass | fail | flaky | not_run
    error_first_line: str

    @property
    def is_access_probe(self) -> bool:
        return self.test_id.upper().startswith("AC")


TestRow.__test__ = False  # not a pytest class


def _specs(suite: dict[str, Any]) -> Iterator[dict[str, Any]]:
    yield from suite.get("specs") or []
    for child in suite.get("suites") or []:
        yield from _specs(child)


def _first_error_line(results: list[dict[str, Any]]) -> str:
    if not results:
        return ""
    last = results[-1]
    errors = list(last.get("errors") or [])
    if last.get("error"):
        errors.insert(0, last["error"])
    for err in errors:
        msg = err.get("message") or err.get("value") or ""
        for line in msg.splitlines():
            # Playwright colours messages with ANSI codes; strip them.
            line = _strip_ansi(line).strip()
            if line:
                return line
    return ""


def _strip_ansi(s: str) -> str:
    import re

    return re.sub(r"\x1b\[[0-9;]*m", "", s)


def parse_report(report: Any) -> list[TestRow]:
    """Rows for every test in the report. `report` is a dict, JSON text or a path."""
    if isinstance(report, Path):
        report = json.loads(report.read_text(encoding="utf-8"))
    elif isinstance(report, str):
        report = json.loads(report)

    rows: dict[str, TestRow] = {}
    for suite in report.get("suites") or []:
        for spec in _specs(suite):
            title = spec["title"].strip()
            test_id = title.split()[0] if title else ""
            if not test_id:
                raise ValueError(f"test with empty title in {spec.get('file')}")
            for t in spec.get("tests") or []:
                raw = t.get("status")
                if raw not in STATUS_MAP:
                    raise UnknownStatus(f"{test_id}: unknown Playwright status {raw!r}")
                row = TestRow(test_id, STATUS_MAP[raw], _first_error_line(t.get("results") or []))
                if test_id in rows:
                    raise ValueError(f"duplicate test id {test_id!r} in one report")
                rows[test_id] = row
    return [rows[k] for k in sorted(rows)]


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: parse_playwright.py <playwright.json>", file=sys.stderr)
        return 2
    for r in parse_report(Path(argv[1])):
        print(f"{r.test_id}\t{r.status}\t{r.error_first_line}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

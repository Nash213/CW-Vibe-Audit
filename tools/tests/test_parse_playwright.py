"""Playwright parser on the sample report (one row of every status)."""

import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from parse_playwright import UnknownStatus, parse_report  # noqa: E402

FIXTURE = HERE / "fixtures" / "playwright-sample.json"


def test_one_row_of_every_status():
    rows = {r.test_id: r for r in parse_report(FIXTURE)}
    assert rows["T01"].status == "pass"
    assert rows["T04"].status == "fail"
    assert rows["TA"].status == "flaky"
    assert rows["AC3-admin"].status == "not_run"
    assert rows["AC2-tasks"].status == "fail"


def test_error_is_first_line_of_last_attempt():
    rows = {r.test_id: r for r in parse_report(FIXTURE)}
    assert rows["T04"].error_first_line == "Error: expect(received).toBe(expected)"
    assert rows["AC2-tasks"].error_first_line == "Expected 403, got 200"
    assert rows["T01"].error_first_line == ""


def test_access_probe_flag():
    rows = {r.test_id: r for r in parse_report(FIXTURE)}
    assert rows["AC2-tasks"].is_access_probe
    assert not rows["TA"].is_access_probe


def test_unknown_status_stops():
    report = {"suites": [{"specs": [{"title": "T01 x", "tests": [{"status": "interrupted"}]}]}]}
    with pytest.raises(UnknownStatus):
        parse_report(report)

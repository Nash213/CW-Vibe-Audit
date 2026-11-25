"""Ingest on a fake raw tree: D7, ac findings, idempotence, unfinished checkpoints."""

import csv
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from ingest import ingest, request_for  # noqa: E402

FIXTURE = HERE / "fixtures" / "playwright-sample.json"


def _cp(raw, cid, boot="ok", stage="done", with_scans=True, with_tests=True, agent=None):
    d = raw / cid
    d.mkdir(parents=True)
    (d / "stage").write_text(stage + "\n", encoding="utf-8")
    (d / "boot_status").write_text(boot + "\n", encoding="utf-8")
    (d / "commit").write_text("abc123\n", encoding="utf-8")
    (d / "notes").write_text("", encoding="utf-8")
    (d / "timings.log").write_text("2026-11-21T22:00:00Z lint (t=0s)\n", encoding="utf-8")
    if agent:
        (d / "agent.json").write_text(json.dumps(agent), encoding="utf-8")
    if with_scans:
        sem = {"results": [{"check_id": "eval", "path": "a.js", "start": {"line": 1},
                            "end": {"line": 1}, "extra": {"severity": "ERROR"}}]}
        (d / "semgrep.json").write_text(json.dumps(sem), encoding="utf-8")
        (d / "semgrep.code.json").write_text(json.dumps(["eval(x);"]), encoding="utf-8")
        (d / "gitleaks.json").write_text("null", encoding="utf-8")
        (d / "npm-audit").mkdir()
        npm = {"vulnerabilities": {"lodash": {"severity": "high", "via": [
            {"url": "https://github.com/advisories/GHSA-1", "severity": "high"}]}}}
        (d / "npm-audit" / "root.json").write_text(json.dumps(npm), encoding="utf-8")
    if with_tests:
        shutil.copy(FIXTURE, d / "playwright.json")
    return d


def _rows(path):
    with open(path, encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def _tree(tmp_path):
    raw = tmp_path / "raw"
    _cp(raw, "g1/DCBA/r0")
    _cp(raw, "g1/DCBA/r1", agent={"model": "m", "steps": 7,
                                  "tokens": {"in": 100, "out": 20}})
    _cp(raw, "g1/DCBA/r2", boot="fail", with_tests=False)  # did not boot
    _cp(raw, "g1/DCBA/r3", stage="aborted")                # unfinished
    return raw


def test_request_for():
    assert request_for("DCBA", 0) == ""
    assert request_for("DCBA", 1) == "D"
    assert request_for("DCBA-rep", 4) == "A"


def test_ingest_tables(tmp_path):
    out = tmp_path / "out"
    summary = ingest(_tree(tmp_path), out)
    assert summary["skipped_unfinished"] == ["g1/DCBA/r3"]

    cps = {r["checkpoint_id"]: r for r in _rows(out / "checkpoints.csv")}
    assert set(cps) == {"g1/DCBA/r0", "g1/DCBA/r1", "g1/DCBA/r2"}
    r1 = cps["g1/DCBA/r1"]
    assert (r1["request"], r1["model"], r1["steps"], r1["tokens_in"], r1["tokens_out"]) == (
        "D", "m", "7", "100", "20")
    assert r1["assessed_on"] == "2026-11-21"
    assert (r1["tests_total"], r1["tests_pass"], r1["tests_fail"], r1["tests_flaky"]) == (
        "5", "1", "2", "1")

    findings = _rows(out / "findings.csv")
    r1_tools = sorted(f["tool"] for f in findings if f["checkpoint_id"] == "g1/DCBA/r1")
    assert r1_tools == ["ac", "npm-audit", "semgrep"]
    ac = [f for f in findings if f["tool"] == "ac"]
    assert {f["key"] for f in ac} == {"ac:g1:AC2-tasks"}  # skipped AC3 is not a finding
    npm = [f for f in findings if f["tool"] == "npm-audit"][0]
    assert npm["path"] == "node_modules/lodash"


def test_d7_did_not_boot(tmp_path):
    out = tmp_path / "out"
    ingest(_tree(tmp_path), out)
    assert not [f for f in _rows(out / "findings.csv") if f["checkpoint_id"] == "g1/DCBA/r2"]
    r2_tests = [t for t in _rows(out / "tests.csv") if t["checkpoint_id"] == "g1/DCBA/r2"]
    assert len(r2_tests) == 5
    assert {t["status"] for t in r2_tests} == {"not_run"}


def test_idempotent(tmp_path):
    raw, out = _tree(tmp_path), tmp_path / "out"
    ingest(raw, out)
    first = {p.name: p.read_bytes() for p in out.glob("*.csv")}
    ingest(raw, out)
    assert first == {p.name: p.read_bytes() for p in out.glob("*.csv")}

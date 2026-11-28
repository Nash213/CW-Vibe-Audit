"""Self-checks for the labels import (tools/import_labels.py)."""

import csv
import sys
from pathlib import Path

import pytest

pytest.importorskip("openpyxl")  # the sheets are .xlsx (tools/requirements.txt)

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))

import import_labels as il  # noqa: E402
from make_label_sheets import write_sheet  # noqa: E402


def finding(app, key, label="", note=""):
    return {"app": app, "key": key, "tool": "semgrep", "rule": "r", "severity": "ERROR",
            "example_location": "a.js:1", "code_snippet": "x", "checkpoints": "ABCD/r0",
            "label": label, "note": note}


def transition(app, cp, test, label="", note=""):
    return {"app": app, "checkpoint": cp, "test": test, "first_error_line": "Error",
            "diff_command": "git diff", "prev_adjacent": "yes", "label": label, "note": note}


def sheet(tmp_path, name, kind, rows):
    p = tmp_path / name
    write_sheet(str(p), kind, rows)
    return p


def run(tmp_path, *args):
    out = tmp_path / "labels.csv"
    il.main([*args, "--out", str(out), "--resolutions", str(tmp_path / "resolutions.csv")])
    with out.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def by_key(rows):
    return {(r["kind"], r["app"], r["key_or_test"], r["checkpoint_id"]): r for r in rows}


def test_primary_only_final_is_label1_and_unsure_or_blank_stay_out(tmp_path):
    f = sheet(tmp_path, "f.xlsx", "findings", [
        finding("g1", "k1", "true"), finding("g1", "k2", "False"),
        finding("g2", "k3", "unsure", "check later"), finding("g2", "k4", "")])
    rows = by_key(run(tmp_path, "--findings", str(f)))
    assert rows[("finding", "g1", "k1", "")]["final"] == "true"
    assert rows[("finding", "g1", "k1", "")]["rater1"] == "Nazrul"
    assert rows[("finding", "g1", "k2", "")]["final"] == "false"
    assert rows[("finding", "g2", "k3", "")]["final"] == ""
    assert rows[("finding", "g2", "k3", "")]["note"] == "check later"
    assert rows[("finding", "g2", "k4", "")]["rater1"] == ""


def test_transition_ids_keep_checkpoint(tmp_path):
    t = sheet(tmp_path, "t.xlsx", "transitions", [
        transition("g1", "g1/ABCD/r1", "T05", "real_break"),
        transition("g1", "g1/CADB/r2", "T05", "broken_test")])
    rows = by_key(run(tmp_path, "--transitions", str(t)))
    assert rows[("test_transition", "g1", "T05", "g1/ABCD/r1")]["final"] == "real_break"
    assert rows[("test_transition", "g1", "T05", "g1/CADB/r2")]["final"] == "broken_test"
    assert rows[("test_transition", "g1", "T05", "g1/ABCD/r1")]["rater1"] == "Jarred"


def test_second_rater_agreement_and_disagreement(tmp_path):
    f = sheet(tmp_path, "f.xlsx", "findings", [
        finding("g1", "k1", "true"), finding("g1", "k2", "true"), finding("g1", "k3", "false")])
    s = sheet(tmp_path, "s.xlsx", "findings", [
        finding("g1", "k1", "true"), finding("g1", "k2", "false", "looks sanitised")])
    rows = by_key(run(tmp_path, "--findings", str(f), "--findings-second", str(s)))
    assert rows[("finding", "g1", "k1", "")]["final"] == "true"
    agreed = rows[("finding", "g1", "k2", "")]
    assert (agreed["label1"], agreed["label2"], agreed["final"]) == ("true", "false", "")
    assert agreed["rater2"] == "Faris" and agreed["note"] == "2nd: looks sanitised"
    assert rows[("finding", "g1", "k3", "")]["label2"] == ""
    assert rows[("finding", "g1", "k3", "")]["final"] == "false"


def test_resolution_settles_disagreement_and_unsure_but_keeps_first_labels(tmp_path):
    f = sheet(tmp_path, "f.xlsx", "findings", [
        finding("g1", "k1", "true"), finding("g1", "k2", "unsure")])
    s = sheet(tmp_path, "s.xlsx", "findings", [finding("g1", "k1", "false")])
    (tmp_path / "resolutions.csv").write_text(
        "app,kind,key_or_test,checkpoint_id,final,note\n"
        "g1,finding,k1,,false,input is a constant\n"
        "g1,finding,k2,,true,reachable from the route\n", encoding="utf-8")
    rows = by_key(run(tmp_path, "--findings", str(f), "--findings-second", str(s)))
    k1 = rows[("finding", "g1", "k1", "")]
    assert (k1["label1"], k1["label2"], k1["final"]) == ("true", "false", "false")
    assert k1["note"] == "resolved: input is a constant"
    assert rows[("finding", "g1", "k2", "")]["final"] == "true"


def test_other_kind_kept_from_existing_labels(tmp_path):
    t = sheet(tmp_path, "t.xlsx", "transitions", [transition("g1", "g1/ABCD/r1", "T05", "real_break")])
    f = sheet(tmp_path, "f.xlsx", "findings", [finding("g1", "k1", "true")])
    run(tmp_path, "--transitions", str(t))
    rows = by_key(run(tmp_path, "--findings", str(f)))
    assert set(rows) == {("test_transition", "g1", "T05", "g1/ABCD/r1"), ("finding", "g1", "k1", "")}


def test_bad_label_wrong_sheet_and_stray_items_are_refused(tmp_path):
    f = sheet(tmp_path, "f.xlsx", "findings", [finding("g1", "k1", "true")])
    t = sheet(tmp_path, "t.xlsx", "transitions", [transition("g1", "g1/ABCD/r1", "T05", "real_break")])
    with pytest.raises(SystemExit):
        run(tmp_path, "--findings", str(t))
    s = sheet(tmp_path, "s.xlsx", "findings", [finding("g1", "other", "true")])
    with pytest.raises(SystemExit):
        run(tmp_path, "--findings", str(f), "--findings-second", str(s))
    (tmp_path / "resolutions.csv").write_text(
        "app,kind,key_or_test,checkpoint_id,final,note\ng1,finding,nope,,true,x\n", encoding="utf-8")
    with pytest.raises(SystemExit):
        run(tmp_path, "--findings", str(f))
    (tmp_path / "resolutions.csv").write_text(
        "app,kind,key_or_test,checkpoint_id,final,note\ng1,finding,k1,,unsure,x\n", encoding="utf-8")
    with pytest.raises(SystemExit):
        run(tmp_path, "--findings", str(f))


def test_agreement_percent_and_kappa():
    rows = [{"label1": a, "label2": b} for a, b in
            [("true", "true")] * 8 + [("false", "false")] * 1 + [("true", "false")] * 1]
    n, po, kappa = il.agreement(rows)
    assert n == 10 and po == pytest.approx(0.9)
    # pe = (9*8 + 1*2) / 100 = 0.74 -> kappa = (0.9 - 0.74) / 0.26
    assert kappa == pytest.approx(0.16 / 0.26)
    assert il.agreement([{"label1": "true", "label2": "true"}])[2] is None

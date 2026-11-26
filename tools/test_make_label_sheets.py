#!/usr/bin/env python3
"""Self-check for make_label_sheets.py: python3 tools/test_make_label_sheets.py"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_label_sheets as m  # noqa: E402
from keys import normalise_code, stable_hash  # noqa: E402
from openpyxl import load_workbook  # noqa: E402

SAMPLES = os.path.join(HERE, "samples", "review")
FINDINGS = os.path.join(SAMPLES, "findings.csv")
TRIAGE = os.path.join(SAMPLES, "triage.csv")


def rows_of(path):
    return [[c.value for c in r] for r in load_workbook(path).active.iter_rows(min_row=2)]


class Sheets(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def out(self, name):
        return os.path.join(self.tmp.name, name)

    def run_findings(self, *extra):
        p = self.out("f.xlsx")
        m.main(["findings", "--findings", FINDINGS, "--out", p, *extra])
        return p

    # ---- findings -----------------------------------------------------

    def test_one_row_per_key_only_semgrep_and_gitleaks_ordered_by_app_then_key(self):
        rows = rows_of(self.run_findings())
        self.assertEqual([[r[0], r[1]] for r in rows], [
            ["g1", "gitleaks:generic-api-key:bbbb2222bbbb2222"],
            ["g1", "semgrep:express.no-csrf:cccc3333cccc3333"],
            ["g2", "semgrep:javascript.sql-injection:aaaa1111aaaa1111"],
        ])  # npm-audit and ac rows are not on the sheet
        self.assertNotIn("npm-audit", [r[2] for r in rows])

    def test_example_location_is_earliest_round_numerically(self):
        rows = {r[1]: r for r in rows_of(self.run_findings())}
        sql = rows["semgrep:javascript.sql-injection:aaaa1111aaaa1111"]
        self.assertEqual(sql[5], "src/db.js:12")        # r2, although r10 comes first in the file
        self.assertEqual(sql[7], "DCBA/r2, DCBA/r10")   # r2 before r10, not alphabetical
        gl = rows["gitleaks:generic-api-key:bbbb2222bbbb2222"]
        self.assertEqual(gl[7], "baseline/r0, DCBA/r1")  # duplicate r1 rows listed once
        self.assertEqual((gl[8], gl[9]), (None, None))   # label and note empty

    def test_label_column_has_dropdown_validation(self):
        ws = load_workbook(self.run_findings()).active
        dvs = ws.data_validations.dataValidation
        self.assertEqual(len(dvs), 1)
        self.assertEqual(dvs[0].formula1, '"true,false,unsure"')
        self.assertTrue(dvs[0].showErrorMessage)
        self.assertIn("I2", str(dvs[0].sqref))

    def test_cut_rule_only_above_threshold_and_never_for_gitleaks(self):
        keep_all = rows_of(self.run_findings("--cut-threshold", "400"))
        self.assertEqual(len(keep_all), 3)
        cut = rows_of(self.run_findings("--cut-threshold", "1"))   # 2 Semgrep keys > 1
        keys = [r[1] for r in cut]
        self.assertNotIn("semgrep:express.no-csrf:cccc3333cccc3333", keys)  # INFO dropped
        self.assertIn("semgrep:javascript.sql-injection:aaaa1111aaaa1111", keys)  # ERROR kept
        self.assertIn("gitleaks:generic-api-key:bbbb2222bbbb2222", keys)    # Gitleaks always kept

    def test_cut_rule_counts_unique_keys_not_rows(self):
        # 2 unique Semgrep keys in 3 rows: a threshold of 2 must NOT cut.
        self.assertEqual(len(rows_of(self.run_findings("--cut-threshold", "2"))), 3)

    def test_snippets_come_from_raw_and_gitleaks_secret_is_redacted(self):
        raw = Path(self.tmp.name) / "raw"
        code = "db.query('SELECT * FROM t WHERE id=' + id)"
        d = raw / "g2" / "DCBA" / "r2"
        d.mkdir(parents=True)
        (d / "semgrep.json").write_text(json.dumps({"results": [
            {"check_id": "javascript.sql-injection", "path": "src/db.js",
             "start": {"line": 12}, "end": {"line": 12}}]}))
        (d / "semgrep.code.json").write_text(json.dumps([code]))
        # Use the real key for this code so the lookup matches by key.
        key = f"semgrep:javascript.sql-injection:{stable_hash(normalise_code(code))}"
        secret = "hunter2-not-real"
        g = raw / "g1" / "baseline" / "r0"
        g.mkdir(parents=True)
        (g / "gitleaks.json").write_text(json.dumps([{
            "RuleID": "generic-api-key", "Secret": secret, "File": "/src/docker-compose.yml",
            "StartLine": 28, "Match": f"JWT_SECRET: {secret}"}]))
        gkey = f"gitleaks:generic-api-key:{stable_hash(secret)}"
        csv_path = self.out("f.csv")
        with open(csv_path, "w") as fh:
            fh.write("checkpoint_id,tool,rule,key,path,line,severity\n")
            fh.write(f"g2/DCBA/r2,semgrep,javascript.sql-injection,{key},src/db.js,12,ERROR\n")
            fh.write(f"g1/baseline/r0,gitleaks,generic-api-key,{gkey},docker-compose.yml,28,\n")
        p = self.out("f2.xlsx")
        m.main(["findings", "--findings", csv_path, "--raw", str(raw), "--out", p])
        by_tool = {r[2]: r for r in rows_of(p)}
        self.assertEqual(by_tool["semgrep"][6], code)
        self.assertEqual(by_tool["gitleaks"][6], "JWT_SECRET: [REDACTED]")
        self.assertNotIn(secret, json.dumps(rows_of(p)))

    def test_missing_raw_leaves_snippet_empty_instead_of_failing(self):
        rows = rows_of(self.run_findings("--raw", self.out("no-such-raw")))
        self.assertTrue(all(r[6] in (None, "") for r in rows))

    # ---- transitions --------------------------------------------------

    def test_transitions_use_real_triage_columns_and_git_tags(self):
        p = self.out("t.xlsx")
        m.main(["transitions", "--triage", TRIAGE, "--out", p])
        rows = rows_of(p)
        self.assertEqual(len(rows), 4)
        self.assertEqual([r[0] for r in rows], ["g1", "g1", "g1", "g2"])  # by app, never round
        by_test = {r[2]: r for r in rows}
        self.assertEqual(by_test["T02 login works"][4], "git -C apps/g1 diff baseline DCBA-r1")
        self.assertEqual(by_test["T05 edit task"][4], "git -C apps/g1 diff DCBA-r2 DCBA-r4")
        self.assertEqual(by_test["T05 edit task"][5], "no")   # previous round not adjacent: visible
        self.assertEqual(by_test["T04 delete task"][1], "g2/DCBA/r2")
        self.assertEqual(load_workbook(p).active.data_validations.dataValidation[0].formula1,
                         '"real_break,broken_test,unsure"')

    # ---- second rating ------------------------------------------------

    def test_second_sheet_hides_first_label_and_note(self):
        primary = self.run_findings()
        wb = load_workbook(primary)
        ws = wb.active
        for r in range(2, ws.max_row + 1):
            ws.cell(row=r, column=9).value = "true"
            ws.cell(row=r, column=10).value = "first rater note"
        wb.save(primary)
        second = self.out("s.xlsx")
        m.main(["second", "--sheet", primary, "--out", second])
        rows = rows_of(second)
        self.assertEqual(len(rows), 3)
        for r in rows:
            self.assertIn(r[8], (None, ""))
            self.assertIn(r[9], (None, ""))
        self.assertEqual(len(load_workbook(second).active.data_validations.dataValidation), 1)

    def test_second_sheet_keeps_only_sampled_keys_and_rejects_unknown_ones(self):
        primary = self.run_findings()
        keys = self.out("keys.csv")
        with open(keys, "w") as fh:
            fh.write("app,key\ng2,semgrep:javascript.sql-injection:aaaa1111aaaa1111\n")
        second = self.out("s.xlsx")
        m.main(["second", "--sheet", primary, "--out", second, "--keys", keys])
        self.assertEqual([[r[0], r[1]] for r in rows_of(second)],
                         [["g2", "semgrep:javascript.sql-injection:aaaa1111aaaa1111"]])
        with open(keys, "w") as fh:
            fh.write("app,key\ng9,nope\n")
        with self.assertRaises(SystemExit):
            m.main(["second", "--sheet", primary, "--out", second, "--keys", keys])

    def test_missing_column_and_bad_checkpoint_are_clear_errors(self):
        bad = self.out("bad.csv")
        with open(bad, "w") as fh:
            fh.write("app,key\ng1,x\n")
        with self.assertRaises(SystemExit) as ctx:
            m.main(["findings", "--findings", bad, "--out", self.out("o.xlsx")])
        self.assertIn("missing required column", str(ctx.exception))
        with open(bad, "w") as fh:
            fh.write("checkpoint_id,tool,rule,key,path,line,severity\nnot-a-checkpoint,semgrep,r,k,p,1,ERROR\n")
        with self.assertRaises(SystemExit) as ctx:
            m.main(["findings", "--findings", bad, "--out", self.out("o.xlsx")])
        self.assertIn("bad checkpoint_id", str(ctx.exception))


if __name__ == "__main__":
    unittest.main(verbosity=2)

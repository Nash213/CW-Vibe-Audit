#!/usr/bin/env python3
"""Self-check for make_label_sheets.py: python3 tools/test_make_label_sheets.py"""
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_label_sheets as m  # noqa: E402
from openpyxl import load_workbook  # noqa: E402

SAMPLES = os.path.join(HERE, "samples", "review")


class Sheets(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def out(self, name):
        return os.path.join(self.tmp.name, name)

    def test_findings_one_row_per_key_ordered_by_app_then_key(self):
        p = self.out("f.xlsx")
        m.main(["findings", "--findings", os.path.join(SAMPLES, "findings.csv"), "--out", p])
        ws = load_workbook(p).active
        rows = [[c.value for c in r] for r in ws.iter_rows(min_row=2)]
        self.assertEqual([[r[0], r[1]] for r in rows],
                         [["g1", "gitleaks:jwt-secret:docker-compose.yml"],
                          ["g1", "semgrep:no-csrf:src/app.js"],
                          ["g2", "semgrep:sql-concat:src/db.js"]])
        gl = rows[0]
        self.assertEqual(gl[7], "DCBA-r0, DCBA-r1")           # checkpoints, no duplicate r1
        self.assertEqual(gl[5], "docker-compose.yml:28")      # location at FIRST checkpoint
        sq = rows[2]
        self.assertEqual(sq[5], "src/db.js:12")               # not the later :14
        self.assertEqual(sq[6], "db.query('SELECT * FROM t WHERE id=' + id)")  # first snippet kept
        self.assertEqual((gl[8], gl[9]), (None, None))        # label and note empty

    def test_label_column_has_dropdown_validation(self):
        p = self.out("f.xlsx")
        m.main(["findings", "--findings", os.path.join(SAMPLES, "findings.csv"), "--out", p])
        ws = load_workbook(p).active
        dvs = ws.data_validations.dataValidation
        self.assertEqual(len(dvs), 1)
        self.assertEqual(dvs[0].formula1, '"true,false,unsure"')
        self.assertTrue(dvs[0].showErrorMessage)
        self.assertIn("I2", str(dvs[0].sqref))                # label is column I on the finding sheet

    def test_transitions_skip_unbooted_and_build_diff_command(self):
        p = self.out("t.xlsx")
        m.main(["transitions", "--tests", os.path.join(SAMPLES, "tests.csv"), "--out", p])
        ws = load_workbook(p).active
        rows = [[c.value for c in r] for r in ws.iter_rows(min_row=2)]
        self.assertEqual(len(rows), 3)                        # the boot_status=fail row is dropped
        self.assertNotIn("T05 edit task", [r[2] for r in rows])
        self.assertEqual([r[0] for r in rows], ["g1", "g1", "g2"])  # by app, never by round
        by_test = {r[2]: r for r in rows}
        self.assertEqual(by_test["T04 delete task"][3], "Error: expected 200")  # first error line only
        self.assertEqual(by_test["T04 delete task"][4], "git -C apps/g2 diff DCBA-r1 DCBA-r2")
        self.assertEqual(load_workbook(p).active.data_validations.dataValidation[0].formula1,
                         '"real_break,broken_test,unsure"')

    def test_second_sheet_hides_first_label_and_note(self):
        primary = self.out("p.xlsx")
        m.main(["findings", "--findings", os.path.join(SAMPLES, "findings.csv"), "--out", primary])
        wb = load_workbook(primary)
        ws = wb.active
        for r in range(2, ws.max_row + 1):
            ws.cell(row=r, column=9).value = "true"
            ws.cell(row=r, column=10).value = "first rater note"
        wb.save(primary)
        second = self.out("s.xlsx")
        m.main(["second", "--sheet", primary, "--out", second])
        rows = [[c.value for c in r] for r in load_workbook(second).active.iter_rows(min_row=2)]
        self.assertEqual(len(rows), 3)
        for r in rows:
            self.assertIn(r[8], (None, ""))
            self.assertIn(r[9], (None, ""))
        self.assertEqual(len(load_workbook(second).active.data_validations.dataValidation), 1)

    def test_second_sheet_keeps_only_sampled_keys_and_rejects_unknown_ones(self):
        primary = self.out("p.xlsx")
        m.main(["findings", "--findings", os.path.join(SAMPLES, "findings.csv"), "--out", primary])
        keys = self.out("keys.csv")
        with open(keys, "w") as fh:
            fh.write("app,key\ng2,semgrep:sql-concat:src/db.js\n")
        second = self.out("s.xlsx")
        m.main(["second", "--sheet", primary, "--out", second, "--keys", keys])
        rows = [[c.value for c in r] for r in load_workbook(second).active.iter_rows(min_row=2)]
        self.assertEqual([[r[0], r[1]] for r in rows], [["g2", "semgrep:sql-concat:src/db.js"]])
        with open(keys, "w") as fh:
            fh.write("app,key\ng9,nope\n")
        with self.assertRaises(SystemExit):
            m.main(["second", "--sheet", primary, "--out", second, "--keys", keys])

    def test_missing_column_is_a_clear_error(self):
        bad = self.out("bad.csv")
        with open(bad, "w") as fh:
            fh.write("app,key\ng1,x\n")
        with self.assertRaises(SystemExit) as ctx:
            m.main(["findings", "--findings", bad, "--out", self.out("o.xlsx")])
        self.assertIn("missing required column", str(ctx.exception))


if __name__ == "__main__":
    unittest.main(verbosity=2)

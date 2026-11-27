"""Self-checks for analysis/figures.py on the synthetic results of test_tables.py.

The figures use tables.load, so these check only what the figures add: the survival
points (F1), the damage stack (F2), and that every file is written.
"""

import sys
from pathlib import Path

import pytest

pytest.importorskip("matplotlib")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import figures  # noqa: E402
import tables  # noqa: E402
from test_tables import results  # noqa: E402,F401  (fixture)


def test_f1_survival_points(results):  # noqa: F811
    chains = tables.load(results).chains
    s = figures.survival_series(chains)
    # DCBA: k=2 did not boot, so no point there; ABCD has no round after D: no line
    assert s == {"g1": {"DCBA": [(0, 1.0), (1, 0.5), (3, 0.0)]}}
    assert figures.survival_n(chains) == {0: 1, 1: 1, 2: 0, 3: 1}


def test_f2_stack_splits_new(results):  # noqa: F811
    chains = tables.load(results).chains
    after = figures.damage_stack(chains, "after D")
    c = after["C"]
    # new 2 = reintroduced 1 + other new 1; regressions 1
    assert (c["reintroduced"], c["other_new"], c["regressions"], c["n"]) == (1.0, 1.0, 1.0, 1)
    assert (after["B"]["n"], after["B"]["dnb"]) == (0, 1)
    assert after["A"]["n"] == 0  # r3 did not boot, so new at r4 is undefined
    first = figures.damage_stack(chains, "first after D")
    assert [first[x]["applied"] for x in "ABC"] == [0, 0, 1]


def test_build_writes_all_figures(results, tmp_path):  # noqa: F811
    out = tmp_path / "fig"
    assert figures.main(["--results", str(results), "--out", str(out)]) == 0
    names = sorted(p.name for p in out.iterdir())
    assert names == ["F1_survival.pdf", "F1_survival.png", "F2_damage.pdf", "F2_damage.png",
                     "F3_grid.pdf", "F3_grid.png"]
    assert all((out / n).stat().st_size > 1000 for n in names)


def test_empty_results_still_draw(tmp_path):
    (tmp_path / "checkpoints.csv").write_text("checkpoint_id,app,chain,round,request,boot\n",
                                              encoding="utf-8")
    assert figures.main(["--results", str(tmp_path), "--out", str(tmp_path / "f")]) == 0

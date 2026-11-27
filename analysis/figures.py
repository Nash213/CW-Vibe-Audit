"""Figures F1 to F3 from the result CSVs (plan Wuth-6), as PDF (for the paper) and PNG.

Uses the same counting as analysis/tables.py (tables.load), so a figure and its table
can never disagree:
  F1  fix survival by rounds after D (0 to 3), one panel per app, one line per chain
      that has a later round; the number of chains measured at each x is printed
      under the axis. No smoothing. A chain where D fixed nothing has no line.
  F2  damage per request type (A, B, C), stacked: reintroduced, other new findings,
      regressions (D8: new includes reintroduced, so the stack splits new rather than
      adding reintroduced on top). Two panels: every round after D, and only the first
      round after D (D9a). Bars are means over the rounds where all three are defined,
      with n above each bar.
  F3  chain x round grid: fill = new findings + regressions at that round, text = the
      two numbers, hatched grey = did not boot, outlined = the D round.

Colours: the dataviz reference palette's first three categorical slots, validated
all-pairs (worst CVD dE 9.2, normal-vision 24.0). Aqua is below 3:1 contrast on white,
so every coloured series is also labelled directly and R1-R3 are the table view.

Usage:
  python analysis/figures.py [--results results] [--out results/figures] [--unlabelled]
Needs matplotlib (analysis/requirements.txt).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap  # noqa: E402
from matplotlib.patches import Rectangle  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))

import tables  # noqa: E402

SERIES = ["#2a78d6", "#eb6834", "#1baf7a"]          # blue, orange, aqua (fixed order)
INK, INK_2, MUTED, GRID = "#0b0b0b", "#52514e", "#8a8984", "#e4e3df"
SURFACE = "#ffffff"
DNB_FILL = "#d9d8d4"
MARKERS = ["o", "s", "^"]                            # second encoding for the three orders
DODGE = 0.07                                        # sideways offset so equal lines stay visible
SEQ = ["#f1f1ef", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]
ORDERS_WITH_LATER = ("BDAC", "CADB", "DCBA")        # orders that have a round after D

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 8, "axes.edgecolor": MUTED,
    "axes.labelcolor": INK_2, "xtick.color": INK_2, "ytick.color": INK_2,
    "axes.spines.top": False, "axes.spines.right": False, "axes.linewidth": 0.6,
    "xtick.major.width": 0.6, "ytick.major.width": 0.6, "legend.frameon": False,
    "pdf.fonttype": 42, "svg.fonttype": "none", "savefig.facecolor": SURFACE,
})


def _save(fig, out: Path, name: str) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    paths = [out / f"{name}.pdf", out / f"{name}.png"]
    fig.savefig(paths[0], bbox_inches="tight", metadata={"CreationDate": None, "ModDate": None})
    fig.savefig(paths[1], bbox_inches="tight", dpi=200)
    plt.close(fig)
    return paths


def _watermark(fig, unlabelled: bool) -> None:
    if unlabelled:
        fig.text(0.5, 0.5, "UNLABELLED - not for reporting", ha="center", va="center",
                 fontsize=18, color="#e34948", alpha=0.35, rotation=20)


# --- F1 ----------------------------------------------------------------------------


def survival_series(chains: list[tables.Chain]) -> dict[str, dict[str, list[tuple[int, float]]]]:
    """app -> order -> [(k, survival)], k = 0 included at 1.0. Only defined points."""
    out: dict[str, dict[str, list[tuple[int, float]]]] = {}
    for ch in chains:
        if ch.d_round is None or not ch.survival or ch.fixed in (None, 0):
            continue
        pts = [(0, 1.0)] + [(k, v) for k, v in sorted(ch.survival.items()) if v is not None]
        out.setdefault(ch.app, {})[ch.chain] = pts
    return out


def survival_n(chains: list[tables.Chain]) -> dict[int, int]:
    """Chains with a defined survival value at each k (k = 0: D fixed something)."""
    n = {k: 0 for k in range(tables.MAX_K + 1)}
    for pts in (p for app in survival_series(chains).values() for p in app.values()):
        for k, _ in pts:
            n[k] += 1
    return n


def figure_f1(chains, out: Path, unlabelled=False) -> list[Path]:
    series = survival_series(chains)
    apps = sorted({ch.app for ch in chains}) or ["(no data)"]
    fig, axes = plt.subplots(1, len(apps), figsize=(1.9 * len(apps) + 0.6, 2.4), sharey=True,
                             squeeze=False)
    for ax, app in zip(axes[0], apps):
        ax.set_title(app, color=INK, fontsize=9, loc="left")
        ax.set_xlim(-0.2, tables.MAX_K + 0.9)
        ax.set_ylim(-0.05, 1.08)
        ax.set_xticks(range(tables.MAX_K + 1))
        ax.yaxis.grid(True, color=GRID, linewidth=0.6)
        ax.set_axisbelow(True)
        ends = []
        for i, order in enumerate(ORDERS_WITH_LATER):
            pts = series.get(app, {}).get(order)
            if not pts:
                continue
            xs, ys = zip(*pts)
            xs = [x + DODGE * (i - 1) for x in xs]
            ax.plot(xs, ys, color=SERIES[i], linewidth=2, marker=MARKERS[i], markersize=5,
                    markeredgecolor=SURFACE, markeredgewidth=1, solid_capstyle="round",
                    zorder=3, label=order)
            ends.append([ys[-1], xs[-1], order])
        # direct labels at the right edge, pushed apart so they never overlap
        ends.sort()
        for j in range(1, len(ends)):
            ends[j][0] = max(ends[j][0], ends[j - 1][0] + 0.11)
        for y, x, order in ends:
            ax.annotate(order, (x, y), xytext=(tables.MAX_K + 0.25, y), textcoords="data",
                        va="center", fontsize=7, color=INK_2,
                        arrowprops=dict(arrowstyle="-", color=GRID, linewidth=0.6, shrinkA=0, shrinkB=3))
    axes[0][0].set_ylabel("Fix survival")
    for ax in axes[0]:
        ax.set_xlim(-0.25, tables.MAX_K + 1.1)
        ax.set_ylim(-0.05, 1.3)
    handles = [plt.Line2D([], [], color=SERIES[i], marker=MARKERS[i], linewidth=2, markersize=5,
                          markeredgecolor=SURFACE, label=o) for i, o in enumerate(ORDERS_WITH_LATER)]
    fig.legend(handles=handles, loc="upper center", ncol=3, fontsize=7,
               bbox_to_anchor=(0.5, 1.0), handlelength=2.5)
    n = survival_n(chains)
    fig.supxlabel("Rounds after D   (chains measured: "
                  + ", ".join(f"{k}: n={n[k]}" for k in sorted(n)) + ")", fontsize=8, color=INK_2)
    _watermark(fig, unlabelled)
    fig.tight_layout(rect=(0, 0, 1, 0.9))
    return _save(fig, out, "F1_survival")


# --- F2 ----------------------------------------------------------------------------


def damage_stack(chains, scope: str) -> dict[str, dict[str, float | int]]:
    """request -> mean reintroduced, other new, regressions over rounds where all
    three are defined, plus n and the number of rounds that did not boot."""
    res = {}
    for x in tables.DAMAGE_REQUESTS:
        vals, dnb, applied = [], 0, 0
        for ch in chains:
            if ch.d_round is None:
                continue
            last = ch.d_round + 1 if scope == "first after D" else ch.last
            for r in range(ch.d_round + 1, last + 1):
                if ch.requests.get(r) != x:
                    continue
                applied += 1
                dnb += not ch.booted.get(r, False)
                new, reg = ch.new(r), ch.regs.get(r)
                reint = ch.newly_reintroduced(r)
                if reint is None and ch.fixed == 0 and new is not None:
                    reint = 0  # D fixed nothing, so nothing can come back
                if None in (new, reg, reint):
                    continue
                vals.append((reint, new - reint, reg))
        k = len(vals)
        mean = [sum(v[i] for v in vals) / k if k else 0.0 for i in range(3)]
        res[x] = {"reintroduced": mean[0], "other_new": mean[1], "regressions": mean[2],
                  "n": k, "applied": applied, "dnb": dnb}
    return res


def figure_f2(chains, out: Path, unlabelled=False) -> list[Path]:
    parts = [("reintroduced", "Reintroduced"), ("other_new", "Other new findings"),
             ("regressions", "Regressions")]
    fig, axes = plt.subplots(1, 2, figsize=(5.6, 2.6), sharey=True)
    top = 0.0
    stacks = {scope: damage_stack(chains, scope) for scope in ("after D", "first after D")}
    for st in stacks.values():
        for v in st.values():
            top = max(top, sum(v[p] for p, _ in parts))
    for ax, (scope, st) in zip(axes, stacks.items()):
        ax.set_title("Every round after D" if scope == "after D" else "First round after D (D9a)",
                     color=INK, fontsize=9, loc="left")
        xs = list(range(len(tables.DAMAGE_REQUESTS)))
        bottom = [0.0] * len(xs)
        for i, (p, label) in enumerate(parts):
            h = [st[x][p] for x in tables.DAMAGE_REQUESTS]
            ax.bar(xs, h, bottom=bottom, width=0.55, color=SERIES[i], edgecolor=SURFACE,
                   linewidth=1.5, label=label, zorder=3)
            bottom = [b + v for b, v in zip(bottom, h)]
        for x, b, req in zip(xs, bottom, tables.DAMAGE_REQUESTS):
            v = st[req]
            note = f"{b:.2f}\nn={v['n']}" + (f", dnb {v['dnb']}" if v["dnb"] else "")
            ax.text(x, b + max(top, 1) * 0.03, note, ha="center", va="bottom", fontsize=6.5,
                    color=INK_2)
        ax.set_xticks(xs, [f"Request {x}" for x in tables.DAMAGE_REQUESTS])
        ax.yaxis.grid(True, color=GRID, linewidth=0.6)
        ax.set_axisbelow(True)
        ax.set_ylim(0, max(top, 1) * 1.35)
    axes[0].set_ylabel("Mean per application")
    handles, labels = axes[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="lower center", ncol=3, fontsize=7, bbox_to_anchor=(0.5, -0.04))
    _watermark(fig, unlabelled)
    fig.tight_layout(rect=(0, 0.06, 1, 1))
    return _save(fig, out, "F2_damage")


# --- F3 ----------------------------------------------------------------------------


def figure_f3(chains, out: Path, unlabelled=False) -> list[Path]:
    rows = sorted(chains, key=lambda c: (c.app, c.chain))
    max_round = max((ch.last for ch in rows), default=4)
    cells = []
    for ch in rows:
        line = []
        for r in range(max_round + 1):
            if r not in ch.requests:
                line.append(None)
            elif not ch.booted.get(r, False):
                line.append("dnb")
            else:
                new, reg = ch.new(r), ch.regs.get(r) if r >= 1 else None
                line.append((new, reg))
        cells.append(line)
    vmax = max([sum(v or 0 for v in c) for line in cells for c in line if isinstance(c, tuple)] + [1])
    cmap = LinearSegmentedColormap.from_list("seq", SEQ)

    fig, ax = plt.subplots(figsize=(1.0 + 0.8 * (max_round + 1), 0.6 + 0.24 * max(len(rows), 1)))
    for i, (ch, line) in enumerate(zip(rows, cells)):
        y = len(rows) - 1 - i
        for r, c in enumerate(line):
            if c is None:
                continue
            if c == "dnb":
                ax.add_patch(Rectangle((r, y), 1, 1, facecolor=DNB_FILL, edgecolor=SURFACE,
                                       linewidth=2, hatch="////"))
                ax.text(r + 0.5, y + 0.5, "dnb", ha="center", va="center", fontsize=6.5, color=INK)
                continue
            total = sum(v or 0 for v in c)
            fill = cmap(total / vmax) if r >= 1 else "#f4f4f2"
            ax.add_patch(Rectangle((r, y), 1, 1, facecolor=fill, edgecolor=SURFACE, linewidth=2))
            dark = r >= 1 and total / vmax > 0.55
            text = "base" if r == 0 else f"{ch.requests[r]}  {tables.cell(c[0])} / {tables.cell(c[1])}"
            ax.text(r + 0.5, y + 0.5, text, ha="center", va="center", fontsize=6.5,
                    color=SURFACE if dark else INK)
        if ch.d_round is not None:
            ax.add_patch(Rectangle((ch.d_round + 0.06, y + 0.06), 0.88, 0.88, fill=False,
                                   edgecolor=INK, linewidth=1.2))
    ax.set_xlim(0, max_round + 1)
    ax.set_ylim(0, max(len(rows), 1))
    ax.set_xticks([r + 0.5 for r in range(max_round + 1)], [f"r{r}" for r in range(max_round + 1)])
    ax.set_yticks([len(rows) - 0.5 - i for i in range(len(rows))],
                  [f"{ch.app} {ch.chain}" for ch in rows])
    ax.tick_params(length=0)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_title("Request, then new findings / regressions per round. Darker = more of both;\n"
                 "outlined = D; dnb = did not boot; n/a = previous round did not boot",
                 fontsize=7.5, color=INK_2, loc="left")
    _watermark(fig, unlabelled)
    fig.tight_layout()
    return _save(fig, out, "F3_grid")


def build(results: Path, out: Path, unlabelled: bool = False) -> list[Path]:
    data = tables.load(results, unlabelled)
    return (figure_f1(data.chains, out, unlabelled) + figure_f2(data.chains, out, unlabelled)
            + figure_f3(data.chains, out, unlabelled))


def main(argv: list[str] | None = None) -> int:
    root = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--results", type=Path, default=root / "results")
    ap.add_argument("--out", type=Path)
    ap.add_argument("--unlabelled", action="store_true",
                    help="count every finding and transition (pipeline check only)")
    a = ap.parse_args(argv)
    out = a.out or (root / "results" / ("dev/figures" if a.unlabelled else "figures"))
    if not (a.results / "checkpoints.csv").exists():
        print(f"no checkpoints.csv in {a.results}: run make ingest first", file=sys.stderr)
        return 1
    paths = build(a.results, out, a.unlabelled)
    print(f"figures: {len(paths)} files -> {out}" + (" (UNLABELLED)" if a.unlabelled else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())

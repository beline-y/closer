"""The trade-off chart in RESULTS.md, as plain SVG (no plotting library).

Colors are the validated default categorical palette (fixed slot order, light and dark
steps); the light aqua and yellow fall under 3:1, so the chart carries direct labels and
RESULTS.md repeats every point in a table.
"""

from __future__ import annotations

import math
from xml.sax.saxutils import escape

SERIES = (  # front key, label, light, dark: fixed slot order, color follows the method
    ("ppo", "RL agent", "#2a78d6", "#3987e5"),
    ("threshold", "Threshold on P(distress)", "#eb6834", "#d95926"),
    ("threshold_ask", "Threshold + questions", "#1baf7a", "#199e70"),
    ("ppo_no_ask", "RL agent without questions", "#eda100", "#c98500"),
)
LABELLED = ("ppo", "threshold")  # direct end labels for the two series the story compares

STYLE = """
svg { --surface:#fcfcfb; --ink:#0b0b0b; --ink2:#52514e; --muted:#898781; --grid:#e1e0d9; --axis:#c3c2b7;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
@media (prefers-color-scheme: dark) {
  svg { --surface:#1a1a19; --ink:#f0efec; --ink2:#c3c2b7; --muted:#898781; --grid:#2c2c2a; --axis:#383835; }
}
.bg { fill: var(--surface); }
.title { fill: var(--ink); font-size: 17px; font-weight: 600; }
.sub, .tick, .axis-title, .note { fill: var(--ink2); font-size: 12px; }
.tick { fill: var(--muted); font-variant-numeric: tabular-nums; }
.legend, .end { fill: var(--ink); font-size: 12px; }
.grid { stroke: var(--grid); stroke-width: 1; }
.axis { stroke: var(--axis); stroke-width: 1; }
.budget { stroke: var(--ink2); stroke-width: 1; }
.line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.dot { stroke: var(--surface); stroke-width: 2; }
.ref { fill: var(--surface); stroke: var(--ink2); stroke-width: 2; }
"""


def _series_style() -> str:
    light = "".join(f".s-{key} {{ stroke: {lt}; }} .f-{key} {{ fill: {lt}; }} " for key, _, lt, _ in SERIES)
    dark = "".join(f".s-{key} {{ stroke: {dk}; }} .f-{key} {{ fill: {dk}; }} " for key, _, _, dk in SERIES)
    return f"{light}\n@media (prefers-color-scheme: dark) {{ {dark} }}"


def tradeoff_svg(fronts: dict[str, list[tuple[float, float, float]]], budget: float, title: str,
                 reference: tuple[str, float, float] | None = None, x_max: float = 1.0) -> str:
    """fronts: key -> [(knob, workload, harm)]; reference: (label, workload, harm) for a single policy."""
    width, left, right, bottom = 760, 72, 178, 62
    shown = {key: sorted((load, harm, knob) for knob, load, harm in rows if load <= x_max)
             for key, rows in fronts.items()}
    # Legend first: a line-key beside each label, text in ink, wrapping onto a new row when needed.
    legend, x, y = [], left, 78
    for key, label, _, _ in SERIES:
        if key not in shown:
            continue
        item = 34 + 6.0 * len(label)
        if x + item > width - 16:
            x, y = left, y + 20
        legend.append(f'<line class="line s-{key}" x1="{x}" y1="{y - 4}" x2="{x + 18}" y2="{y - 4}"/>')
        legend.append(f'<text class="legend" x="{x + 24}" y="{y}">{escape(label)}</text>')
        x += item
    top = y + 36
    height = top + 320 + bottom
    pw, ph = width - left - right, 320
    harms = [h for rows in shown.values() for _, h, _ in rows] + ([reference[2]] if reference else [])
    hidden = sum(1 for rows in fronts.values() for _, load, _ in rows if load > x_max)
    y_max = math.ceil(max(harms) * 10 + 1e-9) / 10

    def sx(x: float) -> float:
        return left + x / x_max * pw

    def sy(y: float) -> float:
        return top + ph - y / y_max * ph

    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="100%" role="img" '
        'aria-labelledby="title desc">',
        '<title id="title">Unsupported distress days against psychologist workload</title>',
        '<desc id="desc">Trade-off curves of four alerting policies on the validation cohort; the same points are '
        'listed in the table below the chart.</desc>',
        f"<style>{STYLE}{_series_style()}</style>",
        f'<rect class="bg" width="{width}" height="{height}" rx="8"/>',
        f'<text class="title" x="{left}" y="32">{escape(title)}</text>',
        f'<text class="sub" x="{left}" y="52">Validation cohort, simulated children. Lower and to the left is better.'
        + (f" Points beyond a workload of {x_max:g} are not shown." if hidden else "") + "</text>",
    ] + legend
    # Grid, axes, ticks.
    for k in range(int(round(y_max * 10)) + 1):
        y = k / 10
        out.append(f'<line class="grid" x1="{left}" y1="{sy(y):.1f}" x2="{left + pw}" y2="{sy(y):.1f}"/>')
        out.append(f'<text class="tick" x="{left - 10}" y="{sy(y) + 4:.1f}" text-anchor="end">{y:.1f}</text>')
    for k in range(int(round(x_max / 0.2)) + 1):
        xv = k * 0.2
        out.append(f'<text class="tick" x="{sx(xv):.1f}" y="{top + ph + 20}" text-anchor="middle">{xv:.1f}</text>')
    out.append(f'<line class="axis" x1="{left}" y1="{top + ph}" x2="{left + pw}" y2="{top + ph}"/>')
    out.append(f'<text class="axis-title" x="{left + pw / 2}" y="{height - 18}" text-anchor="middle">'
               "Psychologist workload (alert units per child-week)</text>")
    out.append(f'<text class="axis-title" transform="translate(20 {top + ph / 2}) rotate(-90)" text-anchor="middle">'
               "Unsupported distress days per child-week</text>")
    # Budget marker.
    if budget <= x_max:
        out.append(f'<line class="budget" x1="{sx(budget):.1f}" y1="{top - 6}" x2="{sx(budget):.1f}" y2="{top + ph}"/>')
        out.append(f'<text class="note" x="{sx(budget) + 6:.1f}" y="{top + 6}">Budget {budget:g}</text>')
    # Series: lines, then dots with a surface ring and a native tooltip.
    for key, label, _, _ in SERIES:
        rows = shown.get(key)
        if not rows:
            continue
        d = " ".join(f"{'M' if i == 0 else 'L'}{sx(load):.1f},{sy(harm):.1f}" for i, (load, harm, _) in enumerate(rows))
        out.append(f'<path class="line s-{key}" d="{d}"/>')
        knob = "lambda" if key.startswith("ppo") else "tau"
        for load, harm, value in rows:
            out.append(f'<circle class="dot f-{key}" cx="{sx(load):.1f}" cy="{sy(harm):.1f}" r="4.5">'
                       f"<title>{escape(label)}, {knob}={value:.2f}: workload {load:.2f}, "
                       f"{harm:.3f} unsupported distress days per child-week</title></circle>")
        if key in LABELLED:
            load, harm, _ = rows[-1]
            out.append(f'<text class="end" x="{sx(load) + 10:.1f}" y="{sy(harm) + 4:.1f}">{escape(label)}</text>')
    if reference and reference[1] <= x_max:
        label, load, harm = reference
        out.append(f'<circle class="ref" cx="{sx(load):.1f}" cy="{sy(harm):.1f}" r="5">'
                   f"<title>{escape(label)}: workload {load:.2f}, {harm:.3f}</title></circle>")
        out.append(f'<text class="end" x="{sx(load) + 10:.1f}" y="{sy(harm) - 8:.1f}">{escape(label)}</text>')
    out.append("</svg>")
    return "\n".join(out)


ACTION_FILLS = {  # wait is the neutral midpoint gray; actions take the first three categorical slots
    "wait": ("#f0efec", "#383835"), "digest": ("#2a78d6", "#3987e5"), "priority": ("#eb6834", "#d95926"),
    "ask": ("#1baf7a", "#199e70"),
}


def policy_map_svg(actions: list[list[str]], lams: list[float], p_values: list[float], deployed: float) -> str:
    """Action per (P(distress), lambda) cell for one typical child-day; rows follow p_values, columns lams."""
    width, left, right, top, bottom = 760, 72, 40, 104, 62
    pw, ph = width - left - right, 300
    height = top + ph + bottom
    cw, chh = pw / len(lams), ph / len(p_values)
    lo, hi = math.log(lams[0]), math.log(lams[-1])

    def sx(lam: float) -> float:
        return left + (math.log(lam) - lo) / (hi - lo) * (pw - cw) + cw / 2

    fills = "".join(f".a-{a} {{ fill: {lt}; }} " for a, (lt, _) in ACTION_FILLS.items())
    dark = "".join(f".a-{a} {{ fill: {dk}; }} " for a, (_, dk) in ACTION_FILLS.items())
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="100%" role="img" '
        'aria-labelledby="mtitle mdesc">',
        '<title id="mtitle">What the RL agent does, by belief and price of an alert</title>',
        '<desc id="mdesc">For one typical child-day, the action chosen for each probability of distress and each '
        'price of an alert; the table below the chart gives the same boundaries.</desc>',
        f"<style>{STYLE}{fills}\n@media (prefers-color-scheme: dark) {{ {dark} }}"
        ".cell { stroke: var(--surface); stroke-width: 1; }</style>",
        f'<rect class="bg" width="{width}" height="{height}" rx="8"/>',
        f'<text class="title" x="{left}" y="32">The price of the psychologist\'s time changes what the agent does</text>',
        f'<text class="sub" x="{left}" y="52">One network, every price. A typical child-day: 12 years old, day 10, '
        "no recent alert, contact or question.</text>",
    ]
    x = left
    for action in ("wait", "ask", "digest", "priority"):
        out.append(f'<rect class="cell a-{action}" x="{x}" y="68" width="14" height="14" rx="3"/>')
        out.append(f'<text class="legend" x="{x + 20}" y="80">{action}</text>')
        x += 34 + 7 * len(action)
    for i, p in enumerate(p_values):
        y = top + ph - (i + 1) * chh
        for j, lam in enumerate(lams):
            action = actions[i][j]
            out.append(f'<rect class="cell a-{action}" x="{left + j * cw:.1f}" y="{y:.1f}" width="{cw:.1f}" '
                       f'height="{chh:.1f}"><title>P(distress) {p:.2f}, lambda {lam:.2f}: {action}</title></rect>')
    for value in (0.0, 0.25, 0.5, 0.75, 1.0):
        y = top + ph - value * ph
        out.append(f'<text class="tick" x="{left - 10}" y="{y + 4:.1f}" text-anchor="end">{value:.2f}</text>')
    for lam in (0.05, 0.1, 0.2, 0.5, 1, 2, 5):
        if lams[0] * 0.999 <= lam <= lams[-1] * 1.001:
            out.append(f'<text class="tick" x="{sx(lam):.1f}" y="{top + ph + 20}" text-anchor="middle">{lam:g}</text>')
    out.append(f'<line class="budget" x1="{sx(deployed):.1f}" y1="{top - 8}" x2="{sx(deployed):.1f}" y2="{top + ph}"/>')
    out.append(f'<text class="note" x="{sx(deployed) + 6:.1f}" y="{top - 12}">Deployed: lambda {deployed:.2f}</text>')
    out.append(f'<text class="axis-title" x="{left + pw / 2}" y="{height - 18}" text-anchor="middle">'
               "Price of one alert, lambda (log scale)</text>")
    out.append(f'<text class="axis-title" transform="translate(20 {top + ph / 2}) rotate(-90)" text-anchor="middle">'
               "P(distress)</text>")
    out.append("</svg>")
    return "\n".join(out)

"""
notes9-stats, the deterministic compute engine (L4).

Runs inside Pyodide, in a Web Worker, with no network access after the runtime
has loaded. A pure function of its payload: the same inputs produce the same
outputs forever, which is what Law 4 of the architecture promises.

Two rules govern every function here:

  Law 2, no number reaches the user that did not come from this file. The model
          may describe and caveat results; it never produces one. That means this
          engine also generates the report sentence, so even the prose in a
          figure legend is built from computed values by template.

  §6.3  - every test carries its assumption checks and its effect size by
          default, not on request. A p-value shipped without the assumption it
          depends on is how a wrong statistic reaches a publication.

DEPENDENCIES. numpy, scipy and statsmodels only, all of which ship prebuilt in
the Pyodide distribution. Kaplan-Meier, the log-rank test, Dunn's test and
Mauchly's sphericity test are implemented here rather than imported from
lifelines / scikit-posthocs / pingouin, because those are pure-Python wheels
fetched at runtime by micropip: a network hiccup would otherwise turn "run my
analysis" into "analysis unavailable". Everything below is textbook and
checkable against R.

The payload arrives already shaped by the TypeScript resolver
(lib/data-analysis/engine/resolver.ts). This file never filters, groups, or
guesses, it receives clean arrays and computes.
"""

from __future__ import annotations

import math
import time

import numpy as np
from scipy import optimize, stats

try:  # statsmodels ships with Pyodide; degrade rather than crash if absent.
    import pandas as pd
    from statsmodels.formula.api import ols, mixedlm
    from statsmodels.stats.anova import AnovaRM, anova_lm
    _HAS_SM = True
except Exception:  # pragma: no cover
    _HAS_SM = False


# ── helpers ───────────────────────────────────────────────────────────────────


def _clean_counted(values) -> tuple[np.ndarray, int]:
    """Numeric values plus the number of submitted entries that were discarded.

    Dropping is correct; dropping silently is not. A reported n that is smaller
    than the n the user submitted, with nothing saying why, reads as a
    transcription error in the methods section. The count travels back so `run`
    can say it out loud, the same way the resolver already warns about the
    missing values it filtered upstream."""
    out, dropped = [], 0
    for v in values or []:
        if v is None or v == "":
            dropped += 1
            continue
        try:
            f = float(v)
        except (TypeError, ValueError):
            dropped += 1
            continue
        if math.isfinite(f):
            out.append(f)
        else:
            dropped += 1
    return np.asarray(out, dtype=float), dropped


def _clean(values) -> np.ndarray:
    return _clean_counted(values)[0]


def _fmt_p(p) -> str:
    """Journal convention: below 0.0001 is reported as a bound, not a number."""
    if p is None or not math.isfinite(p):
        return "p = n/a"
    return "p < 0.0001" if p < 0.0001 else f"p = {p:.4f}"


def _alt(tails: str) -> str:
    return {"two": "two-sided", "greater": "greater", "less": "less"}.get(tails, "two-sided")


def _nan_to_none(x):
    if isinstance(x, (float, np.floating)):
        f = float(x)
        return f if math.isfinite(f) else None
    if isinstance(x, (bool, np.bool_)):
        return bool(x)
    if isinstance(x, (int, np.integer)):
        return int(x)
    return x


def _scrub(obj):
    if isinstance(obj, dict):
        return {k: _scrub(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_scrub(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return [_scrub(v) for v in obj.tolist()]
    return _nan_to_none(obj)


def _result(test, statistic=None, df=None, p=None, effects=None, assumptions=None,
            pairwise=None, sizes=None, sentence="", terms=None) -> dict:
    return {
        "test": test, "statistic": statistic, "df": df, "pValue": p,
        "effectSizes": effects or [], "assumptions": assumptions or [],
        "pairwise": pairwise or [], "terms": terms or [],
        "groupSizes": sizes or {}, "reportSentence": sentence,
    }


def _term(term, statistic=None, df=None, p=None, estimate=None, lo=None, hi=None) -> dict:
    return {"term": term, "statistic": statistic, "df": df, "pValue": p,
            "estimate": estimate, "ciLow": lo, "ciHigh": hi}


def _z(alpha: float) -> float:
    """Normal critical value for the spec's alpha, not a hard-coded 1.96.

    The spec carries one alpha and it governs both halves of the report: an
    analysis declared at alpha = 0.01 must not decide significance at 1% while
    quoting 95% intervals beside it."""
    return float(stats.norm.ppf(1 - float(alpha) / 2))


def _ci_label(alpha: float) -> str:
    return f"{(1 - float(alpha)) * 100:g}% CI"


# ── descriptives ──────────────────────────────────────────────────────────────


def describe_column(column: str, values) -> dict:
    a = _clean(values)
    n = int(a.size)
    if n == 0:
        return {"column": column, "group": None, "n": 0}

    mean = float(np.mean(a))
    sd = float(np.std(a, ddof=1)) if n > 1 else 0.0  # sample SD, never population
    sem = sd / math.sqrt(n) if n > 1 else 0.0
    q1, med, q3 = (float(x) for x in np.percentile(a, [25, 50, 75]))
    if n > 1 and sem > 0:
        t = float(stats.t.ppf(0.975, n - 1))
        lo, hi = mean - t * sem, mean + t * sem
    else:
        lo = hi = mean
    positive = a[a > 0]
    geo = float(stats.gmean(positive)) if positive.size == a.size and a.size else None

    return {
        "column": column, "group": None, "n": n, "mean": mean, "sd": sd, "sem": sem,
        "median": med, "q1": q1, "q3": q3, "iqr": q3 - q1,
        "min": float(np.min(a)), "max": float(np.max(a)),
        "cv": (sd / mean * 100.0) if mean != 0 else None,
        "geometricMean": geo,
        "skewness": float(stats.skew(a, bias=False)) if n > 2 else None,
        "kurtosis": float(stats.kurtosis(a, bias=False)) if n > 3 else None,
        "ci95Low": lo, "ci95High": hi,
    }


# ── assumption checks ─────────────────────────────────────────────────────────


def _normality(groups) -> dict:
    usable = [g for g in groups if g.size]
    pooled = np.concatenate([g - np.mean(g) for g in usable]) if usable else np.array([])
    if pooled.size < 3:
        return {"name": "Normality (Shapiro-Wilk)", "statistic": None, "pValue": None,
                "passed": False, "verdict": "Too few observations to test normality.",
                "alternative": "a nonparametric test"}
    w, p = stats.shapiro(pooled)
    ok = bool(p >= 0.05)
    return {"name": "Normality (Shapiro-Wilk)", "statistic": float(w), "pValue": float(p),
            "passed": ok,
            "verdict": "Residuals are consistent with a normal distribution." if ok
                       else "Residuals deviate from normality.",
            "alternative": None if ok else "a nonparametric test"}


#: Minimum n for the Anderson-Darling p-value approximation. R's nortest::ad.test
#: refuses below 8 and so do we, rather than extrapolate a fit off the end of the
#: range it was built on.
AD_MIN_N = 8


def _ad_pvalue(a2: float, n: int) -> float:
    """p for the Anderson-Darling A^2, D'Agostino & Stephens (1986), table 4.9.

    scipy.stats.anderson returns A^2 and a critical-value table but no p, so the
    p has to come from somewhere. This is the analytic fit to the null
    distribution of the modified statistic A* = A^2 (1 + 0.75/n + 2.25/n^2), the
    same modification scipy applies to its own critical values.

    It is an APPROXIMATION and the report says so. It is also the accurate one:
    100,000-replicate Monte Carlo of the null at n = 8/10/30/100 puts this fit
    within 0.001 of the true tail probability at the 10/5/1% points, whereas
    scipy's tabulated 5% critical value (0.787 before modification) sits at a
    true tail probability near 0.041. Deciding from this p rather than from that
    table also keeps p and verdict from contradicting each other, and keeps the
    Python and TypeScript engines on one shared formula, since the browser has
    no scipy to consult."""
    a = a2 * (1.0 + 0.75 / n + 2.25 / (n * n))
    if a < 0.2:
        p = 1 - math.exp(-13.436 + 101.14 * a - 223.73 * a * a)
    elif a < 0.34:
        p = 1 - math.exp(-8.318 + 42.796 * a - 59.938 * a * a)
    elif a < 0.6:
        p = math.exp(0.9177 - 4.279 * a - 1.38 * a * a)
    elif a < 10:
        p = math.exp(1.2937 - 5.709 * a + 0.0186 * a * a)
    else:
        p = 3.7e-24  # the fit's floor; below this the tail is not resolvable
    return float(min(1.0, max(0.0, p)))


def _anderson_darling(values: np.ndarray) -> dict:
    """Anderson-Darling normality, the third test §6.3 names.

    Weights the squared distance between the empirical and fitted normal CDFs by
    1/(F(1-F)), so it is the sensitive one in the tails - which is where the
    outlier that invalidates a t-test lives. Shapiro-Wilk is stronger against a
    shifted centre; the two are reported side by side because they fail on
    different departures."""
    a = np.asarray(values, dtype=float)
    n = int(a.size)
    if n < AD_MIN_N or float(np.std(a, ddof=1) if n > 1 else 0.0) <= 0:
        return {"name": "Normality (Anderson-Darling)", "statistic": None, "pValue": None,
                "passed": False,
                "verdict": f"Anderson-Darling needs at least {AD_MIN_N} distinct-valued "
                           f"observations; this column has {n}.",
                "alternative": "a nonparametric test"}
    # A^2 = -n - (1/n) sum (2i-1)[ln F(z_i) + ln(1 - F(z_{n+1-i}))], with z
    # standardised by the SAMPLE mean and SD (ddof=1) - the case where both
    # parameters are estimated, which is the only case a real column is in.
    # Written out rather than taken from scipy.stats.anderson because that
    # function's `.statistic` attribute is on a deprecation path (SciPy 1.19
    # drops it), and because the TypeScript engine has to compute the identical
    # quantity from the identical formula. Verified equal to scipy to 1e-15.
    z = np.sort((a - float(np.mean(a))) / float(np.std(a, ddof=1)))
    i = np.arange(1, n + 1, dtype=float)
    a2 = float(-n - np.sum((2 * i - 1) * (stats.norm.logcdf(z) + stats.norm.logsf(z[::-1]))) / n)
    p = _ad_pvalue(a2, n)
    ok = bool(p >= 0.05)  # assumption screen, the same fixed level _normality uses
    return {
        "name": "Normality (Anderson-Darling)", "statistic": a2, "pValue": p, "passed": ok,
        "verdict": ("Consistent with a normal distribution." if ok
                    else "Deviates from normality, most visibly in the tails.")
                   + " p is the D'Agostino & Stephens (1986) analytic approximation to the "
                     "A-squared null distribution, not an exact tail probability.",
        "alternative": None if ok else "a nonparametric test",
    }


def _variance(groups) -> dict:
    usable = [g for g in groups if g.size > 1]
    if len(usable) < 2:
        return {"name": "Equal variance (Levene)", "statistic": None, "pValue": None,
                "passed": False, "verdict": "Not enough groups to test equality of variance.",
                "alternative": None}
    # Median-centred Levene (Brown-Forsythe): robust to the non-normality that
    # often travels with unequal variance.
    w, p = stats.levene(*usable, center="median")
    ok = bool(p >= 0.05)
    return {"name": "Equal variance (Levene)", "statistic": float(w), "pValue": float(p),
            "passed": ok,
            "verdict": "Group variances are comparable." if ok else "Group variances differ appreciably.",
            "alternative": None if ok else "Welch's correction"}


def _sphericity(matrix: np.ndarray) -> dict:
    """Mauchly's test. Below three conditions sphericity is trivially satisfied."""
    n, k = matrix.shape
    if k < 3 or n <= k:
        return {"name": "Sphericity (Mauchly)", "statistic": None, "pValue": None, "passed": True,
                "verdict": "Sphericity is not applicable here.", "alternative": None}
    contrasts = np.zeros((k, k - 1))
    for i in range(k - 1):
        contrasts[: i + 1, i] = 1.0 / (i + 1)
        contrasts[i + 1, i] = -1.0
        contrasts[:, i] /= np.linalg.norm(contrasts[:, i])
    cov = np.cov(matrix, rowvar=False)
    t_cov = contrasts.T @ cov @ contrasts
    det, trace, d = np.linalg.det(t_cov), np.trace(t_cov), k - 1
    if det <= 0 or trace <= 0:
        return {"name": "Sphericity (Mauchly)", "statistic": None, "pValue": None, "passed": True,
                "verdict": "Sphericity could not be assessed.", "alternative": None}
    w = det / ((trace / d) ** d)
    dd = 1 - (2 * d**2 + d + 2) / (6 * d * (n - 1))
    chi = -(n - 1) * dd * math.log(w)
    df = d * (d + 1) / 2 - 1
    p = float(stats.chi2.sf(chi, df)) if df > 0 else 1.0
    ok = bool(p >= 0.05)
    return {"name": "Sphericity (Mauchly)", "statistic": float(w), "pValue": p, "passed": ok,
            "verdict": "Sphericity holds." if ok else "Sphericity is violated.",
            "alternative": None if ok else "Greenhouse-Geisser correction"}


# ── effect sizes ──────────────────────────────────────────────────────────────


def _hedges_g(a: np.ndarray, b: np.ndarray, alpha: float = 0.05) -> dict:
    """Cohen's d with the exact small-sample correction, the default at bench n."""
    n1, n2 = a.size, b.size
    if n1 < 2 or n2 < 2:
        return {"name": "hedges-g", "value": float("nan"), "ciLow": None, "ciHigh": None}
    sp = math.sqrt(((n1 - 1) * np.var(a, ddof=1) + (n2 - 1) * np.var(b, ddof=1)) / (n1 + n2 - 2))
    if sp == 0:
        return {"name": "hedges-g", "value": 0.0, "ciLow": None, "ciHigh": None}
    d = (float(np.mean(a)) - float(np.mean(b))) / sp
    df = n1 + n2 - 2
    j = math.exp(math.lgamma(df / 2) - math.log(math.sqrt(df / 2)) - math.lgamma((df - 1) / 2))
    g = d * j
    se = math.sqrt((n1 + n2) / (n1 * n2) + g**2 / (2 * (n1 + n2)))
    z = _z(alpha)
    return {"name": "hedges-g", "value": g, "ciLow": g - z * se, "ciHigh": g + z * se}


# ── post-hoc ──────────────────────────────────────────────────────────────────


#: Corrections that control the false discovery rate rather than the family-wise
#: error rate. They are step-UP procedures: the largest p-value is adjusted
#: first and monotonicity is enforced downwards, the mirror image of Holm.
FDR_METHODS = ("benjamini-hochberg", "benjamini-yekutieli")


def _adjust(p, method: str):
    m = len(p)
    if m == 0:
        return []
    if method == "bonferroni":
        return [min(1.0, x * m) for x in p]
    if method == "sidak":
        return [1 - (1 - x) ** m for x in p]
    if method in FDR_METHODS:
        # Benjamini-Hochberg (1995): adjusted p_(i) = min over k >= i of
        # (m/k)·p_(k), which is the reverse cumulative minimum walking down from
        # the largest p. Benjamini-Yekutieli (2001) multiplies by the harmonic
        # number c(m) = sum 1/i, the price of dropping BH's positive-dependence
        # assumption; pairwise comparisons that share a pooled error variance
        # are exactly the case where that assumption is not free.
        c = sum(1.0 / i for i in range(1, m + 1)) if method == "benjamini-yekutieli" else 1.0
        order = sorted(range(m), key=lambda i: p[i])
        adjusted, running = [0.0] * m, 1.0
        for rank in range(m - 1, -1, -1):
            idx = order[rank]
            running = min(running, min(1.0, c * m * p[idx] / (rank + 1)))
            adjusted[idx] = running
        return adjusted
    order = sorted(range(m), key=lambda i: p[i])
    adjusted, running = [0.0] * m, 0.0
    for rank, idx in enumerate(order):
        factor = m - rank
        val = min(1.0, p[idx] * factor) if method == "holm" else min(1.0, 1 - (1 - p[idx]) ** factor)
        running = max(running, val)  # step-down monotonicity
        adjusted[idx] = running
    return adjusted


def _single_step_alpha(method: str, alpha: float, m: int):
    """Per-comparison two-sided level whose interval agrees with the adjusted p.

    Bonferroni and Sidak are SINGLE-STEP: every hypothesis is judged against the
    same threshold, so the simultaneous interval is just the per-comparison
    interval at that threshold, and the agreement is exact rather than
    approximate. Bonferroni rejects when min(1, m*p) < alpha, i.e. p < alpha/m,
    which is precisely when the 1 - alpha/m interval excludes zero; Sidak
    rejects when 1 - (1-p)^m < alpha, i.e. p < 1 - (1-alpha)^(1/m).

    Returns None for the STEP-DOWN procedures (Holm, Holm-Sidak) and for
    anything else that falls through `_adjust` to the step-down branch. A
    step-down procedure compares each ordered p against a threshold that depends
    on how many hypotheses survived ahead of it, so there is no single level a
    fixed-width interval could be built at, and no generally accepted
    simultaneous interval exists. See `_interval_note` for what is reported
    instead, and why the conservative single-step interval is not it."""
    if method == "none":
        # No correction, so the plain per-comparison interval IS the right one.
        # `_post_hoc` short-circuits before reaching here and `_dunn` is never
        # called with it, but the helper must not depend on that to be correct.
        return float(alpha)
    if method == "bonferroni":
        return float(alpha) / m
    if method == "sidak":
        return 1.0 - (1.0 - float(alpha)) ** (1.0 / m)
    return None


def _pair_hedges_g(diff: float, ms_within: float, df_within: float) -> dict:
    """Standardised mean difference for one post-hoc row, on the pooled SD.

    §6.3 asks for an effect size beside every comparison, and a difference in
    assay units is not one: a 2 nM shift means nothing without the scatter it
    sits in. The denominator is the ANOVA's own pooled within-group SD, so the
    whole family is standardised on one scale and the rows are comparable with
    each other; Hedges' correction uses df_within, the df that SD was estimated
    with.

    No interval. A simultaneous interval for a standardised effect is not
    defined by any correction offered here, and the multiplicity-adjusted
    interval on the raw difference beside it already carries the uncertainty at
    the family-wise level."""
    if not (ms_within > 0) or df_within < 2:
        return {"name": "hedges-g", "value": None, "ciLow": None, "ciHigh": None}
    j = math.exp(math.lgamma(df_within / 2) - math.log(math.sqrt(df_within / 2))
                 - math.lgamma((df_within - 1) / 2))
    return {"name": "hedges-g", "value": (diff / math.sqrt(ms_within)) * j,
            "ciLow": None, "ciHigh": None}


def _pair_rank_biserial(a: np.ndarray, b: np.ndarray) -> dict:
    """Rank-biserial correlation (Cliff's delta) for one rank-based pair.

    Computed from the pair's own values rather than from Dunn's z, because Dunn
    ranks across every group at once: a z built on the global ranking is not a
    measure of how far apart these two groups are. +1 when every a exceeds every
    b. No CI: Cliff's interval is a per-comparison 1 - alpha one, and issuing it
    beside a family-wise-adjusted p is the contradiction this file removes."""
    if a.size == 0 or b.size == 0:
        return {"name": "rank-biserial", "value": None, "ciLow": None, "ciHigh": None}
    u = float(stats.mannwhitneyu(a, b, alternative="two-sided").statistic)
    return {"name": "rank-biserial", "value": 2.0 * u / (a.size * b.size) - 1.0,
            "ciLow": None, "ciHigh": None}


def _post_hoc(names, arrays, method, alpha, ms_within, df_within, reference=None):
    """Adjusted p AND confidence intervals for every pair (§2)."""
    if method == "none" or len(arrays) < 2 or df_within <= 0:
        return []

    if method == "dunnett" and reference not in names:
        # No control level means no many-to-one distribution to test against.
        # Falling through to the pairwise branch is a defensible substitution;
        # continuing to stamp "dunnett" on the rows is not, because the label is
        # what the methods section will claim was run.
        method = "holm-sidak"

    if method == "dunnett" and reference in names:
        # A real Dunnett: scipy implements the many-to-one distribution exactly.
        ci = names.index(reference)
        others = [i for i in range(len(arrays)) if i != ci]
        # Seeded: scipy integrates the many-to-one distribution by quasi-Monte
        # Carlo, so an unseeded call returns a different p on every run. Law 4
        # promises the same payload yields the same number forever, and a
        # p-value that moves between two runs of the same analysis cannot be
        # reproduced by the reviewer who checks it.
        res = stats.dunnett(*[arrays[i] for i in others], control=arrays[ci], random_state=0)
        # The interval comes from the SAME many-to-one distribution as the
        # p-value. Pairing the exact Dunnett p with a plain two-sided t interval
        # was the worst version of this defect in the file: the p is corrected
        # for k-1 comparisons against a shared control and the interval is not,
        # so the two disagree on every borderline row. scipy computes the
        # matching simultaneous interval and it was sitting unused.
        band = res.confidence_interval(confidence_level=1.0 - float(alpha))
        lo = np.atleast_1d(band.low)
        hi = np.atleast_1d(band.high)
        out = []
        for slot, i in enumerate(others):
            diff = float(np.mean(arrays[i])) - float(np.mean(arrays[ci]))
            padj = float(np.atleast_1d(res.pvalue)[slot])
            out.append({"groupA": names[ci], "groupB": names[i], "meanDifference": diff,
                        "ciLow": float(lo[slot]), "ciHigh": float(hi[slot]),
                        "pValue": padj, "pAdjusted": padj, "correctionMethod": "dunnett",
                        "significant": bool(padj < alpha),
                        "effectSize": _pair_hedges_g(diff, ms_within, df_within)})
        return out

    k = len(arrays)
    m_pairs = k * (k - 1) // 2
    # The margin is a function of the CORRECTION, not of alpha alone. Building
    # every non-Tukey interval at 1 - alpha/2 was the defect: it put a plain
    # per-comparison interval that excludes zero beside an adjusted p that says
    # the comparison is not significant. None means the procedure has no
    # simultaneous interval and none is reported (see `_single_step_alpha`).
    per_alpha = _single_step_alpha(method, alpha, m_pairs)

    out, raw, ses = [], [], []
    for i in range(k):
        for j in range(i + 1, k):
            a, b = arrays[i], arrays[j]
            diff = float(np.mean(a)) - float(np.mean(b))
            se = math.sqrt(ms_within * (1 / a.size + 1 / b.size))
            ses.append(se)
            if method == "tukey":
                q = abs(diff) / (se / math.sqrt(2)) if se > 0 else 0.0
                p = float(stats.studentized_range.sf(q, k, df_within))
                crit = float(stats.studentized_range.ppf(1 - alpha, k, df_within))
                margin = crit * se / math.sqrt(2)
            else:
                t = diff / se if se > 0 else 0.0
                p = float(2 * stats.t.sf(abs(t), df_within))
                margin = (float(stats.t.ppf(1 - per_alpha / 2, df_within)) * se
                          if per_alpha is not None else None)
            raw.append(p)
            out.append({"groupA": names[i], "groupB": names[j], "meanDifference": diff,
                        "ciLow": diff - margin if margin is not None else None,
                        "ciHigh": diff + margin if margin is not None else None,
                        "pValue": p, "pAdjusted": p, "correctionMethod": method,
                        "significant": False,
                        "effectSize": _pair_hedges_g(diff, ms_within, df_within)})

    if method != "tukey":
        for row, padj in zip(out, _adjust(raw, method)):
            row["pAdjusted"] = padj
    for row in out:
        row["significant"] = bool(row["pAdjusted"] < alpha)
    if method in FDR_METHODS:
        _apply_fcr_intervals(out, ses, alpha, lambda q: float(stats.t.ppf(1 - q / 2, df_within)))
    return out


def _apply_fcr_intervals(rows, ses, alpha, crit) -> None:
    """Replace the unadjusted intervals on FDR-corrected rows with FCR-adjusted ones.

    An FDR-adjusted p beside a plain 1-alpha interval is a contradiction the
    reader has to catch: the p says "not a discovery" while the interval, built
    at the uncorrected level, excludes zero. Benjamini & Yekutieli (2005) give
    the matching interval. Select the R rows the FDR procedure rejects, then
    build intervals at level 1 - R*alpha/m for exactly those R parameters; the
    false coverage-statement rate over the selected set is then at most alpha.

    The pairing is exact, not merely thematic. A selected row has raw
    p <= rank*alpha/m <= R*alpha/m, so its 1 - R*alpha/m interval excludes zero
    precisely when the row was selected. Rows that were NOT selected get no
    interval: FCR theory constructs intervals only for the selected set, and
    re-issuing the uncorrected one there is the very defect this avoids.
    """
    m = len(rows)
    r = sum(1 for row in rows if row["significant"])
    if r == 0:
        for row in rows:
            row["ciLow"] = row["ciHigh"] = None
        return
    q = float(alpha) * r / m
    margin_crit = crit(q)
    for row, se in zip(rows, ses):
        if row["significant"]:
            row["ciLow"] = row["meanDifference"] - margin_crit * se
            row["ciHigh"] = row["meanDifference"] + margin_crit * se
        else:
            row["ciLow"] = row["ciHigh"] = None


def _dunn(names, arrays, alpha, method="holm"):
    """Dunn's test with tie correction, the post-hoc for Kruskal-Wallis."""
    allv = np.concatenate(arrays)
    ranks = stats.rankdata(allv)
    n = allv.size
    idx, mean_ranks, sizes = 0, [], []
    for a in arrays:
        mean_ranks.append(float(np.mean(ranks[idx: idx + a.size])))
        sizes.append(a.size)
        idx += a.size
    _, counts = np.unique(allv, return_counts=True)
    ties = float(np.sum(counts.astype(float) ** 3 - counts))
    sigma2 = (n * (n + 1) / 12.0) - (ties / (12.0 * (n - 1))) if n > 1 else 0.0

    k = len(arrays)
    # Dunn's rows carried the same defect as the parametric ones: a margin of
    # z(alpha)*se beside a Holm- or Bonferroni-adjusted p. Rank units do not
    # excuse it - an interval on a rank-mean difference that excludes zero while
    # the adjusted p says the pair is not separated contradicts itself exactly
    # as an interval in assay units would.
    per_alpha = _single_step_alpha(method, alpha, k * (k - 1) // 2)

    out, raw, ses = [], [], []
    for i in range(k):
        for j in range(i + 1, k):
            se = math.sqrt(sigma2 * (1 / sizes[i] + 1 / sizes[j])) if sigma2 > 0 else 0.0
            ses.append(se)
            diff = mean_ranks[i] - mean_ranks[j]
            z = diff / se if se > 0 else 0.0
            p = float(2 * stats.norm.sf(abs(z)))
            raw.append(p)
            margin = _z(per_alpha) * se if per_alpha is not None else None
            out.append({"groupA": names[i], "groupB": names[j], "meanDifference": diff,
                        "ciLow": diff - margin if margin is not None else None,
                        "ciHigh": diff + margin if margin is not None else None,
                        "pValue": p, "pAdjusted": p,
                        "correctionMethod": f"dunn ({method})", "significant": False,
                        "effectSize": _pair_rank_biserial(arrays[i], arrays[j])})
    for row, padj in zip(out, _adjust(raw, method)):
        row["pAdjusted"] = padj
        row["significant"] = bool(padj < alpha)
    if method in FDR_METHODS:
        _apply_fcr_intervals(out, ses, alpha, _z)
    return out


# ══ tests, one per payload shape ══════════════════════════════════════════════


def run_descriptives(p) -> dict:
    cols = p.get("columns") or {}
    n = sum(_clean(v).size for v in cols.values())
    return _result("Descriptive statistics", sizes={k: int(_clean(v).size) for k, v in cols.items()},
                   sentence=f"Descriptive statistics for {len(cols)} column(s), {n} values.")


def run_normality(p) -> dict:
    cols = p.get("columns") or {}
    assumptions = []
    for name, values in cols.items():
        a = _clean(values)
        # Both tests, every column: they disagree on purpose. Shapiro-Wilk is the
        # more powerful against a skewed or shifted centre, Anderson-Darling
        # against heavy tails. Reporting one and not the other means the reader
        # cannot tell which departure was looked for.
        for chk, label in ((_normality([a]), "Shapiro-Wilk"),
                           (_anderson_darling(a), "Anderson-Darling")):
            chk["name"] = f"Normality, {name} ({label})"
            assumptions.append(chk)
    return _result("Normality", assumptions=assumptions,
                   sentence="Normality assessed by Shapiro-Wilk and Anderson-Darling on each "
                            "column; the Anderson-Darling p is an analytic approximation "
                            "(D'Agostino & Stephens 1986).")


def run_one_sample_t(p) -> dict:
    a = _clean(next(iter(p["groups"].values())))
    mu0 = float(p.get("mu0", 0.0))
    res = stats.ttest_1samp(a, popmean=mu0, alternative=_alt(p["tails"]))
    d = (float(np.mean(a)) - mu0) / float(np.std(a, ddof=1)) if a.size > 1 else float("nan")
    return _result("One-sample t-test", float(res.statistic), int(a.size - 1), float(res.pvalue),
                   [{"name": "cohens-d", "value": d, "ciLow": None, "ciHigh": None}],
                   [_normality([a])], sizes={"sample": int(a.size)},
                   sentence=f"One-sample t-test (vs {mu0:g}): t({a.size - 1}) = {float(res.statistic):.3f}, "
                            f"{_fmt_p(float(res.pvalue))} (n = {a.size}).")


def run_two_sample_t(p) -> dict:
    names = list(p["groups"].keys())
    a, b = (_clean(p["groups"][n]) for n in names)
    equal = bool(p.get("equalVariance", False))
    res = stats.ttest_ind(a, b, equal_var=equal, alternative=_alt(p["tails"]))
    df = float(getattr(res, "df", a.size + b.size - 2))
    label = "Unpaired t-test" if equal else "Welch's t-test"
    return _result(label, float(res.statistic), round(df, 3), float(res.pvalue),
                   [_hedges_g(a, b, p["alpha"])], [_normality([a, b]), _variance([a, b])],
                   sizes={names[0]: int(a.size), names[1]: int(b.size)},
                   sentence=f"{label}: t({df:.2f}) = {float(res.statistic):.3f}, "
                            f"{_fmt_p(float(res.pvalue))} (n = {a.size} vs {b.size}).")


def run_paired_t(p) -> dict:
    pairs = np.asarray(p["pairs"], dtype=float)
    a, b = pairs[:, 0], pairs[:, 1]
    res = stats.ttest_rel(a, b, alternative=_alt(p["tails"]))
    diff = a - b
    dz = float(np.mean(diff)) / float(np.std(diff, ddof=1)) if diff.size > 1 else float("nan")
    la, lb = p.get("labels", ["A", "B"])
    return _result("Paired t-test", float(res.statistic), int(a.size - 1), float(res.pvalue),
                   [{"name": "cohens-d", "value": dz, "ciLow": None, "ciHigh": None}],
                   [_normality([diff])], sizes={la: int(a.size), lb: int(b.size)},
                   sentence=f"Paired t-test: t({a.size - 1}) = {float(res.statistic):.3f}, "
                            f"{_fmt_p(float(res.pvalue))} ({a.size} pairs).")


def run_wilcoxon(p) -> dict:
    pairs = np.asarray(p["pairs"], dtype=float)
    res = stats.wilcoxon(pairs[:, 0], pairs[:, 1], alternative=_alt(p["tails"]))
    la, lb = p.get("labels", ["A", "B"])
    n = int(pairs.shape[0])
    # Kerby (2014) matched-pairs rank-biserial correlation, (W+ - W-) divided by
    # the total rank sum. §6.3 wants an effect size beside every p and this test
    # shipped without one; W on its own is unbounded in n and unreadable as a
    # magnitude. Zero differences are dropped first, matching scipy's default
    # zero_method="wilcox", so the effect is computed over the same pairs the
    # p-value was. No CI: no interval for this coefficient is standard, and the
    # bootstrap one that exists is not what a reader would assume it to be.
    d = pairs[:, 0] - pairs[:, 1]
    d = d[d != 0]
    rrb = None
    if d.size:
        ranks = stats.rankdata(np.abs(d))
        w_plus = float(np.sum(ranks[d > 0]))
        w_minus = float(np.sum(ranks[d < 0]))
        rrb = (w_plus - w_minus) / (d.size * (d.size + 1) / 2.0)
    return _result("Wilcoxon signed-rank", float(res.statistic), None, float(res.pvalue),
                   [{"name": "rank-biserial", "value": rrb, "ciLow": None, "ciHigh": None}],
                   sizes={la: n, lb: n},
                   sentence=f"Wilcoxon signed-rank W = {float(res.statistic):.1f}, "
                            f"{_fmt_p(float(res.pvalue))} ({n} pairs)"
                            + (f", rank-biserial r = {rrb:.3f}." if rrb is not None else "."))


def run_mann_whitney(p) -> dict:
    names = list(p["groups"].keys())
    a, b = (_clean(p["groups"][n]) for n in names)
    res = stats.mannwhitneyu(a, b, alternative=_alt(p["tails"]), method="auto")
    u = float(res.statistic)
    rb = 1 - (2 * u) / (a.size * b.size) if a.size and b.size else float("nan")
    return _result("Mann-Whitney U", u, None, float(res.pvalue),
                   [{"name": "rank-biserial", "value": float(rb), "ciLow": None, "ciHigh": None}],
                   sizes={names[0]: int(a.size), names[1]: int(b.size)},
                   sentence=f"Mann-Whitney U = {u:.1f}, {_fmt_p(float(res.pvalue))} "
                            f"(n = {a.size} vs {b.size}).")


def run_anova_one_way(p) -> dict:
    names = list(p["groups"].keys())
    arrays = [_clean(p["groups"][n]) for n in names]
    f, pv = stats.f_oneway(*arrays)
    k, n_total = len(arrays), sum(a.size for a in arrays)
    df_b, df_w = k - 1, n_total - k
    grand = float(np.mean(np.concatenate(arrays)))
    ss_b = sum(a.size * (float(np.mean(a)) - grand) ** 2 for a in arrays)
    ss_w = sum(float(np.sum((a - np.mean(a)) ** 2)) for a in arrays)
    eta = ss_b / (ss_b + ss_w) if (ss_b + ss_w) > 0 else float("nan")
    ms_w = ss_w / df_w if df_w else 0.0
    pw = _post_hoc(names, arrays, p.get("postHoc", "none"), p["alpha"], ms_w, df_w,
                   p.get("referenceLevel"))
    s = (f"One-way ANOVA: F({df_b}, {df_w}) = {float(f):.3f}, {_fmt_p(float(pv))}, "
         f"η² = {eta:.3f} (n = {n_total} across {k} groups).")
    if pw:
        s += f" Post-hoc: {pw[0]['correctionMethod']}."
    out = _result("One-way ANOVA", float(f), f"{df_b}, {df_w}", float(pv),
                  [{"name": "eta-squared", "value": float(eta), "ciLow": None, "ciHigh": None}],
                  [_normality(arrays), _variance(arrays)], pw,
                  {n: int(a.size) for n, a in zip(names, arrays)}, s)
    if pw and p.get("postHoc") != pw[0]["correctionMethod"]:
        out["_warnings"] = [
            f"Dunnett's test needs a control group and the reference level "
            f"{p.get('referenceLevel')!r} is not one of the groups analysed, so "
            f"{pw[0]['correctionMethod']} pairwise comparisons were run instead."]
    note = _interval_note(pw, p["alpha"], pw[0]["correctionMethod"] if pw else None)
    if note:
        out.setdefault("_warnings", []).append(note)
    return out


def _interval_note(rows, alpha, method):
    """Say what the intervals beside an adjusted p actually are.

    Silence is only honest when the interval is the plain 1 - alpha one. Every
    correction here reports something else - a simultaneous interval at a
    different per-comparison level, an FCR-adjusted one over the selected set,
    or no interval at all - and an interval whose level is not the one the
    reader assumes is the same defect as an interval that contradicts its
    p-value, just harder to notice."""
    if not rows:
        return None
    m = len(rows)
    a = float(alpha)

    if method in FDR_METHODS:
        r = sum(1 for row in rows if row["significant"])
        if r == 0:
            return (f"{method} controls the false discovery rate and "
                    f"selected no comparison, so no confidence interval is reported: an "
                    f"unadjusted interval beside an FDR-adjusted p would contradict it.")
        return (f"{method} selected {r} of {m} comparisons. Intervals are "
                f"FCR-adjusted (Benjamini & Yekutieli 2005) at "
                f"{(1 - a * r / m) * 100:g}%, not {(1 - a) * 100:g}%, so they "
                f"agree with the adjusted p-values; the {m - r} unselected comparisons carry no "
                f"interval, because the false coverage-statement rate is only controlled over "
                f"the selected set.")

    if method.startswith("dunn (") or method in ("tukey", "dunnett", "none"):
        # Tukey (studentized range) and Dunnett (many-to-one) both have exact
        # simultaneous intervals at 1 - alpha and both report them; "none" is the
        # plain 1 - alpha interval. Nothing to disclose, and a note would be
        # noise that trains the reader to skip the ones that matter.
        # "dunn (...)" is dispatched on its inner method by the caller.
        return None

    per = _single_step_alpha(method, a, m)
    if per is not None:
        return (f"{method} is a single-step correction, so each interval is built at the "
                f"per-comparison level {(1 - per) * 100:.6g}%, not {(1 - a) * 100:g}%. The "
                f"family-wise coverage over all {m} comparisons is {(1 - a) * 100:g}%, and "
                f"each interval excludes zero exactly when its adjusted p is below "
                f"{a:g}.")

    # Holm and Holm-Sidak, plus anything else `_adjust` routes to the step-down
    # branch. Reporting the conservative single-step interval instead was the
    # tempting option and it is the wrong one: Holm's adjusted p is never larger
    # than Bonferroni's, so a comparison can be Holm-significant while the
    # Bonferroni interval still contains zero. That reintroduces the exact
    # contradiction this work removes, pointing the other way, and it does so
    # while looking like a real number the reader can quote.
    return (f"{method} is a step-down procedure: each ordered p-value is judged against a "
            f"threshold that depends on how many hypotheses remain, so there is no single "
            f"level a simultaneous interval could be built at, and no generally accepted "
            f"one exists. No interval is reported rather than an invented or a mismatched "
            f"one - the single-step interval is wider than the step-down rejection region, "
            f"so it would contain zero for comparisons {method} calls significant. Choose "
            f"bonferroni or sidak (single-step, slightly less powerful) if the differences "
            f"need intervals, or tukey for all-pairs comparisons of means.")


def run_kruskal(p) -> dict:
    names = list(p["groups"].keys())
    arrays = [_clean(p["groups"][n]) for n in names]
    h, pv = stats.kruskal(*arrays)
    k, n_total = len(arrays), sum(a.size for a in arrays)
    # (H - k + 1) / (n - k) is eta-squared-H. Epsilon-squared is H / (n - 1),
    # a different number; naming this one epsilon-squared misreports the effect
    # size a reader will look up to interpret it.
    eta_h = (float(h) - k + 1) / (n_total - k) if n_total > k else float("nan")
    # The chosen correction is the user's decision, not a default to discard:
    # Dunn's rank comparisons take whichever family-wise adjustment was asked
    # for. Tukey and Dunnett are not defined on ranks, so those fall back and
    # `correctionMethod` names the adjustment that actually ran.
    requested = p.get("postHoc", "none")
    chosen = (requested if requested in ("bonferroni", "sidak", "holm-sidak") + FDR_METHODS
              else "holm")
    pw = _dunn(names, arrays, p["alpha"], chosen) if requested != "none" else []
    out = _result("Kruskal-Wallis", float(h), k - 1, float(pv),
                  [{"name": "eta-squared-H", "value": float(eta_h), "ciLow": None, "ciHigh": None}],
                  [], pw, {n: int(a.size) for n, a in zip(names, arrays)},
                  f"Kruskal-Wallis H({k - 1}) = {float(h):.3f}, {_fmt_p(float(pv))} (n = {n_total}).")
    if requested in ("tukey", "dunnett"):
        out["_warnings"] = [
            f"{requested.title()}'s test is defined on group means, not ranks; Dunn's "
            f"test with a Holm adjustment was run after the Kruskal-Wallis instead."]
    # The note names the adjustment that RAN, not the one that was asked for:
    # a request for Tukey lands on Holm here, and a note about Tukey's
    # intervals would describe a procedure that never executed.
    note = _interval_note(pw, p["alpha"], chosen)
    if note:
        out.setdefault("_warnings", []).append(note)
    return out


def run_friedman(p) -> dict:
    m = np.asarray(p["matrix"], dtype=float)
    chi, pv = stats.friedmanchisquare(*[m[:, i] for i in range(m.shape[1])])
    n, k = m.shape
    w = float(chi) / (n * (k - 1)) if n and k > 1 else float("nan")  # Kendall's W
    return _result("Friedman", float(chi), k - 1, float(pv),
                   [{"name": "kendalls-w", "value": w, "ciLow": None, "ciHigh": None}],
                   sizes={c: int(n) for c in p["conditions"]},
                   sentence=f"Friedman χ²({k - 1}) = {float(chi):.3f}, {_fmt_p(float(pv))} "
                            f"({n} subjects × {k} conditions).")


def run_anova_rm(p) -> dict:
    m = np.asarray(p["matrix"], dtype=float)
    n, k = m.shape
    subjects, conditions = p["subjects"], p["conditions"]
    if not _HAS_SM:
        # Friedman is a reasonable stand-in without statsmodels, but the record
        # has to name what ran, not what was asked for.
        out = run_friedman(p)
        out["_test_ran"] = "friedman"
        out["_warnings"] = ["statsmodels is unavailable in this session, so the "
                            "nonparametric Friedman test was run instead of a "
                            "repeated-measures ANOVA."]
        return out

    long = pd.DataFrame({"y": m.flatten(),
                         "subject": np.repeat(subjects, k),
                         "cond": np.tile(conditions, n)})
    tbl = AnovaRM(long, "y", "subject", within=["cond"]).fit().anova_table
    f = float(tbl["F Value"].iloc[0])
    df1 = float(tbl["Num DF"].iloc[0])
    df2 = float(tbl["Den DF"].iloc[0])
    pv = float(tbl["Pr > F"].iloc[0])
    sph = _sphericity(m)

    note = ""
    rdf1, rdf2 = df1, df2  # the df the reported p was actually computed against
    if sph["passed"] is False:
        # Greenhouse-Geisser. Reporting an uncorrected RM p-value against
        # violated sphericity inflates significance.
        cov = np.cov(m, rowvar=False)
        d = k - 1
        num = (k**2) * (np.mean(np.diag(cov)) - np.mean(cov)) ** 2
        den = d * (np.sum(cov**2) - 2 * k * np.sum(np.mean(cov, axis=0) ** 2) + (k**2) * np.mean(cov) ** 2)
        if den > 0:
            gg = float(min(max(num / den, 1.0 / d), 1.0))
            rdf1, rdf2 = df1 * gg, df2 * gg
            pv = float(stats.f.sf(f, rdf1, rdf2))
            note = f" Greenhouse-Geisser corrected (ε = {gg:.3f})."

    # Partial eta-squared for the within-subjects factor, the effect size §6.3
    # asks for and this routine shipped without. F*df1/(F*df1 + df2) is exactly
    # SS_cond/(SS_cond + SS_error) for this design, and it is computed from the
    # UNCORRECTED df on purpose: Greenhouse-Geisser multiplies both df by the
    # same epsilon, which cancels, so the effect size does not move when the
    # p-value is corrected - and it should not, because epsilon rescales the
    # reference distribution, not the variance the factor explains.
    pes = (f * df1) / (f * df1 + df2) if (f * df1 + df2) > 0 else float("nan")
    effects = [{"name": "partial-eta-squared", "term": "within-subjects factor",
                "value": float(pes), "ciLow": None, "ciHigh": None}]

    # The df reported are the df the p-value came from. Quoting the uncorrected
    # integer df beside a Greenhouse-Geisser p is a pairing no reader can
    # reproduce, and the mismatch is invisible unless they try.
    return _result("Repeated-measures ANOVA", f, f"{rdf1:.2f}, {rdf2:.2f}", pv, effects,
                   [sph], [], {c: int(n) for c in conditions},
                   f"RM ANOVA: F({rdf1:.2f}, {rdf2:.2f}) = {f:.3f}, {_fmt_p(pv)}, "
                   f"partial η² = {pes:.3f} ({n} subjects).{note}")


def run_anova_two_way(p) -> dict:
    if not _HAS_SM:
        return _result("Two-way ANOVA", sentence="statsmodels is unavailable in this session.")
    df = pd.DataFrame(p["long"])
    has_f2 = "f2" in df.columns and df["f2"].notna().any()
    formula = "y ~ C(f1)" + (" * C(f2)" if has_f2 and p.get("interaction", True)
                             else (" + C(f2)" if has_f2 else ""))
    model = ols(formula, data=df).fit()
    # Type II sums of squares: the correct default for the unbalanced designs
    # bench data almost always produces.
    tbl = anova_lm(model, typ=2)
    names = [t for t in tbl.index if t != "Residual"]
    resid_ss = float(tbl.loc["Residual", "sum_sq"])
    df_resid = float(tbl.loc["Residual", "df"])

    def pretty(t: str) -> str:
        # "C(f1):C(f2)" is statsmodels' formula syntax, not something to show a
        # bench scientist. The factor names come from the resolver's column map.
        return t.replace("C(", "").replace(")", "").replace(":", " x ")

    # Every term is reported. `statistic`/`pValue` at the top level carry the
    # highest-order term (the interaction when one was fitted), because that is
    # the term the design was built to test, but the table below is the answer.
    effects = [{"name": "partial-eta-squared", "term": pretty(t),
                "value": float(tbl.loc[t, "sum_sq"] / (tbl.loc[t, "sum_sq"] + resid_ss)),
                "ciLow": None, "ciHigh": None} for t in names]
    terms = [_term(pretty(t), float(tbl.loc[t, "F"]),
                   f"{tbl.loc[t, 'df']:.0f}, {df_resid:.0f}",
                   float(tbl.loc[t, "PR(>F)"])) for t in names]
    lead = names[-1]
    pieces = [f"{pretty(t)}: F({tbl.loc[t, 'df']:.0f}, {df_resid:.0f}) = "
              f"{tbl.loc[t, 'F']:.3f}, {_fmt_p(float(tbl.loc[t, 'PR(>F)']))}" for t in names]
    return _result("Two-way ANOVA", float(tbl.loc[lead, "F"]),
                   f"{tbl.loc[lead, 'df']:.0f}, {df_resid:.0f}",
                   float(tbl.loc[lead, "PR(>F)"]), effects, [], [],
                   {str(k): int(v) for k, v in df["f1"].value_counts().items()},
                   "Two-way ANOVA (Type II SS). " + "; ".join(pieces) + ".",
                   terms=terms)


def run_mixed_effects(p) -> dict:
    if not _HAS_SM:
        return _result("Mixed-effects model", sentence="statsmodels is unavailable in this session.")
    df = pd.DataFrame(p["long"])
    if "subject" not in df.columns:
        return _result("Mixed-effects model", sentence="No subject column supplied.")
    model = mixedlm("y ~ C(f1)", df, groups=df["subject"]).fit()
    names = [n for n in model.params.index if n != "Intercept" and "Var" not in str(n)]
    if not names:
        return _result("Mixed-effects model", sentence="Model fitted with no fixed effects to test.")
    alpha = float(p["alpha"])
    conf = model.conf_int(alpha=alpha)

    def pretty(t: str) -> str:
        return str(t).replace("C(f1)[T.", "").replace("]", "").replace("C(f1)", "")

    # Every fixed-effect coefficient is reported. Reducing the model to its
    # smallest p would hand the user the one number the spec author screens
    # requests for, dressed up as the model's result.
    terms = [_term(pretty(n), float(model.tvalues[n]), None, float(model.pvalues[n]),
                   float(model.params[n]), float(conf.loc[n, 0]), float(conf.loc[n, 1]))
             for n in names]
    # Nakagawa & Schielzeth (2013) pseudo-R^2, the effect size for a mixed model
    # and the one this routine shipped without. Marginal R^2 is the share of
    # total variance the FIXED effects explain; conditional R^2 adds the random
    # intercept, so the gap between them is how much of the response is
    # between-subject rather than treatment. Reporting only coefficients leaves
    # the reader unable to tell a large effect from a large subject spread.
    #
    # var_f is computed from the design matrix rather than from
    # `model.fittedvalues`, which statsmodels defines to include the predicted
    # random effects; that would fold the subject variance into the fixed part
    # and inflate marginal R^2 toward conditional R^2.
    var_f = float(np.var(np.asarray(model.model.exog) @ np.asarray(model.fe_params), ddof=0))
    var_r = float(np.asarray(model.cov_re)[0, 0])
    var_e = float(model.scale)
    total = var_f + var_r + var_e
    # No CI: no closed-form interval for either quantity is standard, and the
    # parametric bootstrap that gives one is not affordable in Pyodide.
    effects = ([{"name": "r-squared", "term": "marginal (fixed effects)",
                 "value": var_f / total, "ciLow": None, "ciHigh": None},
                {"name": "r-squared", "term": "conditional (fixed + random)",
                 "value": (var_f + var_r) / total, "ciLow": None, "ciHigh": None}]
               if total > 0 else [])

    lead = names[0]
    ci = _ci_label(alpha)
    pieces = [f"{pretty(n)}: b = {float(model.params[n]):.3f} "
              f"({ci} {float(conf.loc[n, 0]):.3f} to {float(conf.loc[n, 1]):.3f}), "
              f"{_fmt_p(float(model.pvalues[n]))}" for n in names]
    if effects:
        pieces.append(f"marginal R² = {effects[0]['value']:.3f}, "
                      f"conditional R² = {effects[1]['value']:.3f}")
    return _result("Mixed-effects model", float(model.tvalues[lead]), None,
                   float(model.pvalues[lead]), effects, [], [],
                   {str(k): int(v) for k, v in df["f1"].value_counts().items()},
                   f"Linear mixed-effects model with subject as a random intercept "
                   f"({df['subject'].nunique()} subjects, {len(df)} observations). "
                   + "; ".join(pieces) + ".",
                   terms=terms)


def run_contingency(p) -> dict:
    table = np.asarray(p["table"], dtype=float)
    alpha = float(p["alpha"])
    z = _z(alpha)
    ci = _ci_label(alpha)
    is_2x2 = table.shape == (2, 2)
    # Yates' continuity correction applies to 2x2 tables only, and is named in
    # the label when used rather than silently changing the number behind a
    # result the user reads as a plain chi-square.
    chi2, p_chi, dof, expected = stats.chi2_contingency(table, correction=is_2x2)
    # Cochran's rule, not "any cell below 5". On a 2x2 the strict form is right
    # and it is what escalates to Fisher. On anything larger the chi-square
    # approximation survives a fifth of the cells below 5 provided none is below
    # 1, and firing "unreliable" on a single sparse cell of a 5x4 table trains
    # the reader to ignore the warning that does matter.
    n_below5 = int((expected < 5).sum())
    small = (n_below5 > 0 if is_2x2
             else n_below5 > 0.20 * expected.size or bool((expected < 1).any()))

    if is_2x2:
        # Haldane-Anscombe: a zero cell otherwise yields an infinite odds ratio.
        t = table + 0.5 if (table == 0).any() else table
        a, b, c, d = t[0, 0], t[0, 1], t[1, 0], t[1, 1]
        or_ = (a * d) / (b * c)
        se_or = math.sqrt(1 / a + 1 / b + 1 / c + 1 / d)
        rr = (a / (a + b)) / (c / (c + d))
        se_rr = math.sqrt(1 / a - 1 / (a + b) + 1 / c - 1 / (c + d))
        effects = [
            {"name": "odds-ratio", "value": float(or_),
             "ciLow": float(or_ * math.exp(-z * se_or)), "ciHigh": float(or_ * math.exp(z * se_or))},
            {"name": "risk-ratio", "value": float(rr),
             "ciLow": float(rr * math.exp(-z * se_rr)), "ciHigh": float(rr * math.exp(z * se_rr))},
        ]
    else:
        n = float(table.sum())
        v = math.sqrt((chi2 / n) / (min(table.shape) - 1)) if n and min(table.shape) > 1 else float("nan")
        effects = [{"name": "cramers-v", "value": float(v), "ciLow": None, "ciHigh": None}]

    # An explicitly requested test is honoured. The RULE only escalates a
    # chi-square to Fisher when an expected cell falls below 5; it must never
    # quietly hand back a different test than the one the spec names, because
    # the spec is what the methods section will claim was run.
    warnings = []
    asked_fisher = p.get("test") == "fisher-exact"
    escalate = (not asked_fisher) and is_2x2 and small
    if asked_fisher and not is_2x2:
        warnings.append(
            "Fisher's exact test applies to 2x2 tables; this table is "
            f"{table.shape[0]}x{table.shape[1]}, so a chi-square was run instead.")
    if (asked_fisher and is_2x2) or escalate:
        pv = float(stats.fisher_exact(np.rint(table).astype(int))[1])
        # The statistic slot is for the test statistic; Fisher has none, and the
        # odds ratio is already reported above as the effect size it is.
        label, stat, dfv = "Fisher's exact test", None, None
        ran = "fisher-exact"
        note = " Fisher's exact used because an expected cell was below 5." if escalate else ""
    else:
        label = "Chi-square test" + (" (Yates corrected)" if is_2x2 else "")
        ran = "chi-square"
        stat, dfv, pv = float(chi2), int(dof), float(p_chi)
        note = ""
        if small:
            # Fisher on a large R x C table is not tractable in the browser, so
            # the chi-square stands but the user is told its p is approximate.
            warnings.append(
                f"{n_below5} of {expected.size} expected cell counts are below 5"
                + (f" and {int((expected < 1).sum())} below 1" if (expected < 1).any() else "")
                + ", which breaches Cochran's rule, so the chi-square approximation is "
                "unreliable here. Consider pooling sparse categories or collecting more "
                "observations.")

    ors = ""
    if is_2x2:
        e = effects[0]
        ors = f" Odds ratio {e['value']:.3g} ({ci} {e['ciLow']:.3g} to {e['ciHigh']:.3g})."
    out = _result(label, stat, dfv, float(pv), effects, [], [],
                  {f"row {i + 1}": int(r.sum()) for i, r in enumerate(table)},
                  f"{label}: {_fmt_p(float(pv))} (n = {int(table.sum())}).{note}{ors}")
    # The substitution above is reasonable; letting the record keep saying
    # "fisher-exact" afterwards is not.
    out["_test_ran"] = ran
    out["_warnings"] = warnings
    return out


def run_correlation(p) -> dict:
    x, y = np.asarray(p["x"], float), np.asarray(p["y"], float)
    alpha = float(p["alpha"])
    spearman = p["test"] == "correlation-spearman"
    if spearman:
        r, pv = stats.spearmanr(x, y)
        label, coef, sym = "Spearman correlation", "spearman-rho", "rho"
    else:
        r, pv = stats.pearsonr(x, y)
        label, coef, sym = "Pearson correlation", "pearson-r", "r"
    n = int(x.size)
    lo = hi = None
    if n > 3 and abs(float(r)) < 1:
        # Fisher z interval on r. For Spearman the standard error carries the
        # Fieller/Bonett-Wright inflation, since ranks are not the raw variates.
        z = math.atanh(float(r))
        se = math.sqrt(1.06 / (n - 3)) if spearman else 1 / math.sqrt(n - 3)
        zc = _z(alpha)
        lo, hi = math.tanh(z - zc * se), math.tanh(z + zc * se)
    ci = _ci_label(alpha)
    return _result(label, float(r), n - 2, float(pv),
                   [{"name": coef, "value": float(r), "ciLow": lo, "ciHigh": hi}],
                   [], [], {"pairs": n},
                   f"{label}: {sym} = {float(r):.3f}"
                   + (f" ({ci} {lo:.3f} to {hi:.3f})" if lo is not None else "")
                   + f", {_fmt_p(float(pv))} (n = {n}).")


def _regression_assumptions(x: np.ndarray, y: np.ndarray, resid: np.ndarray,
                            fitted: np.ndarray) -> list:
    """The three assumptions a straight-line fit actually rests on.

    A slope, an R-squared and a p-value describe the line that was drawn; none
    of them notices that the relationship curves, that the scatter fans out, or
    that one point is dragging the whole fit. §6.3 asks for the assumption
    checks by default, and this routine had none - the only test in the file
    that reported a p-value with nothing supporting it."""
    n = int(x.size)
    out = []

    # 1. Residual normality. The slope's t-test and its interval both assume it.
    norm = _normality([resid])
    norm["name"] = "Residual normality (Shapiro-Wilk)"
    out.append(norm)

    # 2. Homoscedasticity, Breusch-Pagan in Koenker's studentised form: the LM
    # statistic n*R^2 from regressing the SQUARED residuals on x. Koenker's
    # version rather than the original because the original divides by an
    # estimate of the fourth moment under normality, so on the heavy-tailed
    # residuals that usually accompany non-constant variance it rejects for the
    # wrong reason. Matches statsmodels het_breuschpagan (robust=True).
    if n >= 4 and float(np.std(x)) > 0:
        aux = stats.linregress(x, resid ** 2)
        lm = n * float(aux.rvalue) ** 2
        p_bp = float(stats.chi2.sf(lm, 1))
        ok = bool(p_bp >= 0.05)
        out.append({"name": "Equal variance of residuals (Breusch-Pagan)",
                    "statistic": lm, "pValue": p_bp, "passed": ok,
                    "verdict": ("Residual scatter is comparable across the range of x."
                                if ok else
                                "Residual scatter changes with x, so the slope's standard "
                                "error and interval are understated where the scatter is "
                                "widest."),
                    "alternative": None if ok else "weighted least squares, or a transform of Y"})
    else:
        out.append({"name": "Equal variance of residuals (Breusch-Pagan)", "statistic": None,
                    "pValue": None, "passed": False,
                    "verdict": f"Needs at least 4 points with varying x; this fit has {n}.",
                    "alternative": None})

    # 3. Linearity, Ramsey's RESET with powers 2 and 3 of the fitted values. If
    # squares and cubes of the fit explain residual structure, the relationship
    # is not a straight line and every number above describes the wrong model.
    # Lack-of-fit against pure error would be stronger but needs replicate x,
    # which a regression payload is not guaranteed to have.
    dfd = n - 4
    sse_r = float(np.sum(resid ** 2))
    if dfd > 0 and sse_r > 0:
        design = np.column_stack([np.ones(n), x, fitted ** 2, fitted ** 3])
        beta = np.linalg.lstsq(design, y, rcond=None)[0]
        sse_f = float(np.sum((y - design @ beta) ** 2))
        f_reset = ((sse_r - sse_f) / 2) / (sse_f / dfd) if sse_f > 0 else float("inf")
        p_reset = float(stats.f.sf(f_reset, 2, dfd)) if math.isfinite(f_reset) else 0.0
        ok = bool(p_reset >= 0.05)
        out.append({"name": "Linearity (Ramsey RESET, powers 2-3)",
                    "statistic": float(f_reset), "pValue": p_reset, "passed": ok,
                    "verdict": ("No detectable curvature; a straight line is an adequate "
                                "description." if ok else
                                "The relationship departs from a straight line, so the slope "
                                "is an average over a curve rather than a constant rate."),
                    "alternative": None if ok else "a nonlinear model, or a transform of X"})
    else:
        out.append({"name": "Linearity (Ramsey RESET, powers 2-3)", "statistic": None,
                    "pValue": None, "passed": False,
                    "verdict": f"Needs more than 4 points; this fit has {n}.",
                    "alternative": None})
    return out


def run_linear_regression(p) -> dict:
    x, y = np.asarray(p["x"], float), np.asarray(p["y"], float)
    alpha = float(p["alpha"])
    res = stats.linregress(x, y)
    n = int(x.size)
    tcrit = float(stats.t.ppf(1 - alpha / 2, n - 2)) if n > 2 else _z(alpha)
    lo = float(res.slope - tcrit * res.stderr)
    hi = float(res.slope + tcrit * res.stderr)
    ilo = float(res.intercept - tcrit * res.intercept_stderr)
    ihi = float(res.intercept + tcrit * res.intercept_stderr)
    r2 = float(res.rvalue**2)
    ci = _ci_label(alpha)
    # The slope interval belongs to the slope, and R² is reported as R², not as
    # a Cohen's d wearing the slope's CI.
    terms = [
        _term("Intercept", None, n - 2, None, float(res.intercept), ilo, ihi),
        _term("Slope", float(res.slope / res.stderr) if res.stderr else None, n - 2,
              float(res.pvalue), float(res.slope), lo, hi),
    ]
    fitted = float(res.intercept) + float(res.slope) * x
    resid = y - fitted
    assumptions = _regression_assumptions(x, y, resid, fitted)

    # Prediction interval. The confidence band says where the LINE is; the
    # prediction band says where the next observation will fall, and they differ
    # by the residual scatter itself - the wider one is the one a reader needs
    # to use a standard curve to read off an unknown. Reporting only the slope's
    # interval leaves both unavailable.
    regression = None
    if n > 2:
        sxx = float(np.sum((x - float(np.mean(x))) ** 2))
        syx = math.sqrt(float(np.sum(resid ** 2)) / (n - 2))
        if sxx > 0:
            grid = np.linspace(float(np.min(x)), float(np.max(x)), 120)
            centre = float(res.intercept) + float(res.slope) * grid
            lev = 1.0 / n + (grid - float(np.mean(x))) ** 2 / sxx
            se_mean = syx * np.sqrt(lev)
            se_pred = syx * np.sqrt(1.0 + lev)
            regression = {
                "x": grid.tolist(), "fit": centre.tolist(),
                "ciLow": (centre - tcrit * se_mean).tolist(),
                "ciHigh": (centre + tcrit * se_mean).tolist(),
                "piLow": (centre - tcrit * se_pred).tolist(),
                "piHigh": (centre + tcrit * se_pred).tolist(),
                "level": 1.0 - alpha, "syx": syx,
            }

    out = _result("Linear regression", float(res.slope), n - 2, float(res.pvalue),
                  [{"name": "r-squared", "value": r2, "ciLow": None, "ciHigh": None}],
                  assumptions, [], {"points": n},
                  f"Linear regression: slope = {float(res.slope):.4f} ({ci} {lo:.4f} to {hi:.4f}), "
                  f"R² = {r2:.4f}, {_fmt_p(float(res.pvalue))} (n = {n}). Residual normality, "
                  f"equal variance and linearity were tested; see the assumption checks."
                  + (f" A {(1 - alpha) * 100:g}% prediction interval accompanies the fitted "
                     f"line." if regression else ""),
                  terms=terms)
    if regression:
        out["_regression"] = regression
    return out


def _km_curve(durations: np.ndarray, events: np.ndarray, alpha: float = 0.05) -> dict:
    """
    One Kaplan-Meier product-limit curve, with Greenwood standard errors.

    Returned rather than merely drawn: the survival probabilities and the median
    are numbers the reader acts on, so they come from here and the renderer only
    draws them (Law 2). Censoring times are carried separately because the tick
    marks on a KM plot are how a reader judges how much follow-up is left.
    """
    times = np.unique(durations[(events == 1)])
    step_t = [0.0]
    step_s = [1.0]
    step_lo = [1.0]
    step_hi = [1.0]
    at_risk_out = [int(durations.size)]
    zc = _z(alpha)  # the spec's alpha governs the band, not a hard-coded 1.96
    surv = 1.0
    greenwood = 0.0
    median = None
    for t in times:
        n_risk = float(np.sum(durations >= t))
        d_t = float(np.sum((durations == t) & (events == 1)))
        if n_risk <= 0:
            continue
        surv *= 1 - d_t / n_risk
        if n_risk > d_t:
            greenwood += d_t / (n_risk * (n_risk - d_t))
        se = surv * math.sqrt(greenwood) if greenwood > 0 else 0.0
        step_t.append(float(t))
        step_s.append(float(surv))
        step_lo.append(float(max(0.0, surv - zc * se)))
        step_hi.append(float(min(1.0, surv + zc * se)))
        at_risk_out.append(int(n_risk))
        if median is None and surv <= 0.5:
            median = float(t)
    censored = sorted(float(t) for t in durations[events == 0])
    return {
        "time": step_t,
        "survival": step_s,
        "lower": step_lo,
        "upper": step_hi,
        "atRisk": at_risk_out,
        "censoredTimes": censored,
        "median": median,
        "n": int(durations.size),
        "events": int(np.sum(events == 1)),
    }


def run_survival(p) -> dict:
    """Kaplan-Meier with the Mantel-Cox log-rank test, implemented directly."""
    durations = np.asarray(p["durations"], float)
    events = np.asarray(p["events"], float)
    groups = p.get("groups")
    alpha = float(p.get("alpha", 0.05))

    if not groups:
        curve = _km_curve(durations, events, alpha)
        median = curve["median"]
        out = _result("Kaplan-Meier", None, None, None, [], [], [],
                      {"subjects": int(durations.size)},
                      f"Kaplan-Meier estimate over {int(durations.size)} subjects"
                      + (f"; median survival {median:g}." if median is not None else "; median not reached."))
        out["_survival"] = {"groups": [{"label": "All", **curve}]}
        return out

    labels = sorted(set(groups))
    g = np.asarray(groups)
    k = len(labels)
    obs = {l: 0.0 for l in labels}
    exp = {l: 0.0 for l in labels}
    var = 0.0
    # Hypergeometric covariance of the per-group death counts, accumulated over
    # event times. Σ(O-E)²/E is a Pearson goodness-of-fit statistic, not the
    # log-rank test: the O-E are linearly dependent (they sum to zero) and
    # correlated, and E is not their variance. It does not follow chi²(k-1), so
    # its p-value is wrong in a direction that depends on the data — neither
    # reliably conservative nor reliably liberal, which is the worse failure.
    vmat = np.zeros((k, k))
    for t in np.unique(durations[events == 1]):
        n_risk = float(np.sum(durations >= t))
        d_t = float(np.sum((durations == t) & (events == 1)))
        if n_risk <= 1:
            continue
        at_risk = np.array([float(np.sum(durations[g == l] >= t)) for l in labels])
        for i, l in enumerate(labels):
            m = g == l
            obs[l] += float(np.sum((durations[m] == t) & (events[m] == 1)))
            exp[l] += d_t * at_risk[i] / n_risk
        # Accumulated for every k, not just k > 2. The diagonal V_ii is what the
        # Peto hazard-ratio standard error needs, and for k = 2 vmat[0,0] is
        # algebraically the same scalar the two-group branch used to compute on
        # its own, so the statistic is unchanged.
        frac = at_risk / n_risk
        vmat += d_t * (n_risk - d_t) / (n_risk - 1) * (np.diag(frac) - np.outer(frac, frac))

    var = float(vmat[0, 0])
    df = len(labels) - 1
    if len(labels) == 2 and var > 0:
        chi, df = (obs[labels[0]] - exp[labels[0]]) ** 2 / var, 1
    else:
        # Mantel-Cox quadratic form on any k-1 of the groups; the omitted group
        # is redundant, and which one is dropped does not change the statistic.
        d_vec = np.array([obs[l] - exp[l] for l in labels[:-1]])
        v_red = vmat[:-1, :-1]
        try:
            chi = float(d_vec @ np.linalg.solve(v_red, d_vec))
        except np.linalg.LinAlgError:
            chi = float(d_vec @ np.linalg.pinv(v_red) @ d_vec)
        chi = max(chi, 0.0)
    pv = float(stats.chi2.sf(chi, df))

    # Hazard ratio. A log-rank p says the curves differ; it never says by how
    # much or in which direction, and this routine reported no effect size at
    # all. The Peto one-step estimator log(HR_i) = (O_i - E_i)/V_ii with
    # SE = 1/sqrt(V_ii) is the one that AGREES with the test by construction:
    # for two groups chi2 = (O-E)^2/V, so the interval excludes 1 exactly when
    # the log-rank p falls below alpha. A Mantel-Haenszel (O1/E1)/(O2/E2) ratio
    # with SE = sqrt(1/E1 + 1/E2) does not have that property.
    zc = _z(alpha)
    ci_lbl = _ci_label(alpha)
    effects, hr_pieces = [], []
    for i, l in enumerate(labels):
        v_ii = float(vmat[i, i])
        if v_ii <= 0:
            continue
        loghr = (obs[l] - exp[l]) / v_ii
        se = 1.0 / math.sqrt(v_ii)
        # With two groups "group i versus the rest" IS group i versus the other
        # group, so the label is the plain contrast. Above two it is group i
        # against the pooled remainder, which is a different quantity from any
        # pairwise contrast and is named as such rather than left to be misread.
        term = (f"{l} vs {labels[1 - i]}" if k == 2 else f"{l} vs. all other groups")
        effects.append({"name": "hazard-ratio", "term": term,
                        "value": math.exp(loghr),
                        "ciLow": math.exp(loghr - zc * se),
                        "ciHigh": math.exp(loghr + zc * se)})
        hr_pieces.append(f"HR {term} = {math.exp(loghr):.3g} "
                         f"({ci_lbl} {math.exp(loghr - zc * se):.3g} to "
                         f"{math.exp(loghr + zc * se):.3g})")
        if k == 2:
            break  # the second group's HR is just the reciprocal of the first

    out = _result("Kaplan-Meier with log-rank", float(chi), df, pv, effects, [], [],
                  {l: int(np.sum(g == l)) for l in labels},
                  f"Log-rank test: χ²({df}) = {float(chi):.3f}, {_fmt_p(pv)} across "
                  f"{len(labels)} groups (n = {int(durations.size)})."
                  + (" " + "; ".join(hr_pieces) + "." if hr_pieces else ""))
    if k > 2 and effects:
        out["_warnings"] = [
            "The log-rank test above is an omnibus test across all "
            f"{k} groups. With more than two groups there is no single hazard ratio, so "
            "each one reported is the Peto estimate for that group against the pooled "
            "remainder, not a pairwise contrast; two of them can both exceed 1."]
    out["_survival"] = {
        "groups": [
            {"label": str(l), **_km_curve(durations[g == l], events[g == l], alpha)} for l in labels
        ]
    }
    return out


# ── nonlinear regression ──────────────────────────────────────────────────────


def _four_pl(x, bottom, top, logec50, hill):
    return bottom + (top - bottom) / (1.0 + 10.0 ** ((logec50 - x) * hill))


def _three_pl(x, bottom, top, logec50):
    return _four_pl(x, bottom, top, logec50, 1.0)


def _five_pl(x, bottom, top, logec50, hill, s):
    return bottom + (top - bottom) / ((1.0 + 10.0 ** ((logec50 - x) * hill)) ** s)


#: model key -> (function, parameter names, in the order the function takes them)
_DR_MODELS = {
    "3pl": (_three_pl, ["bottom", "top", "logEC50"]),
    "4pl": (_four_pl, ["bottom", "top", "logEC50", "hillSlope"]),
    "5pl": (_five_pl, ["bottom", "top", "logEC50", "hillSlope", "asymmetry"]),
}


def _dr_sigma(ys: np.ndarray, weighting: str):
    """curve_fit minimises sum(((y - f)/sigma)^2), so the effective weight is
    1/sigma^2, not 1/sigma. Passing sigma = |y| for "1/Y" delivers 1/Y^2 and
    sigma = y^2 delivers 1/Y^4: both over-weight the low end by a whole power
    and pull the EC50 with them."""
    absy = np.where(np.abs(ys) > 0, np.abs(ys), 1.0)
    return (np.sqrt(absy) if weighting == "1/Y"
            else absy if weighting == "1/Y^2" else None)


def _dr_scores(ys: np.ndarray, resid: np.ndarray, sigma, k: int):
    """R-squared, adjusted R-squared, Sy.x and AICc, on the fit's own weights.

    The weights that chose the parameters have to be the weights that judge
    them. Scoring a weighted fit with unweighted residuals describes a fit that
    was never performed."""
    ss_res = float(np.sum((resid if sigma is None else resid / sigma) ** 2))
    if sigma is None:
        ss_tot = float(np.sum((ys - np.mean(ys)) ** 2))
    else:
        wt = 1.0 / sigma**2
        ss_tot = float(np.sum(wt * (ys - np.sum(wt * ys) / np.sum(wt)) ** 2))
    n = int(ys.size)
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    adj = 1 - (1 - r2) * (n - 1) / (n - k - 1) if n - k - 1 > 0 else float("nan")
    syx = math.sqrt(ss_res / (n - k)) if n > k else float("nan")
    # Burnham-Anderson, and GraphPad after them, count the residual variance as
    # a parameter: K = p + 1. Below n = p + 3 the correction is undefined and
    # there is no honest finite value to report.
    kk = k + 1
    aicc = (n * math.log(ss_res / n) + 2 * kk + (2 * kk * (kk + 1)) / (n - kk - 1)
            if n - kk - 1 > 0 and ss_res > 0 else None)
    return {"ss_res": ss_res, "rSquared": r2, "adjustedRSquared": adj, "syx": syx,
            "aicc": aicc}


def _numeric_band(f, theta, cov, grid, tcrit):
    """Delta-method interval for y = f(gx, theta) over a grid of gx.

    A fixed absolute finite-difference step is below float64 relative precision
    once a parameter is large (a plateau in RFU, an EC50 in nM): the bumped
    value equals the original, every gradient reads exactly zero, and the band
    collapses to zero width - which draws as a perfect fit. The step is
    therefore relative to each parameter's own magnitude."""
    theta = np.asarray(theta, float)
    steps = np.abs(theta) * 1e-6 + 1e-6
    centre, lower, upper = [], [], []
    for gx in grid:
        base = float(f(gx, theta))
        grad = np.zeros(theta.size)
        for i in range(theta.size):
            bumped = theta.copy()
            bumped[i] += steps[i]
            grad[i] = (float(f(gx, bumped)) - base) / steps[i]
        v = float(grad @ cov @ grad)
        half = tcrit * math.sqrt(v) if v > 0 else 0.0
        centre.append(base)
        lower.append(base - half)
        upper.append(base + half)
    return centre, lower, upper


def _dr_clean(x_raw, y_raw, warnings, label=""):
    """log10 the doses, dropping the ones that have no position on a log axis.

    log10 of a zero-dose vehicle control is -inf, which curve_fit rejects, so
    one control row otherwise takes the whole fit down as a generic convergence
    failure. Substituting an arbitrary value some decades below the lowest real
    dose would invent an anchor point the reader cannot see, and the EC50 would
    move with the invention, so the point is excluded and the exclusion said out
    loud."""
    x_raw = np.asarray(x_raw, float)
    ys = np.asarray(y_raw, float)
    usable = x_raw > 0
    if not np.all(usable):
        where = f" in {label}" if label else ""
        warnings.append(
            f"{int((~usable).sum())} point(s){where} at zero or negative concentration were "
            f"excluded from the fit, because the curve is parameterised in "
            f"log10(concentration) where a vehicle control has no position. The fit "
            f"uses the remaining {int(usable.sum())} point(s){where}.")
        x_raw, ys = x_raw[usable], ys[usable]
    return np.log10(x_raw), ys


def _dr_guess(xs: np.ndarray, ys: np.ndarray, n_params: int) -> list:
    p0 = [float(np.min(ys)), float(np.max(ys)), float(np.median(xs))]
    if n_params >= 4:
        p0.append(1.0)
    if n_params == 5:
        p0.append(1.0)
    return p0


def run_global_dose_response(p, datasets) -> dict:
    """Several dose-response curves fitted SIMULTANEOUSLY, sharing parameters.

    The pharmacology case this exists for: a family of analogues assayed on one
    plate share a bottom, a top and a Hill slope because they act on the same
    receptor through the same readout, and differ only in potency. Fitting them
    independently spends four parameters per curve on three quantities that are
    known to be common, so each curve's plateaus are estimated from its own
    handful of points and the logEC50s inherit that noise. Fitting them together
    estimates the shared parameters from every point at once, and the logEC50
    confidence intervals narrow accordingly.

    This is NOT the same answer as fitting each curve alone and averaging: the
    shared parameters are a joint least-squares solution over the pooled
    residuals, so a curve with more points, or with less scatter, pulls harder.
    The test suite pins that difference rather than asserting it.

    `sharedParameters` names parameters of the chosen model. Naming none is
    legal and means the curves are fitted jointly but constrained by nothing,
    which reproduces the independent fits exactly - useful as a control, and
    the suite checks it.
    """
    warnings = []
    model = p.get("model", "4pl")
    func, names = _DR_MODELS.get(model, _DR_MODELS["4pl"])
    n_params = len(names)
    weighting = p.get("weighting", "none")
    alpha = float(p.get("alpha", 0.05))

    requested = list(p.get("sharedParameters") or [])
    shared = [s for s in requested if s in names]
    unknown = [s for s in requested if s not in names]
    if unknown:
        # The record names what ran. Silently dropping a name the caller asked
        # to share would report a global fit that shares less than it claims.
        warnings.append(
            f"{', '.join(repr(u) for u in unknown)} is not a parameter of the "
            f"{model.upper()} model, whose parameters are {', '.join(names)}, so it was "
            f"ignored; the fit shares {', '.join(shared) if shared else 'nothing'}.")

    prepared = []
    for idx, d in enumerate(datasets):
        label = str(d.get("label") or f"dataset {idx + 1}")
        xs, ys = _dr_clean(d.get("x"), d.get("y"), warnings, label)
        if xs.size < 2:
            warnings.append(f"{label} has fewer than 2 usable points and was left out of "
                            f"the global fit.")
            continue
        prepared.append({"label": label, "xs": xs, "ys": ys})

    if len(prepared) < 2:
        return {"curveFit": {"converged": False, "model": model.upper(), "global": True},
                "warnings": warnings + [
                    "A global fit needs at least two datasets with usable points; "
                    f"{len(prepared)} survived cleaning, so no fit was attempted."]}

    n_sets = len(prepared)
    # Flat parameter vector: one slot per shared parameter, one slot per dataset
    # for every free one. `slot[(j, i)]` is where parameter j of dataset i lives.
    slot, flat_names, free_of = {}, [], []
    for j, nm in enumerate(names):
        if nm in shared:
            slot[(j, None)] = len(flat_names)
            flat_names.append(f"{nm} (shared)")
            free_of.append((j, None))
        else:
            for i in range(n_sets):
                slot[(j, i)] = len(flat_names)
                flat_names.append(f"{nm} [{prepared[i]['label']}]")
                free_of.append((j, i))

    def index_of(j, i):
        return slot[(j, None)] if names[j] in shared else slot[(j, i)]

    guesses = [_dr_guess(d["xs"], d["ys"], n_params) for d in prepared]
    theta0 = np.empty(len(flat_names))
    for j, nm in enumerate(names):
        if nm in shared:
            # One starting value for a parameter every curve will share: the
            # mean of what each curve would have started from on its own.
            theta0[slot[(j, None)]] = float(np.mean([g[j] for g in guesses]))
        else:
            for i in range(n_sets):
                theta0[slot[(j, i)]] = guesses[i][j]

    xs_all = np.concatenate([d["xs"] for d in prepared])
    ys_all = np.concatenate([d["ys"] for d in prepared])
    owner = np.concatenate([np.full(d["xs"].size, i) for i, d in enumerate(prepared)])
    sigma_all = _dr_sigma(ys_all, weighting)

    def params_for(i, theta):
        return [theta[index_of(j, i)] for j in range(n_params)]

    def stacked(_x, *theta):
        theta = np.asarray(theta, float)
        out = np.empty(xs_all.size)
        for i in range(n_sets):
            m = owner == i
            out[m] = func(xs_all[m], *params_for(i, theta))
        return out

    try:
        popt, pcov = optimize.curve_fit(stacked, xs_all, ys_all, p0=theta0,
                                        sigma=sigma_all, maxfev=40000)
    except (RuntimeError, ValueError) as exc:
        return {"curveFit": {"converged": False, "model": model.upper(), "global": True},
                "warnings": warnings + [f"Global fit did not converge: {exc}"]}

    k_flat = len(flat_names)
    resid = ys_all - stacked(xs_all, *popt)
    scores = _dr_scores(ys_all, resid, sigma_all, k_flat)
    if scores["aicc"] is None:
        warnings.append(
            f"AICc is not defined for {int(ys_all.size)} pooled points and a {k_flat}-parameter "
            f"global fit (it needs more than {k_flat + 2}), so no value is reported; comparing "
            f"models on this data set is not supported.")

    n_total = int(ys_all.size)
    tcrit = float(stats.t.ppf(1 - alpha / 2, max(n_total - k_flat, 1)))
    perr = np.sqrt(np.diag(pcov))

    def described(flat_index, val):
        e = float(perr[flat_index]) if math.isfinite(perr[flat_index]) else None
        return {"value": float(val), "stderr": e,
                "ciLow": float(val - tcrit * e) if e is not None else None,
                "ciHigh": float(val + tcrit * e) if e is not None else None}

    shared_block = {nm: described(slot[(j, None)], popt[slot[(j, None)]])
                    for j, nm in enumerate(names) if nm in shared}
    if "logEC50" in shared_block and shared_block["logEC50"]["ciLow"] is not None:
        shared_block["ec50"] = {
            "value": 10.0 ** shared_block["logEC50"]["value"], "stderr": None,
            "ciLow": 10.0 ** shared_block["logEC50"]["ciLow"],
            "ciHigh": 10.0 ** shared_block["logEC50"]["ciHigh"]}

    want_band = p.get("confidenceBands", True) and bool(np.all(np.isfinite(pcov)))
    per_set = []
    for i, d in enumerate(prepared):
        block = {nm: described(index_of(j, i), popt[index_of(j, i)])
                 for j, nm in enumerate(names)}
        logec50 = float(popt[index_of(names.index("logEC50"), i)])
        if block["logEC50"]["ciLow"] is not None:
            # Asymmetric in concentration because symmetric in log units.
            block["ec50"] = {"value": 10.0**logec50, "stderr": None,
                             "ciLow": 10.0 ** block["logEC50"]["ciLow"],
                             "ciHigh": 10.0 ** block["logEC50"]["ciHigh"]}
        grid = np.linspace(float(np.min(d["xs"])), float(np.max(d["xs"])), 120)
        curve_y = func(grid, *params_for(i, popt))
        band = None
        if want_band:
            # The gradient runs over the FULL flat vector, so a shared
            # parameter's uncertainty - which every dataset paid into and every
            # dataset carries - propagates into this curve's band. Taking only
            # this dataset's own slots would understate it.
            _, lo_b, hi_b = _numeric_band(
                lambda gx, th, i=i: func(gx, *params_for(i, th)), popt, pcov, grid, tcrit)
            band = {"x": (10.0**grid).tolist(), "lower": lo_b, "upper": hi_b}
        d_resid = d["ys"] - func(d["xs"], *params_for(i, popt))
        d_sigma = _dr_sigma(d["ys"], weighting)
        # Per-dataset R-squared is scored against the parameters this dataset
        # actually got, shared ones included; k is its own free count, because
        # a shared parameter was not spent on this curve alone.
        k_own = sum(1 for nm in names if nm not in shared)
        d_scores = _dr_scores(d["ys"], d_resid, d_sigma, max(k_own, 1))
        per_set.append({
            "label": d["label"], "n": int(d["xs"].size), "parameters": block,
            "ec50": 10.0**logec50,
            "rSquared": d_scores["rSquared"], "syx": d_scores["syx"],
            "curve": {"x": (10.0**grid).tolist(), "y": curve_y.tolist()},
            "confidenceBand": band,
        })

    if p.get("unknowns"):
        warnings.append(
            "Unknowns are not interpolated from a global fit: each dataset has its own "
            "standard curve, so a single signal has no unambiguous concentration. Fit the "
            "standard curve on its own to interpolate.")

    if not shared:
        warnings.append(
            f"A global fit over {n_sets} datasets was run with no shared parameters, so it "
            f"is arithmetically identical to fitting each curve independently; name "
            f"parameters in sharedParameters ({', '.join(names)}) for the curves to "
            f"constrain each other.")

    if scores["rSquared"] < 0.9:
        warnings.append(f"Pooled R² is {scores['rSquared']:.3f}; inspect the fit before "
                        f"reporting it.")

    return {
        "curveFit": {
            "model": model.upper(), "global": True, "sharedParameters": shared,
            "datasets": per_set, "parameters": shared_block,
            "ec50": (shared_block["ec50"]["value"] if "ec50" in shared_block else None),
            "rSquared": float(scores["rSquared"]),
            "adjustedRSquared": float(scores["adjustedRSquared"]),
            "aicc": scores["aicc"], "syx": float(scores["syx"]),
            "curve": None, "confidenceBand": None, "interpolated": None,
            "converged": True, "iterations": 0,
        },
        "warnings": warnings,
    }


def run_dose_response(p) -> dict:
    """
    Parameterised in log10(concentration), so logEC50 is a FITTED parameter with
    its own standard error. Deriving an EC50 interval from a linear-x fit does
    not give you an honest one.

    `datasets` is the additive, backward-compatible way to express more than one
    curve: absent, the payload's flat `x`/`y` are fitted exactly as before; with
    two or more entries the fit is global (see `run_global_dose_response`).
    """
    datasets = p.get("datasets") or []
    if len(datasets) > 1:
        return run_global_dose_response(p, datasets)
    if len(datasets) == 1:
        # One dataset is a single fit, not a degenerate global one; sharing a
        # parameter with nothing is not a constraint.
        p = {**p, "x": datasets[0].get("x"), "y": datasets[0].get("y")}
    warnings = []
    xs, ys = _dr_clean(p["x"], p["y"], warnings)
    model = p.get("model", "4pl")
    func, names = _DR_MODELS.get(model, _DR_MODELS["4pl"])
    n_params = len(names)
    p0 = _dr_guess(xs, ys, n_params)

    weighting = p.get("weighting", "none")
    sigma = _dr_sigma(ys, weighting)

    try:
        popt, pcov = optimize.curve_fit(func, xs, ys, p0=p0, sigma=sigma, maxfev=20000)
    except (RuntimeError, ValueError) as exc:
        return {"curveFit": {"converged": False, "model": model.upper()},
                "warnings": warnings + [f"Fit did not converge: {exc}"]}

    resid = ys - func(xs, *popt)
    n, k = int(xs.size), len(popt)
    scores = _dr_scores(ys, resid, sigma, k)
    r2, adj, syx, aicc = (scores["rSquared"], scores["adjustedRSquared"],
                          scores["syx"], scores["aicc"])
    if aicc is None:
        warnings.append(
            f"AICc is not defined for {n} points and a {k}-parameter model (it needs "
            f"more than {k + 2}), so no value is reported; comparing models on this "
            f"data set is not supported.")

    perr = np.sqrt(np.diag(pcov))
    # The caller's alpha governs the parameter intervals too. An analysis
    # declared at alpha = 0.01 must not quote 95% limits on its EC50.
    alpha = float(p.get("alpha", 0.05))
    tcrit = float(stats.t.ppf(1 - alpha / 2, max(n - k, 1)))
    params = {}
    for name, val, err in zip(names, popt, perr):
        e = float(err) if math.isfinite(err) else None
        params[name] = {"value": float(val), "stderr": e,
                        "ciLow": float(val - tcrit * err) if e is not None else None,
                        "ciHigh": float(val + tcrit * err) if e is not None else None}
    logec50 = float(popt[2])
    ec50 = 10.0**logec50
    if params["logEC50"]["ciLow"] is not None:
        # Asymmetric in concentration units because symmetric in log units.
        params["ec50"] = {"value": ec50, "stderr": None,
                          "ciLow": 10.0 ** params["logEC50"]["ciLow"],
                          "ciHigh": 10.0 ** params["logEC50"]["ciHigh"]}

    grid = np.linspace(float(np.min(xs)), float(np.max(xs)), 120)
    band = None
    if p.get("confidenceBands", True) and np.all(np.isfinite(pcov)):
        _, lower, upper = _numeric_band(lambda gx, th: func(gx, *th), popt, pcov, grid, tcrit)
        band = {"x": (10.0**grid).tolist(), "lower": lower, "upper": upper}

    interpolated = None
    unknowns = p.get("unknowns") or []
    if unknowns:
        interpolated = []
        lo_y, hi_y = float(np.min(ys)), float(np.max(ys))
        bottom, top = float(popt[0]), float(popt[1])
        hill = float(popt[3]) if n_params >= 4 else 1.0
        for item in unknowns:
            sig = float(item.get("signal"))
            conc = None
            if top != bottom and sig != bottom:
                ratio = (top - sig) / (sig - bottom)
                if ratio > 0:
                    conc = 10.0 ** (logec50 - math.log10(ratio) / hill)
            interpolated.append({"label": str(item.get("label", "")), "signal": sig,
                                 "concentration": conc, "inRange": bool(lo_y <= sig <= hi_y)})
        out_of = sum(1 for i in interpolated if not i["inRange"])
        if out_of:
            warnings.append(f"{out_of} unknown(s) fall outside the standard range; "
                            "those concentrations are extrapolated.")

    if r2 < 0.9:
        warnings.append(f"R² is {r2:.3f}; inspect the fit before reporting it.")

    return {
        "curveFit": {
            "model": model.upper(), "parameters": params, "ec50": ec50,
            "rSquared": float(r2), "adjustedRSquared": float(adj), "aicc": aicc,
            "syx": float(syx),
            "curve": {"x": (10.0**grid).tolist(), "y": func(grid, *popt).tolist()},
            "confidenceBand": band, "interpolated": interpolated,
            "converged": True, "iterations": 0,
        },
        "warnings": warnings,
    }


# ── dispatch ──────────────────────────────────────────────────────────────────

REGISTRY = {
    # No test chosen: summarise, report nothing. A figure with no hypothesis
    # attached is a legitimate analysis, so this returns descriptives rather
    # than an error.
    "none": run_descriptives,
    "descriptives": run_descriptives,
    "normality": run_normality,
    "t-one-sample": run_one_sample_t,
    "t-unpaired": run_two_sample_t,
    "t-welch": run_two_sample_t,
    "t-paired": run_paired_t,
    "wilcoxon-signed-rank": run_wilcoxon,
    "mann-whitney": run_mann_whitney,
    "anova-one-way": run_anova_one_way,
    "kruskal-wallis": run_kruskal,
    "friedman": run_friedman,
    "anova-rm": run_anova_rm,
    "anova-two-way": run_anova_two_way,
    "mixed-effects": run_mixed_effects,
    "chi-square": run_contingency,
    "fisher-exact": run_contingency,
    "correlation-pearson": run_correlation,
    "correlation-spearman": run_correlation,
    "linear-regression": run_linear_regression,
    "kaplan-meier": run_survival,
    "nonlinear-regression": run_dose_response,
}


def run(payload: dict) -> dict:
    """
    Single entry point. `payload` is already shaped by the resolver; the return
    value maps onto EngineResult in contract.ts.
    """
    started = time.time()
    warnings = list(payload.get("warnings") or [])
    test = payload.get("test", "none")

    descriptives = []
    shape = payload.get("shape")
    series = {}
    if shape == "columns":
        series = payload.get("columns") or {}
    elif shape == "groups":
        series = payload.get("groups") or {}
    descriptives = [describe_column(n, v) for n, v in series.items()]

    # Every routine below reaches its data through `_clean`, which discards
    # blanks and non-numeric entries. Silently is the problem: an n smaller than
    # the n the user submitted, with nothing saying why, reads as a mistake in
    # the methods section. One warning here covers every routine.
    for name, values in series.items():
        dropped = _clean_counted(values)[1]
        if dropped:
            warnings.append(
                f"{dropped} of {len(values)} value(s) in {name} were blank or "
                f"non-numeric and were excluded; the reported n counts only the "
                f"values actually analysed.")

    test_result, curve_fit, survival, regression, error = None, None, None, None, None
    test_ran = None
    fn = REGISTRY.get(test)
    if fn is None:
        error = {
            "code": "no-routine",
            "test": test,
            "message": f"This engine has no routine for '{test}'.",
            "detail": None,
        }
    else:
        try:
            out = fn(payload)
            # A routine may substitute a test the data can actually support; it
            # says so here so the record names what ran, not what was asked for.
            test_ran = out.pop("_test_ran", None) or test
            if "curveFit" in out:
                curve_fit = out["curveFit"]
                warnings.extend(out.get("warnings") or [])
            else:
                # Routines raise their caveats through `_warnings`; they belong on
                # the result, not inside the test object the renderer prints.
                warnings.extend(out.pop("_warnings", None) or [])
                survival = out.pop("_survival", None)
                regression = out.pop("_regression", None)
                test_result = out
        except Exception as exc:
            # Reported, never swallowed, but as a failure, not a caveat. Filed
            # under `warnings` this returned as a successful run with nothing to
            # report, and put "OverflowError: (68, 'Result not representable')"
            # in front of a bench scientist. The repr stays, in `detail`.
            error = {
                "code": "test-failed",
                "test": test,
                "message": f"The {test} calculation could not be completed on this data.",
                "detail": f"{type(exc).__name__}: {exc}",
            }

    return _scrub({
        "descriptives": descriptives,
        "test": test_result,
        "curveFit": curve_fit,
        "survival": survival,
        "regression": regression,
        "testRan": test_ran,
        "error": error,
        "warnings": warnings,
        "durationMs": int((time.time() - started) * 1000),
    })

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


def _adjust(p, method: str):
    m = len(p)
    if m == 0:
        return []
    if method == "bonferroni":
        return [min(1.0, x * m) for x in p]
    if method == "sidak":
        return [1 - (1 - x) ** m for x in p]
    order = sorted(range(m), key=lambda i: p[i])
    adjusted, running = [0.0] * m, 0.0
    for rank, idx in enumerate(order):
        factor = m - rank
        val = min(1.0, p[idx] * factor) if method == "holm" else min(1.0, 1 - (1 - p[idx]) ** factor)
        running = max(running, val)  # step-down monotonicity
        adjusted[idx] = running
    return adjusted


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
        crit = float(stats.t.ppf(1 - alpha / 2, df_within))
        out = []
        for slot, i in enumerate(others):
            diff = float(np.mean(arrays[i])) - float(np.mean(arrays[ci]))
            se = math.sqrt(ms_within * (1 / arrays[i].size + 1 / arrays[ci].size))
            padj = float(np.atleast_1d(res.pvalue)[slot])
            out.append({"groupA": names[ci], "groupB": names[i], "meanDifference": diff,
                        "ciLow": diff - crit * se, "ciHigh": diff + crit * se,
                        "pValue": padj, "pAdjusted": padj, "correctionMethod": "dunnett",
                        "significant": bool(padj < alpha)})
        return out

    out, raw = [], []
    for i in range(len(arrays)):
        for j in range(i + 1, len(arrays)):
            a, b = arrays[i], arrays[j]
            diff = float(np.mean(a)) - float(np.mean(b))
            se = math.sqrt(ms_within * (1 / a.size + 1 / b.size))
            if method == "tukey":
                q = abs(diff) / (se / math.sqrt(2)) if se > 0 else 0.0
                p = float(stats.studentized_range.sf(q, len(arrays), df_within))
                crit = float(stats.studentized_range.ppf(1 - alpha, len(arrays), df_within))
                margin = crit * se / math.sqrt(2)
            else:
                t = diff / se if se > 0 else 0.0
                p = float(2 * stats.t.sf(abs(t), df_within))
                margin = float(stats.t.ppf(1 - alpha / 2, df_within)) * se
            raw.append(p)
            out.append({"groupA": names[i], "groupB": names[j], "meanDifference": diff,
                        "ciLow": diff - margin, "ciHigh": diff + margin,
                        "pValue": p, "pAdjusted": p, "correctionMethod": method, "significant": False})

    if method != "tukey":
        for row, padj in zip(out, _adjust(raw, method)):
            row["pAdjusted"] = padj
    for row in out:
        row["significant"] = bool(row["pAdjusted"] < alpha)
    return out


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

    out, raw = [], []
    for i in range(len(arrays)):
        for j in range(i + 1, len(arrays)):
            se = math.sqrt(sigma2 * (1 / sizes[i] + 1 / sizes[j])) if sigma2 > 0 else 0.0
            diff = mean_ranks[i] - mean_ranks[j]
            z = diff / se if se > 0 else 0.0
            p = float(2 * stats.norm.sf(abs(z)))
            raw.append(p)
            margin = _z(alpha) * se  # a real interval in rank units, not NaN
            out.append({"groupA": names[i], "groupB": names[j], "meanDifference": diff,
                        "ciLow": diff - margin, "ciHigh": diff + margin,
                        "pValue": p, "pAdjusted": p,
                        "correctionMethod": f"dunn ({method})", "significant": False})
    for row, padj in zip(out, _adjust(raw, method)):
        row["pAdjusted"] = padj
        row["significant"] = bool(padj < alpha)
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
        chk = _normality([_clean(values)])
        chk["name"] = f"Normality, {name} (Shapiro-Wilk)"
        assumptions.append(chk)
    return _result("Normality", assumptions=assumptions,
                   sentence="Normality assessed by Shapiro-Wilk on each column.")


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
    return _result("Wilcoxon signed-rank", float(res.statistic), None, float(res.pvalue),
                   sizes={la: n, lb: n},
                   sentence=f"Wilcoxon signed-rank W = {float(res.statistic):.1f}, "
                            f"{_fmt_p(float(res.pvalue))} ({n} pairs).")


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
    return out


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
    pw = (_dunn(names, arrays, p["alpha"],
                requested if requested in ("bonferroni", "sidak", "holm-sidak") else "holm")
          if requested != "none" else [])
    out = _result("Kruskal-Wallis", float(h), k - 1, float(pv),
                  [{"name": "eta-squared-H", "value": float(eta_h), "ciLow": None, "ciHigh": None}],
                  [], pw, {n: int(a.size) for n, a in zip(names, arrays)},
                  f"Kruskal-Wallis H({k - 1}) = {float(h):.3f}, {_fmt_p(float(pv))} (n = {n_total}).")
    if requested in ("tukey", "dunnett"):
        out["_warnings"] = [
            f"{requested.title()}'s test is defined on group means, not ranks; Dunn's "
            f"test with a Holm adjustment was run after the Kruskal-Wallis instead."]
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

    # The df reported are the df the p-value came from. Quoting the uncorrected
    # integer df beside a Greenhouse-Geisser p is a pairing no reader can
    # reproduce, and the mismatch is invisible unless they try.
    return _result("Repeated-measures ANOVA", f, f"{rdf1:.2f}, {rdf2:.2f}", pv, [], [sph], [],
                   {c: int(n) for c in conditions},
                   f"RM ANOVA: F({rdf1:.2f}, {rdf2:.2f}) = {f:.3f}, {_fmt_p(pv)} ({n} subjects).{note}")


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
    lead = names[0]
    ci = _ci_label(alpha)
    pieces = [f"{pretty(n)}: b = {float(model.params[n]):.3f} "
              f"({ci} {float(conf.loc[n, 0]):.3f} to {float(conf.loc[n, 1]):.3f}), "
              f"{_fmt_p(float(model.pvalues[n]))}" for n in names]
    return _result("Mixed-effects model", float(model.tvalues[lead]), None,
                   float(model.pvalues[lead]), [], [], [],
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
    return _result("Linear regression", float(res.slope), n - 2, float(res.pvalue),
                   [{"name": "r-squared", "value": r2, "ciLow": None, "ciHigh": None}],
                   [], [], {"points": n},
                   f"Linear regression: slope = {float(res.slope):.4f} ({ci} {lo:.4f} to {hi:.4f}), "
                   f"R² = {r2:.4f}, {_fmt_p(float(res.pvalue))} (n = {n}).",
                   terms=terms)


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
    # event times. Σ(O-E)²/E is a goodness-of-fit statistic and is not the
    # log-rank test: the O-E are linearly dependent (they sum to zero) and
    # strongly correlated, so treating them as independent Poisson cells
    # understates the variance and inflates significance.
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
        if k > 2:
            frac = at_risk / n_risk
            scale = d_t * (n_risk - d_t) / (n_risk - 1)
            vmat += scale * (np.diag(frac) - np.outer(frac, frac))
        if len(labels) == 2:
            n1 = float(np.sum(durations[g == labels[0]] >= t))
            var += d_t * (n1 / n_risk) * (1 - n1 / n_risk) * (n_risk - d_t) / (n_risk - 1)

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

    out = _result("Kaplan-Meier with log-rank", float(chi), df, pv, [], [], [],
                  {l: int(np.sum(g == l)) for l in labels},
                  f"Log-rank test: χ²({df}) = {float(chi):.3f}, {_fmt_p(pv)} across "
                  f"{len(labels)} groups (n = {int(durations.size)}).")
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


def run_dose_response(p) -> dict:
    """
    Parameterised in log10(concentration), so logEC50 is a FITTED parameter with
    its own standard error. Deriving an EC50 interval from a linear-x fit does
    not give you an honest one.
    """
    warnings = []
    x_raw = np.asarray(p["x"], float)
    ys = np.asarray(p["y"], float)
    # log10 of a zero-dose vehicle control is -inf, which curve_fit rejects, so
    # one control row otherwise takes the whole fit down as a generic
    # convergence failure. A zero dose has no position on a log axis, so it is
    # excluded and the exclusion is reported: substituting an arbitrary value
    # some decades below the lowest real dose would invent an anchor point the
    # reader cannot see and the EC50 would move with the invention.
    usable = x_raw > 0
    if not np.all(usable):
        warnings.append(
            f"{int((~usable).sum())} point(s) at zero or negative concentration were "
            f"excluded from the fit, because the curve is parameterised in "
            f"log10(concentration) where a vehicle control has no position. The fit "
            f"uses the remaining {int(usable.sum())} point(s).")
        x_raw, ys = x_raw[usable], ys[usable]
    xs = np.log10(x_raw)
    model = p.get("model", "4pl")
    func, n_params, names = (
        (_three_pl, 3, ["bottom", "top", "logEC50"]) if model == "3pl"
        else (_five_pl, 5, ["bottom", "top", "logEC50", "hillSlope", "asymmetry"]) if model == "5pl"
        else (_four_pl, 4, ["bottom", "top", "logEC50", "hillSlope"])
    )
    p0 = [float(np.min(ys)), float(np.max(ys)), float(np.median(xs))]
    if n_params >= 4:
        p0.append(1.0)
    if n_params == 5:
        p0.append(1.0)

    weighting = p.get("weighting", "none")
    # curve_fit minimises Σ((y - f)/σ)², so the effective weight is 1/σ², not
    # 1/σ. Passing σ = |y| for "1/Y" delivers 1/Y² and σ = y² delivers 1/Y⁴:
    # both over-weight the low end by a whole power and pull the EC50 with them.
    absy = np.where(np.abs(ys) > 0, np.abs(ys), 1.0)
    sigma = (np.sqrt(absy) if weighting == "1/Y"
             else absy if weighting == "1/Y^2" else None)

    try:
        popt, pcov = optimize.curve_fit(func, xs, ys, p0=p0, sigma=sigma, maxfev=20000)
    except (RuntimeError, ValueError) as exc:
        return {"curveFit": {"converged": False, "model": model.upper()},
                "warnings": warnings + [f"Fit did not converge: {exc}"]}

    resid = ys - func(xs, *popt)
    # The weights that chose the parameters have to be the weights that judge
    # them. Scoring a weighted fit with unweighted residuals describes a fit
    # that was never performed, and R², adjusted R², Sy.x and AICc all inherit
    # the mismatch — the reported R² can even beat the fit's own optimum.
    ss_res = float(np.sum((resid if sigma is None else resid / sigma) ** 2))
    if sigma is None:
        ss_tot = float(np.sum((ys - np.mean(ys)) ** 2))
    else:
        wt = 1.0 / sigma**2
        ss_tot = float(np.sum(wt * (ys - np.sum(wt * ys) / np.sum(wt)) ** 2))
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    n, k = int(xs.size), len(popt)
    adj = 1 - (1 - r2) * (n - 1) / (n - k - 1) if n - k - 1 > 0 else float("nan")
    syx = math.sqrt(ss_res / (n - k)) if n > k else float("nan")
    # Burnham-Anderson, and GraphPad after them, count the residual variance as
    # a parameter: K = p + 1, so the small-sample correction divides by
    # n - K - 1 = n - p - 2. Using K = p understates the penalty and biases
    # model selection toward the larger model, which is the whole reason AICc
    # exists. Below n = p + 3 the correction is undefined and there is no honest
    # finite value to report.
    kk = k + 1
    aicc = (n * math.log(ss_res / n) + 2 * kk + (2 * kk * (kk + 1)) / (n - kk - 1)
            if n - kk - 1 > 0 and ss_res > 0 else None)
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
        lower, upper = [], []
        # A fixed absolute step is below float64 relative precision once a
        # parameter is large (a plateau in RFU, an EC50 in nM): the bumped value
        # equals the original, every gradient reads exactly zero, and the band
        # collapses to zero width — which draws as a perfect fit.
        steps = np.abs(np.asarray(popt, float)) * 1e-6 + 1e-6
        for gx in grid:
            grad = np.zeros(k)
            for i in range(k):
                bumped = np.array(popt, float)
                bumped[i] += steps[i]
                grad[i] = (func(gx, *bumped) - func(gx, *popt)) / steps[i]
            v = float(grad @ pcov @ grad)
            half = tcrit * math.sqrt(v) if v > 0 else 0.0
            yv = float(func(gx, *popt))
            lower.append(yv - half)
            upper.append(yv + half)
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

    test_result, curve_fit, survival, error = None, None, None, None
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
        "testRan": test_ran,
        "error": error,
        "warnings": warnings,
        "durationMs": int((time.time() - started) * 1000),
    })

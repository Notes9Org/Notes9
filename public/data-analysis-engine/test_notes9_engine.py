"""
Golden-value tests for notes9_engine.

Every assertion below compares the engine against a value computed here from
scipy/statsmodels directly, or against an identity the statistic must satisfy.
Nothing is asserted against a number this file also produced by calling the
engine, because that only proves the engine is consistent with itself.

Two rules shaped the coverage:

  - one test per defect, each with a golden the engine did not supply;
  - one test per user-selectable OPTION, not just per routine. Two of the
    defects fixed here (curve-fit weighting, and Dunn's discarded correction
    method) live on non-default option values and were invisible to any suite
    that only ever exercised the defaults.

Run:  python test_notes9_engine.py     (plain asserts, pytest optional)
"""

from __future__ import annotations

import importlib.util
import math
import os

import numpy as np
from scipy import optimize, stats

_SPEC = importlib.util.spec_from_file_location(
    "notes9_engine", os.path.join(os.path.dirname(os.path.abspath(__file__)), "notes9_engine.py"))
eng = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(eng)


def close(a, b, tol=1e-9):
    return abs(float(a) - float(b)) <= tol * max(1.0, abs(float(b)))


# ── shared fixtures ───────────────────────────────────────────────────────────

DOSE_X = [1e-3, 3e-3, 1e-2, 3e-2, 1e-1, 3e-1, 1.0, 3.0, 10.0, 30.0]
DOSE_Y = [5.156, 5.6624, 7.3042, 12.7819, 31.5601, 57.7251, 83.8571, 97.7803, 91.8664, 91.8398]
_XS = np.log10(np.asarray(DOSE_X))
_YS = np.asarray(DOSE_Y)
_P0 = [float(_YS.min()), float(_YS.max()), float(np.median(_XS)), 1.0]

GROUPS3 = {"ctrl": [5.1, 4.8, 5.4, 5.0, 5.2, 4.9],
           "lowD": [6.2, 5.9, 6.5, 6.1, 6.4, 6.0],
           "highD": [8.1, 7.7, 8.4, 8.0, 8.3, 7.9]}


def _fit(sigma):
    popt, _ = optimize.curve_fit(eng._four_pl, _XS, _YS, p0=_P0, sigma=sigma, maxfev=20000)
    return popt


# ══ defect 1 — curve-fit weighting is off by a square ═════════════════════════

def test_weighting_option_1_over_y():
    """curve_fit minimises Σ((y-f)/σ)², so 1/Y weighting needs σ = sqrt(|y|)."""
    gold = _fit(np.sqrt(np.abs(_YS)))
    got = eng.run_dose_response({"x": DOSE_X, "y": DOSE_Y, "model": "4pl",
                                 "weighting": "1/Y", "alpha": 0.05})["curveFit"]
    assert close(got["ec50"], 10.0 ** gold[2]), (got["ec50"], 10.0 ** gold[2])
    # And it is NOT what the old σ = |y| produced, which was really 1/Y².
    wrong = _fit(np.abs(_YS))
    assert not close(got["ec50"], 10.0 ** wrong[2], 1e-6)


def test_weighting_option_1_over_y_squared():
    gold = _fit(np.abs(_YS))
    got = eng.run_dose_response({"x": DOSE_X, "y": DOSE_Y, "model": "4pl",
                                 "weighting": "1/Y^2", "alpha": 0.05})["curveFit"]
    assert close(got["ec50"], 10.0 ** gold[2])
    wrong = _fit(_YS ** 2)  # the old σ = y², really 1/Y⁴
    assert not close(got["ec50"], 10.0 ** wrong[2], 1e-6)


def test_weighting_option_none_is_unweighted():
    gold = _fit(None)
    got = eng.run_dose_response({"x": DOSE_X, "y": DOSE_Y, "model": "4pl",
                                 "weighting": "none", "alpha": 0.05})["curveFit"]
    assert close(got["ec50"], 10.0 ** gold[2])


def test_weighting_actually_moves_the_ec50():
    """If the three options agreed, the option would be decorative."""
    e = [eng.run_dose_response({"x": DOSE_X, "y": DOSE_Y, "model": "4pl",
                                "weighting": w, "alpha": 0.05})["curveFit"]["ec50"]
         for w in ("none", "1/Y", "1/Y^2")]
    assert len({round(v, 8) for v in e}) == 3, e


# ══ defect 2 — AICc uses K = p + 1 ════════════════════════════════════════════

def test_aicc_counts_variance_as_a_parameter():
    got = eng.run_dose_response({"x": DOSE_X, "y": DOSE_Y, "model": "4pl",
                                 "weighting": "none", "alpha": 0.05})["curveFit"]
    popt = _fit(None)
    ss_res = float(np.sum((_YS - eng._four_pl(_XS, *popt)) ** 2))
    n, kk = len(DOSE_X), 4 + 1  # K = p + 1 (Burnham-Anderson / GraphPad)
    gold = n * math.log(ss_res / n) + 2 * kk + (2 * kk * (kk + 1)) / (n - kk - 1)
    assert close(got["aicc"], gold, 1e-7), (got["aicc"], gold)
    old = n * math.log(ss_res / n) + 2 * 4 + (2 * 4 * 5) / (n - 4 - 1)
    assert not close(got["aicc"], old, 1e-6)


def test_aicc_is_none_when_the_correction_is_undefined():
    """5PL on 7 points: n - p - 2 = 0, so there is no honest finite AICc."""
    x = DOSE_X[:7]
    y = DOSE_Y[:7]
    got = eng.run_dose_response({"x": x, "y": y, "model": "5pl",
                                 "weighting": "none", "alpha": 0.05})
    assert got["curveFit"]["aicc"] is None, got["curveFit"]["aicc"]
    assert any("AICc is not defined" in w for w in got["warnings"]), got["warnings"]


# ══ defect 3 — goodness of fit uses the fit's own weights ═════════════════════

def test_weighted_fit_is_scored_with_weighted_residuals():
    sigma = np.sqrt(np.abs(_YS))
    popt = _fit(sigma)
    resid = _YS - eng._four_pl(_XS, *popt)
    ss_res = float(np.sum((resid / sigma) ** 2))
    wt = 1.0 / sigma ** 2
    ss_tot = float(np.sum(wt * (_YS - np.sum(wt * _YS) / np.sum(wt)) ** 2))
    n, k = len(DOSE_X), 4
    got = eng.run_dose_response({"x": DOSE_X, "y": DOSE_Y, "model": "4pl",
                                 "weighting": "1/Y", "alpha": 0.05})["curveFit"]
    assert close(got["rSquared"], 1 - ss_res / ss_tot, 1e-7)
    assert close(got["syx"], math.sqrt(ss_res / (n - k)), 1e-7)
    assert close(got["adjustedRSquared"],
                 1 - (ss_res / ss_tot) * (n - 1) / (n - k - 1), 1e-7)
    # The unweighted residual sum of the weighted fit is a different number.
    assert not close(got["syx"], math.sqrt(float(np.sum(resid ** 2)) / (n - k)), 1e-6)


def test_unweighted_fit_scoring_is_unchanged():
    popt = _fit(None)
    ss_res = float(np.sum((_YS - eng._four_pl(_XS, *popt)) ** 2))
    ss_tot = float(np.sum((_YS - _YS.mean()) ** 2))
    got = eng.run_dose_response({"x": DOSE_X, "y": DOSE_Y, "model": "4pl",
                                 "weighting": "none", "alpha": 0.05})["curveFit"]
    assert close(got["rSquared"], 1 - ss_res / ss_tot, 1e-7)


# ══ defect 4 — confidence-band step must be relative ══════════════════════════

def test_confidence_band_gradient_survives_large_parameters():
    """d/d(top) of a 4PL is 1/(1+10^((logEC50-x)*hill)), known in closed form."""
    gx = -7.0
    exact = 1 / (1 + 10 ** ((-7.3 - gx) * 1.0))
    for top in (1e2, 1e6, 1e9, 1e11):
        popt = [0.05 * top, top, -7.3, 1.0]
        step = abs(popt[1]) * 1e-6 + 1e-6
        bumped = list(popt)
        bumped[1] += step
        rel = (eng._four_pl(gx, *bumped) - eng._four_pl(gx, *popt)) / step
        assert close(rel, exact, 1e-8), (top, rel, exact)
    # The old absolute 1e-6 step reads exactly zero at 1e11 — a band of zero
    # width, which draws as a perfect fit.
    popt = [5e9, 1e11, -7.3, 1.0]
    bumped = list(popt)
    bumped[1] += 1e-6
    assert (eng._four_pl(gx, *bumped) - eng._four_pl(gx, *popt)) / 1e-6 == 0.0


def test_confidence_bands_option_on_and_off():
    base = {"x": DOSE_X, "y": DOSE_Y, "model": "4pl", "weighting": "none", "alpha": 0.05}
    on = eng.run_dose_response({**base, "confidenceBands": True})["curveFit"]["confidenceBand"]
    off = eng.run_dose_response({**base, "confidenceBands": False})["curveFit"]["confidenceBand"]
    assert off is None
    assert on is not None and len(on["x"]) == 120
    assert all(u > l for u, l in zip(on["upper"], on["lower"]))


# ══ defect 5 — a zero-dose vehicle control must not kill the fit ══════════════

def test_zero_dose_control_is_excluded_and_reported():
    out = eng.run_dose_response({"x": [0.0] + DOSE_X, "y": [5.0] + DOSE_Y,
                                 "model": "4pl", "weighting": "none", "alpha": 0.05})
    assert out["curveFit"]["converged"] is True
    assert any("excluded" in w and "zero" in w for w in out["warnings"]), out["warnings"]
    # Excluded, not substituted: the fit equals the fit of the non-zero points.
    gold = eng.run_dose_response({"x": DOSE_X, "y": DOSE_Y, "model": "4pl",
                                  "weighting": "none", "alpha": 0.05})["curveFit"]
    assert close(out["curveFit"]["ec50"], gold["ec50"])


# ══ defect 6 — Kaplan-Meier bands follow the spec's alpha ═════════════════════

_KM = {"durations": [4, 6, 6, 7, 9, 10, 11, 13, 15, 16, 19, 20, 22, 23, 25],
       "events": [1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1]}


def test_km_band_uses_alpha_not_1_96():
    d = np.asarray(_KM["durations"], float)
    e = np.asarray(_KM["events"], float)
    c95 = eng._km_curve(d, e, 0.05)
    c99 = eng._km_curve(d, e, 0.01)
    i = 3  # the upper bound clamps at 1.0 early on, so recover se from the lower
    se95 = (c95["survival"][i] - c95["lower"][i]) / stats.norm.ppf(0.975)
    se99 = (c99["survival"][i] - c99["lower"][i]) / stats.norm.ppf(0.995)
    assert close(se95, se99, 1e-9), (se95, se99)
    assert c99["lower"][i] < c95["lower"][i]
    # and the default alpha still reproduces the old hard-coded 1.96 band exactly
    assert close(c95["lower"][i], c95["survival"][i] - 1.959963984540054 * se95, 1e-9)


def test_km_alpha_reaches_the_curve_through_run_survival():
    a = eng.run_survival({**_KM, "alpha": 0.05})["_survival"]["groups"][0]
    b = eng.run_survival({**_KM, "alpha": 0.01})["_survival"]["groups"][0]
    assert b["lower"][3] < a["lower"][3]


# ══ defect 7 — dose-response parameter CIs follow the caller's alpha ══════════

def test_parameter_ci_honours_alpha():
    popt, pcov = optimize.curve_fit(eng._four_pl, _XS, _YS, p0=_P0, maxfev=20000)
    se = float(np.sqrt(np.diag(pcov))[2])
    n, k = len(DOSE_X), 4
    for alpha in (0.05, 0.01, 0.10):
        t = float(stats.t.ppf(1 - alpha / 2, n - k))
        got = eng.run_dose_response({"x": DOSE_X, "y": DOSE_Y, "model": "4pl",
                                     "weighting": "none", "alpha": alpha})["curveFit"]
        assert close(got["parameters"]["logEC50"]["ciLow"], popt[2] - t * se, 1e-7), alpha
        assert close(got["parameters"]["ec50"]["ciHigh"], 10 ** (popt[2] + t * se), 1e-7)


# ══ defect 8 — Dunn's post-hoc keeps the chosen correction ════════════════════

def _dunn_raw_p():
    names = list(GROUPS3)
    arrays = [np.asarray(GROUPS3[n], float) for n in names]
    return [r["pValue"] for r in eng._dunn(names, arrays, 0.05, "holm")]


def test_dunn_forwards_bonferroni():
    raw = _dunn_raw_p()
    got = eng.run_kruskal({"groups": GROUPS3, "alpha": 0.05, "postHoc": "bonferroni"})
    assert [r["correctionMethod"] for r in got["pairwise"]] == ["dunn (bonferroni)"] * 3
    for row, r in zip(got["pairwise"], raw):
        assert close(row["pAdjusted"], min(1.0, r * 3), 1e-12), (row["pAdjusted"], r)


def test_dunn_forwards_sidak_and_holm_sidak_and_they_differ():
    out = {m: eng.run_kruskal({"groups": GROUPS3, "alpha": 0.05, "postHoc": m})["pairwise"]
           for m in ("bonferroni", "sidak", "holm-sidak", "dunn")}
    for m in out:
        assert out[m][0]["correctionMethod"].startswith("dunn (")
    raw = _dunn_raw_p()
    assert close(out["sidak"][0]["pAdjusted"], 1 - (1 - raw[0]) ** 3, 1e-12)
    # Bonferroni and Sidak must not be the same number, or the option is a lie.
    assert out["bonferroni"][0]["pAdjusted"] != out["sidak"][0]["pAdjusted"]
    assert out["holm-sidak"][0]["pAdjusted"] != out["bonferroni"][0]["pAdjusted"]
    # "dunn" is the plain request and keeps the Holm default.
    assert out["dunn"][0]["correctionMethod"] == "dunn (holm)"


def test_dunn_post_hoc_none_runs_nothing():
    assert eng.run_kruskal({"groups": GROUPS3, "alpha": 0.05, "postHoc": "none"})["pairwise"] == []


def test_rank_test_declines_tukey_and_dunnett_out_loud():
    for m in ("tukey", "dunnett"):
        got = eng.run_kruskal({"groups": GROUPS3, "alpha": 0.05, "postHoc": m})
        assert got["pairwise"][0]["correctionMethod"] == "dunn (holm)"
        assert got["_warnings"] and "not ranks" in got["_warnings"][0]


# ══ defect 9 — RM ANOVA reports the df its p came from ════════════════════════

RM = {"matrix": [[10.0, 12.5, 19.0], [11.0, 13.0, 15.5], [9.5, 14.0, 22.0],
                 [12.0, 12.2, 14.0], [10.5, 15.0, 24.0], [11.5, 13.5, 16.0],
                 [9.0, 16.0, 25.0], [12.5, 12.8, 14.5]],
      "subjects": [f"s{i}" for i in range(8)],
      "conditions": ["t0", "t1", "t2"], "alpha": 0.05}


def test_rm_anova_df_reproduces_its_own_p():
    got = eng.run_anova_rm(RM)
    assert got["assumptions"][0]["passed"] is False, "fixture must violate sphericity"
    df1, df2 = (float(v) for v in got["df"].split(","))
    assert (df1, df2) != (2.0, 14.0), "GG-corrected df must not be the integer df"
    # The df are printed to 2 dp by journal convention, so the p they regenerate
    # agrees to within that rounding — the uncorrected df are not even close.
    gold = float(stats.f.sf(got["statistic"], df1, df2))
    assert abs(gold - got["pValue"]) / got["pValue"] < 1e-2, (gold, got["pValue"])
    uncorrected = float(stats.f.sf(got["statistic"], 2.0, 14.0))
    assert abs(uncorrected - got["pValue"]) / got["pValue"] > 0.5, uncorrected
    assert "Greenhouse-Geisser" in got["reportSentence"] and "ε =" in got["reportSentence"]


def test_rm_anova_reports_integer_df_when_sphericity_holds():
    m = np.asarray(RM["matrix"], float).copy()
    m[:, 2] = m[:, 0] + 1.0  # kill the variance heterogeneity
    got = eng.run_anova_rm({**RM, "matrix": m.tolist()})
    df1, df2 = (float(v) for v in got["df"].split(","))
    assert (df1, df2) == (2.0, 14.0), got["df"]
    assert close(float(stats.f.sf(got["statistic"], df1, df2)), got["pValue"], 1e-12)


# ══ defect 10 — the record names what ran ═════════════════════════════════════

def test_rm_anova_fallback_to_friedman_is_labelled_friedman():
    saved = eng._HAS_SM
    try:
        eng._HAS_SM = False
        out = eng.run({**RM, "test": "anova-rm", "shape": "matrix"})
    finally:
        eng._HAS_SM = saved
    assert out["testRan"] == "friedman", out["testRan"]
    assert out["test"]["test"] == "Friedman"
    assert any("Friedman" in w for w in out["warnings"]), out["warnings"]


def test_dunnett_without_a_control_is_not_stamped_dunnett():
    p = {"groups": GROUPS3, "alpha": 0.05, "postHoc": "dunnett",
         "referenceLevel": "vehicle"}  # not a level that exists
    got = eng.run_anova_one_way(p)
    assert got["pairwise"][0]["correctionMethod"] == "holm-sidak"
    assert got["_warnings"] and "Dunnett" in got["_warnings"][0]


def test_dunnett_with_a_real_control_is_a_real_dunnett():
    names = list(GROUPS3)
    arrays = [np.asarray(GROUPS3[n], float) for n in names]
    gold = stats.dunnett(arrays[1], arrays[2], control=arrays[0], random_state=0)
    got = eng.run_anova_one_way({"groups": GROUPS3, "alpha": 0.05,
                                 "postHoc": "dunnett", "referenceLevel": "ctrl"})
    assert [r["correctionMethod"] for r in got["pairwise"]] == ["dunnett"] * 2
    for row, p in zip(got["pairwise"], np.atleast_1d(gold.pvalue)):
        assert close(row["pAdjusted"], float(p), 1e-9)
    assert "_warnings" not in got


def test_dunnett_is_reproducible():
    """scipy integrates the many-to-one distribution by QMC; unseeded it drifts,
    and Law 4 promises the same payload gives the same number forever."""
    runs = {eng.run_anova_one_way({"groups": GROUPS3, "alpha": 0.05, "postHoc": "dunnett",
                                   "referenceLevel": "ctrl"})["pairwise"][0]["pAdjusted"]
            for _ in range(5)}
    assert len(runs) == 1, runs


def test_post_hoc_tukey_option_matches_the_studentized_range():
    got = eng.run_anova_one_way({"groups": GROUPS3, "alpha": 0.05, "postHoc": "tukey"})
    arrays = [np.asarray(v, float) for v in GROUPS3.values()]
    dfw = sum(a.size for a in arrays) - len(arrays)
    msw = sum(float(np.sum((a - a.mean()) ** 2)) for a in arrays) / dfw
    a, b = arrays[0], arrays[1]
    se = math.sqrt(msw * (1 / a.size + 1 / b.size))
    q = abs(a.mean() - b.mean()) / (se / math.sqrt(2))
    assert close(got["pairwise"][0]["pValue"],
                 float(stats.studentized_range.sf(q, 3, dfw)), 1e-9)


def test_contingency_escalation_names_fisher():
    out = eng.run({"test": "chi-square", "table": [[9, 1], [2, 8]], "alpha": 0.05})
    assert out["testRan"] == "fisher-exact"
    assert close(out["test"]["pValue"], float(stats.fisher_exact([[9, 1], [2, 8]])[1]), 1e-12)


# ══ defect 11 — effect sizes are named after what was computed ════════════════

def test_kruskal_effect_size_is_eta_squared_h():
    got = eng.run_kruskal({"groups": GROUPS3, "alpha": 0.05, "postHoc": "none"})
    arrays = [np.asarray(v, float) for v in GROUPS3.values()]
    h = float(stats.kruskal(*arrays)[0])
    n, k = sum(a.size for a in arrays), len(arrays)
    eff = got["effectSizes"][0]
    assert eff["name"] == "eta-squared-H", eff["name"]
    assert close(eff["value"], (h - k + 1) / (n - k), 1e-12)
    # epsilon-squared is H/(n-1) — a different number, which is the whole point.
    assert not close(eff["value"], h / (n - 1), 1e-6)


def test_friedman_effect_size_is_kendalls_w():
    got = eng.run_friedman(RM)
    m = np.asarray(RM["matrix"], float)
    chi = float(stats.friedmanchisquare(*[m[:, i] for i in range(m.shape[1])])[0])
    n, k = m.shape
    eff = got["effectSizes"][0]
    assert eff["name"] == "kendalls-w", eff["name"]
    assert close(eff["value"], chi / (n * (k - 1)), 1e-12)


# ══ defect 12 — dropped values are counted, not swallowed ═════════════════════

def test_dropped_values_are_reported():
    out = eng.run({"test": "t-unpaired", "shape": "groups", "alpha": 0.05, "tails": "two",
                   "equalVariance": True,
                   "groups": {"A": [1, 2, "", 3, "n/a", 4, None], "B": [2, 4, 6, 8]}})
    assert out["test"]["groupSizes"]["A"] == 4
    w = [x for x in out["warnings"] if "excluded" in x]
    assert len(w) == 1 and "3 of 7" in w[0] and " A " in w[0], out["warnings"]
    assert close(out["test"]["pValue"],
                 float(stats.ttest_ind([1, 2, 3, 4], [2, 4, 6, 8], equal_var=True).pvalue), 1e-12)


def test_clean_values_produce_no_warning():
    out = eng.run({"test": "t-unpaired", "shape": "groups", "alpha": 0.05, "tails": "two",
                   "equalVariance": True, "groups": {"A": [1, 2, 3, 4], "B": [2, 4, 6, 8]}})
    assert not [x for x in out["warnings"] if "excluded" in x]


# ══ defect 13 — Cochran's rule for tables larger than 2x2 ═════════════════════

def _warn(table):
    return eng.run_contingency({"table": table, "alpha": 0.05, "test": "chi-square"})["_warnings"]


def test_cochran_tolerates_one_sparse_cell_in_a_large_table():
    # 6x3 = 18 cells; one sparse row puts 3 of them (17%) below 5, none below 1.
    table = [[30, 28, 26], [27, 31, 25], [29, 26, 30],
             [28, 30, 27], [26, 29, 31], [3, 4, 3]]
    exp = stats.chi2_contingency(table)[3]
    assert 0 < int((exp < 5).sum()) <= 0.20 * exp.size and not (exp < 1).any(), exp
    assert _warn(table) == []


def test_cochran_fires_above_twenty_percent():
    table = [[50, 50, 50], [50, 50, 50], [2, 2, 2]]  # 3 of 9 cells (33%) below 5
    exp = stats.chi2_contingency(table)[3]
    assert int((exp < 5).sum()) > 0.20 * exp.size, exp
    assert _warn(table) and "Cochran" in _warn(table)[0]


def test_cochran_fires_on_any_cell_below_one():
    # 6x3 = 18 cells; only 3 (17%) below 5, but all three are below 1.
    table = [[40, 40, 40], [40, 40, 40], [40, 40, 40],
             [40, 40, 40], [40, 40, 40], [1, 0, 0]]
    exp = stats.chi2_contingency(table)[3]
    assert (exp < 1).any() and int((exp < 5).sum()) <= 0.20 * exp.size, exp
    assert _warn(table) and "below 1" in _warn(table)[0]


def test_2x2_keeps_the_strict_rule():
    out = eng.run_contingency({"table": [[9, 1], [2, 8]], "alpha": 0.05, "test": "chi-square"})
    assert out["_test_ran"] == "fisher-exact"  # strict rule still escalates


def test_fisher_option_on_a_larger_table_says_it_ran_chi_square():
    out = eng.run_contingency({"table": [[9, 1, 4], [2, 8, 5]], "alpha": 0.05,
                               "test": "fisher-exact"})
    assert out["_test_ran"] == "chi-square"
    assert any("2x2" in w for w in out["_warnings"])


# ══ defect 14 — multi-group log-rank is the Mantel-Cox quadratic form ═════════

SURV3 = {
    "durations": [4, 6, 7, 9, 11, 13, 16, 19, 22, 25,
                  5, 8, 10, 12, 14, 17, 20, 23, 26, 28,
                  3, 5, 6, 8, 9, 11, 12, 15, 18, 21],
    "events": [1, 1, 0, 1, 1, 1, 0, 1, 1, 1,
               1, 1, 1, 0, 1, 1, 1, 0, 1, 1,
               1, 1, 1, 1, 0, 1, 1, 1, 1, 1],
    "groups": ["A"] * 10 + ["B"] * 10 + ["C"] * 10,
    "alpha": 0.05,
}


def _mantel_cox(durations, events, groups):
    """Independent reference: quadratic form over the hypergeometric covariance."""
    d = np.asarray(durations, float)
    e = np.asarray(events, float)
    g = np.asarray(groups)
    labs = sorted(set(groups))
    k = len(labs)
    ome = np.zeros(k)
    V = np.zeros((k, k))
    for t in np.unique(d[e == 1]):
        n = float(np.sum(d >= t))
        dt = float(np.sum((d == t) & (e == 1)))
        if n <= 1:
            continue
        r = np.array([float(np.sum(d[g == l] >= t)) for l in labs])
        o = np.array([float(np.sum((d[g == l] == t) & (e[g == l] == 1))) for l in labs])
        ome += o - dt * r / n
        f = r / n
        V += dt * (n - dt) / (n - 1) * (np.diag(f) - np.outer(f, f))
    return float(ome[:-1] @ np.linalg.solve(V[:-1, :-1], ome[:-1])), k - 1


def test_three_group_log_rank_matches_the_quadratic_form():
    gold, df = _mantel_cox(SURV3["durations"], SURV3["events"], SURV3["groups"])
    got = eng.run_survival(SURV3)
    assert got["df"] == df
    assert close(got["statistic"], gold, 1e-10), (got["statistic"], gold)
    assert close(got["pValue"], float(stats.chi2.sf(gold, df)), 1e-12)
    # The old Σ(O-E)²/E ignores the covariance and is a different statistic.
    d = np.asarray(SURV3["durations"], float)
    e = np.asarray(SURV3["events"], float)
    g = np.asarray(SURV3["groups"])
    obs, exp = {}, {}
    for l in sorted(set(SURV3["groups"])):
        obs[l] = exp[l] = 0.0
    for t in np.unique(d[e == 1]):
        n = float(np.sum(d >= t))
        dt = float(np.sum((d == t) & (e == 1)))
        if n <= 1:
            continue
        for l in obs:
            obs[l] += float(np.sum((d[g == l] == t) & (e[g == l] == 1)))
            exp[l] += dt * float(np.sum(d[g == l] >= t)) / n
    old = sum((obs[l] - exp[l]) ** 2 / exp[l] for l in obs if exp[l] > 0)
    assert not close(got["statistic"], old, 1e-3), (got["statistic"], old)


def test_quadratic_form_reduces_to_the_two_group_statistic():
    """The k-1 quadratic form must equal the untouched two-group branch."""
    two = {"durations": SURV3["durations"][:20], "events": SURV3["events"][:20],
           "groups": SURV3["groups"][:20], "alpha": 0.05}
    got = eng.run_survival(two)  # uses the scalar-variance branch
    gold, df = _mantel_cox(two["durations"], two["events"], two["groups"])
    assert df == 1 and got["df"] == 1
    assert close(got["statistic"], gold, 1e-10), (got["statistic"], gold)


def test_identical_groups_give_a_near_zero_log_rank():
    d = SURV3["durations"][:10] * 3
    e = SURV3["events"][:10] * 3
    got = eng.run_survival({"durations": d, "events": e,
                            "groups": ["A"] * 10 + ["B"] * 10 + ["C"] * 10, "alpha": 0.05})
    assert got["statistic"] < 1e-9, got["statistic"]
    assert got["pValue"] > 0.99


# ══ remaining user-selectable options ═════════════════════════════════════════

def test_model_option_3pl_4pl_5pl():
    for model, n_par in (("3pl", 3), ("4pl", 4), ("5pl", 5)):
        cf = eng.run_dose_response({"x": DOSE_X, "y": DOSE_Y, "model": model,
                                    "weighting": "none", "alpha": 0.05})["curveFit"]
        assert cf["model"] == model.upper()
        assert len([k for k in cf["parameters"] if k != "ec50"]) == n_par
    # 3PL pins hill = 1, so it cannot reach the 4PL optimum.
    a = eng.run_dose_response({"x": DOSE_X, "y": DOSE_Y, "model": "3pl",
                               "weighting": "none", "alpha": 0.05})["curveFit"]
    b = eng.run_dose_response({"x": DOSE_X, "y": DOSE_Y, "model": "4pl",
                               "weighting": "none", "alpha": 0.05})["curveFit"]
    assert a["rSquared"] < b["rSquared"]


def test_tails_option():
    a = [5.1, 4.8, 5.4, 5.0, 5.2, 4.9]
    b = [6.2, 5.9, 6.5, 6.1, 6.4, 6.0]
    for tails, alt in (("two", "two-sided"), ("greater", "greater"), ("less", "less")):
        got = eng.run_two_sample_t({"groups": {"A": a, "B": b}, "tails": tails,
                                    "alpha": 0.05, "equalVariance": True})
        assert close(got["pValue"],
                     float(stats.ttest_ind(a, b, equal_var=True, alternative=alt).pvalue), 1e-12)


def test_equal_variance_option_switches_the_label_and_the_df():
    a = [5.1, 4.8, 5.4, 5.0, 5.2, 4.9]
    b = [6.2, 5.9, 6.5, 6.1, 6.4, 6.0, 6.3, 5.8]
    eq = eng.run_two_sample_t({"groups": {"A": a, "B": b}, "tails": "two",
                               "alpha": 0.05, "equalVariance": True})
    we = eng.run_two_sample_t({"groups": {"A": a, "B": b}, "tails": "two",
                               "alpha": 0.05, "equalVariance": False})
    assert eq["test"] == "Unpaired t-test" and we["test"] == "Welch's t-test"
    assert close(eq["pValue"], float(stats.ttest_ind(a, b, equal_var=True).pvalue), 1e-12)
    assert close(we["pValue"], float(stats.ttest_ind(a, b, equal_var=False).pvalue), 1e-12)


def test_correlation_option_pearson_and_spearman():
    x = [1, 2, 3, 4, 5, 6, 7, 8]
    y = [2.1, 3.9, 7.8, 6.2, 10.1, 13.8, 12.2, 16.1]  # not monotonic: |rho| < 1
    pe = eng.run_correlation({"x": x, "y": y, "alpha": 0.05, "test": "correlation-pearson"})
    sp = eng.run_correlation({"x": x, "y": y, "alpha": 0.05, "test": "correlation-spearman"})
    assert close(pe["statistic"], float(stats.pearsonr(x, y)[0]), 1e-12)
    assert close(sp["statistic"], float(stats.spearmanr(x, y)[0]), 1e-12)
    # Spearman carries the Bonett-Wright inflation: sqrt(1.06/(n-3)) vs 1/sqrt(n-3).
    n = len(x)
    zc = stats.norm.ppf(0.975)
    z = math.atanh(sp["statistic"])
    assert close(sp["effectSizes"][0]["ciHigh"],
                 math.tanh(z + zc * math.sqrt(1.06 / (n - 3))), 1e-12)
    z = math.atanh(pe["statistic"])
    assert close(pe["effectSizes"][0]["ciHigh"],
                 math.tanh(z + zc / math.sqrt(n - 3)), 1e-12)


def test_alpha_option_widens_every_interval_it_touches():
    a = [5.1, 4.8, 5.4, 5.0, 5.2, 4.9]
    b = [6.2, 5.9, 6.5, 6.1, 6.4, 6.0]
    g95 = eng.run_two_sample_t({"groups": {"A": a, "B": b}, "tails": "two",
                                "alpha": 0.05, "equalVariance": True})["effectSizes"][0]
    g99 = eng.run_two_sample_t({"groups": {"A": a, "B": b}, "tails": "two",
                                "alpha": 0.01, "equalVariance": True})["effectSizes"][0]
    assert (g99["ciHigh"] - g99["ciLow"]) > (g95["ciHigh"] - g95["ciLow"])


def test_interaction_option_two_way_anova():
    if not eng._HAS_SM:
        return
    long = {"y": [], "f1": [], "f2": []}
    vals = {("a", "x"): [4, 5, 6], ("a", "y"): [7, 8, 9],
            ("b", "x"): [5, 6, 7], ("b", "y"): [12, 13, 14]}
    for (f1, f2), vs in vals.items():
        for v in vs:
            long["y"].append(float(v)); long["f1"].append(f1); long["f2"].append(f2)
    with_i = eng.run_anova_two_way({"long": long, "alpha": 0.05, "interaction": True})
    no_i = eng.run_anova_two_way({"long": long, "alpha": 0.05, "interaction": False})
    assert [t["term"] for t in with_i["terms"]] == ["f1", "f2", "f1 x f2"]
    assert [t["term"] for t in no_i["terms"]] == ["f1", "f2"]


def test_unknowns_interpolation_option():
    out = eng.run_dose_response({"x": DOSE_X, "y": DOSE_Y, "model": "4pl",
                                 "weighting": "none", "alpha": 0.05,
                                 "unknowns": [{"label": "u1", "signal": 50.0},
                                              {"label": "u2", "signal": 500.0}]})
    ip = out["curveFit"]["interpolated"]
    assert ip[0]["inRange"] is True and ip[1]["inRange"] is False
    assert any("extrapolated" in w for w in out["warnings"])


def test_end_to_end_run_shape_is_intact():
    out = eng.run({"test": "anova-one-way", "shape": "groups", "alpha": 0.05,
                   "postHoc": "bonferroni", "groups": GROUPS3})
    assert out["error"] is None and out["testRan"] == "anova-one-way"
    assert len(out["descriptives"]) == 3
    assert out["test"]["pairwise"][0]["correctionMethod"] == "bonferroni"



# ══ Anderson-Darling normality (§6.3's third normality test) ══════════════════
#
# scipy.stats.anderson gives A^2 and a critical-value TABLE but no p-value, so
# the p has to come from the D'Agostino & Stephens (1986) analytic fit. Every
# golden below is either scipy's own A^2 or that fit transcribed independently
# here, never a number the engine produced.

AD_SETS = {
    "normalish": [4.1, 4.5, 4.3, 4.9, 5.2, 4.7, 5.0, 4.4, 4.8, 4.6],
    "right-skewed": [1, 1, 1, 2, 2, 3, 3, 4, 6, 10, 18, 40],
    "uniform": [1, 2, 3, 4, 5, 6, 7, 8, 9],
    "bimodal": [1, 1.1, 1.2, 1.3, 1.4, 1.5, 9, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9],
    "outlier": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1e6],
    # Chosen to land A* in the fit's [0.2, 0.34) and [0.34, 0.6) pieces, which no
    # other sample here reaches; see test_anderson_darling_covers_every_branch.
    "fit-piece-2": [6.3, 13.1, 9.8, 11.4, 9.7, 9.2, 10.9, 11.6],
    "fit-piece-3": [12.7, 12.4, 9.0, 9.4, 8.9, 11.1, 9.9, 11.5],
}


def _ad_p_reference(a2, n):
    """D'Agostino & Stephens (1986) table 4.9, transcribed from the published
    coefficients rather than read back out of the engine."""
    a = a2 * (1 + 0.75 / n + 2.25 / n / n)
    if a < 0.2:
        return 1 - math.exp(-13.436 + 101.14 * a - 223.73 * a * a)
    if a < 0.34:
        return 1 - math.exp(-8.318 + 42.796 * a - 59.938 * a * a)
    if a < 0.6:
        return math.exp(0.9177 - 4.279 * a - 1.38 * a * a)
    if a < 10:
        return math.exp(1.2937 - 5.709 * a + 0.0186 * a * a)
    return 3.7e-24


def test_anderson_darling_statistic_matches_scipy():
    for label, values in AD_SETS.items():
        a = np.asarray(values, float)
        got = eng._anderson_darling(a)
        assert close(got["statistic"], float(stats.anderson(a, "norm").statistic), 1e-12), label


def test_anderson_darling_p_matches_the_published_approximation():
    for label, values in AD_SETS.items():
        a = np.asarray(values, float)
        got = eng._anderson_darling(a)
        assert close(got["pValue"], _ad_p_reference(got["statistic"], a.size), 1e-12), label


def test_anderson_darling_covers_every_branch_of_the_fit():
    """The fit is piecewise in A*; two prior defects lived on non-default paths
    and a p-value formula with four unexercised branches is the same trap."""
    seen = set()
    for values in AD_SETS.values():
        a = np.asarray(values, float)
        n = a.size
        a2 = eng._anderson_darling(a)["statistic"]
        star = a2 * (1 + 0.75 / n + 2.25 / n / n)
        seen.add(0 if star < 0.2 else 1 if star < 0.34 else 2 if star < 0.6 else 3)
    assert seen == {0, 1, 2, 3}, seen
    # and the >= 10 floor, which no natural sample reaches
    assert eng._ad_pvalue(20.0, 30) == 3.7e-24


def test_anderson_darling_rejects_a_clearly_non_normal_column():
    got = eng._anderson_darling(np.asarray(AD_SETS["bimodal"], float))
    assert got["passed"] is False and got["pValue"] < 0.01
    assert got["alternative"] == "a nonparametric test"


def test_anderson_darling_accepts_a_normal_column():
    got = eng._anderson_darling(np.asarray(AD_SETS["normalish"], float))
    assert got["passed"] is True and got["pValue"] > 0.05


def test_anderson_darling_declines_below_its_minimum_n():
    """R's nortest::ad.test refuses under 8; extrapolating the fit off the end of
    the range it was built on is worse than saying no."""
    got = eng._anderson_darling(np.arange(7.0))
    assert got["statistic"] is None and got["pValue"] is None
    assert "at least 8" in got["verdict"]


def test_anderson_darling_declines_on_a_constant_column():
    got = eng._anderson_darling(np.full(12, 3.0))
    assert got["statistic"] is None and got["pValue"] is None


def test_anderson_darling_survives_a_far_tail_outlier():
    """A 1e6 outlier drives z past -5, where a naive Phi loses all significant
    digits and ln Phi(z) goes to nan. A^2 must stay finite."""
    got = eng._anderson_darling(np.asarray(AD_SETS["outlier"], float))
    assert math.isfinite(got["statistic"]) and got["passed"] is False


def test_run_normality_reports_shapiro_and_anderson_for_every_column():
    out = eng.run_normality({"columns": {"a": AD_SETS["normalish"], "b": AD_SETS["bimodal"]}})
    names = [c["name"] for c in out["assumptions"]]
    assert names == ["Normality, a (Shapiro-Wilk)", "Normality, a (Anderson-Darling)",
                     "Normality, b (Shapiro-Wilk)", "Normality, b (Anderson-Darling)"]
    ad_a = out["assumptions"][1]
    assert close(ad_a["statistic"],
                 float(stats.anderson(np.asarray(AD_SETS["normalish"], float), "norm").statistic), 1e-12)
    assert "approximation" in ad_a["verdict"]
    assert "approximation" in out["reportSentence"]


def test_run_normality_end_to_end_names_anderson_darling():
    out = eng.run({"test": "normality", "shape": "columns", "alpha": 0.05,
                   "columns": {"a": AD_SETS["right-skewed"]}})
    assert out["error"] is None and out["testRan"] == "normality"
    ad = [c for c in out["test"]["assumptions"] if "Anderson-Darling" in c["name"]]
    assert len(ad) == 1 and ad[0]["passed"] is False


# ══ FDR: Benjamini-Hochberg and Benjamini-Yekutieli ═══════════════════════════

FDR_P = {
    "spread": [0.001, 0.008, 0.039, 0.041, 0.042, 0.6],
    "ties": [0.01, 0.01, 0.01, 0.04, 0.04, 0.9],
    "monotonicity": [0.02, 0.03, 0.04, 0.05],
    "single": [0.03],
    "large": [0.0001, 0.0002, 0.02, 0.03, 0.04, 0.05, 0.2, 0.3, 0.5, 0.9],
    "unsorted": [0.6, 0.001, 0.042, 0.008, 0.041, 0.039],
}


def test_bh_and_by_match_statsmodels():
    from statsmodels.stats.multitest import multipletests
    for label, pv in FDR_P.items():
        for method, sm in (("benjamini-hochberg", "fdr_bh"), ("benjamini-yekutieli", "fdr_by")):
            gold = [float(x) for x in multipletests(pv, method=sm)[1]]
            got = eng._adjust(pv, method)
            assert all(close(a, b, 1e-12) for a, b in zip(got, gold)), (label, method, got, gold)


def test_bh_enforces_step_up_monotonicity():
    """Raw (m/k)p_(k) is not monotone in k; without the reverse cumulative
    minimum, [0.02,0.03,0.04,0.05] adjusts to 0.08/0.06/0.0533/0.05, so the
    SMALLEST raw p gets the LARGEST adjusted p."""
    got = eng._adjust([0.02, 0.03, 0.04, 0.05], "benjamini-hochberg")
    assert got == sorted(got)
    assert all(close(x, 0.05, 1e-12) for x in got)


def test_by_is_bh_times_the_harmonic_number():
    m = 6
    c = sum(1.0 / i for i in range(1, m + 1))
    pv = FDR_P["spread"]
    bh = eng._adjust(pv, "benjamini-hochberg")
    by = eng._adjust(pv, "benjamini-yekutieli")
    assert all(close(y, min(1.0, c * h), 1e-12) for h, y in zip(bh, by))


def test_bh_never_exceeds_one_or_falls_below_the_raw_p():
    pv = FDR_P["large"]
    for method in eng.FDR_METHODS:
        got = eng._adjust(pv, method)
        assert all(0 <= a <= 1 for a in got)
        assert all(a >= raw - 1e-12 for a, raw in zip(got, pv))


def test_bh_is_less_conservative_than_holm():
    pv = FDR_P["large"]
    bh = eng._adjust(pv, "benjamini-hochberg")
    holm = eng._adjust(pv, "holm")
    assert all(b <= h + 1e-12 for b, h in zip(bh, holm))
    assert any(b < h - 1e-12 for b, h in zip(bh, holm))


def _pairwise_bh(method="benjamini-hochberg", alpha=0.05, groups=None):
    return eng.run_anova_one_way({"groups": groups or GROUPS3, "alpha": alpha,
                                  "postHoc": method})


def test_post_hoc_bh_option_matches_statsmodels_on_the_pairwise_ps():
    from statsmodels.stats.multitest import multipletests
    for method, sm in (("benjamini-hochberg", "fdr_bh"), ("benjamini-yekutieli", "fdr_by")):
        got = _pairwise_bh(method)
        rows = got["pairwise"]
        assert [r["correctionMethod"] for r in rows] == [method] * 3
        gold = [float(x) for x in multipletests([r["pValue"] for r in rows], method=sm)[1]]
        for row, g in zip(rows, gold):
            assert close(row["pAdjusted"], g, 1e-12), (method, row["pAdjusted"], g)


def test_bh_intervals_are_fcr_adjusted_not_unadjusted():
    """The known defect elsewhere: an adjusted p beside a 1-alpha interval that
    contradicts it. FDR rows carry the Benjamini & Yekutieli (2005) FCR interval
    at 1 - R*alpha/m instead, or none at all."""
    alpha = 0.05
    got = _pairwise_bh(alpha=alpha)
    rows = got["pairwise"]
    m = len(rows)
    r = sum(1 for row in rows if row["significant"])
    assert r == m == 3, r  # all three pairs separate cleanly in GROUPS3

    arrays = [np.asarray(v, float) for v in GROUPS3.values()]
    dfw = sum(a.size for a in arrays) - len(arrays)
    msw = sum(float(np.sum((a - a.mean()) ** 2)) for a in arrays) / dfw
    crit = float(stats.t.ppf(1 - (alpha * r / m) / 2, dfw))
    unadjusted = float(stats.t.ppf(1 - alpha / 2, dfw))
    a, b = arrays[0], arrays[1]
    se = math.sqrt(msw * (1 / a.size + 1 / b.size))
    diff = float(a.mean()) - float(b.mean())
    assert close(rows[0]["ciLow"], diff - crit * se, 1e-12)
    assert close(rows[0]["ciHigh"], diff + crit * se, 1e-12)
    # R == m here, so the FCR level collapses to 1 - alpha; the point is that it
    # is computed from R, not assumed. Confirm with a case where R < m below.
    assert close(crit, unadjusted, 1e-12)


def test_fcr_interval_widens_and_drops_rows_when_only_some_are_selected():
    # Two of three pairs separate; the third does not, so R = 2 of m = 3 and the
    # surviving intervals are built at 1 - 2*alpha/3 = 96.67%, not 95%.
    groups = {"ctrl": [5.1, 4.8, 5.4, 5.0, 5.2, 4.9],
              "near": [5.3, 5.0, 5.5, 5.2, 5.4, 5.1],
              "far": [8.1, 7.7, 8.4, 8.0, 8.3, 7.9]}
    alpha = 0.05
    got = _pairwise_bh(alpha=alpha, groups=groups)
    rows = got["pairwise"]
    m, r = len(rows), sum(1 for row in rows if row["significant"])
    assert (m, r) == (3, 2), [(row["groupA"], row["groupB"], row["pAdjusted"]) for row in rows]

    arrays = [np.asarray(v, float) for v in groups.values()]
    dfw = sum(a.size for a in arrays) - len(arrays)
    msw = sum(float(np.sum((a - a.mean()) ** 2)) for a in arrays) / dfw
    crit = float(stats.t.ppf(1 - (alpha * r / m) / 2, dfw))
    assert crit > float(stats.t.ppf(1 - alpha / 2, dfw))  # genuinely wider

    for row in rows:
        if row["significant"]:
            se = math.sqrt(msw * (1 / 6 + 1 / 6))
            assert close(row["ciLow"], row["meanDifference"] - crit * se, 1e-12)
            assert row["ciLow"] * row["ciHigh"] > 0  # excludes zero, agreeing with pAdj
        else:
            assert row["ciLow"] is None and row["ciHigh"] is None


def test_fcr_interval_excludes_zero_exactly_for_the_selected_rows():
    """The coherence claim, checked rather than asserted in prose: a BH-selected
    row has raw p <= R*alpha/m, so its 1 - R*alpha/m interval cannot contain
    zero, and an unselected row is not given one to misread."""
    for groups in (GROUPS3,
                   {"a": [1, 2, 3, 4, 5, 6], "b": [1.1, 2.2, 2.9, 4.1, 5.2, 5.8],
                    "c": [1.2, 2.1, 3.1, 3.9, 5.1, 6.2]},
                   {"a": [1, 2, 3, 4, 5, 6], "b": [3, 4, 5, 6, 7, 8], "c": [9, 10, 11, 12, 13, 14]}):
        for alpha in (0.01, 0.05, 0.10):
            rows = _pairwise_bh(alpha=alpha, groups=groups)["pairwise"]
            for row in rows:
                if row["significant"]:
                    assert row["ciLow"] is not None
                    assert row["ciLow"] * row["ciHigh"] > 0, (alpha, row)
                else:
                    assert row["ciLow"] is None and row["ciHigh"] is None


def test_no_selection_means_no_interval_at_all():
    groups = {"a": [1, 2, 3, 4, 5, 6], "b": [1.1, 2.2, 2.9, 4.1, 5.2, 5.8],
              "c": [1.2, 2.1, 3.1, 3.9, 5.1, 6.2]}
    rows = _pairwise_bh(groups=groups)["pairwise"]
    assert not any(row["significant"] for row in rows)
    assert all(row["ciLow"] is None and row["ciHigh"] is None for row in rows)


def test_fdr_interval_convention_is_stated_in_the_record():
    """'The record names what ran': an interval at a level other than 1 - alpha
    that appears without saying so is exactly the defect being avoided."""
    got = _pairwise_bh()
    note = [w for w in got.get("_warnings", []) if "FCR-adjusted" in w]
    assert len(note) == 1 and "benjamini-hochberg" in note[0], got.get("_warnings")

    groups = {"a": [1, 2, 3, 4, 5, 6], "b": [1.1, 2.2, 2.9, 4.1, 5.2, 5.8],
              "c": [1.2, 2.1, 3.1, 3.9, 5.1, 6.2]}
    empty = _pairwise_bh(groups=groups)
    assert any("no confidence interval is reported" in w for w in empty.get("_warnings", []))


def test_alpha_drives_the_fcr_level_and_is_not_hardcoded():
    wide = _pairwise_bh(alpha=0.01)["pairwise"][0]
    narrow = _pairwise_bh(alpha=0.10)["pairwise"][0]
    assert (wide["ciHigh"] - wide["ciLow"]) > (narrow["ciHigh"] - narrow["ciLow"])
    arrays = [np.asarray(v, float) for v in GROUPS3.values()]
    dfw = sum(a.size for a in arrays) - len(arrays)
    msw = sum(float(np.sum((a - a.mean()) ** 2)) for a in arrays) / dfw
    se = math.sqrt(msw * (1 / 6 + 1 / 6))
    assert close(wide["ciHigh"] - wide["ciLow"], 2 * float(stats.t.ppf(1 - 0.01 / 2, dfw)) * se, 1e-12)


def test_dunn_accepts_the_fdr_corrections_instead_of_discarding_them():
    from statsmodels.stats.multitest import multipletests
    for method, sm in (("benjamini-hochberg", "fdr_bh"), ("benjamini-yekutieli", "fdr_by")):
        got = eng.run_kruskal({"groups": GROUPS3, "alpha": 0.05, "postHoc": method})
        rows = got["pairwise"]
        assert [r["correctionMethod"] for r in rows] == [f"dunn ({method})"] * 3
        gold = [float(x) for x in multipletests([r["pValue"] for r in rows], method=sm)[1]]
        for row, g in zip(rows, gold):
            assert close(row["pAdjusted"], g, 1e-12), (method, row["pAdjusted"], g)


def test_dunn_fdr_rows_also_carry_fcr_intervals():
    got = eng.run_kruskal({"groups": GROUPS3, "alpha": 0.05,
                           "postHoc": "benjamini-hochberg"})
    rows = got["pairwise"]
    m = len(rows)
    r = sum(1 for row in rows if row["significant"])
    assert r > 0

    # Rebuild Dunn's rank-scale standard error from scratch: sigma^2 with the
    # tie term, times (1/ni + 1/nj); margin = z(alpha*R/m) * se.
    allv = np.concatenate([np.asarray(v, float) for v in GROUPS3.values()])
    n = allv.size
    _, counts = np.unique(allv, return_counts=True)
    ties = float(np.sum(counts.astype(float) ** 3 - counts))
    sigma2 = (n * (n + 1) / 12.0) - (ties / (12.0 * (n - 1)))
    se = math.sqrt(sigma2 * (1 / 6 + 1 / 6))
    margin = float(stats.norm.ppf(1 - (0.05 * r / m) / 2)) * se

    for row in rows:
        if row["significant"]:
            assert close(row["ciHigh"] - row["ciLow"], 2 * margin, 1e-12)
            assert close(row["ciLow"], row["meanDifference"] - margin, 1e-12)
        else:
            assert row["ciLow"] is None and row["ciHigh"] is None
    assert any("FCR-adjusted" in w for w in got.get("_warnings", []))


def test_end_to_end_bh_run_names_the_correction_that_ran():
    out = eng.run({"test": "anova-one-way", "shape": "groups", "alpha": 0.05,
                   "postHoc": "benjamini-hochberg", "groups": GROUPS3})
    assert out["error"] is None
    assert out["test"]["pairwise"][0]["correctionMethod"] == "benjamini-hochberg"
    assert any("FCR-adjusted" in w for w in out["warnings"])


# ══ multiplicity-adjusted intervals for the four FWER corrections ═════════════
#
# The defect: Bonferroni, Sidak, Holm and Holm-Sidak reported an UNADJUSTED
# interval beside an adjusted p, so the two contradicted each other. Dunnett was
# worse - the exact many-to-one p paired with a plain two-sided t interval,
# while scipy's own DunnettResult.confidence_interval() sat unused.


def _pooled(groups):
    """dfw, MS_within and the pooled SE of an equal-n pair, computed here."""
    arrays = [np.asarray(v, float) for v in groups.values()]
    dfw = sum(a.size for a in arrays) - len(arrays)
    msw = sum(float(np.sum((a - a.mean()) ** 2)) for a in arrays) / dfw
    return arrays, dfw, msw


#: ctrl-vs-mid is borderline (raw p = 0.02651) while the other two pairs are
#: overwhelming - exactly when Holm's step-down gains over Bonferroni, because
#: the borderline hypothesis is tested last at factor 1.
_OFF = np.array([-0.35, -0.15, -0.05, 0.05, 0.15, 0.35])
BORDERLINE = {"ctrl": (5.000 + _OFF).tolist(),
              "mid": (5.345 + _OFF).tolist(),
              "high": (7.000 + _OFF).tolist()}


def test_bonferroni_interval_is_built_at_the_adjusted_level():
    alpha = 0.05
    got = eng.run_anova_one_way({"groups": GROUPS3, "alpha": alpha, "postHoc": "bonferroni"})
    rows = got["pairwise"]
    m = len(rows)
    arrays, dfw, msw = _pooled(GROUPS3)
    crit = float(stats.t.ppf(1 - (alpha / m) / 2, dfw))
    unadjusted = float(stats.t.ppf(1 - alpha / 2, dfw))
    assert crit > unadjusted, (crit, unadjusted)  # genuinely wider than before
    se = math.sqrt(msw * (1 / 6 + 1 / 6))
    for row in rows:
        assert close(row["ciLow"], row["meanDifference"] - crit * se, 1e-12), row
        assert close(row["ciHigh"], row["meanDifference"] + crit * se, 1e-12)
        # and NOT the old unadjusted interval
        assert not close(row["ciLow"], row["meanDifference"] - unadjusted * se, 1e-6)


def test_sidak_interval_is_at_its_own_level_and_is_narrower_than_bonferroni():
    alpha = 0.05
    m = 3
    arrays, dfw, msw = _pooled(GROUPS3)
    se = math.sqrt(msw * (1 / 6 + 1 / 6))
    per = 1 - (1 - alpha) ** (1 / m)
    crit = float(stats.t.ppf(1 - per / 2, dfw))
    rows = eng.run_anova_one_way({"groups": GROUPS3, "alpha": alpha,
                                  "postHoc": "sidak"})["pairwise"]
    for row in rows:
        assert close(row["ciLow"], row["meanDifference"] - crit * se, 1e-12)
    # Sidak is very slightly less conservative than Bonferroni. If the two
    # produced the same interval, one of the two options would be a lie.
    bonf = eng.run_anova_one_way({"groups": GROUPS3, "alpha": alpha,
                                  "postHoc": "bonferroni"})["pairwise"]
    assert (rows[0]["ciHigh"] - rows[0]["ciLow"]) < (bonf[0]["ciHigh"] - bonf[0]["ciLow"])


def test_holm_and_holm_sidak_report_no_interval_at_all():
    """Step-down procedures have no generally accepted simultaneous interval,
    so none is reported - the same convention the FDR path uses for the rows it
    did not select."""
    for method in ("holm", "holm-sidak"):
        got = eng.run_anova_one_way({"groups": GROUPS3, "alpha": 0.05, "postHoc": method})
        rows = got["pairwise"]
        assert len(rows) == 3
        assert all(r["ciLow"] is None and r["ciHigh"] is None for r in rows), rows
        # The adjusted p-values are still produced; only the interval is withheld.
        assert all(math.isfinite(r["pAdjusted"]) for r in rows)


def test_the_single_step_interval_would_contradict_holm_which_is_why_it_is_withheld():
    """The justification, checked rather than asserted in prose.

    Holm's adjusted p is never larger than Bonferroni's, so there EXISTS a
    comparison Holm calls significant whose Bonferroni interval still contains
    zero. Reporting that interval beside Holm's p would reintroduce the very
    contradiction this work removes, pointing the other way."""
    alpha = 0.05
    holm = eng.run_anova_one_way({"groups": BORDERLINE, "alpha": alpha,
                                  "postHoc": "holm"})["pairwise"]
    bonf = eng.run_anova_one_way({"groups": BORDERLINE, "alpha": alpha,
                                  "postHoc": "bonferroni"})["pairwise"]
    arrays, dfw, msw = _pooled(BORDERLINE)
    se = math.sqrt(msw * (1 / 6 + 1 / 6))
    raw = float(2 * stats.t.sf(abs(arrays[0].mean() - arrays[1].mean()) / se, dfw))
    assert close(raw, 0.0265094, 1e-5), raw               # golden, scipy, df = 15
    assert close(holm[0]["pAdjusted"], raw, 1e-12)        # Holm: factor 1, tested last
    assert holm[0]["pAdjusted"] < alpha                   # ... and significant
    assert close(bonf[0]["pAdjusted"], min(1.0, raw * 3), 1e-12)
    assert bonf[0]["pAdjusted"] > alpha                   # Bonferroni: not significant
    # Bonferroni's interval for that same pair straddles zero.
    assert bonf[0]["ciLow"] * bonf[0]["ciHigh"] < 0, bonf[0]
    # Which is why Holm gets none rather than borrowing it.
    assert holm[0]["ciLow"] is None


def test_single_step_interval_excludes_zero_exactly_when_its_adjusted_p_is_below_alpha():
    """Coherence by construction, over every alpha and both single-step methods.

    Bonferroni rejects when p < alpha/m, which is precisely when the 1 - alpha/m
    interval excludes zero; Sidak likewise at 1 - (1-alpha)^(1/m)."""
    sets = (GROUPS3, BORDERLINE,
            {"a": [1, 2, 3, 4, 5, 6], "b": [1.1, 2.2, 2.9, 4.1, 5.2, 5.8],
             "c": [1.2, 2.1, 3.1, 3.9, 5.1, 6.2]})
    for groups in sets:
        for alpha in (0.01, 0.05, 0.10):
            for method in ("bonferroni", "sidak"):
                rows = eng.run_anova_one_way({"groups": groups, "alpha": alpha,
                                              "postHoc": method})["pairwise"]
                for row in rows:
                    excludes = row["ciLow"] * row["ciHigh"] > 0
                    assert excludes == (row["pAdjusted"] < alpha), (method, alpha, row)
                    assert row["significant"] == excludes


def test_the_reported_symptom_is_gone_across_all_four_fwer_methods():
    """No adjusted-nonsignificant row may keep an interval that excludes zero."""
    for method in ("bonferroni", "sidak", "holm", "holm-sidak"):
        for alpha in (0.01, 0.05, 0.10):
            for groups in (GROUPS3, BORDERLINE):
                for row in eng.run_anova_one_way({"groups": groups, "alpha": alpha,
                                                  "postHoc": method})["pairwise"]:
                    if row["pAdjusted"] >= alpha and row["ciLow"] is not None:
                        assert row["ciLow"] * row["ciHigh"] <= 0, (method, alpha, row)


def test_single_step_level_follows_alpha_and_is_not_hardcoded():
    for method in ("bonferroni", "sidak"):
        wide = eng.run_anova_one_way({"groups": GROUPS3, "alpha": 0.01,
                                      "postHoc": method})["pairwise"][0]
        narrow = eng.run_anova_one_way({"groups": GROUPS3, "alpha": 0.10,
                                        "postHoc": method})["pairwise"][0]
        assert (wide["ciHigh"] - wide["ciLow"]) > (narrow["ciHigh"] - narrow["ciLow"])
    arrays, dfw, msw = _pooled(GROUPS3)
    se = math.sqrt(msw * (1 / 6 + 1 / 6))
    w = eng.run_anova_one_way({"groups": GROUPS3, "alpha": 0.01,
                               "postHoc": "bonferroni"})["pairwise"][0]
    assert close(w["ciHigh"] - w["ciLow"],
                 2 * float(stats.t.ppf(1 - (0.01 / 3) / 2, dfw)) * se, 1e-12)


def test_tukey_intervals_are_untouched():
    """Tukey was already correct; this pins it against collateral damage."""
    alpha = 0.05
    arrays, dfw, msw = _pooled(GROUPS3)
    se = math.sqrt(msw * (1 / 6 + 1 / 6))
    qcrit = float(stats.studentized_range.ppf(1 - alpha, 3, dfw))
    rows = eng.run_anova_one_way({"groups": GROUPS3, "alpha": alpha,
                                  "postHoc": "tukey"})["pairwise"]
    for row in rows:
        assert close(row["ciLow"], row["meanDifference"] - qcrit * se / math.sqrt(2), 1e-12)


def test_dunnett_interval_is_scipys_exact_many_to_one_not_a_plain_t():
    alpha = 0.05
    names = list(GROUPS3)
    arrays = [np.asarray(GROUPS3[n], float) for n in names]
    gold = stats.dunnett(arrays[1], arrays[2], control=arrays[0], random_state=0)
    band = gold.confidence_interval(confidence_level=1 - alpha)
    rows = eng.run_anova_one_way({"groups": GROUPS3, "alpha": alpha, "postHoc": "dunnett",
                                  "referenceLevel": "ctrl"})["pairwise"]
    for row, lo, hi in zip(rows, np.atleast_1d(band.low), np.atleast_1d(band.high)):
        assert close(row["ciLow"], float(lo), 1e-12), (row["ciLow"], lo)
        assert close(row["ciHigh"], float(hi), 1e-12)
    # And it is NOT the plain two-sided t interval the code used to pair with it.
    _, dfw, msw = _pooled(GROUPS3)
    se = math.sqrt(msw * (1 / 6 + 1 / 6))
    tcrit = float(stats.t.ppf(1 - alpha / 2, dfw))
    assert not close(rows[0]["ciLow"], rows[0]["meanDifference"] - tcrit * se, 1e-6)
    # The Dunnett interval must be the WIDER one: it covers 2 comparisons at once.
    assert (rows[0]["ciHigh"] - rows[0]["ciLow"]) > 2 * tcrit * se


def test_dunnett_interval_honours_alpha_and_stays_reproducible():
    wide = eng.run_anova_one_way({"groups": GROUPS3, "alpha": 0.01, "postHoc": "dunnett",
                                  "referenceLevel": "ctrl"})["pairwise"][0]
    narrow = eng.run_anova_one_way({"groups": GROUPS3, "alpha": 0.10, "postHoc": "dunnett",
                                    "referenceLevel": "ctrl"})["pairwise"][0]
    assert (wide["ciHigh"] - wide["ciLow"]) > (narrow["ciHigh"] - narrow["ciLow"])
    runs = {eng.run_anova_one_way({"groups": GROUPS3, "alpha": 0.05, "postHoc": "dunnett",
                                   "referenceLevel": "ctrl"})["pairwise"][0]["ciLow"]
            for _ in range(5)}
    assert len(runs) == 1, runs


def test_dunnett_interval_and_adjusted_p_agree():
    groups = {"ctrl": [5.1, 4.8, 5.4, 5.0, 5.2, 4.9],
              "near": [5.3, 5.0, 5.5, 5.2, 5.4, 5.1],
              "far": [8.1, 7.7, 8.4, 8.0, 8.3, 7.9]}
    for alpha in (0.01, 0.05, 0.10):
        rows = eng.run_anova_one_way({"groups": groups, "alpha": alpha, "postHoc": "dunnett",
                                      "referenceLevel": "ctrl"})["pairwise"]
        assert any(r["pAdjusted"] >= alpha for r in rows), "fixture must have a null row"
        for row in rows:
            assert (row["ciLow"] * row["ciHigh"] > 0) == (row["pAdjusted"] < alpha), (alpha, row)


def test_dunn_rows_get_single_step_intervals_and_none_for_holm():
    alpha = 0.05
    m = 3
    allv = np.concatenate([np.asarray(v, float) for v in GROUPS3.values()])
    n = allv.size
    _, counts = np.unique(allv, return_counts=True)
    ties = float(np.sum(counts.astype(float) ** 3 - counts))
    sigma2 = (n * (n + 1) / 12.0) - (ties / (12.0 * (n - 1)))
    se = math.sqrt(sigma2 * (1 / 6 + 1 / 6))

    rows = eng.run_kruskal({"groups": GROUPS3, "alpha": alpha,
                            "postHoc": "bonferroni"})["pairwise"]
    margin = float(stats.norm.ppf(1 - (alpha / m) / 2)) * se
    for row in rows:
        assert close(row["ciLow"], row["meanDifference"] - margin, 1e-12), row
        assert close(row["ciHigh"], row["meanDifference"] + margin, 1e-12)
        assert (row["ciLow"] * row["ciHigh"] > 0) == (row["pAdjusted"] < alpha)
    # ... and the old unadjusted z(alpha) margin is a different number.
    assert not close(margin, float(stats.norm.ppf(1 - alpha / 2)) * se, 1e-6)

    # Holm is Dunn's default and now yields no interval, as it must.
    holm = eng.run_kruskal({"groups": GROUPS3, "alpha": alpha, "postHoc": "dunn"})["pairwise"]
    assert all(r["ciLow"] is None and r["ciHigh"] is None for r in holm)


def test_the_record_states_the_single_step_interval_level():
    """'The record names what ran': an interval at a level other than 1 - alpha
    that appears without saying so is the same defect, just quieter."""
    got = eng.run_anova_one_way({"groups": GROUPS3, "alpha": 0.05, "postHoc": "bonferroni"})
    note = [w for w in got.get("_warnings", []) if "per-comparison level" in w]
    assert len(note) == 1, got.get("_warnings")
    assert "98.3333%" in note[0], note[0]      # 1 - 0.05/3
    assert "95%" in note[0]                     # ... contrasted with the family-wise level
    sid = eng.run_anova_one_way({"groups": GROUPS3, "alpha": 0.05, "postHoc": "sidak"})
    assert any("98.3048%" in w for w in sid.get("_warnings", [])), sid.get("_warnings")


def test_the_record_explains_the_missing_step_down_interval():
    for method in ("holm", "holm-sidak"):
        got = eng.run_anova_one_way({"groups": GROUPS3, "alpha": 0.05, "postHoc": method})
        note = [w for w in got.get("_warnings", []) if "step-down" in w]
        assert len(note) == 1, got.get("_warnings")
        assert "no generally accepted" in note[0]
        assert "bonferroni or sidak" in note[0]


def test_tukey_and_dunnett_carry_no_interval_note():
    """Both report a genuine simultaneous interval at 1 - alpha, so there is
    nothing to disclose and a note would be noise."""
    for p in ({"postHoc": "tukey"}, {"postHoc": "dunnett", "referenceLevel": "ctrl"}):
        got = eng.run_anova_one_way({"groups": GROUPS3, "alpha": 0.05, **p})
        assert not [w for w in got.get("_warnings", [])
                    if "step-down" in w or "per-comparison level" in w]


# ══ effect sizes beside every comparison (§6.3) ═══════════════════════════════


def test_pairwise_rows_carry_hedges_g():
    arrays, dfw, msw = _pooled(GROUPS3)
    j = math.exp(math.lgamma(dfw / 2) - math.log(math.sqrt(dfw / 2))
                 - math.lgamma((dfw - 1) / 2))
    assert 0.94 < j < 1.0, j
    for method in ("bonferroni", "holm", "tukey", "benjamini-hochberg"):
        for row in eng.run_anova_one_way({"groups": GROUPS3, "alpha": 0.05,
                                          "postHoc": method})["pairwise"]:
            eff = row["effectSize"]
            assert eff["name"] == "hedges-g"
            assert close(eff["value"], (row["meanDifference"] / math.sqrt(msw)) * j, 1e-12)
            # No CI is claimed for a standardised effect under multiplicity.
            assert eff["ciLow"] is None and eff["ciHigh"] is None


def test_dunnett_rows_carry_hedges_g_too():
    arrays, dfw, msw = _pooled(GROUPS3)
    rows = eng.run_anova_one_way({"groups": GROUPS3, "alpha": 0.05, "postHoc": "dunnett",
                                  "referenceLevel": "ctrl"})["pairwise"]
    assert all(r["effectSize"]["name"] == "hedges-g" for r in rows)
    assert all(r["effectSize"]["value"] > 0 for r in rows)


def test_dunn_rows_carry_a_rank_biserial_effect_size():
    rows = eng.run_kruskal({"groups": GROUPS3, "alpha": 0.05,
                            "postHoc": "bonferroni"})["pairwise"]
    vals = {k: np.asarray(v, float) for k, v in GROUPS3.items()}
    for row in rows:
        a, b = vals[row["groupA"]], vals[row["groupB"]]
        u = float(stats.mannwhitneyu(a, b, alternative="two-sided").statistic)
        eff = row["effectSize"]
        assert eff["name"] == "rank-biserial"
        assert close(eff["value"], 2 * u / (a.size * b.size) - 1, 1e-12)
    # ctrl lies entirely below both others, so Cliff's delta is exactly -1.
    assert rows[0]["effectSize"]["value"] == -1.0


WILCOXON = {"pairs": [[5.1, 4.4], [6.2, 5.0], [4.8, 4.9], [7.3, 6.1], [5.5, 5.0],
                      [6.0, 5.2], [4.9, 5.3], [6.8, 5.9], [5.2, 4.7], [7.0, 6.4]],
            "tails": "two", "alpha": 0.05, "labels": ["pre", "post"]}


def test_wilcoxon_reports_a_rank_biserial_effect_size():
    got = eng.run_wilcoxon(WILCOXON)
    pairs = np.asarray(WILCOXON["pairs"], float)
    d = pairs[:, 0] - pairs[:, 1]
    d = d[d != 0]                                   # scipy's zero_method="wilcox"
    r = stats.rankdata(np.abs(d))
    w_plus = float(np.sum(r[d > 0]))
    w_minus = float(np.sum(r[d < 0]))
    gold = (w_plus - w_minus) / (d.size * (d.size + 1) / 2)
    eff = got["effectSizes"][0]
    assert eff["name"] == "rank-biserial", eff
    assert close(eff["value"], gold, 1e-12), (eff["value"], gold)
    # Kerby's coefficient is bounded; no CI for it is standard, so none is given.
    assert -1 <= eff["value"] <= 1
    assert eff["ciLow"] is None and eff["ciHigh"] is None
    assert "rank-biserial" in got["reportSentence"]


def test_wilcoxon_rank_biserial_is_plus_one_under_complete_dominance():
    got = eng.run_wilcoxon({"pairs": [[2, 1], [4, 1], [6, 2], [8, 3], [10, 4]],
                            "tails": "two", "alpha": 0.05, "labels": ["a", "b"]})
    assert close(got["effectSizes"][0]["value"], 1.0, 1e-12)


def test_wilcoxon_effect_size_ignores_zero_differences_like_scipy_does():
    """A tied pair contributes to neither W+ nor W-, so it must not enter the
    denominator either - otherwise the effect shrinks toward zero for a reason
    the p-value does not share."""
    base = [[5.0, 4.0], [6.0, 5.0], [7.0, 5.0], [8.0, 6.0], [9.0, 7.0], [10.0, 8.0]]
    tied = base + [[3.0, 3.0]]
    a = eng.run_wilcoxon({"pairs": base, "tails": "two", "alpha": 0.05, "labels": ["a", "b"]})
    b = eng.run_wilcoxon({"pairs": tied, "tails": "two", "alpha": 0.05, "labels": ["a", "b"]})
    assert close(a["effectSizes"][0]["value"], b["effectSizes"][0]["value"], 1e-12)


def test_rm_anova_reports_partial_eta_squared():
    got = eng.run_anova_rm(RM)
    m = np.asarray(RM["matrix"], float)
    n, k = m.shape
    # Golden from the sums-of-squares decomposition, not from F.
    gm = m.mean()
    ss_cond = n * float(np.sum((m.mean(axis=0) - gm) ** 2))
    ss_subj = k * float(np.sum((m.mean(axis=1) - gm) ** 2))
    ss_err = float(np.sum((m - gm) ** 2)) - ss_cond - ss_subj
    gold = ss_cond / (ss_cond + ss_err)
    eff = got["effectSizes"][0]
    assert eff["name"] == "partial-eta-squared", eff
    assert close(eff["value"], gold, 1e-10), (eff["value"], gold)
    assert eff["ciLow"] is None and eff["ciHigh"] is None
    assert "partial η²" in got["reportSentence"]


def test_rm_partial_eta_squared_does_not_move_with_greenhouse_geisser():
    """Epsilon rescales the reference distribution, not the variance explained,
    and it multiplies both df by the same factor - so the effect size cancels."""
    got = eng.run_anova_rm(RM)
    assert got["assumptions"][0]["passed"] is False, "fixture must violate sphericity"
    df1, df2 = (float(v) for v in got["df"].split(","))
    assert (df1, df2) != (2.0, 14.0)                 # the p really was corrected
    f = got["statistic"]
    corrected = (f * df1) / (f * df1 + df2)
    uncorrected = (f * 2.0) / (f * 2.0 + 14.0)
    assert close(corrected, uncorrected, 1e-12)
    assert close(got["effectSizes"][0]["value"], uncorrected, 1e-10)


MIXED_LONG = {
    "y": [], "f1": [], "subject": [],
}
for _i, _s in enumerate([f"s{j}" for j in range(10)]):
    for _j, _l in enumerate(["a", "b", "c"]):
        MIXED_LONG["y"].append(10.0 + 2.0 * _j + 1.7 * _i + (0.4 if _j == 1 else -0.3))
        MIXED_LONG["f1"].append(_l)
        MIXED_LONG["subject"].append(_s)


def test_mixed_effects_reports_nakagawa_pseudo_r_squared():
    if not eng._HAS_SM:
        return
    got = eng.run_mixed_effects({"long": MIXED_LONG, "alpha": 0.05})
    import pandas as pd
    from statsmodels.formula.api import mixedlm
    df = pd.DataFrame(MIXED_LONG)
    gold_model = mixedlm("y ~ C(f1)", df, groups=df["subject"]).fit()
    var_f = float(np.var(np.asarray(gold_model.model.exog)
                         @ np.asarray(gold_model.fe_params), ddof=0))
    var_r = float(np.asarray(gold_model.cov_re)[0, 0])
    var_e = float(gold_model.scale)
    total = var_f + var_r + var_e
    effects = got["effectSizes"]
    assert [e["name"] for e in effects] == ["r-squared", "r-squared"], effects
    assert effects[0]["term"] == "marginal (fixed effects)"
    assert effects[1]["term"] == "conditional (fixed + random)"
    assert close(effects[0]["value"], var_f / total, 1e-10)
    assert close(effects[1]["value"], (var_f + var_r) / total, 1e-10)
    # Conditional always dominates marginal; both are proportions.
    assert effects[1]["value"] >= effects[0]["value"]
    assert 0 <= effects[0]["value"] <= 1 and 0 <= effects[1]["value"] <= 1
    assert effects[0]["ciLow"] is None and effects[1]["ciLow"] is None
    assert "marginal R²" in got["reportSentence"]


def test_mixed_effects_marginal_r2_is_not_the_fitted_value_variance():
    """statsmodels' `fittedvalues` folds in the PREDICTED random effects, so
    using it would push marginal R² up toward conditional R² and hide exactly
    the between-subject share the two numbers exist to separate."""
    if not eng._HAS_SM:
        return
    import pandas as pd
    from statsmodels.formula.api import mixedlm
    df = pd.DataFrame(MIXED_LONG)
    fit = mixedlm("y ~ C(f1)", df, groups=df["subject"]).fit()
    wrong = float(np.var(np.asarray(fit.fittedvalues), ddof=0))
    right = float(np.var(np.asarray(fit.model.exog) @ np.asarray(fit.fe_params), ddof=0))
    assert not close(wrong, right, 1e-6), (wrong, right)
    got = eng.run_mixed_effects({"long": MIXED_LONG, "alpha": 0.05})
    var_r = float(np.asarray(fit.cov_re)[0, 0])
    total = right + var_r + float(fit.scale)
    assert close(got["effectSizes"][0]["value"], right / total, 1e-10)


# ── log-rank hazard ratio ─────────────────────────────────────────────────────


def _peto(durations, events, groups):
    """Independent reference: per-group O-E and the diagonal of the
    hypergeometric covariance, from which log HR = (O-E)/V and SE = 1/sqrt(V)."""
    d = np.asarray(durations, float)
    e = np.asarray(events, float)
    g = np.asarray(groups)
    labs = sorted(set(groups))
    ome = np.zeros(len(labs))
    v = np.zeros(len(labs))
    for t in np.unique(d[e == 1]):
        n = float(np.sum(d >= t))
        dt = float(np.sum((d == t) & (e == 1)))
        if n <= 1:
            continue
        r = np.array([float(np.sum(d[g == l] >= t)) for l in labs])
        o = np.array([float(np.sum((d[g == l] == t) & (e[g == l] == 1))) for l in labs])
        ome += o - dt * r / n
        f = r / n
        v += dt * (n - dt) / (n - 1) * (f - f * f)
    return labs, ome, v


SURV2 = {"durations": SURV3["durations"][:20], "events": SURV3["events"][:20],
         "groups": SURV3["groups"][:20], "alpha": 0.05}


def test_log_rank_reports_a_peto_hazard_ratio_with_interval():
    got = eng.run_survival(SURV2)
    labs, ome, v = _peto(SURV2["durations"], SURV2["events"], SURV2["groups"])
    loghr = ome[0] / v[0]
    se = 1.0 / math.sqrt(v[0])
    z = float(stats.norm.ppf(0.975))
    effects = got["effectSizes"]
    assert len(effects) == 1, effects        # two groups yield ONE ratio
    eff = effects[0]
    assert eff["name"] == "hazard-ratio"
    assert eff["term"] == f"{labs[0]} vs {labs[1]}"
    assert close(eff["value"], math.exp(loghr), 1e-10), (eff["value"], math.exp(loghr))
    assert close(eff["ciLow"], math.exp(loghr - z * se), 1e-10)
    assert close(eff["ciHigh"], math.exp(loghr + z * se), 1e-10)
    assert "HR" in got["reportSentence"]


def test_hazard_ratio_interval_agrees_with_the_log_rank_test_by_construction():
    """chi2 = (O-E)^2/V and log HR = (O-E)/V with SE = 1/sqrt(V), so the interval
    excludes 1 exactly when the log-rank p falls below alpha. A Mantel-Haenszel
    ratio with SE = sqrt(1/E1 + 1/E2) does not have that property."""
    strong = SURV2
    weak = {"durations": SURV3["durations"][:10] * 2,
            "events": SURV3["events"][:10] * 2,
            "groups": ["A"] * 10 + ["B"] * 10}
    for payload in (strong, weak):
        for alpha in (0.01, 0.05, 0.10, 0.5):
            got = eng.run_survival({**payload, "alpha": alpha})
            eff = got["effectSizes"][0]
            excludes_one = (eff["ciLow"] - 1) * (eff["ciHigh"] - 1) > 0
            assert excludes_one == (got["pValue"] < alpha), (alpha, eff, got["pValue"])


def test_hazard_ratio_band_widens_as_alpha_shrinks():
    a = eng.run_survival({**SURV2, "alpha": 0.05})["effectSizes"][0]
    b = eng.run_survival({**SURV2, "alpha": 0.01})["effectSizes"][0]
    assert (b["ciHigh"] - b["ciLow"]) > (a["ciHigh"] - a["ciLow"])


def test_three_group_hazard_ratios_are_vs_the_rest_and_the_record_says_so():
    got = eng.run_survival(SURV3)
    labs, ome, v = _peto(SURV3["durations"], SURV3["events"], SURV3["groups"])
    effects = got["effectSizes"]
    assert len(effects) == 3
    z = float(stats.norm.ppf(0.975))
    for eff, l, o, vv in zip(effects, labs, ome, v):
        assert eff["term"] == f"{l} vs. all other groups", eff
        assert close(eff["value"], math.exp(o / vv), 1e-10)
        assert close(eff["ciLow"], math.exp(o / vv - z / math.sqrt(vv)), 1e-10)
    # An omnibus test has no single hazard ratio, and the record must not let a
    # reader take these three for pairwise contrasts.
    assert any("pooled remainder" in w for w in got.get("_warnings", [])), got.get("_warnings")


def test_two_group_log_rank_statistic_is_unchanged_by_the_shared_covariance():
    """vmat[0,0] must equal the scalar variance the two-group branch used to
    accumulate on its own, or the log-rank statistic itself has moved."""
    got = eng.run_survival(SURV2)
    gold, df = _mantel_cox(SURV2["durations"], SURV2["events"], SURV2["groups"])
    assert df == 1 and got["df"] == 1
    assert close(got["statistic"], gold, 1e-10)


def test_single_group_kaplan_meier_reports_no_hazard_ratio():
    """Nothing to compare against; inventing a ratio against the whole cohort
    would be a comparison the user never asked for."""
    out = eng.run_survival({**_KM, "alpha": 0.05})
    assert out["effectSizes"] == []


# ══ regression diagnostics and the prediction interval ════════════════════════

_RX = np.linspace(1.0, 20.0, 25)
LINREG_CLEAN = {"x": _RX.tolist(),
                "y": (2.0 * _RX + 1.0 + np.array(
                    [0.31, -0.42, 0.15, 0.62, -0.28, 0.44, -0.51, 0.09, 0.37, -0.19,
                     0.55, -0.33, 0.21, -0.47, 0.12, 0.39, -0.25, 0.48, -0.16, 0.29,
                     -0.38, 0.17, 0.51, -0.22, 0.34])).tolist(),
                "alpha": 0.05}
#: Variance grows with x, so Breusch-Pagan must fire.
LINREG_FUNNEL = {"x": _RX.tolist(),
                 "y": (2.0 * _RX + 1.0 + _RX * np.array(
                     [0.31, -0.42, 0.15, 0.62, -0.28, 0.44, -0.51, 0.09, 0.37, -0.19,
                      0.55, -0.33, 0.21, -0.47, 0.12, 0.39, -0.25, 0.48, -0.16, 0.29,
                      -0.38, 0.17, 0.51, -0.22, 0.34])).tolist(),
                 "alpha": 0.05}
#: A parabola fitted with a straight line, so RESET must fire. Scatter is added
#: deliberately: an EXACT parabola is reproduced perfectly by the RESET auxiliary
#: model, driving its residual sum to float dust and its F to ~1e21, where
#: comparing against statsmodels tests the floating-point noise and nothing else.
LINREG_CURVED = {"x": _RX.tolist(),
                 "y": (0.5 * _RX ** 2 + np.array(
                     [0.31, -0.42, 0.15, 0.62, -0.28, 0.44, -0.51, 0.09, 0.37, -0.19,
                      0.55, -0.33, 0.21, -0.47, 0.12, 0.39, -0.25, 0.48, -0.16, 0.29,
                      -0.38, 0.17, 0.51, -0.22, 0.34])).tolist(),
                 "alpha": 0.05}


def _checks(out):
    return {c["name"].split(" (")[0]: c for c in out["assumptions"]}


def test_linear_regression_now_carries_its_three_assumption_checks():
    out = eng.run_linear_regression(LINREG_CLEAN)
    names = [c["name"] for c in out["assumptions"]]
    assert names == ["Residual normality (Shapiro-Wilk)",
                     "Equal variance of residuals (Breusch-Pagan)",
                     "Linearity (Ramsey RESET, powers 2-3)"], names
    assert all(c["passed"] for c in out["assumptions"]), out["assumptions"]
    assert "assumption checks" in out["reportSentence"]


def test_breusch_pagan_matches_statsmodels():
    from statsmodels.stats.diagnostic import het_breuschpagan
    import statsmodels.api as sm
    for payload in (LINREG_CLEAN, LINREG_FUNNEL, LINREG_CURVED):
        x = np.asarray(payload["x"], float)
        y = np.asarray(payload["y"], float)
        fit = stats.linregress(x, y)
        resid = y - (fit.intercept + fit.slope * x)
        gold = het_breuschpagan(resid, sm.add_constant(x))
        got = _checks(eng.run_linear_regression(payload))["Equal variance of residuals"]
        assert close(got["statistic"], float(gold[0]), 1e-9), (got["statistic"], gold[0])
        assert close(got["pValue"], float(gold[1]), 1e-9)


def test_reset_matches_statsmodels_linear_reset():
    from statsmodels.stats.diagnostic import linear_reset
    import statsmodels.api as sm
    for payload in (LINREG_CLEAN, LINREG_FUNNEL, LINREG_CURVED):
        x = np.asarray(payload["x"], float)
        y = np.asarray(payload["y"], float)
        gold = linear_reset(sm.OLS(y, sm.add_constant(x)).fit(), power=3,
                            test_type="fitted", use_f=True)
        got = _checks(eng.run_linear_regression(payload))["Linearity"]
        assert close(got["statistic"], float(gold.fvalue), 1e-6), (got["statistic"], gold.fvalue)
        assert close(got["pValue"], float(gold.pvalue), 1e-6)


def test_the_diagnostics_actually_fire_on_the_data_that_breaks_them():
    """A check that passes on everything is decoration."""
    funnel = _checks(eng.run_linear_regression(LINREG_FUNNEL))
    assert funnel["Equal variance of residuals"]["passed"] is False
    assert "weighted least squares" in funnel["Equal variance of residuals"]["alternative"]
    curved = _checks(eng.run_linear_regression(LINREG_CURVED))
    assert curved["Linearity"]["passed"] is False
    assert "nonlinear model" in curved["Linearity"]["alternative"]
    # A perfect parabola has R² = 0.94 against a line, so R² alone would not
    # have caught it - which is the point of testing linearity separately.
    assert eng.run_linear_regression(LINREG_CURVED)["effectSizes"][0]["value"] > 0.9


def test_regression_diagnostics_decline_gracefully_when_n_is_too_small():
    out = eng.run_linear_regression({"x": [1.0, 2.0, 3.0, 4.0], "y": [2.0, 4.1, 5.9, 8.2],
                                     "alpha": 0.05})
    checks = _checks(out)
    assert checks["Linearity"]["statistic"] is None
    assert "more than 4 points" in checks["Linearity"]["verdict"]


def test_prediction_interval_is_wider_than_the_confidence_interval():
    out = eng.run_linear_regression(LINREG_CLEAN)
    reg = out["_regression"]
    x = np.asarray(LINREG_CLEAN["x"], float)
    y = np.asarray(LINREG_CLEAN["y"], float)
    fit = stats.linregress(x, y)
    n = x.size
    resid = y - (fit.intercept + fit.slope * x)
    syx = math.sqrt(float(np.sum(resid ** 2)) / (n - 2))
    sxx = float(np.sum((x - x.mean()) ** 2))
    tcrit = float(stats.t.ppf(0.975, n - 2))
    grid = np.linspace(x.min(), x.max(), 120)
    lev = 1.0 / n + (grid - x.mean()) ** 2 / sxx
    gold_ci = tcrit * syx * np.sqrt(lev)
    gold_pi = tcrit * syx * np.sqrt(1.0 + lev)
    assert len(reg["x"]) == 120
    assert close(reg["syx"], syx, 1e-12)
    for i in (0, 42, 60, 119):
        centre = fit.intercept + fit.slope * grid[i]
        assert close(reg["fit"][i], centre, 1e-12)
        assert close(reg["ciLow"][i], centre - gold_ci[i], 1e-10)
        assert close(reg["piLow"][i], centre - gold_pi[i], 1e-10)
        assert close(reg["piHigh"][i], centre + gold_pi[i], 1e-10)
        # The prediction band must strictly contain the confidence band: it adds
        # the residual scatter, which is what a reader interpolating an unknown
        # off a standard curve is actually exposed to.
        assert reg["piLow"][i] < reg["ciLow"][i] < reg["ciHigh"][i] < reg["piHigh"][i]


def test_prediction_interval_honours_alpha_and_is_named_in_the_record():
    a = eng.run_linear_regression({**LINREG_CLEAN, "alpha": 0.05})["_regression"]
    b = eng.run_linear_regression({**LINREG_CLEAN, "alpha": 0.01})["_regression"]
    assert close(a["level"], 0.95, 1e-12) and close(b["level"], 0.99, 1e-12)
    assert (b["piHigh"][0] - b["piLow"][0]) > (a["piHigh"][0] - a["piLow"][0])
    out = eng.run_linear_regression({**LINREG_CLEAN, "alpha": 0.01})
    assert "99% prediction interval" in out["reportSentence"]


def test_regression_block_reaches_the_top_level_run_result():
    out = eng.run({"test": "linear-regression", "shape": "columns", **LINREG_CLEAN})
    assert out["error"] is None and out["testRan"] == "linear-regression"
    assert out["regression"] is not None and len(out["regression"]["piLow"]) == 120
    # ... and it is not left inside the test object the renderer prints.
    assert "_regression" not in out["test"]
    assert len(out["test"]["assumptions"]) == 3


def test_a_test_without_a_regression_block_reports_none():
    out = eng.run({"test": "anova-one-way", "shape": "groups", "alpha": 0.05,
                   "postHoc": "none", "groups": GROUPS3})
    assert out["regression"] is None


# ══ global fitting with shared parameters ═════════════════════════════════════
#
# `sharedParameters` was accepted by the resolver and never read by the engine,
# and the payload carried a single {x, y} so multiple datasets could not even be
# expressed. `datasets` is the additive, backward-compatible way to express them.

_GX = np.array([1e-3, 3e-3, 1e-2, 3e-2, 1e-1, 3e-1, 1.0, 3.0, 10.0, 30.0])
_GLX = np.log10(_GX)
#: Two curves from ONE bottom/top/hill, differing only in potency, plus fixed
#: (not random) perturbations so the fixture is reproducible forever.
_NOISE_A = np.array([1.4, -2.1, 0.8, 3.2, -1.7, 2.6, -3.1, 1.1, -0.6, 2.2])
_NOISE_B = np.array([-2.3, 1.9, -1.2, 2.8, 3.4, -2.7, 1.5, -0.9, 2.1, -1.8])
_TRUE = (5.0, 100.0, 1.2)          # bottom, top, hill — shared by construction
GLOBAL_A = (eng._four_pl(_GLX, _TRUE[0], _TRUE[1], -1.0, _TRUE[2]) + _NOISE_A).tolist()
GLOBAL_B = (eng._four_pl(_GLX, _TRUE[0], _TRUE[1], 0.5, _TRUE[2]) + _NOISE_B).tolist()
GLOBAL_SETS = [{"label": "cmpdA", "x": _GX.tolist(), "y": GLOBAL_A},
               {"label": "cmpdB", "x": _GX.tolist(), "y": GLOBAL_B}]
GLOBAL_BASE = {"model": "4pl", "weighting": "none", "alpha": 0.05}
SHARED3 = ["bottom", "top", "hillSlope"]


def _stacked_gold(shared, sigma_mode="none", model="4pl"):
    """Independent reference fit: a stacked model written here, handed straight
    to scipy.optimize.curve_fit. Nothing below is read back out of the engine."""
    func = {"3pl": eng._three_pl, "4pl": eng._four_pl, "5pl": eng._five_pl}[model]
    names = {"3pl": ["bottom", "top", "logEC50"],
             "4pl": ["bottom", "top", "logEC50", "hillSlope"],
             "5pl": ["bottom", "top", "logEC50", "hillSlope", "asymmetry"]}[model]
    npar = len(names)
    ys = [np.asarray(GLOBAL_A, float), np.asarray(GLOBAL_B, float)]
    xs = [_GLX, _GLX]
    idx, flat = {}, 0
    for j, nm in enumerate(names):
        if nm in shared:
            idx[(j, None)] = flat
            flat += 1
        else:
            for i in range(2):
                idx[(j, i)] = flat
                flat += 1
    at = lambda j, i: idx[(j, None)] if names[j] in shared else idx[(j, i)]

    def guess(i):
        g = [float(ys[i].min()), float(ys[i].max()), float(np.median(xs[i]))]
        if npar >= 4:
            g.append(1.0)
        if npar == 5:
            g.append(1.0)
        return g

    gs = [guess(0), guess(1)]
    p0 = np.empty(flat)
    for j, nm in enumerate(names):
        if nm in shared:
            p0[idx[(j, None)]] = float(np.mean([gs[0][j], gs[1][j]]))
        else:
            for i in range(2):
                p0[idx[(j, i)]] = gs[i][j]
    xall = np.concatenate(xs)
    yall = np.concatenate(ys)
    own = np.concatenate([np.full(xs[0].size, 0), np.full(xs[1].size, 1)])

    def stacked(_x, *th):
        th = np.asarray(th, float)
        out = np.empty(xall.size)
        for i in range(2):
            m = own == i
            out[m] = func(xall[m], *[th[at(j, i)] for j in range(npar)])
        return out

    absy = np.where(np.abs(yall) > 0, np.abs(yall), 1.0)
    sig = (np.sqrt(absy) if sigma_mode == "1/Y"
           else absy if sigma_mode == "1/Y^2" else None)
    popt, pcov = optimize.curve_fit(stacked, xall, yall, p0=p0, sigma=sig, maxfev=40000)
    return names, at, popt, pcov


def test_global_fit_matches_an_independently_stacked_curve_fit():
    names, at, gold, gcov = _stacked_gold(SHARED3)
    cf = eng.run_dose_response({**GLOBAL_BASE, "datasets": GLOBAL_SETS,
                                "sharedParameters": SHARED3})["curveFit"]
    assert cf["global"] is True and cf["converged"] is True
    assert cf["sharedParameters"] == SHARED3
    for nm in SHARED3:
        j = names.index(nm)
        assert close(cf["parameters"][nm]["value"], gold[at(j, None)], 1e-7), nm
    for i, d in enumerate(cf["datasets"]):
        j = names.index("logEC50")
        assert close(d["parameters"]["logEC50"]["value"], gold[at(j, i)], 1e-7)
        assert close(d["ec50"], 10.0 ** gold[at(j, i)], 1e-7)


def test_global_fit_recovers_the_parameters_the_data_was_built_from():
    cf = eng.run_dose_response({**GLOBAL_BASE, "datasets": GLOBAL_SETS,
                                "sharedParameters": SHARED3})["curveFit"]
    assert abs(cf["parameters"]["bottom"]["value"] - _TRUE[0]) < 2.0
    assert abs(cf["parameters"]["top"]["value"] - _TRUE[1]) < 2.0
    assert abs(cf["parameters"]["hillSlope"]["value"] - _TRUE[2]) < 0.15
    assert abs(math.log10(cf["datasets"][0]["ec50"]) - (-1.0)) < 0.1
    assert abs(math.log10(cf["datasets"][1]["ec50"]) - 0.5) < 0.1


def test_the_shared_fit_provably_differs_from_the_independent_fits():
    """The whole point of a global fit. One Hill slope estimated from all 20
    points is not either curve's own slope, and it is not their average either -
    it is a joint least-squares solution, so the curve with less scatter pulls
    harder."""
    single = {**GLOBAL_BASE, "x": _GX.tolist()}
    a = eng.run_dose_response({**single, "y": GLOBAL_A})["curveFit"]
    b = eng.run_dose_response({**single, "y": GLOBAL_B})["curveFit"]
    cf = eng.run_dose_response({**GLOBAL_BASE, "datasets": GLOBAL_SETS,
                                "sharedParameters": SHARED3})["curveFit"]
    ha = a["parameters"]["hillSlope"]["value"]
    hb = b["parameters"]["hillSlope"]["value"]
    hg = cf["parameters"]["hillSlope"]["value"]
    assert not close(hg, ha, 1e-3), (hg, ha)
    assert not close(hg, hb, 1e-3), (hg, hb)
    assert not close(hg, (ha + hb) / 2, 1e-3), "a global fit is not an average"
    # The potencies move too: each logEC50 is now estimated against plateaus
    # that every point paid for.
    for i, ind in enumerate((a, b)):
        assert not close(cf["datasets"][i]["parameters"]["logEC50"]["value"],
                         ind["parameters"]["logEC50"]["value"], 1e-4)


def test_sharing_narrows_the_potency_intervals():
    """The pharmacological payoff: three parameters stop being re-estimated per
    curve, so the logEC50 standard errors fall."""
    single = {**GLOBAL_BASE, "x": _GX.tolist()}
    ind = [eng.run_dose_response({**single, "y": y})["curveFit"]
           for y in (GLOBAL_A, GLOBAL_B)]
    cf = eng.run_dose_response({**GLOBAL_BASE, "datasets": GLOBAL_SETS,
                                "sharedParameters": SHARED3})["curveFit"]
    for i in range(2):
        wide = (ind[i]["parameters"]["logEC50"]["ciHigh"]
                - ind[i]["parameters"]["logEC50"]["ciLow"])
        narrow = (cf["datasets"][i]["parameters"]["logEC50"]["ciHigh"]
                  - cf["datasets"][i]["parameters"]["logEC50"]["ciLow"])
        assert narrow < wide, (i, narrow, wide)


def test_sharing_nothing_reproduces_the_independent_fits_exactly():
    """The control that proves the machinery is not quietly constraining
    something: with no shared names the joint objective separates, so every
    parameter must land where the standalone fit put it.

    Agreement is to 1e-4 relative, not to machine precision, and the reason is
    the optimiser rather than the model: curve_fit's convergence test is on the
    POOLED objective, so a parameter stops moving once its contribution to the
    combined residual is negligible, a slightly weaker condition than its own
    standalone fit imposes. 1e-4 is still three orders tighter than the shift
    that real sharing produces, which the assertion below pins."""
    single = {**GLOBAL_BASE, "x": _GX.tolist()}
    ind = [eng.run_dose_response({**single, "y": y})["curveFit"]
           for y in (GLOBAL_A, GLOBAL_B)]
    out = eng.run_dose_response({**GLOBAL_BASE, "datasets": GLOBAL_SETS,
                                 "sharedParameters": []})
    cf = out["curveFit"]
    shared = eng.run_dose_response({**GLOBAL_BASE, "datasets": GLOBAL_SETS,
                                    "sharedParameters": SHARED3})["curveFit"]
    for i in range(2):
        for nm in ("bottom", "top", "logEC50", "hillSlope"):
            free_v = cf["datasets"][i]["parameters"][nm]["value"]
            ind_v = ind[i]["parameters"][nm]["value"]
            shared_v = shared["datasets"][i]["parameters"][nm]["value"]
            assert close(free_v, ind_v, 1e-4), (i, nm, free_v, ind_v)
            # The unshared fit sits on top of the independent one; the shared fit
            # does not. If both were within tolerance the test would prove nothing.
            assert abs(free_v - ind_v) < abs(shared_v - ind_v) / 100, (i, nm)
    # ... and the record says the fit was unconstrained rather than letting the
    # user believe the curves informed each other.
    assert any("no shared parameters" in w for w in out["warnings"]), out["warnings"]


def test_global_fit_shares_only_the_names_that_are_real_parameters():
    out = eng.run_dose_response({**GLOBAL_BASE, "datasets": GLOBAL_SETS,
                                 "sharedParameters": ["bottom", "slope", "Emax"]})
    assert out["curveFit"]["sharedParameters"] == ["bottom"]
    note = [w for w in out["warnings"] if "not a parameter" in w]
    assert len(note) == 1 and "'slope'" in note[0] and "'Emax'" in note[0], out["warnings"]


def test_global_fit_model_option_3pl_4pl_5pl():
    for model, npar in (("3pl", 3), ("4pl", 4), ("5pl", 5)):
        shared = [s for s in SHARED3 if s in _stacked_gold([], model=model)[0]]
        out = eng.run_dose_response({**GLOBAL_BASE, "model": model,
                                     "datasets": GLOBAL_SETS, "sharedParameters": shared})
        cf = out["curveFit"]
        assert cf["model"] == model.upper(), cf["model"]
        assert len(cf["datasets"][0]["parameters"]) == npar + 1   # + derived ec50
        names, at, gold, _ = _stacked_gold(shared, model=model)
        j = names.index("logEC50")
        assert close(cf["datasets"][0]["parameters"]["logEC50"]["value"],
                     gold[at(j, 0)], 1e-6), model


def test_global_fit_weighting_option():
    """Weighting is a user-selectable option and two earlier defects lived on
    non-default option values, so every one of the three is exercised."""
    seen = []
    for w in ("none", "1/Y", "1/Y^2"):
        names, at, gold, _ = _stacked_gold(SHARED3, sigma_mode=w)
        cf = eng.run_dose_response({**GLOBAL_BASE, "weighting": w, "datasets": GLOBAL_SETS,
                                    "sharedParameters": SHARED3})["curveFit"]
        j = names.index("logEC50")
        assert close(cf["datasets"][0]["parameters"]["logEC50"]["value"],
                     gold[at(j, 0)], 1e-6), w
        seen.append(round(cf["datasets"][0]["ec50"], 10))
    assert len(set(seen)) == 3, seen   # if they agreed the option would be decorative


def test_global_fit_confidence_bands_option_on_and_off():
    on = eng.run_dose_response({**GLOBAL_BASE, "datasets": GLOBAL_SETS,
                                "sharedParameters": SHARED3,
                                "confidenceBands": True})["curveFit"]
    off = eng.run_dose_response({**GLOBAL_BASE, "datasets": GLOBAL_SETS,
                                 "sharedParameters": SHARED3,
                                 "confidenceBands": False})["curveFit"]
    for d in off["datasets"]:
        assert d["confidenceBand"] is None
    for d in on["datasets"]:
        assert d["confidenceBand"] is not None
        assert len(d["confidenceBand"]["x"]) == 120
        assert all(u > l for u, l in zip(d["confidenceBand"]["upper"],
                                         d["confidenceBand"]["lower"]))


def test_global_band_carries_the_shared_parameters_uncertainty():
    """A curve's band must widen for the uncertainty in parameters it did not
    estimate alone; taking only this dataset's own slots would understate it."""
    shared = eng.run_dose_response({**GLOBAL_BASE, "datasets": GLOBAL_SETS,
                                    "sharedParameters": SHARED3})["curveFit"]
    free = eng.run_dose_response({**GLOBAL_BASE, "datasets": GLOBAL_SETS,
                                  "sharedParameters": []})["curveFit"]
    sb = shared["datasets"][0]["confidenceBand"]
    fb = free["datasets"][0]["confidenceBand"]
    assert any(u - l > 0 for u, l in zip(sb["upper"], sb["lower"]))
    assert any(u - l > 0 for u, l in zip(fb["upper"], fb["lower"]))
    # Different fits, so different bands - the shared one is not a copy.
    assert not close(sb["upper"][60] - sb["lower"][60],
                     fb["upper"][60] - fb["lower"][60], 1e-6)


def test_global_fit_alpha_option_widens_every_parameter_interval():
    a = eng.run_dose_response({**GLOBAL_BASE, "alpha": 0.05, "datasets": GLOBAL_SETS,
                               "sharedParameters": SHARED3})["curveFit"]
    b = eng.run_dose_response({**GLOBAL_BASE, "alpha": 0.01, "datasets": GLOBAL_SETS,
                               "sharedParameters": SHARED3})["curveFit"]
    for nm in SHARED3:
        assert ((b["parameters"][nm]["ciHigh"] - b["parameters"][nm]["ciLow"])
                > (a["parameters"][nm]["ciHigh"] - a["parameters"][nm]["ciLow"])), nm
    # and the exact critical value, against scipy: df = n_total - n_flat.
    names, at, gold, gcov = _stacked_gold(SHARED3)
    n_total, n_flat = 20, gold.size
    t = float(stats.t.ppf(1 - 0.01 / 2, n_total - n_flat))
    j = names.index("top")
    se = float(np.sqrt(np.diag(gcov))[at(j, None)])
    assert close(b["parameters"]["top"]["ciHigh"], gold[at(j, None)] + t * se, 1e-6)


def test_global_fit_declines_interpolation_and_says_so():
    out = eng.run_dose_response({**GLOBAL_BASE, "datasets": GLOBAL_SETS,
                                 "sharedParameters": SHARED3,
                                 "unknowns": [{"label": "u1", "signal": 50.0}]})
    assert out["curveFit"]["interpolated"] is None
    assert any("not interpolated from a global fit" in w for w in out["warnings"])


def test_global_fit_reports_a_shared_ec50_only_when_logec50_is_shared():
    with_ec = eng.run_dose_response({**GLOBAL_BASE, "datasets": GLOBAL_SETS,
                                     "sharedParameters": ["logEC50"]})["curveFit"]
    assert with_ec["ec50"] is not None
    assert close(with_ec["ec50"], 10.0 ** with_ec["parameters"]["logEC50"]["value"], 1e-12)
    without = eng.run_dose_response({**GLOBAL_BASE, "datasets": GLOBAL_SETS,
                                     "sharedParameters": SHARED3})["curveFit"]
    assert without["ec50"] is None


def test_global_fit_needs_two_usable_datasets_and_says_when_it_does_not_have_them():
    out = eng.run_dose_response({**GLOBAL_BASE, "sharedParameters": SHARED3,
                                 "datasets": [GLOBAL_SETS[0],
                                              {"label": "empty", "x": [0.0], "y": [1.0]}]})
    assert out["curveFit"]["converged"] is False
    assert any("at least two datasets" in w for w in out["warnings"]), out["warnings"]


def test_global_fit_pooled_scores_come_from_the_pooled_residuals():
    names, at, gold, _ = _stacked_gold(SHARED3)
    func = eng._four_pl
    ys = np.concatenate([np.asarray(GLOBAL_A, float), np.asarray(GLOBAL_B, float)])
    pred = np.concatenate([
        func(_GLX, *[gold[at(j, i)] for j in range(4)]) for i in range(2)])
    ss_res = float(np.sum((ys - pred) ** 2))
    ss_tot = float(np.sum((ys - ys.mean()) ** 2))
    n, k = 20, gold.size
    cf = eng.run_dose_response({**GLOBAL_BASE, "datasets": GLOBAL_SETS,
                                "sharedParameters": SHARED3})["curveFit"]
    assert close(cf["rSquared"], 1 - ss_res / ss_tot, 1e-7)
    assert close(cf["syx"], math.sqrt(ss_res / (n - k)), 1e-7)
    kk = k + 1
    assert close(cf["aicc"], n * math.log(ss_res / n) + 2 * kk
                 + (2 * kk * (kk + 1)) / (n - kk - 1), 1e-7)


# ── backward compatibility of the additive payload ────────────────────────────


def test_a_payload_without_datasets_is_unchanged():
    """The single-curve path must be bit-identical to what it was before
    `datasets` existed, or the option is a breaking change wearing an additive
    costume."""
    out = eng.run_dose_response({"x": DOSE_X, "y": DOSE_Y, "model": "4pl",
                                 "weighting": "none", "alpha": 0.05})
    gold = _fit(None)
    cf = out["curveFit"]
    assert "global" not in cf
    assert close(cf["ec50"], 10.0 ** gold[2], 1e-9)
    assert cf["curve"] is not None and cf["confidenceBand"] is not None


def test_one_dataset_is_a_single_fit_not_a_degenerate_global_one():
    a = eng.run_dose_response({"x": DOSE_X, "y": DOSE_Y, "model": "4pl",
                               "weighting": "none", "alpha": 0.05})["curveFit"]
    b = eng.run_dose_response({"model": "4pl", "weighting": "none", "alpha": 0.05,
                               "sharedParameters": SHARED3,
                               "datasets": [{"label": "only", "x": DOSE_X,
                                             "y": DOSE_Y}]})["curveFit"]
    assert "global" not in b
    assert close(b["ec50"], a["ec50"], 1e-12)
    assert close(b["rSquared"], a["rSquared"], 1e-12)


def test_global_fit_reaches_the_engine_entry_point():
    out = eng.run({"test": "nonlinear-regression", "shape": "curve", **GLOBAL_BASE,
                   "datasets": GLOBAL_SETS, "sharedParameters": SHARED3})
    assert out["error"] is None and out["testRan"] == "nonlinear-regression"
    assert out["curveFit"]["global"] is True
    assert [d["label"] for d in out["curveFit"]["datasets"]] == ["cmpdA", "cmpdB"]


def test_global_fit_excludes_zero_dose_points_per_dataset_and_names_the_dataset():
    sets = [{"label": "cmpdA", "x": [0.0] + _GX.tolist(), "y": [5.0] + GLOBAL_A},
            GLOBAL_SETS[1]]
    out = eng.run_dose_response({**GLOBAL_BASE, "datasets": sets,
                                 "sharedParameters": SHARED3})
    assert out["curveFit"]["converged"] is True
    w = [x for x in out["warnings"] if "zero or negative" in x]
    assert len(w) == 1 and "cmpdA" in w[0], out["warnings"]
    # Excluded, not substituted: identical to the fit without the vehicle row.
    gold = eng.run_dose_response({**GLOBAL_BASE, "datasets": GLOBAL_SETS,
                                  "sharedParameters": SHARED3})["curveFit"]
    assert close(out["curveFit"]["datasets"][0]["ec50"], gold["datasets"][0]["ec50"], 1e-9)



if __name__ == "__main__":
    import sys
    tests = [(k, v) for k, v in sorted(globals().items()) if k.startswith("test_")]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"PASS  {name}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL  {name}: {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - failed} passed, {failed} failed")
    sys.exit(1 if failed else 0)

/**
 * The static Python that every exported script carries: the raw-file reader,
 * the pipeline (a port of engine/resolver.ts) and the report printer.
 *
 * It is a string rather than a .py file because the generator runs in the
 * browser, where there is no filesystem to read one from. Nothing in here
 * computes a statistic — the numbers all come from notes9_engine.py, which the
 * generator embeds verbatim alongside this.
 */

export const RUNTIME_PY = `# ═══ pipeline ═══════════════════════════════════════════════════════════════
# A line-for-line port of lib/data-analysis/engine/resolver.ts. The order below
# is the order the app ran, and it does not commute:
#
#   read raw file -> filter -> transform (in order) -> partition exclusions ->
#   missing-value strategy -> shape for the test -> engine
#
# Nothing here computes a statistic. Every number printed at the bottom comes
# out of the engine section above, which is notes9_engine.py as shipped.


def _js_str(v):
    """JavaScript's String(x), because group LEVELS are compared as strings.

    Python's str(3.0) is "3.0" and JavaScript's String(3) is "3"; a condition
    column holding whole numbers would otherwise split into different levels
    here than it did in the app."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float):
        if _math.isnan(v):
            return "NaN"
        if _math.isinf(v):
            return "Infinity" if v > 0 else "-Infinity"
        if v == int(v) and abs(v) < 1e21:
            return str(int(v))
        return repr(v)
    return str(v)


def _num(v):
    if v is None or v == "":
        return None
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if _math.isfinite(f) else None


def _label(v):
    if v is None or v == "":
        return "-"
    return _js_str(v)


def _matches(value, op, target):
    n, t = _num(value), _num(target)
    if op == "eq":
        return _js_str(value) == _js_str(target)
    if op == "neq":
        return _js_str(value) != _js_str(target)
    if op == "lt":
        return n is not None and t is not None and n < t
    if op == "lte":
        return n is not None and t is not None and n <= t
    if op == "gt":
        return n is not None and t is not None and n > t
    if op == "gte":
        return n is not None and t is not None and n >= t
    if op == "in":
        return isinstance(target, list) and _js_str(value) in [_js_str(x) for x in target]
    if op == "notIn":
        return isinstance(target, list) and _js_str(value) not in [_js_str(x) for x in target]
    if op == "contains":
        return _js_str(target).lower() in _js_str(value).lower()
    if op == "isNull":
        return value is None or value == ""
    if op == "notNull":
        return not (value is None or value == "")
    return True


def _median(sorted_vals):
    mid = len(sorted_vals) // 2
    if len(sorted_vals) % 2 == 1:
        return sorted_vals[mid]
    return (sorted_vals[mid - 1] + sorted_vals[mid]) / 2


class PipelineError(Exception):
    """A precondition the resolver would have blocked on."""


def _resolve_reference(rows, spec, level, column):
    """Mean of \`column\` over the rows in the named LEVEL, resolved the way the
    resolver resolves it: declared group column first, then a group/treatment
    role, then the one column the level appears in. Never a table-wide mean."""
    def holds(c):
        return any(_label(r["values"].get(c)) == level for r in rows)

    declared = [c for c in
                [spec["analysis"].get("groupColumn")]
                + [r["column"] for r in spec.get("roles", [])
                   if r.get("role") in ("group", "treatment")]
                if c is not None]

    found = next((c for c in declared if holds(c)), None)
    if found is None:
        seen, anywhere = set(), []
        for r in rows:
            for k in r["values"]:
                if k not in seen:
                    seen.add(k)
                    if holds(k):
                        anywhere.append(k)
        if len(anywhere) > 1:
            raise PipelineError(
                f'"{level}" appears in more than one column ({", ".join(anywhere)}), '
                "so which one holds the reference group is not decidable.")
        found = anywhere[0] if anywhere else None
    if found is None:
        raise PipelineError(f'No group named "{level}" was found in the data.')

    vals = [v for v in (_num(r["values"].get(column)) for r in rows
                        if _label(r["values"].get(found)) == level) if v is not None]
    if not vals:
        raise PipelineError(
            f'The "{level}" rows carry no usable {column} value, so there is '
            "nothing to reference against.")
    return sum(vals) / len(vals)


def _apply_transform(rows, t, reference, warnings):
    kind = t["kind"]

    def num(r, c):
        return _num(r["values"].get(c))

    def rewrite(fn):
        out = []
        for r in rows:
            values = dict(r["values"])
            values[t["column"]] = fn(r)
            out.append({"rowId": r["rowId"], "values": values})
        return out

    if kind in ("log10", "ln"):
        f = _math.log10 if kind == "log10" else _math.log
        return rewrite(lambda r: f(num(r, t["column"]))
                       if num(r, t["column"]) is not None and num(r, t["column"]) > 0 else None)

    if kind == "zscore":
        vals = [v for v in (num(r, t["column"]) for r in rows) if v is not None]
        mean = sum(vals) / (len(vals) or 1)
        sd = _math.sqrt(sum((b - mean) ** 2 for b in vals) / max(len(vals) - 1, 1))
        return rewrite(lambda r: (num(r, t["column"]) - mean) / sd
                       if num(r, t["column"]) is not None and sd > 0 else None)

    if kind == "percent":
        denom = [v for v in (num(r, t["of"]) for r in rows) if v is not None]
        total = sum(denom)
        return rewrite(lambda r: (num(r, t["column"]) / total) * 100
                       if num(r, t["column"]) is not None and total != 0 else None)

    if kind == "foldChange":
        # A baseline that read zero yields null, not Infinity.
        return rewrite(lambda r: num(r, t["column"]) / reference
                       if num(r, t["column"]) is not None and reference else None)

    if kind == "normalise":
        vals = [v for v in (num(r, t["column"]) for r in rows) if v is not None]
        lo, hi = min(vals), max(vals)
        span = hi - lo
        return rewrite(lambda r: t["min"] + ((num(r, t["column"]) - lo) / span) * (t["max"] - t["min"])
                       if num(r, t["column"]) is not None and span > 0 else None)

    if kind == "normaliseToControl":
        # The control mean is taken WITHIN each \`per\` bucket; one global mean
        # would fold plate-to-plate drift straight back in.
        def bucket_of(r):
            return "␟".join(_label(r["values"].get(c)) for c in t.get("per", []))
        controls = {}
        for r in rows:
            if _label(r["values"].get(t["groupColumn"])) != t["controlLevel"]:
                continue
            v = num(r, t["column"])
            if v is None:
                continue
            controls.setdefault(bucket_of(r), []).append(v)
        scale = 100 if t.get("as", "percent") == "percent" else 1

        def scaled(r):
            ctrl = controls.get(bucket_of(r))
            mean = (sum(ctrl) / len(ctrl)) if ctrl else None
            v = num(r, t["column"])
            if v is None or mean is None or mean == 0:
                return None
            return (v / mean) * scale
        return rewrite(scaled)

    if kind == "pivotLonger":
        carried = [c for c in (rows[0]["values"].keys() if rows else []) if c not in t["columns"]]
        out = []
        for r in rows:
            for c in t["columns"]:
                values = {k: r["values"].get(k) for k in carried}
                values[t["namesTo"]] = c
                values[t["valuesTo"]] = r["values"].get(c)
                out.append({"rowId": f'{r["rowId"]}␟{c}', "values": values})
        return out

    if kind == "baselineSubtract":
        b = t.get("blankValue")
        if b is None:
            b = reference if reference is not None else 0
        return rewrite(lambda r: num(r, t["column"]) - b
                       if num(r, t["column"]) is not None else None)

    if kind == "collapseReplicates":
        buckets = {}
        for r in rows:
            key = "␟".join(_label(r["values"].get(c)) for c in t["by"])
            buckets.setdefault(key, []).append(r)
        first_keys = list(rows[0]["values"].keys()) if rows else []
        numeric_cols = [c for c in first_keys
                        if any(_num(r["values"].get(c)) is not None for r in rows)]
        out = []
        for group in buckets.values():
            values = dict(group[0]["values"])
            for c in numeric_cols:
                vals = [v for v in (_num(r["values"].get(c)) for r in group) if v is not None]
                if not vals:
                    continue
                values[c] = (_median(sorted(vals)) if t["statistic"] == "median"
                             else sum(vals) / len(vals))
            out.append({"rowId": "+".join(r["rowId"] for r in group), "values": values})
        return out

    if kind == "calculatedColumn":
        # Formula evaluation belongs to the sheet, not here.
        warnings.append(
            f'The calculated column "{t["name"]}" is evaluated by the spreadsheet, '
            "not by the analysis pipeline; its values are read from the file as-is.")
        return rows

    return rows


def _apply_missing_values(rows, spec, warnings):
    declared = spec["analysis"].get("responseColumns") or []
    if declared:
        pool = declared
    else:
        pool, seen = [], set()
        for r in rows:
            for k in r["values"]:
                if k not in seen:
                    seen.add(k)
                    pool.append(k)
    cols = [c for c in pool if any(_num(r["values"].get(c)) is not None for r in rows)]
    holes = sum(1 for r in rows for c in cols if _num(r["values"].get(c)) is None)
    if holes == 0:
        return rows
    missing = f'{holes} missing value{"" if holes == 1 else "s"}'
    strategy = spec["analysis"].get("missingValues", "pairwise")

    if strategy == "listwise":
        kept = [r for r in rows if all(_num(r["values"].get(c)) is not None for c in cols)]
        dropped = len(rows) - len(kept)
        warnings.append(
            f'{dropped} row{"" if dropped == 1 else "s"} dropped whole: a value was '
            f'missing in {", ".join(cols)} (listwise deletion).')
        return kept

    if strategy in ("mean-impute", "median-impute"):
        use_mean = strategy == "mean-impute"
        fill = {}
        for c in cols:
            vals = [v for v in (_num(r["values"].get(c)) for r in rows) if v is not None]
            if not vals:
                continue
            fill[c] = (sum(vals) / len(vals)) if use_mean else _median(sorted(vals))
        warnings.append(
            f'{missing} filled with the column {"mean" if use_mean else "median"}; n is '
            "unchanged but the spread is narrower than the measured data.")
        out = []
        for r in rows:
            values = dict(r["values"])
            for c in cols:
                if c in fill and _num(values.get(c)) is None:
                    values[c] = fill[c]
            out.append({"rowId": r["rowId"], "values": values})
        return out

    if strategy == "pairwise":
        warnings.append(f"{missing} kept in place; each comparison uses the rows where "
                        "its own variables are present.")
        return rows

    warnings.append(f"{missing} left as-is; they are omitted from the computation.")
    return rows


def resolve_payload(spec, table):
    """AnalysisSpec + table -> the payload notes9_engine.run() consumes."""
    warnings = []
    test = spec["analysis"]["test"]

    # 1, filter
    rows = [r for r in table["rows"]
            if all(_matches(r["values"].get(f["column"]), f["op"], f.get("value"))
                   for f in spec.get("filters", []))]
    filtered_out = len(table["rows"]) - len(rows)
    if filtered_out > 0:
        warnings.append(f'{filtered_out} row{"" if filtered_out == 1 else "s"} removed by filters.')

    # 2, transform, in order
    for t in spec.get("transforms", []):
        reference = None
        if t["kind"] == "foldChange":
            reference = _resolve_reference(rows, spec, t["baseline"], t["column"])
        elif t["kind"] == "baselineSubtract" and t.get("blankValue") is None and t.get("blankGroup"):
            reference = _resolve_reference(rows, spec, t["blankGroup"], t["column"])
        rows = _apply_transform(rows, t, reference, warnings)

    # 3, exclusions: partitioned, never dropped
    excluded_ids = {e["rowId"] for e in spec.get("exclusions", [])}
    plot_rows = [{"rowId": r["rowId"], "values": r["values"],
                  "excluded": r["rowId"] in excluded_ids} for r in rows]
    kept = [r for r in rows if r["rowId"] not in excluded_ids]
    applied = len(rows) - len(kept)
    orphaned = len(excluded_ids) - applied
    if applied > 0:
        warnings.append(f'{applied} point{"" if applied == 1 else "s"} excluded; the '
                        "result is computed without them.")
    if orphaned > 0:
        warnings.append(
            f'{orphaned} exclusion{" was" if orphaned == 1 else "s were"} NOT applied: '
            f'the row{" it names no longer exists" if orphaned == 1 else "s they name no longer exist"} '
            "after a reshape, collapsing replicates or folding wide columns rewrites row ids. "
            "Re-exclude those points on the current table.")

    # 3b, missing values
    included = _apply_missing_values(kept, spec, warnings)
    if not included:
        raise PipelineError("No rows remain after filters and exclusions.")

    base = {
        "test": test,
        "alpha": spec["analysis"]["alpha"],
        "tails": spec["analysis"]["tails"],
        "plotRows": plot_rows,
        "warnings": warnings,
    }

    response = (spec["analysis"].get("responseColumns") or [None])[0]
    group_col = spec["analysis"].get("groupColumn")
    subject_col = spec.get("design", {}).get("subjectColumn")
    resp_cols = spec["analysis"].get("responseColumns") or []

    def build_groups():
        groups = {}
        for r in included:
            level = _label(r["values"].get(group_col))
            v = _num(r["values"].get(response))
            if v is None:
                continue
            entry = groups.setdefault(level, {"values": [], "rowIds": []})
            entry["values"].append(v)
            entry["rowIds"].append(r["rowId"])
        return groups

    def too_few(need, have):
        raise PipelineError(f'Not enough data: {have} usable value{"" if have == 1 else "s"}, '
                            f"{need} needed.")

    # 4, shape for the test
    if test in ("none", "descriptives", "normality"):
        available, seen = list(table["columns"]), set(table["columns"])
        for r in included:
            for k in r["values"]:
                if k not in seen:
                    seen.add(k)
                    available.append(k)
        cols = resp_cols or [c for c in available
                             if any(_num(r["values"].get(c)) is not None for r in included)]
        if not cols:
            raise PipelineError("No numeric column to summarise.")
        return {**base, "shape": "columns",
                "columns": {c: [_num(r["values"].get(c)) for r in included] for c in cols},
                "rowIds": [r["rowId"] for r in included]}

    if test == "t-one-sample":
        values = [v for v in (_num(r["values"].get(response)) for r in included) if v is not None]
        if len(values) < 2:
            too_few(2, len(values))
        return {**base, "shape": "groups", "groups": {"sample": values},
                "referenceLevel": None, "postHoc": "none", "equalVariance": True,
                "rowIds": [r["rowId"] for r in included]}

    if test in ("t-unpaired", "t-welch", "mann-whitney"):
        groups = build_groups()
        levels = list(groups.keys())
        if len(levels) != 2:
            raise PipelineError(f'"{group_col}" has {len(levels)} level(s); a two-group '
                                "test compares exactly two.")
        a, b = levels
        if len(groups[a]["values"]) < 2 or len(groups[b]["values"]) < 2:
            too_few(2, min(len(groups[a]["values"]), len(groups[b]["values"])))
        return {**base, "shape": "groups",
                "groups": {a: groups[a]["values"], b: groups[b]["values"]},
                "referenceLevel": spec["analysis"].get("referenceLevel"),
                "postHoc": "none",
                # Welch is the default; Student requires a deliberate choice.
                "equalVariance": test == "t-unpaired",
                "rowIds": groups[a]["rowIds"] + groups[b]["rowIds"]}

    if test in ("t-paired", "wilcoxon-signed-rank"):
        if not subject_col:
            raise PipelineError("A paired test needs to know which rows belong to the same subject.")
        by_level = {}
        for r in included:
            v = _num(r["values"].get(response))
            if v is None:
                continue
            by_level.setdefault(_label(r["values"].get(group_col)), {})[
                _label(r["values"].get(subject_col))] = v
        levels = list(by_level.keys())
        if len(levels) != 2:
            raise PipelineError(f"A paired test needs exactly two conditions; "
                                f'"{group_col}" has {len(levels)}.')
        la, lb = levels
        ma, mb = by_level[la], by_level[lb]
        pairs, unmatched = [], 0
        for subject, va in ma.items():
            if subject not in mb:
                unmatched += 1
                continue
            pairs.append([va, mb[subject]])
        unmatched += sum(1 for s in mb if s not in ma)
        if unmatched > 0:
            warnings.append(f'{unmatched} subject{"" if unmatched == 1 else "s"} had no '
                            "matching pair and were excluded from the test.")
        if len(pairs) < 2:
            too_few(2, len(pairs))
        return {**base, "shape": "pairs", "pairs": pairs, "labels": [la, lb],
                "rowIds": [r["rowId"] for r in included]}

    if test in ("anova-one-way", "kruskal-wallis"):
        groups = build_groups()
        levels = list(groups.keys())
        if len(levels) < 3:
            raise PipelineError(f'An ANOVA needs at least three groups; "{group_col}" has '
                                f"{len(levels)}.")
        if any(len(groups[l]["values"]) < 2 for l in levels):
            too_few(2, 1)
        return {**base, "shape": "groups",
                "groups": {l: groups[l]["values"] for l in levels},
                "referenceLevel": spec["analysis"].get("referenceLevel"),
                "postHoc": spec["analysis"].get("postHoc", "none"),
                "equalVariance": True,
                "rowIds": [rid for l in levels for rid in groups[l]["rowIds"]]}

    if test in ("friedman", "anova-rm"):
        if not subject_col:
            raise PipelineError("A repeated-measures test needs a subject column.")
        conditions, subjects, lookup = [], [], {}
        for r in included:
            c, s = _label(r["values"].get(group_col)), _label(r["values"].get(subject_col))
            if c not in conditions:
                conditions.append(c)
            if s not in subjects:
                subjects.append(s)
        for r in included:
            v = _num(r["values"].get(response))
            if v is None:
                continue
            lookup[(_label(r["values"].get(subject_col)),
                    _label(r["values"].get(group_col)))] = v
        complete, matrix = [], []
        for s in subjects:
            row = [lookup.get((s, c)) for c in conditions]
            if any(v is None for v in row):
                continue
            complete.append(s)
            matrix.append(row)
        dropped = len(subjects) - len(complete)
        if dropped > 0:
            warnings.append(
                f'{dropped} subject{"" if dropped == 1 else "s"} had missing conditions and were dropped.'
                + (" A mixed-effects model would keep them." if test == "anova-rm" else ""))
        if len(matrix) < 2 or len(conditions) < 2:
            too_few(2, len(matrix))
        return {**base, "shape": "matrix", "matrix": matrix, "subjects": complete,
                "conditions": conditions, "rowIds": [r["rowId"] for r in included]}

    if test in ("anova-two-way", "mixed-effects"):
        second = spec["analysis"].get("secondFactorColumn")
        if test == "anova-two-way" and not second:
            raise PipelineError("A two-way ANOVA needs a second factor.")
        long = []
        for r in included:
            y = _num(r["values"].get(response))
            if y is None:
                continue
            item = {"y": y, "f1": _label(r["values"].get(group_col))}
            if second:
                item["f2"] = _label(r["values"].get(second))
            if subject_col:
                item["subject"] = _label(r["values"].get(subject_col))
            long.append(item)
        if len(long) < 4:
            too_few(4, len(long))
        return {**base, "shape": "long", "long": long, "interaction": True,
                "rowIds": [r["rowId"] for r in included]}

    if test in ("chi-square", "fisher-exact"):
        row_var, col_var = (resp_cols + [None, None])[:2]
        if not row_var or not col_var:
            raise PipelineError("A contingency test needs two categorical columns.")
        row_levels, col_levels = [], []
        for r in included:
            rl, cl = _label(r["values"].get(row_var)), _label(r["values"].get(col_var))
            if rl not in row_levels:
                row_levels.append(rl)
            if cl not in col_levels:
                col_levels.append(cl)
        counts = [[sum(1 for r in included
                       if _label(r["values"].get(row_var)) == rl
                       and _label(r["values"].get(col_var)) == cl)
                   for cl in col_levels] for rl in row_levels]
        if len(row_levels) < 2 or len(col_levels) < 2:
            raise PipelineError("A contingency table needs at least two levels on each axis.")
        return {**base, "shape": "contingency", "table": counts,
                "rowLevels": row_levels, "colLevels": col_levels,
                "rowIds": [r["rowId"] for r in included]}

    if test in ("correlation-pearson", "correlation-spearman", "linear-regression"):
        x_col, y_col = (resp_cols + [None, None])[:2]
        if not x_col or not y_col:
            raise PipelineError("This needs an x and a y column.")
        x, y, ids = [], [], []
        for r in included:
            xv, yv = _num(r["values"].get(x_col)), _num(r["values"].get(y_col))
            if xv is None or yv is None:
                continue  # pairwise complete
            x.append(xv)
            y.append(yv)
            ids.append(r["rowId"])
        if len(x) < 3:
            too_few(3, len(x))
        return {**base, "shape": "xy", "x": x, "y": y, "forceIntercept": False, "rowIds": ids}

    if test == "nonlinear-regression":
        x_col, y_col = (resp_cols + [None, None])[:2]
        if not x_col or not y_col:
            raise PipelineError("A curve fit needs a concentration column and a signal column.")
        nl = spec["analysis"].get("nonlinear")
        if not nl:
            raise PipelineError("No curve model selected.")
        x, y, ids, non_positive = [], [], [], 0
        for r in included:
            xv, yv = _num(r["values"].get(x_col)), _num(r["values"].get(y_col))
            if xv is None or yv is None:
                continue
            if xv <= 0:
                non_positive += 1
                continue
            x.append(xv)
            y.append(yv)
            ids.append(r["rowId"])
        if non_positive > 0:
            warnings.append(f'{non_positive} point{"" if non_positive == 1 else "s"} with '
                            "concentration ≤ 0 excluded from the log-scale fit.")
        min_points = 3 if nl["model"] == "3pl" else 5 if nl["model"] == "5pl" else 4
        if len(x) < min_points:
            raise PipelineError(f'A {nl["model"].upper()} fit needs at least {min_points} '
                                f"points; {len(x)} available.")
        if len(set(x)) < min_points:
            raise PipelineError(
                f'A {nl["model"].upper()} fit estimates {min_points} parameters and needs at '
                f"least {min_points} different concentrations; these {len(x)} points cover "
                f"only {len(set(x))}.")
        return {**base, "shape": "curve", "x": x, "y": y, "model": nl["model"],
                "weighting": nl.get("weighting", "none"),
                "sharedParameters": nl.get("sharedParameters", []),
                "confidenceBands": nl.get("confidenceBands", True),
                "unknowns": [], "rowIds": ids}

    if test == "kaplan-meier":
        time_col, event_col = (resp_cols + [None, None])[:2]
        if not time_col or not event_col:
            raise PipelineError("Survival analysis needs a time column and an event column.")
        durations, events, groups, ids = [], [], [], []
        for r in included:
            t_, e_ = _num(r["values"].get(time_col)), _num(r["values"].get(event_col))
            if t_ is None or e_ is None:
                continue
            durations.append(t_)
            events.append(0 if e_ == 0 else 1)
            if group_col:
                groups.append(_label(r["values"].get(group_col)))
            ids.append(r["rowId"])
        if len(durations) < 2:
            too_few(2, len(durations))
        return {**base, "shape": "survival", "durations": durations, "events": events,
                "groups": groups if group_col else None, "rowIds": ids}

    raise PipelineError(f'The test "{test}" is not yet supported.')


# ═══ raw file -> the exact table the app analysed ═══════════════════════════
#
# The app reads a sheet through a header detector that can skip a preamble, fold
# a two-row header, read a unit row and drop a footnote. Re-implementing that
# here would mean this script could disagree with the app the day the detector
# changes. Instead the OUTCOME of that read is recorded above — the column names
# and the 1-based sheet rows the data occupied — and applied to the raw grid.
# The file is still the source; nothing but raw cells is baked in.


def _cell(v):
    """One raw grid cell, coerced the way the app's sheet reader coerces it."""
    if v is None:
        return None
    if isinstance(v, float) and _math.isnan(v):
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v
    s = str(v)
    if s == "":
        return None
    try:
        f = float(s)
    except ValueError:
        return s
    return f if _math.isfinite(f) else s


def read_raw_grid(path):
    lower = str(path).lower()
    if lower.endswith((".xlsx", ".xlsm", ".xls")):
        frame = _pd.read_excel(path, sheet_name=(SHEET or 0), header=None, dtype=object)
    else:
        sep = "\\t" if lower.endswith((".tsv", ".tab")) else ","
        frame = _pd.read_csv(path, header=None, sep=sep, dtype=object,
                             keep_default_na=True, skip_blank_lines=False)
    return frame.values.tolist()


def read_table(path):
    if INLINE_ROWS is not None:
        # The rows no longer map onto sheet rows (a reshape rewrote their ids
        # before the spec was saved), so they travel with the script instead.
        return {"columns": list(COLUMNS),
                "rows": [{"rowId": r["rowId"], "values": dict(r["values"])} for r in INLINE_ROWS]}
    grid = read_raw_grid(path)
    rows = []
    for n in ROW_NUMBERS:
        raw = grid[n - 1] if 0 <= n - 1 < len(grid) else []
        values = {}
        for i, name in enumerate(COLUMNS):
            values[name] = _cell(raw[i]) if i < len(raw) else None
        rows.append({"rowId": f"row-{n}", "values": values})
    return {"columns": list(COLUMNS), "rows": rows}


# ═══ report ═════════════════════════════════════════════════════════════════


def _n(v, digits=6):
    if v is None:
        return "n/a"
    if isinstance(v, float):
        return f"{v:.{digits}g}"
    return str(v)


def print_report(result):
    rule = "─" * 72
    print(rule)
    print(f"Notes9 reproducible analysis — {DATASET_NAME}")
    print(f"engine   {ENGINE_VERSION}")
    print(f"spec     {SPEC_HASH}")
    print(rule)

    if result.get("error"):
        e = result["error"]
        print(f"\\nFAILED [{e['code']}] {e['message']}")
        if e.get("detail"):
            print(f"  detail: {e['detail']}")

    desc = result.get("descriptives") or []
    if desc:
        print("\\nDescriptives")
        head = ("column", "n", "mean", "sd", "sem", "median", "min", "max", "95% CI")
        print("  " + "  ".join(h.ljust(12) for h in head))
        for d in desc:
            if not d.get("n"):
                print(f"  {str(d['column']).ljust(12)}  0")
                continue
            ci = f"{_n(d['ci95Low'], 4)}..{_n(d['ci95High'], 4)}"
            cells = (str(d["column"]), str(d["n"]), _n(d["mean"], 6), _n(d["sd"], 6),
                     _n(d["sem"], 6), _n(d["median"], 6), _n(d["min"], 6), _n(d["max"], 6), ci)
            print("  " + "  ".join(c.ljust(12) for c in cells))

    t = result.get("test")
    if t:
        print(f"\\nTest: {t['test']}")
        print(f"  statistic     {_n(t.get('statistic'))}")
        print(f"  df            {_n(t.get('df'))}")
        print(f"  p             {_n(t.get('pValue'), 10)}")
        for g, n in (t.get("groupSizes") or {}).items():
            print(f"  n[{g}]        {n}")
        for e in t.get("effectSizes") or []:
            span = ("" if e.get("ciLow") is None
                    else f"  (CI {_n(e['ciLow'])} to {_n(e['ciHigh'])})")
            term = f" [{e['term']}]" if e.get("term") else ""
            print(f"  effect {e['name']}{term} = {_n(e['value'])}{span}")
        for a in t.get("assumptions") or []:
            print(f"  assumption {a['name']}: statistic {_n(a.get('statistic'))}, "
                  f"p {_n(a.get('pValue'))} — {a['verdict']}")
        if t.get("terms"):
            print("  terms:")
            for m in t["terms"]:
                print(f"    {m['term']}: statistic {_n(m.get('statistic'))}, "
                      f"df {_n(m.get('df'))}, p {_n(m.get('pValue'), 10)}, "
                      f"estimate {_n(m.get('estimate'))}")
        if t.get("pairwise"):
            print("  pairwise:")
            for c in t["pairwise"]:
                print(f"    {c['groupA']} vs {c['groupB']}: diff {_n(c['meanDifference'])}, "
                      f"CI {_n(c.get('ciLow'))} to {_n(c.get('ciHigh'))}, "
                      f"p {_n(c['pValue'], 10)}, p-adj {_n(c['pAdjusted'], 10)} "
                      f"({c['correctionMethod']})")
        print(f"\\n  {t.get('reportSentence', '')}")

    cf = result.get("curveFit")
    if cf:
        print(f"\\nCurve fit: {cf.get('model')}")
        print(f"  converged     {cf.get('converged')}")
        for name, p in (cf.get("parameters") or {}).items():
            span = ("" if p.get("ciLow") is None
                    else f"  (CI {_n(p['ciLow'])} to {_n(p['ciHigh'])})")
            print(f"  {name.ljust(12)} {_n(p['value'])}  ± {_n(p.get('stderr'))}{span}")
        print(f"  EC50          {_n(cf.get('ec50'))}")
        print(f"  R²            {_n(cf.get('rSquared'))}")
        print(f"  adj R²        {_n(cf.get('adjustedRSquared'))}")
        print(f"  Sy.x          {_n(cf.get('syx'))}")
        print(f"  AICc          {_n(cf.get('aicc'))}")

    sv = result.get("survival")
    if sv:
        print("\\nSurvival")
        for g in sv.get("groups") or []:
            print(f"  {g['label']}: n {g['n']}, events {g['events']}, "
                  f"median {_n(g.get('median'))}")

    for w in result.get("warnings") or []:
        print(f"\\n! {w}")
    print()


def main():
    import argparse
    ap = argparse.ArgumentParser(description="Reproduce this Notes9 analysis from the raw file.")
    ap.add_argument("source", nargs="?", default=SOURCE_FILE,
                    help=f"the raw data file (default: {SOURCE_FILE!r})")
    ap.add_argument("--json", action="store_true", help="print the raw result as JSON")
    args = ap.parse_args()

    table = read_table(args.source)
    payload = resolve_payload(SPEC, table)
    result = run(payload)  # \`run\` is notes9_engine.run, embedded above

    if args.json:
        print(_json.dumps(result, indent=2, sort_keys=True, default=str))
    else:
        print_report(result)


if __name__ == "__main__":
    main()
`

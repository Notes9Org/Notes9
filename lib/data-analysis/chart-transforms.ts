/**
 * Data transforms for specialized scientific charts, ROC curves, Kaplan–Meier
 * survival, and Bland–Altman agreement. Kept as pure functions so they can be
 * unit-tested independently of the Plotly rendering layer.
 */

/**
 * Receiver-operating-characteristic curve from binary truth + a continuous
 * score. The positive class is the larger of the two truth labels (so 0/1 and
 * 1/2 both work). Returns FPR/TPR points (including the (0,0) and (1,1)
 * endpoints) and the trapezoidal AUC.
 */
export function rocCurve(truth: number[], score: number[]): { fpr: number[]; tpr: number[]; auc: number } {
  const pairs: { t: number; s: number }[] = []
  for (let i = 0; i < Math.min(truth.length, score.length); i++) {
    if (isFinite(truth[i]) && isFinite(score[i])) pairs.push({ t: truth[i], s: score[i] })
  }
  if (!pairs.length) return { fpr: [], tpr: [], auc: NaN }
  const posLabel = Math.max(...pairs.map((p) => p.t))
  const y: number[] = pairs.map((p) => (p.t === posLabel ? 1 : 0))
  const P = y.reduce((a, b) => a + b, 0)
  const N = y.length - P
  if (P === 0 || N === 0) return { fpr: [0, 1], tpr: [0, 1], auc: NaN }
  const order = pairs.map((_, i) => i).sort((a, b) => pairs[b].s - pairs[a].s)
  const fpr: number[] = []
  const tpr: number[] = []
  let tp = 0
  let fp = 0
  let prev = NaN
  for (const i of order) {
    if (pairs[i].s !== prev) {
      fpr.push(fp / N)
      tpr.push(tp / P)
      prev = pairs[i].s
    }
    if (y[i] === 1) tp++
    else fp++
  }
  fpr.push(fp / N)
  tpr.push(tp / P)
  let auc = 0
  for (let k = 1; k < fpr.length; k++) auc += (fpr[k] - fpr[k - 1]) * (tpr[k] + tpr[k - 1]) / 2
  return { fpr, tpr, auc }
}

/**
 * Kaplan–Meier survival estimate. `event = 1` marks an observed event, `0` a
 * right-censored observation. Returns step-function points starting at (0, 1),
 * suitable for a Plotly `shape: "hv"` line.
 */
export function kaplanMeier(time: number[], event: number[]): { time: number[]; survival: number[] } {
  const pairs: { t: number; e: number }[] = []
  for (let i = 0; i < Math.min(time.length, event.length); i++) {
    if (isFinite(time[i])) pairs.push({ t: time[i], e: event[i] === 1 ? 1 : 0 })
  }
  if (!pairs.length) return { time: [], survival: [] }
  const eventTimes = [...new Set(pairs.filter((p) => p.e === 1).map((p) => p.t))].sort((a, b) => a - b)
  const outT: number[] = [0]
  const outS: number[] = [1]
  let S = 1
  for (const et of eventTimes) {
    const atRisk = pairs.filter((p) => p.t >= et).length
    const dEvents = pairs.filter((p) => p.t === et && p.e === 1).length
    if (atRisk > 0) S *= 1 - dEvents / atRisk
    outT.push(et)
    outS.push(S)
  }
  return { time: outT, survival: outS }
}

/**
 * Bland–Altman agreement between two measurement methods: per-pair mean vs.
 * difference, plus the bias (mean difference) and 95% limits of agreement
 * (bias ± 1.96·SD).
 */
export function blandAltman(
  a: number[],
  b: number[],
): { mean: number[]; diff: number[]; bias: number; sd: number; loaLow: number; loaHigh: number } {
  const mean: number[] = []
  const diff: number[] = []
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (isFinite(a[i]) && isFinite(b[i])) {
      mean.push((a[i] + b[i]) / 2)
      diff.push(a[i] - b[i])
    }
  }
  const n = diff.length
  const bias = n ? diff.reduce((s, v) => s + v, 0) / n : NaN
  const sd = n > 1 ? Math.sqrt(diff.reduce((s, v) => s + (v - bias) ** 2, 0) / (n - 1)) : NaN
  return { mean, diff, bias, sd, loaLow: bias - 1.96 * sd, loaHigh: bias + 1.96 * sd }
}

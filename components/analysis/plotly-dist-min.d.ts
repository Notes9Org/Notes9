/**
 * `plotly.js-dist-min` ships a pre-built UMD bundle (`main: plotly.min.js`, no
 * `module`/`exports` field) and carries no types. `@types/plotly.js` types the
 * whole API surface but is keyed to the `plotly.js` package name, so point the
 * dist bundle at it. `default` — not named exports — because the bundle is CJS
 * and the bundler's interop puts `module.exports` on `default`.
 *
 * ponytail: 4-line shim rather than a second devDep (`@types/plotly.js-dist-min`
 * is literally this file published). Swap to the package if it ever diverges.
 */
declare module "plotly.js-dist-min" {
  import * as Plotly from "plotly.js"

  const plotly: typeof Plotly
  export default plotly
}

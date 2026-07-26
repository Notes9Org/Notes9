// plotly.js-dist-min ships no type declarations (the bundled minified build).
// The wrapper in components/data-analysis/plotly-chart.tsx accesses it via a
// dynamic import and uses it loosely, so an `any`-typed module is sufficient.
declare module "plotly.js-dist-min" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Plotly: any
  export default Plotly
}

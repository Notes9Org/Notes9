// ponytail: no-op stand-in for the `server-only` package under vitest.
// Next's bundler aliases `server-only` to an empty module; plain vite does not,
// so any test that transitively imports a server-only module fails to resolve.
// Aliased in vitest.config.ts.
export {}

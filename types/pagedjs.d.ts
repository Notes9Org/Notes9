// Minimal typings for Paged.js (the package ships none). We only use the
// Previewer to render content + stylesheets into a container for clean,
// page-numbered PDF export.
declare module "pagedjs" {
  export class Previewer {
    constructor(options?: unknown)
    preview(
      content: string | Node,
      stylesheets: Array<string | { [key: string]: unknown }>,
      renderTo: Element,
    ): Promise<{ total: number; pages: unknown[] }>
  }

  export class Handler {
    constructor(...args: unknown[])
  }

  export function registerHandlers(...handlers: unknown[]): void
}

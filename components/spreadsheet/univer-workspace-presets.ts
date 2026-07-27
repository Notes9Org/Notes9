/**
 * Workspace-tier Univer feature presets — the Excel-grade plugin suite layered
 * on top of `UniverSheetsCorePreset`:
 *
 *   • Conditional formatting (color scales, data bars, icon sets, rules)
 *   • Data validation (dropdown lists, number/date/text/custom constraints)
 *   • AutoFilter (filter by value / condition)
 *   • Sort (range + column sort, ascending/descending)
 *   • Find & Replace (sheet / workbook, regex, match case)
 *   • Hyperlinks (cell links)
 *   • Notes (cell notes)
 *   • Threaded comments (discussion per cell)
 *   • Structured tables (banded ranges, headers)
 *   • Images / floating drawings
 *
 * Isolated in its own module and imported dynamically (client-only) so the
 * lightweight `embed` variant used inside note pages never pays for this
 * bundle. Every feature above serializes its state into the workbook
 * snapshot's top-level `resources` array — which {@link
 * normalizeWorkbookSnapshot} must preserve for the features to survive a
 * reload.
 */
import "@univerjs/preset-sheets-conditional-formatting/lib/index.css"
import "@univerjs/preset-sheets-data-validation/lib/index.css"
import "@univerjs/preset-sheets-filter/lib/index.css"
import "@univerjs/preset-sheets-sort/lib/index.css"
import "@univerjs/preset-sheets-find-replace/lib/index.css"
import "@univerjs/preset-sheets-hyper-link/lib/index.css"
import "@univerjs/preset-sheets-note/lib/index.css"
import "@univerjs/preset-sheets-thread-comment/lib/index.css"
import "@univerjs/preset-sheets-table/lib/index.css"
import "@univerjs/preset-sheets-drawing/lib/index.css"

import { mergeLocales } from "@univerjs/presets"
import sheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US"

import { UniverSheetsConditionalFormattingPreset } from "@univerjs/preset-sheets-conditional-formatting"
import conditionalFormattingEnUS from "@univerjs/preset-sheets-conditional-formatting/locales/en-US"
import { UniverSheetsDataValidationPreset } from "@univerjs/preset-sheets-data-validation"
import dataValidationEnUS from "@univerjs/preset-sheets-data-validation/locales/en-US"
import { UniverSheetsFilterPreset } from "@univerjs/preset-sheets-filter"
import filterEnUS from "@univerjs/preset-sheets-filter/locales/en-US"
import { UniverSheetsSortPreset } from "@univerjs/preset-sheets-sort"
import sortEnUS from "@univerjs/preset-sheets-sort/locales/en-US"
import { UniverSheetsFindReplacePreset } from "@univerjs/preset-sheets-find-replace"
import findReplaceEnUS from "@univerjs/preset-sheets-find-replace/locales/en-US"
import { UniverSheetsHyperLinkPreset } from "@univerjs/preset-sheets-hyper-link"
import hyperLinkEnUS from "@univerjs/preset-sheets-hyper-link/locales/en-US"
import { UniverSheetsNotePreset } from "@univerjs/preset-sheets-note"
import noteEnUS from "@univerjs/preset-sheets-note/locales/en-US"
import { UniverSheetsThreadCommentPreset } from "@univerjs/preset-sheets-thread-comment"
import threadCommentEnUS from "@univerjs/preset-sheets-thread-comment/locales/en-US"
import { UniverSheetsTablePreset } from "@univerjs/preset-sheets-table"
import tableEnUS from "@univerjs/preset-sheets-table/locales/en-US"
import { UniverSheetsDrawingPreset } from "@univerjs/preset-sheets-drawing"
import drawingEnUS from "@univerjs/preset-sheets-drawing/locales/en-US"

export type WorkspaceSheetFeatures = {
  /** Feature presets to register AFTER the core preset. */
  presets: unknown[]
  /** Merged en-US locale bundle (core + every feature preset). */
  locale: typeof sheetsCoreEnUS
}

/**
 * Build the workspace feature presets and their merged en-US locale. Called
 * once per Univer mount in the `workspace` variant. `createUniver` dedupes
 * plugins by name, so ordering here is not load-bearing.
 */
export function buildWorkspaceSheetFeatures(): WorkspaceSheetFeatures {
  const presets: unknown[] = [
    UniverSheetsConditionalFormattingPreset(),
    UniverSheetsDataValidationPreset(),
    UniverSheetsFilterPreset(),
    UniverSheetsSortPreset(),
    UniverSheetsFindReplacePreset(),
    UniverSheetsHyperLinkPreset(),
    UniverSheetsNotePreset(),
    UniverSheetsThreadCommentPreset(),
    UniverSheetsTablePreset(),
    UniverSheetsDrawingPreset(),
  ]

  const locale = mergeLocales(
    sheetsCoreEnUS,
    conditionalFormattingEnUS,
    dataValidationEnUS,
    filterEnUS,
    sortEnUS,
    findReplaceEnUS,
    hyperLinkEnUS,
    noteEnUS,
    threadCommentEnUS,
    tableEnUS,
    drawingEnUS,
  ) as typeof sheetsCoreEnUS

  return { presets, locale }
}

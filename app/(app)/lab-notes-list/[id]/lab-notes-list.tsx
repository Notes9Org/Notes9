"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { NotebookPen, Grid3x3, List, Eye } from "lucide-react"

type LabNote = {
  id: string
  title: string
  created_at: string
  note_type?: string | null
  project_name?: string | null
  experiment_name?: string | null
}

type LabNotesListProps = {
  notes: LabNote[]
  selectedNote: LabNote | null
  isCreating: boolean
  handleNewNote: () => void
  handleSelectNote: (note: LabNote) => void
  borderless?: boolean
  viewMode?: "grid" | "table"
  setViewMode?: (mode: "grid" | "table") => void
  hideToolbar?: boolean
}

// Format date consistently
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  return date.toISOString().split('T')[0]
}

export default function LabNotesList({
  notes,
  selectedNote,
  isCreating,
  handleNewNote,
  handleSelectNote,
  borderless = false,
  viewMode: controlledView,
  setViewMode: setControlledView,
  hideToolbar,
}: LabNotesListProps) {
  const [internalView, setInternalView] = useState<"grid" | "table">("grid")
  const viewMode = controlledView ?? internalView
  const setViewMode = setControlledView ?? setInternalView

  if (notes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <NotebookPen className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground mb-4">No lab notes yet</p>
          <Button onClick={handleNewNote}>
            <NotebookPen className="h-4 w-4 mr-2" />
            Create First Lab Note
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* View Toggle - only when not in header */}
      {!hideToolbar && (
        <div className="flex justify-end mb-4">
          <div className="inline-flex gap-1 rounded-lg border p-1">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
              className="gap-2"
            >
              <Grid3x3 className="h-4 w-4" />
              Grid
            </Button>
            <Button
              variant={viewMode === "table" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="gap-2"
            >
              <List className="h-4 w-4" />
              Table
            </Button>
          </div>
        </div>
      )}

      {/* Grid View */}
      {viewMode === "grid" && (
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
          {notes.map((note) => (
            <Card 
              key={note.id} 
              className="bg-card hover:border-primary transition-colors flex flex-col min-w-0 overflow-hidden cursor-pointer"
              onClick={() => handleSelectNote(note)}
            >
              <CardHeader className="pb-3 min-w-0">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <NotebookPen className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
                    <CardTitle className="text-base text-foreground leading-tight min-w-0 overflow-hidden text-ellipsis" style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      wordBreak: 'break-all',
                      overflowWrap: 'break-word'
                    }}>
                      {note.title}
                    </CardTitle>
                    {note.project_name && (
                      <CardDescription className="text-xs min-w-0 overflow-hidden text-ellipsis" style={{
                        wordBreak: 'break-all',
                        overflowWrap: 'break-word'
                      }}>
                        {note.project_name}
                      </CardDescription>
                    )}
                  </div>
                </div>
                {/* Badge and date */}
                <div className="flex items-center justify-between pt-2 gap-2 min-w-0">
                  {note.note_type && (
                    <Badge variant="outline" className="text-xs font-medium whitespace-nowrap shrink-0 max-w-full overflow-hidden text-ellipsis">
                      {note.note_type}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 overflow-hidden text-ellipsis max-w-32">
                    {new Date(note.created_at).toLocaleDateString()}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 flex-1 flex flex-col pt-0 min-w-0">
                <div className="space-y-2 flex-1 min-w-0">
                  {note.experiment_name && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 overflow-hidden">
                      <span className="text-xs font-semibold shrink-0">Experiment:</span>
                      <span className="truncate text-ellipsis overflow-hidden text-xs">
                        {note.experiment_name}
                      </span>
                    </div>
                  )}
                </div>
                <Button variant="outline" size="sm" className="w-full mt-auto shrink-0">
                  <Eye className="h-4 w-4 mr-2" />
                  <span className="truncate">View Details</span>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table View */}
      {viewMode === "table" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">All Lab Notes</CardTitle>
            <CardDescription>Complete list of laboratory notes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative w-full overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[250px]">Note Title</TableHead>
                    <TableHead className="min-w-[120px]">Type</TableHead>
                    <TableHead className="min-w-[180px]">Project</TableHead>
                    <TableHead className="min-w-[180px]">Experiment</TableHead>
                    <TableHead className="min-w-[120px]">Created</TableHead>
                    <TableHead className="text-right min-w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notes.map((note) => (
                    <TableRow key={note.id}>
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <NotebookPen className="h-4 w-4 text-primary shrink-0" />
                          <div className="max-w-[280px]">
                            <div className="font-semibold truncate">{note.title}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {note.note_type ? (
                          <Badge variant="outline" className="whitespace-nowrap">
                            {note.note_type}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {note.project_name || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {note.experiment_name || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(note.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleSelectNote(note)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
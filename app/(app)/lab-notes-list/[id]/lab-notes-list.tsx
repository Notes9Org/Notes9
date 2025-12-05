 "use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FileText, Plus } from "lucide-react"

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
}

export default function LabNotesList({
  notes,
  selectedNote,
  isCreating,
  handleNewNote,
  handleSelectNote,
  borderless = false,
}: LabNotesListProps) {
  const cardClass = borderless
    ? "h-fit border-0 shadow-none bg-transparent p-0"
    : "h-fit"
  const headerClass = borderless ? "px-0 pt-0 pb-2" : undefined
  const contentClass = borderless ? "px-0 pb-0" : undefined

  return (
    <Card className={cardClass}>
      <CardHeader className={headerClass}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Lab Notes</CardTitle>
          <Button size="sm" onClick={handleNewNote}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className={contentClass}>
        {notes.length > 0 ? (
          <div className="space-y-2">
            {notes.map((note) => (
              <button
                key={note.id}
                onClick={() => handleSelectNote(note)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedNote?.id === note.id && !isCreating
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-foreground truncate">
                      {note.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(note.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {note.note_type && (
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {note.note_type}
                      </Badge>
                    )}
                    {(note.project_name || note.experiment_name) && (
                      <div className="text-right text-xs leading-tight text-muted-foreground space-y-0.5">
                        {note.project_name && (
                          <div className="truncate">
                            <span className="font-semibold text-[11px] text-foreground/80">Project: </span>
                            <span>{note.project_name}</span>
                          </div>
                        )}
                        {note.experiment_name && (
                          <div className="truncate">
                            <span className="font-semibold text-[11px] text-foreground/80">Experiment: </span>
                            <span>{note.experiment_name}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No notes yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
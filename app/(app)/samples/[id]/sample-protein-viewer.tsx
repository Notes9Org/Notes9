"use client"

import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Maximize2, RotateCcw } from "lucide-react"
import { getFileExtension } from "@/lib/sample-molecular"

type SampleProteinViewerProps = {
  fileName: string
  fileUrl: string
}

function molstarFormat(fileName: string) {
  const ext = getFileExtension(fileName)
  if (ext === "cif" || ext === "mmcif") return "mmcif"
  return "pdb"
}

function buildMolstarFrame(fileName: string, fileUrl: string) {
  const name = JSON.stringify(fileName).replace(/</g, "\\u003c")
  const url = JSON.stringify(fileUrl).replace(/</g, "\\u003c")
  const format = JSON.stringify(molstarFormat(fileName))

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/molstar/build/viewer/molstar.css" />
  <style>
    html, body, #viewer { height: 100%; width: 100%; margin: 0; overflow: hidden; background: #111827; }
    .fallback { height: 100%; display: grid; place-items: center; color: #d1d5db; font: 13px system-ui; padding: 24px; text-align: center; }
  </style>
</head>
<body>
  <div id="viewer"><div class="fallback">Loading Mol* viewer...</div></div>
  <script src="https://cdn.jsdelivr.net/npm/molstar/build/viewer/molstar.js"></script>
  <script>
    async function mount() {
      try {
        if (!window.molstar || !window.molstar.Viewer) throw new Error("Mol* browser build unavailable");
        const viewer = await window.molstar.Viewer.create("viewer", {
          layoutIsExpanded: false,
          layoutShowControls: true,
          layoutShowRemoteState: false,
          layoutShowSequence: true,
          layoutShowLog: false,
          layoutShowLeftPanel: false,
          viewportShowExpand: false,
          viewportShowSelectionMode: false,
          viewportShowAnimation: false
        });
        window.notes9MolstarViewer = viewer;
        await viewer.loadStructureFromUrl(${url}, ${format}, false, { label: ${name} });
      } catch (error) {
        document.getElementById("viewer").innerHTML = '<div class="fallback">Could not load this structure. Use Download/Open externally for inspection.</div>';
      }
    }
    window.addEventListener("message", function(event) {
      if (event.data === "notes9-reset-camera") {
        window.notes9MolstarViewer?.plugin?.managers?.camera?.reset?.();
      }
    });
    mount();
  </script>
</body>
</html>`
}

export function SampleProteinViewer({ fileName, fileUrl }: SampleProteinViewerProps) {
  const frame = useMemo(() => buildMolstarFrame(fileName, fileUrl), [fileName, fileUrl])

  const resetCamera = () => {
    const frameEl = document.getElementById("sample-protein-viewer-frame") as HTMLIFrameElement | null
    frameEl?.contentWindow?.postMessage("notes9-reset-camera", "*")
  }

  const openFullscreen = () => {
    document.getElementById("sample-protein-viewer-frame")?.requestFullscreen?.()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium">{fileName}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={resetCamera}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={openFullscreen}>
            <Maximize2 className="mr-2 h-4 w-4" />
            Fullscreen
          </Button>
        </div>
      </div>
      <div className="relative h-[520px] min-h-[360px] overflow-hidden rounded-md border bg-background">
        <iframe id="sample-protein-viewer-frame" title={`${fileName} structure viewer`} srcDoc={frame} className="h-full w-full border-0" />
      </div>
    </div>
  )
}

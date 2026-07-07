"use client"

/**
 * UI gallery — a living showcase of the revamped design system so interactive
 * states are visible in one place (docs/UI_UX_REVAMP_PLAN.md §5). Navigate to
 * /ui-gallery. Hover and click the elements to see the micro-interactions.
 */

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import { Icon } from "@/components/ui/icon"
import {
  Flask, TestTube, Notebook, FolderOpen, Sparkle, Trash, Plus, DownloadSimple, MagnifyingGlass,
} from "@phosphor-icons/react/ssr"

const KINDS = [
  { name: "Project", token: "var(--kind-project)", icon: FolderOpen },
  { name: "Experiment", token: "var(--kind-experiment)", icon: Flask },
  { name: "Protocol", token: "var(--kind-protocol)", icon: Notebook },
  { name: "Sample", token: "var(--kind-sample)", icon: TestTube },
  { name: "Paper", token: "var(--kind-paper)", icon: Notebook },
  { name: "Lab note", token: "var(--kind-note)", icon: Notebook },
]

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-xl font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <div className="rounded-xl border bg-card p-5">{children}</div>
    </section>
  )
}

export default function UiGalleryPage() {
  const [tab, setTab] = useState("one")
  return (
    <TooltipProvider>
      <div className="mx-auto flex max-w-5xl flex-col gap-8 pb-16">
        <header className="space-y-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Design system gallery</h1>
          <p className="text-muted-foreground">
            Hover and click each element to see the interaction. Fonts: Merriweather Sans (body) + Source Serif 4 (this display type) + IBM Plex Mono.
          </p>
        </header>

        <Section title="Buttons" hint="Hover: icon scales up + shadow lifts. Click: presses in. Every variant + size.">
          <div className="flex flex-wrap items-center gap-3">
            <Button><Icon icon={Plus} /> Default</Button>
            <Button variant="secondary"><Icon icon={DownloadSimple} /> Secondary</Button>
            <Button variant="outline"><Icon icon={MagnifyingGlass} /> Outline</Button>
            <Button variant="ghost"><Icon icon={Sparkle} /> Ghost</Button>
            <Button variant="destructive"><Icon icon={Trash} /> Destructive</Button>
            <Button variant="destructive-ghost"><Icon icon={Trash} /> Destructive ghost</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button size="sm"><Icon icon={Plus} /> Small</Button>
            <Button size="default"><Icon icon={Plus} /> Default</Button>
            <Button size="lg"><Icon icon={Plus} /> Large</Button>
            <Button size="icon" aria-label="Add"><Icon icon={Plus} /></Button>
            <Button size="icon-sm" variant="outline" aria-label="Add"><Icon icon={Plus} /></Button>
            <Button disabled><Icon icon={Plus} /> Disabled</Button>
          </div>
        </Section>

        <Section title="Interactive icon (weight-shift)" hint="The signature gesture: hover a card below — its icon shifts from regular to filled.">
          <div className="flex flex-wrap gap-3">
            {KINDS.slice(0, 4).map((k) => (
              <div key={k.name} className="group flex cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm transition-shadow hover:shadow-md">
                <Icon icon={k.icon} interactive className="size-5" />
                {k.name}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Cards — interactive + kind-ribbon" hint="Hover: the interactive card lifts. Each ribbon is tinted by its entity kind.">
          <div className="grid gap-4 sm:grid-cols-3">
            {KINDS.map((k) => (
              <Card key={k.name} variant="interactive" ribbon={k.token}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon icon={k.icon} className="size-4" /> {k.name}
                  </CardTitle>
                  <CardDescription>Hover me — I lift and cast a deeper shadow.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Ribbon uses <span className="font-mono text-xs">{k.token}</span>.
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>

        <Section title="Badges" hint="Solid + the modern tonal (soft) variants for status.">
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="soft">Soft</Badge>
            <Badge variant="soft-success">Soft success</Badge>
            <Badge variant="soft-warning">Soft warning</Badge>
            <Badge variant="soft-info">Soft info</Badge>
            <Badge variant="soft-destructive">Soft destructive</Badge>
          </div>
        </Section>

        <Section title="Inputs" hint="Hover: border warms. Focus: ring appears.">
          <div className="grid max-w-md gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="g-in">Text input</Label>
              <Input id="g-in" placeholder="Hover, then focus me…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-sel">Select</Label>
              <Select>
                <SelectTrigger id="g-sel"><SelectValue placeholder="Pick one…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="a">Option A</SelectItem>
                  <SelectItem value="b">Option B</SelectItem>
                  <SelectItem value="c">Option C</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-ta">Textarea</Label>
              <Textarea id="g-ta" placeholder="Auto-growing, hover for border…" />
            </div>
          </div>
        </Section>

        <Section title="Tabs" hint="Hover an inactive tab; click to move the active pill.">
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList>
              <TabsTrigger value="one">Overview</TabsTrigger>
              <TabsTrigger value="two">Details</TabsTrigger>
              <TabsTrigger value="three">History</TabsTrigger>
            </TabsList>
            <TabsContent value="one" className="text-sm text-muted-foreground">Overview panel.</TabsContent>
            <TabsContent value="two" className="text-sm text-muted-foreground">Details panel.</TabsContent>
            <TabsContent value="three" className="text-sm text-muted-foreground">History panel.</TabsContent>
          </Tabs>
        </Section>

        <Section title="Controls" hint="Hover: border warms. Click: presses in + the check/dot animates in. Switch and progress glide on the token curve.">
          <div className="flex flex-wrap items-center gap-8">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox defaultChecked /> Checkbox
            </label>
            <RadioGroup defaultValue="a" className="flex gap-4">
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="a" /> Option A</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="b" /> Option B</label>
            </RadioGroup>
            <label className="flex items-center gap-2 text-sm">
              <Switch defaultChecked /> Switch
            </label>
            <div className="w-48 space-y-1.5">
              <span className="text-sm">Progress</span>
              <Progress value={64} />
            </div>
          </div>
        </Section>

        <Section title="Overlays" hint="Dialogs use a frosted (blurred) scrim, not flat black.">
          <div className="flex flex-wrap gap-3">
            <Dialog>
              <DialogTrigger asChild><Button variant="outline"><Icon icon={Sparkle} /> Open dialog</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Frosted overlay</DialogTitle>
                  <DialogDescription>The backdrop blurs the content behind it, matching the platform glass language.</DialogDescription>
                </DialogHeader>
                <DialogFooter><Button>Got it</Button></DialogFooter>
              </DialogContent>
            </Dialog>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="destructive"><Icon icon={Trash} /> Delete…</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this item?</AlertDialogTitle>
                  <AlertDialogDescription>This can’t be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild><Button variant="ghost">Hover for tooltip</Button></TooltipTrigger>
              <TooltipContent>Inverted, instant tooltip.</TooltipContent>
            </Tooltip>
          </div>
        </Section>
      </div>
    </TooltipProvider>
  )
}

import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FileText, Plus, Download, Calendar } from 'lucide-react'
import Link from 'next/link'

export default async function ReportsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  // Fetch reports
  const { data: reports } = await supabase
    .from("reports")
    .select(`
      *,
      project:projects(name),
      experiment:experiments(name),
      generated_by:profiles!reports_generated_by_fkey(first_name, last_name)
    `)
    .order("created_at", { ascending: false })

  return (
      <div className="space-y-4 md:space-y-6">
        {/* Header: stacked on mobile */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Reports & Analytics</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              View and generate research reports
            </p>
          </div>
          <Button className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Generate Report
          </Button>
        </div>

        {/* Reports List */}
        <div className="space-y-4">
          {reports && reports.length > 0 ? (
            reports.map((report: any) => (
              <Card key={report.id} className="hover:border-primary transition-colors cursor-pointer">
                <CardContent className="flex items-center justify-between pt-6">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                      <FileText className="h-6 w-6" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{report.title}</h3>
                        <Badge
                          variant={
                            report.status === "final"
                              ? "default"
                              : report.status === "review"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {report.status}
                        </Badge>
                        <Badge variant="outline">{report.report_type}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {report.project && (
                          <span>Project: {report.project.name}</span>
                        )}
                        {report.experiment && (
                          <>
                            <span>•</span>
                            <span>Experiment: {report.experiment.name}</span>
                          </>
                        )}
                        {report.generated_by && (
                          <>
                            <span>•</span>
                            <span>
                              By: {report.generated_by.first_name} {report.generated_by.last_name}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>Created: {new Date(report.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">
                      View
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No reports generated yet</p>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Generate First Report
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Analytics Section */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Experiment Completion Rate</CardTitle>
              <CardDescription>
                Monthly experiment completion statistics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                Chart placeholder - Experiment completion trend
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Equipment Utilization</CardTitle>
              <CardDescription>
                Equipment usage across the organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                Chart placeholder - Equipment usage statistics
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
}

import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { FileText, Plus, Search } from 'lucide-react'
import Link from 'next/link'

export default async function ProtocolsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  // Fetch protocols with usage count
  const { data: protocols } = await supabase
    .from("protocols")
    .select(`
      *,
      experiment_protocols(count)
    `)
    .eq("is_active", true)
    .order("name")

  return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Protocols & SOPs</h1>
            <p className="text-muted-foreground mt-1">
              Standard Operating Procedures library
            </p>
          </div>
          <Button asChild>
            <Link href="/protocols/new">
              <Plus className="h-4 w-4 mr-2" />
              Add Protocol
            </Link>
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search protocols..." className="pl-9 text-foreground" />
        </div>

        {/* Protocols Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">All Protocols</CardTitle>
            <CardDescription>
              Active Standard Operating Procedures
            </CardDescription>
          </CardHeader>
          <CardContent>
            {protocols && protocols.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">Protocol Name</TableHead>
                    <TableHead className="w-[150px]">Category</TableHead>
                    <TableHead className="w-[80px]">Version</TableHead>
                    <TableHead className="w-[100px]">Used In</TableHead>
                    <TableHead className="w-[150px]">Last Updated</TableHead>
                    <TableHead className="w-[80px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {protocols.map((protocol: any) => (
                    <TableRow key={protocol.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{protocol.name}</p>
                          {protocol.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {protocol.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {protocol.category ? (
                          <Badge variant="secondary" className="text-xs">
                            {protocol.category}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {protocol.version}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-xs">
                          {protocol.experiment_protocols?.[0]?.count || 0} experiments
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(protocol.updated_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/protocols/${protocol.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No protocols available</p>
                <Button asChild>
                  <Link href="/protocols/new">
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Protocol
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
}

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Bot, Sparkles } from 'lucide-react'
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

export function RightSidebar() {
  const [aiMessage, setAiMessage] = useState("")

  const recentActivity = [
    {
      id: "1",
      user: "Dr. Sarah Chen",
      action: "completed Protein Crystallization - Batch #47",
      time: "2 hours ago",
      initials: "SC",
    },
    {
      id: "2",
      user: "Mike Rodriguez",
      action: "uploaded data to Compound Screening",
      time: "3 hours ago",
      initials: "MR",
    },
    {
      id: "3",
      user: "Dr. Emily Watson",
      action: "analyzed results for Cancer Drug Discovery",
      time: "5 hours ago",
      initials: "EW",
    },
  ]

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Sidebar Header */}
      <div className="h-14 border-b border-border flex items-center px-4">
        <h2 className="font-semibold text-sm">Assistant & Tools</h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* AI Assistant */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bot className="h-4 w-4" />
                AI Assistant
              </CardTitle>
              <CardDescription className="text-xs">
                Ask questions about your experiments and data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Ask AI about your experiment..."
                className="min-h-[80px] text-sm resize-none"
                value={aiMessage}
                onChange={(e) => setAiMessage(e.target.value)}
              />
              <Button size="sm" className="w-full gap-2">
                <Sparkles className="h-3 w-3" />
                Ask Assistant
              </Button>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Recent Activity</CardTitle>
              <CardDescription className="text-xs">
                Latest updates from your team
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {activity.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1">
                    <p className="text-xs font-medium leading-none">
                      {activity.user}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {activity.action}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {activity.time}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  )
}

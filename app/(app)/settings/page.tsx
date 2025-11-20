"use client"

import { useState, useEffect } from "react"
import { useRouter } from 'next/navigation'
import { useTheme } from "next-themes"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LogOut, Sun, Moon, Monitor, Save, Loader2 } from 'lucide-react'
import { useToast } from "@/hooks/use-toast"
import { ChangePasswordDialog } from "@/components/auth/change-password-dialog"

export default function SettingsPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  
  // Form state
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [phone, setPhone] = useState("")
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [defaultView, setDefaultView] = useState("dashboard")

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const loadProfile = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single()

        if (data) {
          setProfile(data)
          setFirstName(data.first_name || "")
          setLastName(data.last_name || "")
          setPhone(data.phone || "")
        }
      }
      setLoading(false)
    }

    loadProfile()
  }, [])

  const handleSaveProfile = async () => {
    setSaving(true)
    const supabase = createClient()

    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) throw new Error("Not authenticated")

      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: phone,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)

      if (error) throw error

      toast({
        title: "Profile updated",
        description: "Your profile information has been saved successfully.",
      })

      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your account and preferences
          </p>
        </div>

        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>
                  Update your personal information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4">
                  <Avatar className="h-20 w-20">
                    <AvatarFallback className="text-2xl">
                      {firstName?.[0]?.toUpperCase()}
                      {lastName?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <Button variant="outline" size="sm" disabled>
                      Change Avatar
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">
                      Coming soon
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Enter first name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Enter last name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email" 
                    value={profile?.email || ""} 
                    readOnly 
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Email cannot be changed. Contact administrator for assistance.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Input 
                    id="role" 
                    value={profile?.role || ""} 
                    readOnly 
                    className="bg-muted capitalize"
                  />
                  <p className="text-xs text-muted-foreground">
                    Role is assigned by your administrator.
                  </p>
                </div>

                <Button 
                  onClick={handleSaveProfile} 
                  disabled={saving || !firstName || !lastName}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Account Tab */}
          <TabsContent value="account" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Account Security</CardTitle>
                <CardDescription>
                  Manage your account security settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-4 border-b">
                    <div className="space-y-0.5">
                      <p className="font-medium">Password</p>
                      <p className="text-sm text-muted-foreground">
                        Last updated: Never
                      </p>
                    </div>
                    <Button onClick={() => setChangePasswordOpen(true)}>
                      Change Password
                    </Button>
                  </div>

                  <div className="flex items-center justify-between pb-4 border-b">
                    <div className="space-y-0.5">
                      <p className="font-medium">Two-Factor Authentication</p>
                      <p className="text-sm text-muted-foreground">
                        Add an extra layer of security
                      </p>
                    </div>
                    <Button variant="outline" disabled>
                      Enable 2FA
                    </Button>
                  </div>

                  <div className="flex items-center justify-between pb-4">
                    <div className="space-y-0.5">
                      <p className="font-medium">Active Sessions</p>
                      <p className="text-sm text-muted-foreground">
                        View and manage your active sessions
                      </p>
                    </div>
                    <Button variant="outline" disabled>
                      View Sessions
                    </Button>
                  </div>
                </div>

                <div className="pt-6 border-t">
                  <h3 className="font-semibold mb-2 text-destructive">Danger Zone</h3>
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium">Sign Out</p>
                        <p className="text-sm text-muted-foreground">
                          Sign out from your account on this device
                        </p>
                      </div>
                      <Button variant="destructive" onClick={handleSignOut}>
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign Out
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Application Preferences</CardTitle>
                <CardDescription>
                  Customize your Notes9 experience
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Theme Selector */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Theme</p>
                    <p className="text-sm text-muted-foreground">
                      Choose your preferred color theme
                    </p>
                  </div>
                  {mounted && (
                    <div className="flex gap-2">
                      <Button
                        variant={theme === "light" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTheme("light")}
                      >
                        <Sun className="h-4 w-4 mr-2" />
                        Light
                      </Button>
                      <Button
                        variant={theme === "dark" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTheme("dark")}
                      >
                        <Moon className="h-4 w-4 mr-2" />
                        Dark
                      </Button>
                      <Button
                        variant={theme === "system" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTheme("system")}
                      >
                        <Monitor className="h-4 w-4 mr-2" />
                        System
                      </Button>
                    </div>
                  )}
                </div>

                {/* Email Notifications */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Email Notifications</p>
                    <p className="text-sm text-muted-foreground">
                      Receive email updates about your experiments
                    </p>
                  </div>
                  <Switch
                    checked={emailNotifications}
                    onCheckedChange={setEmailNotifications}
                  />
                </div>

                {/* Default View */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Default View</p>
                    <p className="text-sm text-muted-foreground">
                      Page to show when you log in
                    </p>
                  </div>
                  <Select value={defaultView} onValueChange={setDefaultView}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select view" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dashboard">Dashboard</SelectItem>
                      <SelectItem value="projects">Projects</SelectItem>
                      <SelectItem value="experiments">Experiments</SelectItem>
                      <SelectItem value="protocols">Protocols</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Language */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Language</p>
                    <p className="text-sm text-muted-foreground">
                      Select your preferred language
                    </p>
                  </div>
                  <Select defaultValue="en" disabled>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Timezone */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Timezone</p>
                    <p className="text-sm text-muted-foreground">
                      Your local timezone for date display
                    </p>
                  </div>
                  <Select defaultValue="utc" disabled>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="utc">UTC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button disabled>
                  <Save className="h-4 w-4 mr-2" />
                  Save Preferences
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Change Password Dialog */}
      <ChangePasswordDialog 
        open={changePasswordOpen} 
        onOpenChange={setChangePasswordOpen} 
      />
    </>
  )
}

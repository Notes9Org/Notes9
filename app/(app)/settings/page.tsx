"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from 'next/navigation'
import { useTheme } from "next-themes"
import { createClient } from "@/lib/supabase/client"
import { useAuthUser } from "@/components/auth/auth-provider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { LogOut, Sun, Moon, Monitor, Loader2 } from 'lucide-react'
import { ChangePasswordDialog } from "@/components/change-password-dialog"
import { PageHeading } from "@/components/ui/page-heading"
import { useToast } from "@/hooks/use-toast"
import { USER_STORAGE_BUCKET, createProfileAvatarStoragePath } from "@/lib/user-storage-bucket"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

const SETTINGS_PANEL_MIN_H = "min-h-[540px] max-h-[540px]"
const SETTINGS_PANEL_SHELL =
  "mt-0 block w-full min-w-0 max-w-full focus-visible:outline-none"

function SettingsPanelCard({
  title,
  description,
  children,
  className,
}: {
  title: string
  description: string
  children: ReactNode
  className?: string
}) {
  return (
    <Card
      className={cn(
        "box-border flex w-full min-w-0 max-w-full flex-col py-6",
        SETTINGS_PANEL_MIN_H,
        className,
      )}
    >
      <CardHeader className="space-y-1.5 pb-2">
        <CardTitle className="text-xl tracking-tight">{title}</CardTitle>
        <CardDescription className="text-sm">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto text-base">
        {children}
      </CardContent>
    </Card>
  )
}

function SettingsRow({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-[5.5rem] flex-col justify-center gap-3 border-b border-border/60 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1 pr-0 sm:max-w-[55%] sm:pr-4">
        <p className="text-base font-medium leading-snug">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-[6.25rem] shrink-0 flex-col justify-center gap-3 border-b border-border/60 py-4 last:border-b-0">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div>{children}</div>
    </div>
  )
}

const settingsFieldClass = "h-11 text-base md:text-base"
const settingsLabelClass = "text-sm font-medium"

export default function SettingsPage() {
  const user = useAuthUser();
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()
  const [profile, setProfile] = useState<any>(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [role, setRole] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadingTimedOut, setLoadingTimedOut] = useState(false)
  const [saving, setSaving] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!loading) return
    const timer = setTimeout(() => {
      setLoadingTimedOut(true)
    }, 10000)
    return () => clearTimeout(timer)
  }, [loading])

  useEffect(() => {
    const loadProfile = async () => {
      const supabase = createClient()
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single()

        setProfile(data)
        if (data) {
          setFirstName(data.first_name ?? "")
          setLastName(data.last_name ?? "")
          setRole(data.role ?? "researcher")
          // avatar_url stores either a legacy public URL or (post-051) a storage
          // path; sign whichever it is so the bucket can stay private.
          if (data.avatar_url) {
            const { createBucketSignedUrl } = await import("@/lib/storage-signed-url")
            const signed = await createBucketSignedUrl(supabase, USER_STORAGE_BUCKET, data.avatar_url)
            setAvatarUrl(signed)
          } else {
            setAvatarUrl(null)
          }
        }
      }
      setLoading(false)
    }

    loadProfile()
  }, [])

  const ROLES = ["admin", "researcher", "technician", "analyst", "viewer"] as const

  const handleSaveProfile = async () => {
    if (!profile?.id) return
    const f = firstName.trim()
    const l = lastName.trim()
    if (!f || !l) {
      toast({
        title: "Validation",
        description: "First name and last name are required.",
        variant: "destructive",
      })
      return
    }
    if (!role || !ROLES.includes(role as (typeof ROLES)[number])) {
      toast({
        title: "Validation",
        description: "Please select a valid role.",
        variant: "destructive",
      })
      return
    }
    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: f,
          last_name: l,
          role,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id)
      if (error) throw error
      setProfile((p: any) => (p ? { ...p, first_name: f, last_name: l, role } : p))
      toast({ title: "Profile updated", description: "Your changes have been saved." })
    } catch (err: any) {
      toast({
        title: "Update failed",
        description: err.message ?? "Could not save profile.",
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

  const handleChangeAvatarClick = () => {
    avatarInputRef.current?.click()
  }

  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile?.id) return
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Please choose an image file (e.g. JPG, PNG).",
        variant: "destructive",
      })
      e.target.value = ""
      return
    }
    const maxMb = 2
    if (file.size > maxMb * 1024 * 1024) {
      toast({
        title: "File too large",
        description: `Please choose an image under ${maxMb} MB.`,
        variant: "destructive",
      })
      e.target.value = ""
      return
    }
    setAvatarUploading(true)
    try {
      const supabase = createClient()
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"
      const path = createProfileAvatarStoragePath(profile.id, ext)

      const { error: uploadError } = await supabase.storage.from(USER_STORAGE_BUCKET).upload(path, file, {
        upsert: true,
      })

      if (uploadError) throw uploadError

      // Bucket is private — persist the storage path; sign for display.
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          avatar_url: path,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id)

      if (updateError) throw updateError

      const { createBucketSignedUrl } = await import("@/lib/storage-signed-url")
      const signed = await createBucketSignedUrl(supabase, USER_STORAGE_BUCKET, path)
      setAvatarUrl(signed)
      setProfile((p: any) => (p ? { ...p, avatar_url: path } : p))
      toast({ title: "Avatar updated", description: "Your profile photo has been updated." })
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description:
          err.message ??
          "Could not update avatar. Ensure the `user` storage bucket exists and profile policies are applied (scripts/045).",
        variant: "destructive",
      })
    } finally {
      setAvatarUploading(false)
      e.target.value = ""
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        {loadingTimedOut ? (
          <p className="text-destructive">Failed to load profile. Please try refreshing the page.</p>
        ) : (
          <p className="text-muted-foreground">Loading...</p>
        )}
      </div>
    )
  }

  return (
      <div className="mx-auto w-full max-w-4xl space-y-4 px-4 md:space-y-6 md:px-6">
        <div>
          <PageHeading>Settings</PageHeading>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage your account and preferences
          </p>
        </div>

        <Tabs defaultValue="profile" className="flex w-full min-w-0 flex-col gap-4">
          <TabsList className="h-auto w-full max-w-md gap-1 self-start p-1">
            <TabsTrigger value="profile" className="flex-1 px-4 py-2 text-sm sm:text-base">
              Profile
            </TabsTrigger>
            <TabsTrigger value="account" className="flex-1 px-4 py-2 text-sm sm:text-base">
              Account
            </TabsTrigger>
            <TabsTrigger value="preferences" className="flex-1 px-4 py-2 text-sm sm:text-base">
              Preferences
            </TabsTrigger>
          </TabsList>

          <div className="relative grid w-full min-w-0 grid-cols-1">
            {/* Full-width sizer so every tab panel matches the settings column width */}
            <div
              className="pointer-events-none col-start-1 row-start-1 w-full min-h-[540px] opacity-0"
              aria-hidden
            />
          <TabsContent value="profile" className={cn(SETTINGS_PANEL_SHELL, "col-start-1 row-start-1")}>
            <SettingsPanelCard
              title="Profile Information"
              description="Update your personal information"
            >
                <div className="flex items-center gap-4">
                  <Avatar className="size-20">
                    {avatarUrl && (
                      <AvatarImage src={avatarUrl} alt="Profile" className="object-cover" />
                    )}
                    <AvatarFallback className="text-2xl">
                      {profile?.first_name?.[0]}
                      {profile?.last_name?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarFileSelect}
                      aria-label="Upload avatar"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 text-sm"
                      onClick={handleChangeAvatarClick}
                      disabled={avatarUploading}
                    >
                      {avatarUploading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        "Change Avatar"
                      )}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className={settingsLabelClass}>
                      First Name
                    </Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="First name"
                      disabled={saving}
                      className={settingsFieldClass}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className={settingsLabelClass}>
                      Last Name
                    </Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last name"
                      disabled={saving}
                      className={settingsFieldClass}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className={settingsLabelClass}>
                    Email
                  </Label>
                  <Input
                    id="email"
                    value={profile?.email || ""}
                    readOnly
                    className={cn(settingsFieldClass, "bg-muted")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role" className={settingsLabelClass}>
                    Role
                  </Label>
                  <Select value={role} onValueChange={setRole} disabled={saving}>
                    <SelectTrigger id="role" className={settingsFieldClass}>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r.charAt(0).toUpperCase() + r.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-auto pt-2">
                  <Button
                    className="h-11 px-6 text-base"
                    onClick={handleSaveProfile}
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </div>
            </SettingsPanelCard>
          </TabsContent>

          <TabsContent value="account" className={cn(SETTINGS_PANEL_SHELL, "col-start-1 row-start-1")}>
            <SettingsPanelCard
              title="Account Settings"
              description="Manage your account security"
            >
              <div className="flex flex-1 flex-col">
                <SettingsSection
                  title="Password"
                  description="Update the password you use to sign in to Notes9."
                >
                  <ChangePasswordDialog>
                    <Button variant="outline" className="h-10 text-sm">
                      Change Password
                    </Button>
                  </ChangePasswordDialog>
                </SettingsSection>

                <SettingsSection
                  title="Two-factor authentication"
                  description="Add an extra layer of security with a TOTP authenticator app (Google Authenticator, 1Password, Authy). Requires re-signing in to enroll."
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="outline" className="h-10 text-sm" disabled>
                      Enable 2FA
                    </Button>
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Coming soon
                    </span>
                  </div>
                </SettingsSection>

                <SettingsSection
                  title="Legal & Privacy"
                  description="View our terms and privacy policy."
                >
                  <Button variant="outline" className="h-10 text-sm" asChild>
                    <a href="/privacy" target="_blank" rel="noopener noreferrer">
                      View Terms & Privacy Policy
                    </a>
                  </Button>
                </SettingsSection>

                <SettingsSection
                  title="Sign Out"
                  description="Sign out from your account on this device."
                >
                  <Button
                    variant="destructive"
                    className="h-10 text-sm"
                    onClick={handleSignOut}
                  >
                    <LogOut className="mr-2 size-4" />
                    Sign Out
                  </Button>
                </SettingsSection>
              </div>
            </SettingsPanelCard>
          </TabsContent>

        <TabsContent value="preferences" className={cn(SETTINGS_PANEL_SHELL, "col-start-1 row-start-1")}>
          <SettingsPanelCard
            title="Preferences"
            description="Customize your Notes9 experience"
          >
            <div className="flex flex-1 flex-col justify-center">
              <SettingsRow
                title="Theme"
                description="Choose your preferred color theme"
              >
                {mounted ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={theme === "light" ? "default" : "outline"}
                      className="h-10 text-sm"
                      onClick={() => setTheme("light")}
                    >
                      <Sun className="mr-2 size-4" />
                      Light
                    </Button>
                    <Button
                      variant={theme === "dark" ? "default" : "outline"}
                      className="h-10 text-sm"
                      onClick={() => setTheme("dark")}
                    >
                      <Moon className="mr-2 size-4" />
                      Dark
                    </Button>
                    <Button
                      variant={theme === "system" ? "default" : "outline"}
                      className="h-10 text-sm"
                      onClick={() => setTheme("system")}
                    >
                      <Monitor className="mr-2 size-4" />
                      System
                    </Button>
                  </div>
                ) : null}
              </SettingsRow>

              <SettingsRow
                title="Email Notifications"
                description="Receive email updates about your experiments"
              >
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Coming soon
                </span>
              </SettingsRow>

              <SettingsRow
                title="Default View"
                description="Set your preferred dashboard layout"
              >
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Coming soon
                </span>
              </SettingsRow>
            </div>
          </SettingsPanelCard>
        </TabsContent>
          </div>

      </Tabs>
    </div>
  )
}

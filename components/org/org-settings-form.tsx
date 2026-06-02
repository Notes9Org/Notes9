"use client"

import { useState } from "react"
import { z } from "zod"
import { Building2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"

const orgSettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters")
    .max(100, "Organization name must be at most 100 characters"),
  type: z
    .enum(["academic", "industry", "government", "independent"])
    .optional(),
  description: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
})

type OrgSettingsFormValues = z.infer<typeof orgSettingsSchema>

const ORG_TYPES = [
  { value: "academic", label: "Academic" },
  { value: "industry", label: "Industry" },
  { value: "government", label: "Government" },
  { value: "independent", label: "Independent" },
] as const

export interface OrgSettingsFormProps {
  organization: {
    id: string
    name: string
    type?: string | null
    description?: string | null
    address?: string | null
    phone?: string | null
    email?: string | null
  }
}

export function OrgSettingsForm({ organization }: OrgSettingsFormProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof OrgSettingsFormValues, string>>>({})
  const [formValues, setFormValues] = useState<OrgSettingsFormValues>({
    name: organization.name ?? "",
    type: (organization.type as OrgSettingsFormValues["type"]) ?? undefined,
    description: organization.description ?? "",
    address: organization.address ?? "",
    phone: organization.phone ?? "",
    email: organization.email ?? "",
  })

  function updateField<K extends keyof OrgSettingsFormValues>(
    field: K,
    value: OrgSettingsFormValues[K]
  ) {
    setFormValues((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrors({})

    const result = orgSettingsSchema.safeParse(formValues)
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof OrgSettingsFormValues, string>> = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof OrgSettingsFormValues
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message
        }
      }
      setErrors(fieldErrors)
      return
    }

    setIsLoading(true)

    try {
      const supabase = createClient()

      type OrgUpdatePayload = {
        name: string
        type: string | null
        description: string | null
        address: string | null
        phone: string | null
        email: string | null
      }

      const payload: OrgUpdatePayload = {
        name: result.data.name,
        type: result.data.type ?? null,
        description: result.data.description || null,
        address: result.data.address || null,
        phone: result.data.phone || null,
        email: result.data.email || null,
      }

      const { error } = await supabase
        .from("organizations")
        .update(payload)
        .eq("id", organization.id)

      if (error) {
        toast({
          title: "Error",
          description: error.message || "Failed to update organization settings",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Settings updated",
        description: "Organization settings have been saved.",
      })
    } catch {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Organization Settings
        </CardTitle>
        <CardDescription>
          Update your lab&apos;s details and contact information.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-6">
          {/* Organization Name (required) */}
          <div className="grid gap-2">
            <Label htmlFor="org-name">
              Organization Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="org-name"
              placeholder="e.g. Smith Research Lab"
              value={formValues.name}
              onChange={(e) => updateField("name", e.target.value)}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "org-name-error" : undefined}
              disabled={isLoading}
            />
            {errors.name && (
              <p id="org-name-error" className="text-sm text-destructive">
                {errors.name}
              </p>
            )}
          </div>

          {/* Organization Type */}
          <div className="grid gap-2">
            <Label htmlFor="org-type">Organization Type</Label>
            <Select
              value={formValues.type ?? ""}
              onValueChange={(value) =>
                updateField("type", value as OrgSettingsFormValues["type"])
              }
              disabled={isLoading}
            >
              <SelectTrigger id="org-type">
                <SelectValue placeholder="Select a type" />
              </SelectTrigger>
              <SelectContent>
                {ORG_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="grid gap-2">
            <Label htmlFor="org-description">Description</Label>
            <Textarea
              id="org-description"
              placeholder="Briefly describe your lab or organization"
              value={formValues.description}
              onChange={(e) => updateField("description", e.target.value)}
              disabled={isLoading}
              rows={3}
            />
          </div>

          {/* Address */}
          <div className="grid gap-2">
            <Label htmlFor="org-address">Address</Label>
            <Input
              id="org-address"
              placeholder="Lab or institution address"
              value={formValues.address}
              onChange={(e) => updateField("address", e.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* Phone and Email side by side */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="org-phone">Phone</Label>
              <Input
                id="org-phone"
                type="tel"
                placeholder="Contact phone number"
                value={formValues.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-email">Email</Label>
              <Input
                id="org-email"
                type="email"
                placeholder="Contact email address"
                value={formValues.email}
                onChange={(e) => updateField("email", e.target.value)}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "org-email-error" : undefined}
                disabled={isLoading}
              />
              {errors.email && (
                <p id="org-email-error" className="text-sm text-destructive">
                  {errors.email}
                </p>
              )}
            </div>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={isLoading}
            className="cursor-pointer"
          >
            {isLoading && <Spinner className="mr-2" />}
            {isLoading ? "Saving..." : "Save Settings"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

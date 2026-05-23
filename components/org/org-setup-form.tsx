"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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

const orgSetupSchema = z.object({
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

type OrgSetupFormValues = z.infer<typeof orgSetupSchema>

const ORG_TYPES = [
  { value: "academic", label: "Academic" },
  { value: "industry", label: "Industry" },
  { value: "government", label: "Government" },
  { value: "independent", label: "Independent" },
] as const

export function OrgSetupForm() {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof OrgSetupFormValues, string>>>({})
  const [formValues, setFormValues] = useState<OrgSetupFormValues>({
    name: "",
    type: undefined,
    description: "",
    address: "",
    phone: "",
    email: "",
  })

  function updateField<K extends keyof OrgSetupFormValues>(
    field: K,
    value: OrgSetupFormValues[K]
  ) {
    setFormValues((prev) => ({ ...prev, [field]: value }))
    // Clear field error on change
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

    // Client-side validation
    const result = orgSetupSchema.safeParse(formValues)
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof OrgSetupFormValues, string>> = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof OrgSetupFormValues
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message
        }
      }
      setErrors(fieldErrors)
      return
    }

    setIsLoading(true)

    try {
      // Build payload, omitting empty optional fields
      const payload: Record<string, string> = { name: result.data.name }
      if (result.data.type) payload.type = result.data.type
      if (result.data.description) payload.description = result.data.description
      if (result.data.address) payload.address = result.data.address
      if (result.data.phone) payload.phone = result.data.phone
      if (result.data.email) payload.email = result.data.email

      const res = await fetch("/api/org/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const message = data?.error || "Failed to create organization"
        toast({
          title: "Error",
          description: message,
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Organization created",
        description: "Your lab has been set up successfully.",
      })

      router.push("/settings/organization")
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
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Set up your lab
        </CardTitle>
        <CardDescription>
          Create your organization to start collaborating with your research
          team.
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
                updateField(
                  "type",
                  value as OrgSetupFormValues["type"]
                )
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
            {isLoading ? "Creating..." : "Create Organization"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

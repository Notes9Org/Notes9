"use client"

import { createClient } from "@/lib/supabase/client"
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
import Link from "next/link"
import { useState } from "react"
import Image from "next/image"
import { ArrowLeft, Mail } from "lucide-react"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      // Use explicit production URL - must match Supabase redirect URLs config
      const redirectUrl = process.env.NODE_ENV === 'production' 
        ? 'https://www.notes9.com/auth/reset-password'
        : `${window.location.origin}/auth/reset-password`
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      })
      
      if (error) throw error
      
      setSuccess(true)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <Image 
              src="/notes9-logo.png" 
              alt="Notes9 Logo" 
              width={60} 
              height={60}
            />
            <h1 className="text-2xl font-bold">Reset Your Password</h1>
            <p className="text-sm text-muted-foreground">
              Enter your email to receive a password reset link
            </p>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Forgot Password</CardTitle>
              <CardDescription>
                We'll send you a link to reset your password
              </CardDescription>
            </CardHeader>
            <CardContent>
              {success ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4">
                    <div className="flex items-start gap-3">
                      <Mail className="h-5 w-5 text-green-500 mt-0.5" />
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium text-green-500">
                          Check your email
                        </p>
                        <p className="text-sm text-muted-foreground">
                          We've sent a password reset link to <strong>{email}</strong>
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          The link will expire in 1 hour. If you don't see the email, check your spam folder.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <Link
                      href="/auth/login"
                      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back to sign in
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleResetRequest}>
                  <div className="flex flex-col gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="researcher@lab.com"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    
                    {error && (
                      <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                      </div>
                    )}
                    
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? "Sending..." : "Send Reset Link"}
                    </Button>
                  </div>
                  
                  <div className="mt-4 text-center">
                    <Link
                      href="/auth/login"
                      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back to sign in
                    </Link>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}


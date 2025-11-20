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
import { useRouter } from 'next/navigation'
import { useState, useEffect } from "react"
import Image from "next/image"
import { CheckCircle2, Eye, EyeOff } from "lucide-react"

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hasToken, setHasToken] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // Check if we have a valid token/session
    const checkSession = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      // Check for recovery token in URL hash
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const accessToken = hashParams.get('access_token')
      const type = hashParams.get('type')
      
      if (type === 'recovery' && accessToken) {
        setHasToken(true)
      } else if (!session) {
        // No valid token or session
        router.push('/auth/login')
      } else {
        setHasToken(true)
      }
    }
    
    checkSession()
  }, [router])

  const validatePassword = (pass: string): string | null => {
    if (pass.length < 8) {
      return "Password must be at least 8 characters long"
    }
    if (!/[A-Z]/.test(pass)) {
      return "Password must contain at least one uppercase letter"
    }
    if (!/[a-z]/.test(pass)) {
      return "Password must contain at least one lowercase letter"
    }
    if (!/[0-9]/.test(pass)) {
      return "Password must contain at least one number"
    }
    return null
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    // Validate passwords match
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      setIsLoading(false)
      return
    }

    // Validate password strength
    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      setIsLoading(false)
      return
    }

    const supabase = createClient()

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      })
      
      if (error) throw error
      
      setSuccess(true)
      
      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  if (!hasToken) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-6 bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">Validating reset token...</p>
        </div>
      </div>
    )
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
            <h1 className="text-2xl font-bold">Set New Password</h1>
            <p className="text-sm text-muted-foreground">
              Create a strong password for your account
            </p>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Reset Password</CardTitle>
              <CardDescription>
                Enter your new password below
              </CardDescription>
            </CardHeader>
            <CardContent>
              {success ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium text-green-500">
                          Password reset successful!
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Redirecting you to the dashboard...
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleResetPassword}>
                  <div className="flex flex-col gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="password">New Password</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Must be at least 8 characters with uppercase, lowercase, and number
                      </p>
                    </div>
                    
                    <div className="grid gap-2">
                      <Label htmlFor="confirmPassword">Confirm Password</Label>
                      <div className="relative">
                        <Input
                          id="confirmPassword"
                          type={showConfirmPassword ? "text" : "password"}
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    
                    {error && (
                      <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                      </div>
                    )}
                    
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? "Resetting..." : "Reset Password"}
                    </Button>
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


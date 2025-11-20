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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import Link from "next/link"
import { useRouter } from 'next/navigation'
import { useState, useEffect } from "react"
import Image from "next/image"
import { Separator } from "@/components/ui/separator"

export default function SignUpPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [role, setRole] = useState("researcher")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [checkingEmail, setCheckingEmail] = useState(false)
  const router = useRouter()

  // Check if email exists when user stops typing
  useEffect(() => {
    if (!email || !email.includes('@')) {
      setEmailError(null)
      return
    }

    const checkEmail = async () => {
      setCheckingEmail(true)
      const supabase = createClient()
      
      try {
        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("email")
          .eq("email", email)
          .single()

        if (existingProfile) {
          setEmailError("An account with this email already exists. Please sign in instead.")
        } else {
          setEmailError(null)
        }
      } catch (error: any) {
        // If error is "no rows returned", email doesn't exist (good)
        if (error?.code === 'PGRST116') {
          setEmailError(null)
        } else {
          // Other errors, don't show error (might be network issue)
          setEmailError(null)
        }
      } finally {
        setCheckingEmail(false)
      }
    }

    // Debounce email check
    const timeoutId = setTimeout(checkEmail, 500)
    return () => clearTimeout(timeoutId)
  }, [email])

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      // Check if email already exists in profiles table
      const { data: existingProfile, error: checkError } = await supabase
        .from("profiles")
        .select("email")
        .eq("email", email)
        .single()

      if (existingProfile) {
        setError("An account with this email already exists. Please sign in instead.")
        setIsLoading(false)
        return
      }

      // Attempt to sign up
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ||
            `${window.location.origin}/dashboard`,
          data: {
            first_name: firstName,
            last_name: lastName,
            role: role,
          },
        },
      })

      if (error) {
        // Handle specific Supabase auth errors
        if (error.message.includes('already registered') || error.message.includes('already exists')) {
          setError("An account with this email already exists. Please sign in instead.")
        } else {
          throw error
        }
        return
      }

      // Check if user was created or if it's a duplicate
      if (data.user && !data.session) {
        // User created but needs email verification
        router.push("/auth/sign-up-success")
      } else if (data.user && data.session) {
        // User already exists and was signed in automatically
        router.push("/dashboard")
      } else {
        router.push("/auth/sign-up-success")
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message.includes('already registered') || error.message.includes('already exists')) {
          setError("An account with this email already exists. Please sign in instead.")
        } else {
          setError(error.message)
        }
      } else {
        setError("An error occurred")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleOAuthSignUp = async (provider: 'google' | 'azure') => {
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: provider === 'google' 
            ? 'email profile' 
            : 'email openid profile',
          queryParams: provider === 'azure'
            ? {
                prompt: 'select_account',
              }
            : undefined,
        },
      })
      if (error) throw error
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
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
            <h1 className="text-2xl font-bold">Join Notes9</h1>
            <p className="text-sm text-muted-foreground">
              Create your research lab account
            </p>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Create Account</CardTitle>
              <CardDescription>
                Enter your information to get started
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* OAuth Buttons */}
              <div className="flex flex-col gap-3 mb-6">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleOAuthSignUp('google')}
                  disabled={isLoading}
                >
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continue with Google
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleOAuthSignUp('azure')}
                  disabled={isLoading}
                >
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 23 23" fill="none">
                    <path
                      d="M11.4 11.4H22.5V0.299999H11.4V11.4Z"
                      fill="#F25022"
                    />
                    <path
                      d="M0.299999 11.4H11.4V0.299999H0.299999V11.4Z"
                      fill="#7FBA00"
                    />
                    <path
                      d="M11.4 22.5H22.5V11.4H11.4V22.5Z"
                      fill="#00A4EF"
                    />
                    <path
                      d="M0.299999 22.5H11.4V11.4H0.299999V22.5Z"
                      fill="#FFB900"
                    />
                  </svg>
                  Continue with Microsoft
                </Button>
              </div>

              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <Separator />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    Or continue with email
                  </span>
                </div>
              </div>

              <form onSubmit={handleSignUp}>
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        type="text"
                        placeholder="Sarah"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        type="text"
                        placeholder="Chen"
                        required
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="researcher@lab.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={emailError ? "border-destructive" : ""}
                    />
                    {emailError && (
                      <p className="text-sm text-destructive">{emailError}</p>
                    )}
                    {checkingEmail && (
                      <p className="text-sm text-muted-foreground">Checking email...</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="role">Role</Label>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger id="role">
                        <SelectValue placeholder="Select your role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="researcher">Researcher</SelectItem>
                        <SelectItem value="technician">Technician</SelectItem>
                        <SelectItem value="analyst">Analyst</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  {error && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      {error}
                    </div>
                  )}
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isLoading || !!emailError || checkingEmail}
                  >
                    {isLoading ? "Creating account..." : "Create Account"}
                  </Button>
                  {emailError && (
                    <div className="text-center text-sm">
                      <Link
                        href={`/auth/login?email=${encodeURIComponent(email)}`}
                        className="text-primary underline underline-offset-4 hover:text-primary/80"
                      >
                        Sign in with this email instead
                      </Link>
                    </div>
                  )}
                </div>
                <div className="mt-4 text-center text-sm">
                  Already have an account?{" "}
                  <Link
                    href="/auth/login"
                    className="underline underline-offset-4 hover:text-primary"
                  >
                    Sign in
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

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
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from "react"
import Image from "next/image"
import { Separator } from "@/components/ui/separator"
import { InteractiveParticles } from "@/components/ui/interactive-particles"

function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [emailExists, setEmailExists] = useState<boolean | null>(null)
  const [checkingEmail, setCheckingEmail] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  // Pre-fill email if coming from sign-up page
  useEffect(() => {
    const emailParam = searchParams.get('email')
    if (emailParam) {
      setEmail(emailParam)
    }
  }, [searchParams])

  // Check if email exists when user stops typing
  useEffect(() => {
    if (!email || !email.includes('@')) {
      setEmailExists(null)
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

        setEmailExists(!!existingProfile)
      } catch (error: any) {
        // If error is "no rows returned", email doesn't exist
        if (error?.code === 'PGRST116') {
          setEmailExists(false)
        } else {
          // Other errors, don't set state (might be network issue)
          setEmailExists(null)
        }
      } finally {
        setCheckingEmail(false)
      }
    }

    // Debounce email check
    const timeoutId = setTimeout(checkEmail, 500)
    return () => clearTimeout(timeoutId)
  }, [email])

  // Handle OAuth errors in URL (route handler handles code exchange)
  useEffect(() => {
    const errorParam = searchParams.get('error')

    if (errorParam) {
      setError(`OAuth error: ${errorParam}`)
      // Clean up URL
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.delete('error')
      router.replace(newUrl.pathname)
    }
  }, [searchParams, router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      // Single attempt; if Supabase says invalid credentials, show wrong password/email
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setError("Wrong email or password. Please try again.")
          return
        }
        throw error
      }

      router.push("/dashboard")
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleOAuthSignIn = async (provider: 'google' | 'azure') => {
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
    <div className="flex min-h-screen w-full items-center justify-center p-6 bg-background relative overflow-hidden">
      <InteractiveParticles />
      {/* Dark overlay for better text visibility */}
      <div className="absolute inset-0 z-0 bg-background/30 backdrop-blur-[1px]" />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_800px_at_center,theme(colors.background)_30%,transparent_100%)]" />

      <div className="w-full max-w-md relative z-10">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <Image
              src="/notes9-logo.png"
              alt="Notes9 Logo"
              width={60}
              height={60}
            />
            <h1 className="text-2xl font-bold">Welcome to Notes9</h1>
            <p className="text-sm text-muted-foreground">
              Research Lab Management
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Sign In</CardTitle>
              <CardDescription>
                Enter your credentials to access your laboratory workspace
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* OAuth Buttons */}
              <div className="flex flex-col gap-3 mb-6">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleOAuthSignIn('google')}
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
                  onClick={() => handleOAuthSignIn('azure')}
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

              <form onSubmit={handleLogin}>
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
                  {emailExists === false && !checkingEmail && !error && (
                    <div className="rounded-md bg-muted p-3 text-sm">
                      <p className="text-muted-foreground mb-2">
                        No account found with this email.
                      </p>
                      <Link
                        href={`/auth/sign-up?email=${encodeURIComponent(email)}`}
                        className="text-primary underline underline-offset-4 hover:text-primary/80"
                      >
                        Sign up with this email instead
                      </Link>
                    </div>
                  )}
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading || checkingEmail}
                  >
                    {isLoading ? "Signing in..." : "Sign In"}
                  </Button>
                </div>
                <div className="mt-4 text-center text-sm">
                  Don't have an account?{" "}
                  <Link
                    href="/auth/sign-up"
                    className="underline underline-offset-4 hover:text-primary"
                  >
                    Sign up
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

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen w-full items-center justify-center p-6 bg-background">
        <div className="text-center">Loading...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}

import { describe, it, expect, vi } from "vitest"
import fs from "fs"
import path from "path"

/**
 * Settings page theme toggle hydration safety tests.
 *
 * Requirements: 11.1, 11.2, 11.3
 *
 * The settings page uses a `mounted` state guard to prevent rendering
 * theme toggle buttons during SSR. We verify the implementation patterns
 * via source code analysis, since the component has heavy dependencies
 * (Supabase, Radix tabs, next-themes) that make isolated rendering fragile.
 */

function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", relativePath), "utf-8")
}

const settingsSource = readSource("app/(app)/settings/page.tsx")

describe("Settings theme toggle hydration safety (Req 11.1)", () => {
  it("uses a mounted state guard initialized to false", () => {
    expect(settingsSource).toContain("const [mounted, setMounted] = useState(false)")
  })

  it("sets mounted to true in a useEffect after client mount", () => {
    expect(settingsSource).toContain("setMounted(true)")
    // The useEffect that sets mounted should have an empty dependency array
    // Pattern: useEffect(() => { setMounted(true) }, [])
    expect(settingsSource).toMatch(/useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?setMounted\(true\)[\s\S]*?\},\s*\[\]\s*\)/)
  })

  it("conditionally renders theme buttons only when mounted is true", () => {
    // The theme buttons are wrapped in {mounted && (...)}
    expect(settingsSource).toMatch(/\{mounted\s*&&/)
  })
})

describe("Settings theme toggle applies immediately (Req 11.2)", () => {
  it("calls setTheme('light') on Light button click", () => {
    expect(settingsSource).toContain('onClick={() => setTheme("light")}')
  })

  it("calls setTheme('dark') on Dark button click", () => {
    expect(settingsSource).toContain('onClick={() => setTheme("dark")}')
  })

  it("calls setTheme('system') on System button click", () => {
    expect(settingsSource).toContain('onClick={() => setTheme("system")}')
  })

  it("calls setTheme('black') on Black button click", () => {
    expect(settingsSource).toContain('onClick={() => setTheme("black")}')
  })

  it("uses useTheme hook from next-themes for immediate theme application", () => {
    expect(settingsSource).toContain("const { theme, setTheme } = useTheme()")
  })
})

describe("Settings theme toggle button variants reflect current theme (Req 11.3)", () => {
  it("Light button uses default variant when theme is light", () => {
    expect(settingsSource).toContain('variant={theme === "light" ? "default" : "outline"}')
  })

  it("Dark button uses default variant when theme is dark", () => {
    expect(settingsSource).toContain('variant={theme === "dark" ? "default" : "outline"}')
  })

  it("System button uses default variant when theme is system", () => {
    expect(settingsSource).toContain('variant={theme === "system" ? "default" : "outline"}')
  })

  it("Black button uses default variant when theme is black", () => {
    expect(settingsSource).toContain('variant={theme === "black" ? "default" : "outline"}')
  })
})

'use client'

import { useTheme } from 'next-themes'
import { Toaster as Sonner, ToasterProps } from 'sonner'

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      closeButton
      toastOptions={{
        // Sandglass toast: grained, blurred, glass-bordered (readability from
        // the high-opacity mix + blur).
        className: 'n9-grain backdrop-blur-xl',
      }}
      style={
        {
          '--normal-bg': 'color-mix(in srgb, var(--popover) 82%, transparent)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--glass-border)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }

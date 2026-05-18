'use client'

/**
 * Thin adapter over sonner — keeps the existing useToast() API so all callers
 * continue to compile while the underlying notifications come from a single
 * unified source (sonner). The radix-based <Toaster> is no longer rendered.
 */
import * as React from 'react'
import { toast as sonnerToast } from 'sonner'

type ToastVariant = 'default' | 'destructive' | 'success'

interface ToastInput {
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: ToastVariant
  duration?: number
  action?: { label: string; onClick: () => void }
}

function nodeToString(n: React.ReactNode): string {
  if (n == null || n === false) return ''
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  return ''
}

function show(input: ToastInput) {
  const title = nodeToString(input.title) || ''
  const description =
    typeof input.description === 'string' || typeof input.description === 'number'
      ? String(input.description)
      : undefined

  const options: Parameters<typeof sonnerToast>[1] = {}
  if (description) options.description = description
  if (typeof input.duration === 'number') options.duration = input.duration
  if (input.action) options.action = input.action

  switch (input.variant) {
    case 'destructive':
      return sonnerToast.error(title, options)
    case 'success':
      return sonnerToast.success(title, options)
    default:
      return sonnerToast(title, options)
  }
}

export function useToast() {
  return {
    toast: show,
    dismiss: (id?: string | number) =>
      id !== undefined ? sonnerToast.dismiss(id) : sonnerToast.dismiss(),
    toasts: [] as never[],
  }
}

export const toast = show

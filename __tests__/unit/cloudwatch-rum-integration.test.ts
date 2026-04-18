import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, act, cleanup } from '@testing-library/react'
import { useRum } from '@/hooks/use-rum'
import { recordRumEvent, setRumClient } from '@/lib/rum'

/**
 * Unit tests for RumProvider, useRum hook, and recordRumEvent standalone.
 *
 * Property 8: Children render regardless of RUM state (covered as unit tests 1 & 2)
 * Validates: Requirements 6.3, 7.4
 */

// Mock Supabase client to prevent real calls
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  }),
}))

// Helper component that exposes useRum() context values
function RumConsumer() {
  const { client } = useRum()
  return React.createElement('div', { 'data-testid': 'rum-client' }, client ? 'has-client' : 'no-client')
}

describe('RumProvider renders children when RUM is skipped in development', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.NODE_ENV = 'development'
  })

  afterEach(() => {
    cleanup()
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('renders child content when NODE_ENV is development', async () => {
    vi.resetModules()

    // Re-mock supabase after resetModules
    vi.doMock('@/lib/supabase/client', () => ({
      createClient: () => ({
        auth: {
          onAuthStateChange: () => ({
            data: { subscription: { unsubscribe: () => {} } },
          }),
        },
      }),
    }))

    const { RumProvider } = await import('@/components/rum-provider')

    await act(async () => {
      render(
        React.createElement(RumProvider, null,
          React.createElement('div', { 'data-testid': 'test-child' }, 'test child')
        )
      )
    })

    expect(screen.getByTestId('test-child')).toBeTruthy()
    expect(screen.getByText('test child')).toBeTruthy()
  })
})

describe('RumProvider renders children when RUM init fails', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.NEXT_PUBLIC_CW_RUM_APP_ID = 'test-app-id'
    process.env.NEXT_PUBLIC_CW_RUM_IDENTITY_POOL_ID = 'us-east-1:test-pool'
    process.env.NEXT_PUBLIC_CW_RUM_ENDPOINT = 'https://rum.us-east-1.amazonaws.com'
    process.env.NEXT_PUBLIC_CW_RUM_REGION = 'us-east-1'
    process.env.NODE_ENV = 'test'
  })

  afterEach(() => {
    cleanup()
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('renders child content when aws-rum-web import throws', async () => {
    vi.resetModules()

    vi.doMock('aws-rum-web', () => {
      throw new Error('Module not found')
    })

    vi.doMock('@/lib/supabase/client', () => ({
      createClient: () => ({
        auth: {
          onAuthStateChange: () => ({
            data: { subscription: { unsubscribe: () => {} } },
          }),
        },
      }),
    }))

    const { RumProvider } = await import('@/components/rum-provider')

    await act(async () => {
      render(
        React.createElement(RumProvider, null,
          React.createElement('div', { 'data-testid': 'test-child' }, 'test child')
        )
      )
    })

    expect(screen.getByTestId('test-child')).toBeTruthy()
    expect(screen.getByText('test child')).toBeTruthy()
  })
})

describe('useRum returns null client when outside provider', () => {
  it('client is null when useRum is called without a RumProvider wrapper', () => {
    render(React.createElement(RumConsumer))

    const el = screen.getByTestId('rum-client')
    expect(el.textContent).toBe('no-client')
  })
})

describe('recordRumEvent is callable before provider mounts (no-op)', () => {
  afterEach(() => {
    setRumClient(null)
  })

  it('does not throw when called with null client', () => {
    setRumClient(null)
    expect(() => recordRumEvent('test_event', { key: 'value' })).not.toThrow()
  })

  it('does not throw when called with various event types and data', () => {
    setRumClient(null)
    expect(() => recordRumEvent('experiment_created', { projectId: 'p-123' })).not.toThrow()
    expect(() => recordRumEvent('', {})).not.toThrow()
    expect(() => recordRumEvent('user_logged_in', { nested: { deep: true } })).not.toThrow()
  })
})

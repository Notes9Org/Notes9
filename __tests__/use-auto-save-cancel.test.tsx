import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useAutoSave } from '@/hooks/use-auto-save'

describe('useAutoSave — cancel and record-switch safety', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debouncedSave fires once after the delay', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useAutoSave({ onSave, delay: 1000 }))

    act(() => {
      result.current.debouncedSave('content A')
    })
    expect(onSave).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith('content A')
  })

  it('rapid successive debouncedSave calls only fire the latest', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useAutoSave({ onSave, delay: 1000 }))

    act(() => {
      result.current.debouncedSave('first')
      result.current.debouncedSave('second')
      result.current.debouncedSave('third')
    })

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith('third')
  })

  it('cancelPendingSave prevents the debounce from firing and clears params', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useAutoSave({ onSave, delay: 1000 }))

    act(() => {
      result.current.debouncedSave('record-A content')
    })
    act(() => {
      result.current.cancelPendingSave()
    })

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(onSave).not.toHaveBeenCalled()
  })

  it('after cancel, forceSave does not replay the cancelled payload', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useAutoSave({ onSave, delay: 1000 }))

    act(() => {
      result.current.debouncedSave('record-A content')
      result.current.cancelPendingSave()
    })
    await act(async () => {
      await result.current.forceSave()
    })
    expect(onSave).not.toHaveBeenCalled()
  })

  it('after switching records (cancel + new debounce), only the new record saves', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useAutoSave({ onSave, delay: 1000 }))

    act(() => {
      result.current.debouncedSave('record-A content')
      result.current.cancelPendingSave()
      result.current.debouncedSave('record-B content')
    })

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith('record-B content')
  })
})

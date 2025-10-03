import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }))

import { invoke } from '@tauri-apps/api/core'
import { useAmpService } from './useAmpService'

describe('useAmpService agent mode', () => {
  beforeEach(() => {
    ;(invoke as any).mockReset?.()
  })

  it('setAgentMode then getAgentMode round-trips via invoke', async () => {
    const { result } = renderHook(() => useAmpService())

    ;(invoke as any).mockResolvedValueOnce(undefined)
    await act(async () => {
      await result.current.setAgentMode('tools-first')
    })
    expect(invoke).toHaveBeenCalledWith('set_agent_mode', { mode: 'tools-first' })

    ;(invoke as any).mockResolvedValueOnce('tools-first')
    let val: string | null = null
    await act(async () => {
      val = await result.current.getAgentMode()
    })
    expect(invoke).toHaveBeenCalledWith('get_agent_mode')
    expect(val).toBe('tools-first')
  })

  it('getAgentMode returns null on failure', async () => {
    const { result } = renderHook(() => useAmpService())
    ;(invoke as any).mockRejectedValueOnce(new Error('boom'))
    let val: string | null = 'x'
    await act(async () => {
      val = await result.current.getAgentMode()
    })
    expect(val).toBeNull()
  })
})

describe('useAmpService toolbox path', () => {
  beforeEach(() => {
    ;(invoke as any).mockReset?.()
  })

  it('setToolboxPath then getToolboxPath round-trips via invoke', async () => {
    const { result } = renderHook(() => useAmpService())

    ;(invoke as any).mockResolvedValueOnce(undefined)
    await act(async () => {
      await result.current.setToolboxPath('/path/to/toolbox')
    })
    expect(invoke).toHaveBeenCalledWith('set_toolbox_path', { path: '/path/to/toolbox' })

    ;(invoke as any).mockResolvedValueOnce('/path/to/toolbox')
    let val: string | null = null
    await act(async () => {
      val = await result.current.getToolboxPath()
    })
    expect(invoke).toHaveBeenCalledWith('get_toolbox_path')
    expect(val).toBe('/path/to/toolbox')
  })

  it('setToolboxPath with null clears the path', async () => {
    const { result } = renderHook(() => useAmpService())

    ;(invoke as any).mockResolvedValueOnce(undefined)
    await act(async () => {
      await result.current.setToolboxPath(null)
    })
    expect(invoke).toHaveBeenCalledWith('set_toolbox_path', { path: null })
  })

  it('getToolboxPath returns null on failure', async () => {
    const { result } = renderHook(() => useAmpService())
    ;(invoke as any).mockRejectedValueOnce(new Error('boom'))
    let val: string | null = 'x'
    await act(async () => {
      val = await result.current.getToolboxPath()
    })
    expect(val).toBeNull()
  })
})

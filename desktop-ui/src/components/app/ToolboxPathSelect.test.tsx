import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn()
}))

vi.mock('../../hooks/useAmpService', () => ({
  useAmpService: vi.fn()
}))

import { open } from '@tauri-apps/plugin-dialog'
import { useAmpService } from '../../hooks/useAmpService'
import { ToolboxPathSelect } from './ToolboxPathSelect'

describe('ToolboxPathSelect', () => {
  const mockGetToolboxPath = vi.fn()
  const mockSetToolboxPath = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
    ;(useAmpService as any).mockReturnValue({
      getToolboxPath: mockGetToolboxPath,
      setToolboxPath: mockSetToolboxPath
    })
  })

  it('renders with no toolbox selected initially', async () => {
    mockGetToolboxPath.mockResolvedValue(null)
    
    render(<ToolboxPathSelect />)
    
    await waitFor(() => {
      expect(screen.getByText('No toolbox selected')).toBeInTheDocument()
    })
    expect(screen.queryByTitle('Clear toolbox selection')).not.toBeInTheDocument()
  })

  it('renders with existing toolbox path', async () => {
    mockGetToolboxPath.mockResolvedValue('/path/to/toolbox')
    
    render(<ToolboxPathSelect />)
    
    await waitFor(() => {
      expect(screen.getByText('/path/to/toolbox')).toBeInTheDocument()
    })
    expect(screen.getByTitle('Clear toolbox selection')).toBeInTheDocument()
  })

  it('calls setToolboxPath when directory is selected', async () => {
    mockGetToolboxPath.mockResolvedValue(null)
    ;(open as any).mockResolvedValue('/new/toolbox/path')
    
    render(<ToolboxPathSelect />)
    
    await waitFor(() => {
      expect(screen.getByText('No toolbox selected')).toBeInTheDocument()
    })
    
    fireEvent.click(screen.getByTitle('Select toolbox directory'))
    
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
        title: 'Select Toolbox Directory'
      })
      expect(mockSetToolboxPath).toHaveBeenCalledWith('/new/toolbox/path')
    })
  })

  it('calls setToolboxPath with null when cleared', async () => {
    mockGetToolboxPath.mockResolvedValue('/path/to/toolbox')
    
    render(<ToolboxPathSelect />)
    
    await waitFor(() => {
      expect(screen.getByText('/path/to/toolbox')).toBeInTheDocument()
    })
    
    fireEvent.click(screen.getByTitle('Clear toolbox selection'))
    
    expect(mockSetToolboxPath).toHaveBeenCalledWith(null)
  })

  it('handles dialog cancellation gracefully', async () => {
    mockGetToolboxPath.mockResolvedValue(null)
    ;(open as any).mockResolvedValue(null)
    
    render(<ToolboxPathSelect />)
    
    await waitFor(() => {
      expect(screen.getByText('No toolbox selected')).toBeInTheDocument()
    })
    
    fireEvent.click(screen.getByTitle('Select toolbox directory'))
    
    await waitFor(() => {
      expect(open).toHaveBeenCalled()
    })
    
    // Should not call setToolboxPath if dialog was cancelled
    expect(mockSetToolboxPath).not.toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToolboxProfileSelect } from './ToolboxProfileSelect'

// Mock the useAmpService hook
const mockUseAmpService = {
  listToolboxProfiles: vi.fn(),
  createToolboxProfile: vi.fn(),
  updateToolboxProfile: vi.fn(),
  deleteToolboxProfile: vi.fn(),
  setActiveToolboxProfile: vi.fn(),
  getActiveToolboxProfile: vi.fn(),
}

vi.mock('../../hooks/useAmpService', () => ({
  useAmpService: () => mockUseAmpService
}))

// Mock Tauri dialog
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn()
}))

describe('ToolboxProfileSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAmpService.listToolboxProfiles.mockResolvedValue([])
    mockUseAmpService.getActiveToolboxProfile.mockResolvedValue(null)
  })

  it('renders with no toolbox when no profiles exist', async () => {
    render(<ToolboxProfileSelect />)
    
    await waitFor(() => {
      expect(screen.getByText('No toolbox')).toBeInTheDocument()
    })
  })

  it('renders active profile name when profile is selected', async () => {
    const mockProfile = {
      id: 1,
      name: 'Test Profile',
      paths: ['/path/to/tools'],
      created_at: '2025-01-01T00:00:00Z'
    }
    
    mockUseAmpService.getActiveToolboxProfile.mockResolvedValue(mockProfile)
    mockUseAmpService.listToolboxProfiles.mockResolvedValue([mockProfile])
    
    render(<ToolboxProfileSelect />)
    
    await waitFor(() => {
      expect(screen.getByText('Test Profile')).toBeInTheDocument()
    })
  })

  it('shows dropdown with Add Toolbox option when clicked', async () => {
    render(<ToolboxProfileSelect />)
    
    const button = screen.getByText('No toolbox')
    fireEvent.click(button)
    
    await waitFor(() => {
      expect(screen.getByText('Add Toolbox')).toBeInTheDocument()
    })
  })

  it('shows existing profiles in dropdown', async () => {
    const mockProfiles = [
      { id: 1, name: 'Profile 1', paths: ['/path1'], created_at: '2025-01-01T00:00:00Z' },
      { id: 2, name: 'Profile 2', paths: ['/path2'], created_at: '2025-01-01T00:00:00Z' }
    ]
    
    mockUseAmpService.listToolboxProfiles.mockResolvedValue(mockProfiles)
    
    render(<ToolboxProfileSelect />)
    
    const button = screen.getByText('No toolbox')
    fireEvent.click(button)
    
    await waitFor(() => {
      expect(screen.getByText('Profile 1')).toBeInTheDocument()
      expect(screen.getByText('Profile 2')).toBeInTheDocument()
      expect(screen.getByText('No toolbox')).toBeInTheDocument()
    })
  })

  it('calls setActiveToolboxProfile when profile is selected', async () => {
    const mockProfile = {
      id: 1,
      name: 'Test Profile',
      paths: ['/path/to/tools'],
      created_at: '2025-01-01T00:00:00Z'
    }
    
    mockUseAmpService.listToolboxProfiles.mockResolvedValue([mockProfile])
    
    render(<ToolboxProfileSelect />)
    
    const button = screen.getByText('No toolbox')
    fireEvent.click(button)
    
    await waitFor(() => {
      expect(screen.getByText('Test Profile')).toBeInTheDocument()
    })
    
    fireEvent.click(screen.getByText('Test Profile'))
    
    await waitFor(() => {
      expect(mockUseAmpService.setActiveToolboxProfile).toHaveBeenCalledWith(1)
    })
  })

  it('clears selection when No toolbox is clicked', async () => {
    const mockProfile = {
      id: 1,
      name: 'Test Profile', 
      paths: ['/path/to/tools'],
      created_at: '2025-01-01T00:00:00Z'
    }
    
    mockUseAmpService.listToolboxProfiles.mockResolvedValue([mockProfile])
    mockUseAmpService.getActiveToolboxProfile.mockResolvedValue(mockProfile)
    
    render(<ToolboxProfileSelect />)
    
    await waitFor(() => {
      const button = screen.getByText('Test Profile')
      fireEvent.click(button)
    })
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('No toolbox'))
    })
    
    await waitFor(() => {
      expect(mockUseAmpService.setActiveToolboxProfile).toHaveBeenCalledWith(null)
    })
  })

  it('opens profile manager when Add Toolbox is clicked', async () => {
    render(<ToolboxProfileSelect />)
    
    const button = screen.getByText('No toolbox')
    fireEvent.click(button)
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('Add Toolbox'))
    })
    
    await waitFor(() => {
      expect(screen.getByText('Manage Toolbox Profiles')).toBeInTheDocument()
    })
  })

  it('shows edit option for active profile', async () => {
    const mockProfile = {
      id: 1,
      name: 'Test Profile',
      paths: ['/path/to/tools'],
      created_at: '2025-01-01T00:00:00Z'
    }
    
    mockUseAmpService.listToolboxProfiles.mockResolvedValue([mockProfile])
    mockUseAmpService.getActiveToolboxProfile.mockResolvedValue(mockProfile)
    
    render(<ToolboxProfileSelect />)
    
    await waitFor(() => {
      const button = screen.getByText('Test Profile')
      fireEvent.click(button)
    })
    
    await waitFor(() => {
      expect(screen.getByText('Edit Current Profile')).toBeInTheDocument()
    })
  })

  it('shows tooltips with paths', async () => {
    const mockProfile = {
      id: 1,
      name: 'Test Profile',
      paths: ['/path1', '/path2'],
      created_at: '2025-01-01T00:00:00Z'
    }
    
    mockUseAmpService.getActiveToolboxProfile.mockResolvedValue(mockProfile)
    mockUseAmpService.listToolboxProfiles.mockResolvedValue([mockProfile])
    
    render(<ToolboxProfileSelect />)
    
    await waitFor(() => {
      const button = screen.getByText('Test Profile')
      expect(button.closest('button')).toHaveAttribute('title', 'Paths:\n/path1\n/path2')
    })
  })
})

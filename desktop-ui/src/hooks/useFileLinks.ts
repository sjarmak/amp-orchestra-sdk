/**
 * Hook for handling file:// links and opening files in VSCode
 */

import { invoke } from '@tauri-apps/api/core'

interface ParsedFileUrl {
  file_path: string
  line_number?: number
}

export function useFileLinks() {
  const handleFileLink = async (url: string): Promise<boolean> => {
    try {
      // Check if it's a file:// URL
      if (!url.startsWith('file://')) {
        return false
      }

      console.log('[FILE_LINKS] Handling file URL:', url)

      // Parse the URL to extract file path and line number
      const parsed = await invoke<ParsedFileUrl>('parse_file_url', { url })
      console.log('[FILE_LINKS] Parsed URL:', parsed)

      // Open in VSCode
      await invoke('open_file_in_vscode', {
        filePath: parsed.file_path,
        lineNumber: parsed.line_number
      })

      console.log('[FILE_LINKS] Successfully opened file in VSCode')
      return true
    } catch (error) {
      console.error('[FILE_LINKS] Failed to handle file link:', error)
      // Fall back to opening in system default app
      try {
        const { openPath } = await import('@tauri-apps/plugin-opener')
        await openPath(url)
        return true
      } catch (fallbackError) {
        console.error('[FILE_LINKS] Fallback also failed:', fallbackError)
        return false
      }
    }
  }

  // Function to setup click handlers for file links
  const setupFileLinkHandlers = (container: HTMLElement) => {
    const handleClick = async (event: MouseEvent) => {
      const target = event.target as HTMLElement
      
      // Check if clicked element is a link
      if (target.tagName === 'A' || target.closest('a')) {
        const link = (target.tagName === 'A' ? target : target.closest('a')) as HTMLAnchorElement
        const href = link.href
        
        if (href && href.startsWith('file://')) {
          console.log('[FILE_LINKS] Intercepting file link click:', href)
          event.preventDefault()
          event.stopPropagation()
          
          try {
            const success = await handleFileLink(href)
            if (!success) {
              console.warn('[FILE_LINKS] Could not handle file link')
            }
          } catch (error) {
            console.error('[FILE_LINKS] Error in click handler:', error)
          }
          return false // Ensure we don't navigate
        }
      }
    }
    
    container.addEventListener('click', handleClick, true) // Use capture phase
    
    // Return cleanup function
    return () => {
      container.removeEventListener('click', handleClick, true)
    }
  }

  return {
    handleFileLink,
    setupFileLinkHandlers
  }
}

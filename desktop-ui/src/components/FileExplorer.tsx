import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { 
  FileText, 
  FileIcon, 
  FileJson, 
  Settings, 
  BookOpen,
  FolderClosed,
  PanelLeftClose
} from 'lucide-react'
import { useFileLinks } from '../hooks/useFileLinks'

interface FileExplorerProps {
  currentPath: string
  onFileSelect: (path: string, content: string) => void
  onToggleSidebar?: () => void
}

export const FileExplorer = ({ currentPath, onFileSelect, onToggleSidebar }: FileExplorerProps) => {
  const [files, setFiles] = useState<string[]>([])
  const { handleFileLink } = useFileLinks()

  useEffect(() => {
    loadDirectory(currentPath)
  }, [currentPath])

  const loadDirectory = async (path: string) => {
    try {
      const fileList = await invoke<string[]>('list_directory', { path })
      setFiles(fileList.sort())
    } catch (error) {
      console.error('Failed to load directory:', error)
    }
  }

  const handleFileClick = async (fileName: string) => {
    const filePath = `${currentPath}/${fileName}`
    
    // Check if it's a directory first
    if (!fileName.includes('.')) {
      // It's likely a directory, don't try to open it
      console.log('Clicked on directory:', fileName)
      return
    }
    
    try {
      // Try to open in VSCode first
      const fileUrl = `file://${filePath}`
      const success = await handleFileLink(fileUrl)
      
      if (!success) {
        // Fallback: load into internal editor
        const content = await invoke<string>('read_file', { path: filePath })
        onFileSelect(filePath, content)
      }
    } catch (error) {
      console.error('Failed to handle file click:', error)
      // Fallback: try to load into internal editor
      try {
        const content = await invoke<string>('read_file', { path: filePath })
        onFileSelect(filePath, content)
      } catch (readError) {
        console.error('Failed to read file:', readError)
      }
    }
  }

  return (
    <div className="h-full bg-background p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-muted-foreground">Explorer</h3>
        {onToggleSidebar && (
          <button 
            onClick={onToggleSidebar} 
            className="p-1 hover:bg-accent rounded-md transition-colors" 
            aria-label="Hide explorer"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="space-y-1">
        {files.map((file) => (
          <div
            key={file}
            onClick={() => handleFileClick(file)}
            className="flex items-center px-2 py-1 text-sm hover:bg-accent cursor-pointer rounded transition-colors"
          >
            <div className="mr-2 w-4 h-4 text-muted-foreground">
              {getFileIcon(file)}
            </div>
            <span className="truncate overflow-hidden whitespace-nowrap" title={file}>{file}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const getFileIcon = (filename: string) => {
  if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return <FileText className="w-4 h-4" />
  if (filename.endsWith('.js') || filename.endsWith('.jsx')) return <FileText className="w-4 h-4" />
  if (filename.endsWith('.rs')) return <Settings className="w-4 h-4" />
  if (filename.endsWith('.py')) return <FileIcon className="w-4 h-4" />
  if (filename.endsWith('.json')) return <FileJson className="w-4 h-4" />
  if (filename.endsWith('.md')) return <BookOpen className="w-4 h-4" />
  if (filename.includes('.')) return <FileIcon className="w-4 h-4" />
  return <FolderClosed className="w-4 h-4" />
}

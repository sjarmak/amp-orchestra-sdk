import Editor, { OnMount } from '@monaco-editor/react'
import { useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTheme } from '../contexts/ThemeContext'

export const CodeEditor = ({
  path,
  initialCode,
}: { path: string; initialCode: string }) => {
  const { theme } = useTheme()

  /*   ① sync file->editor on mount   */
  const onMount: OnMount = useCallback((editor, monaco) => {
    editor.getModel()?.updateOptions({ tabSize: 2 })
    
    // Define custom themes
    monaco.editor.defineTheme('amp-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: { 
        'editor.background': 'hsl(25 6% 14%)',
        'editor.foreground': 'hsl(43 14% 88%)'
      }
    })
    
    monaco.editor.defineTheme('amp-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: { 
        'editor.background': 'hsl(0 0% 100%)',
        'editor.foreground': 'hsl(240 10% 3.9%)'
      }
    })
    
    monaco.editor.setTheme(theme === 'dark' ? 'amp-dark' : 'amp-light')
  }, [theme])

  /*   ② persist edits via Tauri   */
  const handleChange = useCallback((code?: string) => {
    invoke('save_file', { path, contents: code ?? '' })
  }, [path])

  return (
    <Editor
      height="100%"
      defaultLanguage={getLanguage(path)}
      defaultValue={initialCode}
      onChange={handleChange}
      onMount={onMount}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: 'JetBrains Mono, monospace',
        automaticLayout: true,
      }}
    />
  )
}

/* helper */
const getLanguage = (p: string) =>
  p.endsWith('.ts') || p.endsWith('.tsx') ? 'typescript' :
  p.endsWith('.js') || p.endsWith('.jsx') ? 'javascript' :
  p.endsWith('.rs') ? 'rust' :
  p.endsWith('.py') ? 'python' :
  p.endsWith('.json') ? 'json' :
  p.endsWith('.md') ? 'markdown' :
  'plaintext'

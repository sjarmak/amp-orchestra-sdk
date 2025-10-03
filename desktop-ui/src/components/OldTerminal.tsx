import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useTheme } from '../contexts/ThemeContext'

export const TerminalPane = ({ cwd = '.' }: { cwd?: string }) => {
  const ref = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const { theme } = useTheme()

  useEffect(() => {
    const term = new Terminal({
      theme: {
        background: theme === 'dark' ? 'hsl(25 6% 14%)' : 'hsl(0 0% 100%)',
        foreground: theme === 'dark' ? 'hsl(43 14% 88%)' : 'hsl(240 10% 3.9%)',
      },
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 12,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(ref.current!)
    fit.fit()
    termRef.current = term

    invoke<string>('spawn_terminal', { cmd: 'bash', cwd })
      .then((pid) => {
        listen<[string, string]>('term:data', (e) => {
          const [streamPid, data] = e.payload
          if (streamPid === pid) term.write(data)
        })
      })
      .catch(console.error)

    return () => {
      term.dispose()
    }
  }, [cwd, theme])

  return <div ref={ref} className="w-full h-full" />
}

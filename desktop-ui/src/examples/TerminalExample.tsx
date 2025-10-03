/**
 * Example: How to use TuiTerminal in your app
 * 
 * This example demonstrates how to integrate the TuiTerminal component
 * with Amp mode switching and full TUI functionality.
 */

import React from 'react'
import { TuiTerminal } from '../components/terminal'
import { AmpModeProvider, AmpModeSwitcher, useAmpMode } from '../components/app/AmpModeProvider'

/**
 * Example terminal page component
 */
const TerminalPage: React.FC = () => {
  const { mode } = useAmpMode()

  return (
    <div className="h-screen flex flex-col bg-black">
      {/* Header with mode switcher */}
      <header className="flex items-center justify-between p-4 bg-gray-900 text-white border-b border-gray-700">
        <h1 className="text-xl font-semibold">Amp Terminal</h1>
        <AmpModeSwitcher />
      </header>

      {/* Terminal area */}
      <main className="flex-1 relative">
        <TuiTerminal 
          key={mode} // Force remount when mode changes to prevent duplicates
          className="w-full h-full"
          mode={mode}
          onReady={() => {
            console.log('Amp TUI is ready!')
          }}
          onExit={() => {
            console.log('Amp TUI exited')
          }}
        />
      </main>
    </div>
  )
}

/**
 * Full app example with provider
 */
export const TerminalAppExample: React.FC = () => {
  return (
    <AmpModeProvider defaultMode="production">
      <TerminalPage />
    </AmpModeProvider>
  )
}

/**
 * Minimal terminal component example
 */
export const MinimalTerminalExample: React.FC = () => {
  return (
    <div className="w-full h-96 border border-gray-300">
      <TuiTerminal 
        key="production" // Unique key for this instance
        mode="production"
        onReady={() => console.log('Terminal ready')}
      />
    </div>
  )
}

export default TerminalAppExample

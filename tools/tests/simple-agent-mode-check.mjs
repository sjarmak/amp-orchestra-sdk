#!/usr/bin/env node

// Simple test to check agent mode chip without complex WebView evaluation

import { spawnSync } from 'node:child_process'
import orchestraUI from '../amp_toolbox/orchestra-ui-helpers.mjs'

function describeStep(name) { process.stdout.write(`\n=== ${name} ===\n`) }

async function main() {
  describeStep('Simple Agent Mode Check')
  
  try {
    // Try to get the environment badge first (simpler)
    const badge = orchestraUI.getEnvironmentBadgeText()
    console.log(`Environment badge: "${badge}"`)
    
    // Try to get the agent mode chip
    const chip = orchestraUI.evalJS(`
      const chip = document.querySelector('[data-test-id="agent-mode-chip"]');
      return chip ? chip.textContent.trim() : 'CHIP_NOT_FOUND';
    `)
    console.log(`Agent mode chip: "${chip}"`)
    
    // Check if we're in development mode
    const isDev = orchestraUI.evalJS(`
      const devTab = document.querySelector('button[value="development"]');
      return devTab ? devTab.classList.contains('active') || devTab.getAttribute('aria-selected') === 'true' : false;
    `)
    console.log(`Development mode active: ${isDev}`)
    
    // Check connection mode from top bar
    const connectionMode = orchestraUI.evalJS(`
      const badge = document.querySelector('[data-test-id="env-badge"]');
      return badge ? badge.textContent.trim() : 'BADGE_NOT_FOUND';
    `)
    console.log(`Connection mode badge: "${connectionMode}"`)
    
  } catch (error) {
    console.error(`Error: ${error.message}`)
    
    // Try basic app focus/interaction
    try {
      orchestraUI.focus()
      console.log('App focused successfully')
      
      // Try simple keystroke
      orchestraUI.keystroke('k', ['command'])
      console.log('Command+K sent successfully')
      orchestraUI.keystroke('Escape')
      
    } catch (focusError) {
      console.error(`Focus error: ${focusError.message}`)
    }
  }
}

main().catch(err => {
  console.error('Test failed:', err.message)
  process.exit(1)
})

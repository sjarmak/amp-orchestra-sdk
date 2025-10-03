#!/usr/bin/env node

// Test script for webviewEval functionality

import orchestraUI from './amp_toolbox/orchestra-ui-helpers.mjs'

async function testWebviewEval() {
  try {
    console.log('🧪 Testing webviewEval functionality...\n')

    // Test basic JavaScript evaluation
    console.log('📋 Testing basic JS evaluation...')
    const result = orchestraUI.evalJS('document.title')
    console.log('Document title:', result)

    // Test E2E bridge availability
    console.log('\n🔌 Testing E2E bridge availability...')
    const bridgeExists = orchestraUI.evalJS('typeof window.__AMP_E2E_BRIDGE__')
    console.log('Bridge type:', bridgeExists)

    if (bridgeExists === 'object') {
      console.log('\n🎯 Testing E2E bridge methods...')
      
      // Test environment badge
      const envBadge = orchestraUI.getEnvironmentBadgeText()
      console.log('Environment badge:', envBadge)
      
      // Test chat input
      const chatInput = orchestraUI.getChatInputValue()
      console.log('Chat input value:', chatInput)
      
      // Test environment switcher status
      const switcherOpen = orchestraUI.isEnvironmentSwitcherOpen()
      console.log('Environment switcher open:', switcherOpen)
      
      // Test getting all messages
      const allMessages = orchestraUI.getAllMessages()
      console.log('All messages count:', Array.isArray(allMessages) ? allMessages.length : 'Not array')
    }

    console.log('\n✅ WebviewEval test completed successfully!')

  } catch (error) {
    console.error('❌ Test failed:', error.message)
    process.exit(1)
  }
}

// Run the test if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testWebviewEval()
}

export { testWebviewEval }

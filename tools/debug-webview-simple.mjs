#!/usr/bin/env node

// Simple test to get the webview working properly first

import orchestraUI from './amp_toolbox/orchestra-ui-helpers.mjs'

async function testSimpleWebView() {
  try {
    console.log('🚀 Testing simple WebView operations...')
    
    // Launch app
    console.log('📱 Launching app...')
    await orchestraUI.launch()
    await orchestraUI.sleep(2000)
    
    // Test basic evaluation
    console.log('🧪 Testing document.title...')
    const title = await orchestraUI.evalJS('document.title')
    console.log(`Title: "${title}"`)
    
    // Test DOM query
    console.log('🔍 Testing simple DOM query...')
    const bodyText = await orchestraUI.evalJS('document.body ? "body exists" : "no body"')
    console.log(`Body check: ${bodyText}`)
    
    // Test getting all text content to see what's there
    console.log('📄 Getting page content overview...')
    const overview = await orchestraUI.evalJS(`
      Array.from(document.querySelectorAll('*')).slice(0, 20).map(el => ({
        tag: el.tagName,
        id: el.id,
        className: el.className,
        text: el.textContent ? el.textContent.trim().substring(0, 50) : ''
      })).filter(item => item.text.length > 0)
    `)
    console.log('Page elements:', JSON.stringify(overview, null, 2))
    
    console.log('✅ Simple WebView test completed')
    
  } catch (error) {
    console.log(`❌ Test failed: ${error.message}`)
    console.log(`Stack: ${error.stack}`)
  }
}

testSimpleWebView()

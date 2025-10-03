# WebView Evaluation for Orchestra UI

This document describes the new `webviewEval` command added to the `orchestra-ui` tool, which allows executing JavaScript in the Tauri app's WebView and returning results.

## Features

### Core Command

The `orchestra-ui` tool now supports a `webviewEval` command:

```bash
echo '{"cmd": "webviewEval", "expr": "document.title"}' | TOOLBOX_ACTION=execute node orchestra-ui
```

### Helper Library

The `orchestra-ui-helpers.mjs` file provides convenient JavaScript functions:

```javascript
import orchestraUI from './orchestra-ui-helpers.mjs'

// Basic JavaScript evaluation
const title = orchestraUI.evalJS('document.title')
console.log('Page title:', title)

// E2E Bridge functions
const envBadge = orchestraUI.getEnvironmentBadgeText()
const chatInput = orchestraUI.getChatInputValue()
const allMessages = orchestraUI.getAllMessages()
```

## API Reference

### Core Command

**Command**: `webviewEval`

**Parameters**:
- `expr` (string, required): JavaScript expression to evaluate
- `bundleId` (string, optional): App bundle ID (defaults to `com.sjarmak.amp-orchestra`)

**Returns**: JSON-serialized result of the JavaScript expression

### Helper Functions

#### E2E Bridge Functions

```javascript
// Get the current environment badge text (e.g., "Production", "Local")
getEnvironmentBadgeText(bundleId?)

// Get the last assistant message from chat
getLastAssistantMessage(bundleId?)

// Get the current value in the chat input field
getChatInputValue(bundleId?)

// Get all messages in the chat
getAllMessages(bundleId?)

// Check if the environment switcher dialog is open
isEnvironmentSwitcherOpen(bundleId?)
```

#### General Functions

```javascript
// Execute arbitrary JavaScript in the WebView
evalJS(expr, bundleId?)

// UI automation functions
launch(bundleId?)
focus(bundleId?)
keystroke(text, modifiers?, bundleId?)
typeText(text, bundleId?)
paste(text, bundleId?)
clickMenu(menuPath, bundleId?)
quit(bundleId?)
sleep(delayMs)
```

## Implementation Details

### Platform Support

Currently implemented for **macOS** using AppleScript's `do JavaScript` command:

```applescript
tell application id "com.sjarmak.amp-orchestra"
  set jsResult to do JavaScript "document.title" in (get front document)
  return jsResult
end tell
```

### Error Handling

- If the primary AppleScript approach fails, a fallback approach is attempted
- Results are automatically JSON-parsed when possible
- Errors are properly propagated with meaningful messages

### Future Platform Support

The architecture is designed to support Windows and Linux:

- **Windows**: Could use Windows automation APIs or browser automation protocols
- **Linux**: Could use X11 automation or browser debugging protocols

## Usage Examples

### Basic Testing

```javascript
// Test if app is responsive
const title = orchestraUI.evalJS('document.title')
console.log('App loaded:', title !== 'undefined')

// Check if E2E bridge is available
const bridgeType = orchestraUI.evalJS('typeof window.__AMP_E2E_BRIDGE__')
console.log('Bridge available:', bridgeType === 'object')
```

### Environment Testing

```javascript
// Check current environment
const env = orchestraUI.getEnvironmentBadgeText()
console.log('Current environment:', env)

// Wait for environment to change
async function waitForEnvironment(expectedEnv, timeoutMs = 5000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (orchestraUI.getEnvironmentBadgeText() === expectedEnv) {
      return true
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  return false
}
```

### Chat Testing

```javascript
// Send a message and wait for response
orchestraUI.keystroke('k', ['command'])
orchestraUI.typeText('Hello')
orchestraUI.keystroke('\r')

// Wait for assistant response
setTimeout(() => {
  const response = orchestraUI.getLastAssistantMessage()
  console.log('Assistant responded:', response)
}, 2000)
```

## Files

- `orchestra-ui` - Core executable with webviewEval command
- `orchestra-ui-helpers.mjs` - Convenient wrapper functions
- `test-webview-eval.mjs` - Basic test script
- `../tests/env-switch-runner-enhanced.mjs` - Enhanced integration test

## Security Considerations

- JavaScript expressions are executed in the app's WebView context
- Expressions should be sanitized if accepting user input
- The E2E bridge provides controlled access to UI state without exposing sensitive data

## Debugging

Set debug logging to see what's happening:

```javascript
// Enable debug output in AppleScript
orchestraUI.evalJS('console.log("Debug: WebView eval working")')

// Check if elements exist before interacting
const exists = orchestraUI.evalJS('!!document.querySelector("[data-test-id=\\"env-badge\\"]")')
console.log('Environment badge element exists:', exists)
```

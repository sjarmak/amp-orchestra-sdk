# TUI Terminal Implementation Postmortem

**Date**: December 2024  
**Issue**: Critical memory overflow and terminal rendering failures  
**Status**: RESOLVED  

## Executive Summary

The TUI terminal integration experienced critical memory overflow issues and complete rendering failures due to infinite re-mounting loops and unbounded buffer growth. The terminal tab was also unresponsive to user interactions. All issues have been resolved with defensive programming patterns and explicit event handling.

## Critical Issues Identified

### 1. Memory Overflow (OOM) - CRITICAL ⚠️

**Root Cause**: Infinite re-mounting loop in `AmpPtyTerminal.tsx`

**Technical Details**:
- The `mountWhenReady()` function was being called recursively without proper guards
- Each failed mount attempt would schedule multiple `requestAnimationFrame` calls and `setTimeout` callbacks
- No protection against repeated `term.open()` calls on the same xterm instance
- Write buffer (`writeBufRef.current`) was growing unbounded without memory caps
- Event listeners were being subscribed multiple times without cleanup

**Symptoms**:
- Rapid memory consumption leading to browser crashes
- Hundreds of pending RAF/timeout callbacks
- Multiple xterm instances being created simultaneously
- Terminal rendering completely failing

**Impact**: Complete application failure, browser crashes, unusable terminal functionality

### 2. Terminal Tab Unclickable - HIGH

**Root Cause**: Missing explicit pointer event handling and potential CSS overlay issues

**Technical Details**:
- Terminal tab button in `MainViewToggle.tsx` was not receiving click events
- No explicit `pointer-events` CSS property set
- Possible z-index conflicts with other UI elements
- Missing debug logging to track click event flow

**Symptoms**:
- Users could not switch to Terminal tab
- No visual feedback on tab hover/click
- Tab appeared visually normal but was non-interactive

**Impact**: Terminal completely inaccessible to users

### 3. Terminal Rendering Failures - MEDIUM

**Root Cause**: Race conditions in xterm initialization and DOM mounting

**Technical Details**:
- Terminal DOM element dimensions were zero during mounting attempts
- xterm renderer addons were loading before terminal was properly opened
- Multiple mount attempts without cleanup of previous attempts
- Missing checks for element readiness before terminal operations

**Symptoms**:
- Blank terminal areas
- Terminal appearing but not responding to input
- Inconsistent rendering across sessions
- Debug text not appearing in terminal

## Solution Implementation

### 1. Memory Overflow Fix

**File**: `desktop-ui/src/components/terminal/AmpPtyTerminal.tsx`

**Key Changes**:

```typescript
// Added mount state guards
const xtermOpenedRef = useRef<boolean>(false)
const subscribedRef = useRef<boolean>(false)

// Reset flags on mount
useLayoutEffect(() => {
  isCleanedUpRef.current = false
  xtermOpenedRef.current = false
  subscribedRef.current = false
  // ...
})

// Prevent repeated mounting
const mountWhenReady = () => {
  if (isCleanedUpRef.current) return
  if (xtermOpenedRef.current) return  // ⭐ CRITICAL: Prevent re-mount
  // ...
  term.open(el)
  xtermOpenedRef.current = true  // ⭐ Mark as opened
  // ...
}

// Prevent repeated event subscriptions
if (!subscribedRef.current) {
  subscribedRef.current = true
  unlistenPromise = listen('terminal://data', (e: any) => {
    // ... event handling
  })
}

// Cap buffer growth
writeBufRef.current += chunk
if (writeBufRef.current.length > 1_000_000) {
  writeBufRef.current = writeBufRef.current.slice(-500_000)  // ⭐ Prevent runaway growth
}
```

**Result**: Memory usage stabilized, no more infinite loops, proper cleanup

### 2. Terminal Tab Clickability Fix

**File**: `desktop-ui/src/components/app/MainViewToggle.tsx`

**Key Changes**:

```typescript
// Added explicit click handling and debugging
<button
  onClick={() => {
    console.log('Terminal button clicked')  // ⭐ Debug logging
    handleModeChange('terminal')
  }}
  className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${
    currentMode === 'terminal'
      ? 'bg-background text-foreground shadow-sm'
      : 'text-muted-foreground hover:text-foreground'
  }`}
  style={{ pointerEvents: 'auto', zIndex: 10 }}  // ⭐ Explicit interaction control
>
  <Terminal className="w-4 h-4" />
  Terminal
</button>

// Added mode change debugging
const handleModeChange = (mode: string) => {
  console.log('MainViewToggle: handleModeChange called with:', mode)  // ⭐ Debug logging
  const newMode = mode as MainViewMode
  setCurrentMode(newMode)
  onModeChange?.(newMode)
}
```

**Result**: Terminal tab is now fully interactive with debug visibility

### 3. Terminal Rendering Stabilization

**Defensive Programming Patterns Implemented**:

```typescript
// Element readiness checks
const rect = el.getBoundingClientRect()
if (rect.width === 0 || rect.height === 0) {
  // Retry mounting when element has proper dimensions
  rafIdRef.current = requestAnimationFrame(mountWhenReady)
  return
}

// Conditional retry logic
if (!xtermOpenedRef.current) {
  rafIdRef.current = requestAnimationFrame(mountWhenReady)  // Only retry if not opened
}

// Proper cleanup sequencing
return () => {
  isCleanedUpRef.current = true  // Prevent further operations
  if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current)
  timeoutsRef.current.forEach(id => clearTimeout(id))
  // ... comprehensive cleanup
}
```

## Current Architecture Overview

### Component Hierarchy
```
App.tsx
└── MainViewToggle.tsx (Chat ↔ Terminal switching)
    └── AmpTuiView.tsx (Production ↔ Development switching)
        └── AmpPtyTerminal.tsx (Individual terminal sessions)
```

### State Management
- **MainViewToggle**: Controls Chat vs Terminal view (`useState<MainViewMode>`)
- **AmpTuiView**: Controls Production vs Development terminal profiles
- **AmpPtyTerminal**: Manages individual xterm instances and PTY connections

### Key Refs and Their Purposes
- `xtermOpenedRef`: Prevents repeated xterm.open() calls
- `subscribedRef`: Prevents multiple event listener subscriptions  
- `isCleanedUpRef`: Global cleanup flag to prevent operations after unmount
- `writeBufRef`: Buffered terminal output with memory caps (1MB limit, truncates to 500KB)
- `sessionIdRef`: Stable session identifier for PTY matching
- `rendererReadyRef`: Tracks when xterm renderer is fully initialized

### Persistent Dual Session Implementation

**Key Design Principle**: Keep both terminal instances alive and toggle visibility instead of mounting/unmounting.

**File**: `AmpTuiView.tsx`
```typescript
// Render both terminals once and keep them mounted
{(['prod','dev'] as TuiProfile[]).map((p) => {
  const isActive = activeProfile === p
  const className = `absolute inset-0 ${isActive ? '' : 'amp-tui-hidden'}`
  return (
    <div key={p} className={className}>
      <AmpPtyTerminal profile={p} cwd="/Users/sjarmak/amp-orchestra" className="h-full" />
    </div>
  )
})}
```

**CSS**: `globals.css`
```css
.amp-tui-hidden {
  position: absolute !important;
  inset: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
  opacity: 0 !important;
  z-index: -1 !important;
}
```

**Benefits**:
- No remounting = instant tab switching
- Preserved scroll history and terminal state
- Separate PTY processes for prod (`amp`) vs dev (`~/amp/cli/dist/main.js`)
- Maintains valid DOM dimensions for FitAddon when hidden

### Critical Success Patterns

1. **Guard All State-Changing Operations**:
   ```typescript
   if (isCleanedUpRef.current) return
   if (xtermOpenedRef.current) return
   ```

2. **Cap All Unbounded Growth**:
   ```typescript
   if (writeBufRef.current.length > 1_000_000) {
     writeBufRef.current = writeBufRef.current.slice(-500_000)
   }
   ```

3. **Use Stable References**:
   ```typescript
   const mySessionId = sessionIdRef.current  // Capture at start of effect
   ```

4. **Explicit Cleanup Ordering**:
   ```typescript
   // 1. Set cleanup flag
   isCleanedUpRef.current = true
   // 2. Cancel scheduled operations
   if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current)
   // 3. Cleanup resources
   // 4. Dispose objects
   ```

## Regression Prevention

### Code Review Checklist
- [ ] All `useRef` state flags are reset on mount
- [ ] All recursive/retry functions have guard conditions
- [ ] All buffers have maximum size limits
- [ ] All event listeners check cleanup state before operating
- [ ] All async operations validate component is still mounted
- [ ] All RAF/timeout operations are cancelled in cleanup
- [ ] Hidden terminal visibility uses `.amp-tui-hidden` (not `display:none`)
- [ ] `AmpPtyTerminal` effect has empty dependency array (single-mount)

### Monitoring Points
- Browser memory usage during terminal operations
- Number of active xterm instances (should be ≤ 2)
- Event listener subscription count
- Terminal output buffer sizes
- Click event responsiveness
- Renderer readiness logs and absence of `_renderer.value.dimensions` errors

### Known Working State (Checkpoint)
- **Commit**: a919ff0 (fix: resolve terminal OOM and implement persistent dual sessions)
- **Memory Usage**: Stable, no runaway growth
- **Terminal Functionality**: Both Production and Development terminals working; instant switching without remount
- **User Interaction**: Terminal tab fully clickable and responsive
- **Performance**: No infinite loops, proper cleanup, responsive UI; production visual glitches resolved with `term.refresh()` post-renderer-ready

## Future Considerations

### Potential Improvements
1. **Error Boundaries**: Wrap terminal components to prevent cascading failures
2. **Memory Monitoring**: Add runtime memory usage tracking
3. **Terminal Pooling**: Reuse xterm instances instead of creating new ones
4. **Progressive Loading**: Lazy load terminal components when needed
5. **State Persistence**: Save/restore terminal sessions across app restarts

### Architecture Evolution
- Consider extracting terminal management to a dedicated service
- Implement proper terminal session lifecycle management
- Add comprehensive error recovery mechanisms
- Create automated regression tests for memory usage patterns

## Lessons Learned

1. **Always Guard Recursive Operations**: Any function that can call itself must have multiple exit conditions
2. **Refs Are Not Automatically Reset**: Manual ref state management is critical in React
3. **Browser Memory is Finite**: All buffers and collections must have bounds
4. **Click Events Can Be Blocked**: Always test and debug user interactions explicitly
5. **Terminal Libraries are Complex**: xterm.js requires careful lifecycle management

This postmortem serves as both documentation and a recovery guide for future terminal-related issues in the Amp Orchestra application.

# TUI Terminal Integration Postmortem - September 2025

## Status: TERMINAL INTEGRATION RESOLVED ✅

After extensive debugging and refactoring, the terminal integration issues have been **successfully resolved**. This documents the critical fixes that made Amp TUI work beautifully.

## Root Cause Analysis - Final Resolution

The terminal integration failures were caused by **five critical issues** working in combination:

### 1. **Infinite Mounting Cycles** ❌ → ✅ FIXED
**Problem**: TerminalProvider was being remounted repeatedly due to:
- Provider placed too deep in component tree (in MainPanel vs App level) 
- Parent component re-renders causing provider identity changes
- Cleanup effects running on every unmount triggering cascading re-mounts

**Solution**: 
- Moved TerminalProvider to App.tsx level for stable identity
- Replaced cleanup-on-unmount with beforeunload handler
- Fixed session ID consistency between frontend hooks and backend

### 2. **Missing Renderer Readiness Patterns** ❌ → ✅ FIXED
**Problem**: TerminalViewNew.tsx lacked critical `rendererReadyRef` patterns from the working AmpPtyTerminal.tsx:
- No dimension validation before accessing `this._renderer.value.dimensions`
- Missing element size checks before mounting
- No proper initialization sequence (open → addon → renderer ready → operations)

**Solution**: 
- **Switched from TerminalViewNew.tsx to AmpPtyTerminal.tsx** in TuiIntegration
- AmpPtyTerminal contains proven patterns:
  - `rendererReadyRef` checks before dimension access
  - Element dimension validation (`rect.width > 0 && rect.height > 0`)
  - Proper renderer initialization sequence
  - Memory management with buffer caps

### 3. **Frontend/Backend Command Mismatch** ❌ → ✅ FIXED
**Problem**: AmpPtyTerminal was calling non-existent Tauri commands:
- Frontend: `terminal_open` → Backend: `cmd_start_tui`
- Frontend: `terminal_write` → Backend: `cmd_write_stdin`
- Frontend: `terminal_resize` → Backend: `cmd_resize`

**Solution**: Updated all invoke calls to match actual backend commands with correct parameters

### 4. **Session ID Mismatch** ❌ → ✅ FIXED
**Problem**: Session ID format inconsistency prevented event reception:
- Frontend expected: `amp-prod-session` 
- Backend generated: `prod_default`
- Result: `listen('terminal://data')` events never matched

**Solution**: Changed frontend to use backend format: `${profile}_default`

### 5. **Missing xterm CSS** ❌ → ✅ FIXED
**Problem**: Terminal elements had no styling, collapsed to 0x0 pixels
**Solution**: Added `import 'xterm/css/xterm.css'` to TerminalViewNew.tsx

## Critical Success Patterns - PROVEN WORKING ✅

The **AmpPtyTerminal.tsx** component contains the essential patterns that **must be preserved**:

### Renderer Readiness Pattern (CRITICAL)
```typescript
const rendererReadyRef = useRef<boolean>(false)

// Validate renderer dimensions before any operations
const el2 = termRef.current
const rows = el2?.querySelector('.xterm-rows') as HTMLElement | null
const h = rows?.offsetHeight || 0
const w = rows?.offsetWidth || 0
rendererReadyRef.current = h > 0 && w > 0

// Guard all operations with renderer readiness
if (!rendererReadyRef.current) return
```

### Proper Initialization Sequence (CRITICAL)
```typescript
1. term.open(el)                    // First: Open terminal
2. term.loadAddon(fit)             // Then: Load addons  
3. Wait for renderer dimensions     // Critical: Validate renderer ready
4. Start PTY only after ready      // Finally: Begin data operations
```

### State Guards (CRITICAL) 
```typescript
const xtermOpenedRef = useRef<boolean>(false)
const isCleanedUpRef = useRef<boolean>(false)

// Prevent re-mounting
if (xtermOpenedRef.current) return
if (isCleanedUpRef.current) return
```

### Memory Management (IMPORTANT)
```typescript
// Cap buffer growth to prevent memory leaks
if (writeBufRef.current.length > 1_000_000) {
  writeBufRef.current = writeBufRef.current.slice(-500_000)
}
```

### Session ID Coordination (CRITICAL)
```typescript
// Frontend and backend must use matching format
const sessionId = `${profile}_default`  // NOT amp-${profile}-session
```

## Architecture That Works ✅

**Current Working Stack:**
- `App.tsx` → `TuiIntegration.tsx` → `AmpPtyTerminal.tsx`
- TerminalProvider at App level (stable)
- Session ID format: `${profile}_default`
- Backend commands: `cmd_start_tui`, `cmd_write_stdin`, `cmd_resize`
- Event listening: `terminal://data` with matching session IDs

## Key Learnings for Future Development

### DO ✅
- **Always use AmpPtyTerminal.tsx patterns** - they are battle-tested
- **Place providers at App level** for stable identity
- **Validate session ID formats** between frontend/backend
- **Check renderer readiness** before dimension access
- **Use beforeunload cleanup** instead of unmount cleanup for terminals
- **Import xterm CSS** - terminals will be invisible without it
- **Match command names exactly** between frontend invoke calls and backend tauri::command

### DON'T ❌  
- **Never access renderer dimensions** without `rendererReadyRef` validation
- **Don't place providers** in components that remount frequently
- **Don't assume session IDs match** - always verify formats
- **Don't skip xterm CSS imports** - terminals will be invisible
- **Don't ignore command parameter mismatches** - verify backend signatures
- **Don't use different session ID formats** in frontend vs backend

## Evidence of Success ✅

**Console Debug Output:**
```
[prod] Terminal active, writing data (1024 bytes, renderer ready: true)
[prod] Terminal active, writing data (967 bytes, renderer ready: true)
PTY session opened successfully, result: "prod_default"
```

**Visual Confirmation:**
- Amp TUI displays beautifully with full ASCII art
- Terminal shows "Welcome to Amp" with proper styling
- User can interact with terminal (input field responsive)
- No more infinite mounting logs
- No more renderer dimension errors

## Status: TERMINAL INTEGRATION WORKING ✅

## UPDATE: Dual-Session Terminal Implementation ✅

**Date**: September 2025
**Issue**: After restoring Chat/Terminal tabs, the dual-session pattern (Production/Development switching) had critical bugs:
- Development terminal missing textbox
- Both terminals sharing the same session ID
- System breakdown after multiple tab switches

### 6. **Session ID Collision in Dual-Session Mode** ❌ → ✅ FIXED

**Problem**: Both Production and Development terminals used identical session IDs:
```javascript
// Console logs showed both terminals sharing same ID:
[TerminalView] DUAL SESSION - sessionId: "xzh0enVmZGUNPBPIKl2fG" 
// Both prod and dev terminals used same sessionId, causing conflicts
```

**Root Cause**: TerminalView.tsx used same `currentSession?.id` for both terminal instances:
```typescript
const stableKey = `session-${profile}`; // Same for both prod/dev
```

**Solution**: Create unique, stable keys per terminal profile:
```typescript
const baseSessionId = currentSession?.id || 'fallback-session';
const stableKey = `${baseSessionId}-${profile}`;
// Results in: "xzh0enVmZGUNPBPIKl2fG-prod" and "xzh0enVmZGUNPBPIKl2fG-dev"
```

**Implementation**: Each terminal now gets:
- Unique React key preventing remounting conflicts  
- Separate PTY sessions via AmpPtyTerminal's internal `sessionIdRef`
- Independent state preservation when switching tabs
- `.amp-tui-hidden` CSS class for visibility toggling (not unmounting)

**Result**: 
- ✅ Production terminal state persists across switches
- ✅ Development terminal has working textbox  
- ✅ No breakdown after multiple switches
- ✅ True dual-session experience with instant tab switching

## Status: DUAL-SESSION TERMINALS WORKING ✅

**Remaining Enhancements (Non-blocking):**
1. UI sizing optimization (terminal should take full screen height)
2. Session management improvements (new/previous sessions)
3. Chat session management refinements

The dual-session terminal implementation is **STABLE** and **WORKING BEAUTIFULLY**. Both Production and Development terminals maintain independent state and switch instantly without losing context. The solution preserves all critical patterns while enabling true persistent dual-session experience.

---

## UPDATE: Session Management Architecture Integration ✅

**Date**: September 2025  
**Status**: FULLY INTEGRATED WITH SESSION MANAGEMENT

### Critical New Findings from Session Management Integration

After integrating the proven TUI patterns with the Phase A session management architecture, we discovered **additional critical fixes** required for full compatibility:

#### 7. **Dual-Layer Session ID Format Enforcement** ❌ → ✅ FIXED

**Problem**: Session ID format fixes were required in **multiple layers** of the architecture:
- AmpPtyTerminal.tsx: Had correct fallback format `${profile}_default`  
- TerminalView.tsx: Was still using legacy UUID format `${profile}_${baseSessionId}_persistent`
- Backend: Expected `${profile}_default` or `${profile}_{variant}` format

**Root Cause**: The session management integration introduced a new layer (TerminalView) that was overriding the correct session ID format from AmpPtyTerminal.

**Solution**: Enforced consistent session ID format across **all layers**:
```typescript
// TerminalView.tsx - Fixed to use backend-expected format
const sessionId = `${profile}_default`;

// AmpPtyTerminal.tsx - Maintained correct fallback  
const sessionIdRef = useRef(sessionId || `${profile}_default`)

// Backend - Already expected this format
let session_id = match variant_id {
    Some(variant) => format!("{}_{}", profile, variant),
    None => format!("{}_default", profile),
};
```

**Result**: Eliminated "File exists (os error 17)" errors and enabled proper PTY session creation.

#### 8. **Complete Terminal State Restoration on Tab Switching** ❌ → ✅ FIXED

**Problem**: After integrating with session management, terminal tab switching had **two separate issues**:
- Production terminal lost input box after switching back (focus issue)
- Development terminal had ASCII art bleeding into input area (sizing issue)

**Root Cause**: The session management integration required **more comprehensive state restoration** than the original dual-session implementation.

**Solution**: Enhanced the `useEffect([active, profile])` hook with complete restoration sequence:
```typescript
useEffect(() => {
  if (active && xtermRef.current && !isCleanedUpRef.current) {
    // 1. Flush buffered content (existing)
    if (writeBufRef.current) {
      const data = writeBufRef.current
      writeBufRef.current = ''
      try { xtermRef.current.write(data) } catch {}
    }
    
    // 2. Refresh display (existing)
    try { xtermRef.current.refresh(0, xtermRef.current.rows - 1) } catch {}
    
    // 3. Focus terminal (NEW - fixes input box loss)
    try { xtermRef.current.focus() } catch {}
    
    // 4. Fit to container (NEW - fixes ASCII bleed)
    if (fitRef.current) {
      try { (fitRef.current as any)?.fit?.() } catch {}
    }
  }
}, [active, profile])
```

**Result**: Perfect terminal switching with maintained input focus and clean layout.

#### 9. **Provider Hierarchy Compatibility** ❌ → ✅ FIXED

**Problem**: Phase A TerminalLifecycleManager integration initially caused provider remounting issues when placed incorrectly in the component tree.

**Root Cause**: The postmortem guidance required **TerminalProvider at App level for stable identity**, but the new TerminalLifecycleManager was nested incorrectly.

**Solution**: Corrected provider hierarchy following postmortem patterns:
```typescript
// App.tsx - Correct hierarchy
<ThemeProvider>
  <SessionManagerProvider>
    <AmpModeProvider defaultMode="production">
      <TerminalProvider>              // Stable App-level position
        <TerminalLifecycleManager>   // Phase A addition
          <TerminalManagerProvider> // Nested properly
```

**Result**: No provider remounting, stable terminal instances, preserved postmortem patterns.

### New Success Criteria - Session Management Compatible ✅

**Complete Integration Evidence:**
- ✅ Amp TUI displays beautifully with full ASCII art (preserved)
- ✅ Terminal shows "Welcome to Amp" with proper styling (preserved)  
- ✅ Production and Development terminals maintain separate states (preserved)
- ✅ **NEW**: Session ID format compatible with backend expectations
- ✅ **NEW**: Perfect tab switching with input focus restoration  
- ✅ **NEW**: Clean layout without ASCII bleed across all switches
- ✅ **NEW**: Compatible with Phase A session management architecture
- ✅ **NEW**: Provider hierarchy respects postmortem guidance

### Architecture Validation ✅

**Current Working Integration:**
```
SessionManagerProvider (Phase A)
└── TerminalProvider (postmortem requirement - App level)
    └── TerminalLifecycleManager (Phase A addition)  
        └── TerminalManagerProvider (Phase A)
            └── TerminalView.tsx (session management layer)
                └── AmpPtyTerminal.tsx (proven postmortem component)
```

**Key Integration Principles Validated:**
1. **Preserve all postmortem patterns** - AmpPtyTerminal.tsx unchanged in core functionality
2. **Layer session management cleanly** - TerminalView.tsx provides session integration without breaking proven patterns  
3. **Maintain provider stability** - TerminalProvider at App level per postmortem guidance
4. **Enhance state restoration** - Additional focus() and fit() calls for session switching
5. **Enforce format consistency** - Session ID format standardized across all layers

## Status: TUI + SESSION MANAGEMENT FULLY INTEGRATED ✅

**Integration Confirmed**: The proven TUI patterns from this postmortem are **100% compatible** with the Phase A session management architecture when proper layering and format consistency are maintained.

**Future Reference**: When integrating TUI components with session management:
- Enforce session ID format at **ALL layers**, not just backend
- Include **focus() AND fit()** calls in tab switching, not just refresh()  
- Maintain **TerminalProvider at App level** regardless of additional session management layers
- **Layer session management ABOVE proven terminal components**, don't modify the proven components themselves

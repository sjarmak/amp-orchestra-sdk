/**
 * Prevents navigation to file:// URLs that would cause the app to show a white screen
 */

export function setupGlobalFileNavigationPrevention() {
  // Prevent all navigation to file:// URLs
  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState
  
  history.pushState = function(data: any, unused: string, url?: string | URL | null) {
    if (url && url.toString().startsWith('file://')) {
      console.log('[FILE_LINKS] Blocked pushState navigation to file URL:', url)
      return
    }
    return originalPushState.call(this, data, unused, url)
  }
  
  history.replaceState = function(data: any, unused: string, url?: string | URL | null) {
    if (url && url.toString().startsWith('file://')) {
      console.log('[FILE_LINKS] Blocked replaceState navigation to file URL:', url)
      return
    }
    return originalReplaceState.call(this, data, unused, url)
  }
  
  // Block beforeunload for file URLs
  window.addEventListener('beforeunload', (event) => {
    if (window.location.href.startsWith('file://')) {
      console.log('[FILE_LINKS] Preventing navigation away from file URL')
      event.preventDefault()
      event.returnValue = ''
    }
  })
  
  // Block popstate for file URLs
  window.addEventListener('popstate', (_event) => {
    if (window.location.href.startsWith('file://')) {
      console.log('[FILE_LINKS] Blocking popstate for file URL, going back')
      history.back()
    }
  })
  
  // Block hashchange for file URLs  
  window.addEventListener('hashchange', (event) => {
    if (event.newURL.startsWith('file://')) {
      console.log('[FILE_LINKS] Blocking hashchange for file URL')
      event.preventDefault()
      window.location.hash = new URL(event.oldURL).hash
    }
  })
}

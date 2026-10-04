// Old public links were /#/find, /#/build?... and /#/share?...: send them to the finder, keeping the hash.
if (window.location.pathname === '/' && /^#\/(find|build|share)/.test(window.location.hash)) {
  window.location.replace('/finder' + window.location.hash)
} else {
  void import('./portal/main')
}

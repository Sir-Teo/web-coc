/** Explicit opt-in on a development server or loopback preview. No saved unlock flag. */
export function developerToolsEnabled(development: boolean, hostname: string, search: string) {
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
  return (development || local) && new URLSearchParams(search).get('devtools') === '1';
}

/**
 * Fetch con header X-User-Id para simular usuario (sin login).
 * Las APIs filtran por juzgado según este usuario.
 */
export function apiFetch(url: string, options: RequestInit = {}, userId?: string | null): Promise<Response> {
  const headers = new Headers(options.headers)
  if (userId) {
    headers.set('x-user-id', userId)
  }
  return fetch(url, { ...options, headers })
}

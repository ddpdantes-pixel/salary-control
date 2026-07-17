self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    return
  }

  const icon = new URL('pwa-192x192.png', self.registration.scope).href
  const badge = new URL('pwa-192x192.png', self.registration.scope).href
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Мой ритм', {
      body: payload.body || '',
      icon: payload.icon || icon,
      badge: payload.badge || badge,
      tag: payload.tag,
      data: payload.data || {},
      renotify: false,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl =
    event.notification.data && typeof event.notification.data.url === 'string'
      ? event.notification.data.url
      : self.registration.scope

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (windowClients) => {
        const sameOriginClient = windowClients.find((client) => {
          try {
            return new URL(client.url).origin === self.location.origin
          } catch {
            return false
          }
        })

        if (sameOriginClient) {
          if ('navigate' in sameOriginClient) {
            await sameOriginClient.navigate(targetUrl)
          }
          return sameOriginClient.focus()
        }

        return self.clients.openWindow(targetUrl)
      }),
  )
})

self.addEventListener('notificationclose', () => {
  // Closing a notification has no financial side effects.
})

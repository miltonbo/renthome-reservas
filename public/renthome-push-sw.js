self.addEventListener("push", (event) => {
  if (!event.data) return;
  const { title, body, path, tag } = event.data.json();
  event.waitUntil(self.registration.showNotification(title, {
    body, tag, data: { path }, icon: "/icon-192.png",
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.path || "/dashboard", self.location.origin);
  if (target.origin !== self.location.origin || target.pathname !== "/dashboard") return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => client.url === target.href);
    if (existing) return existing.focus();
    return self.clients.openWindow(target.href);
  })());
});

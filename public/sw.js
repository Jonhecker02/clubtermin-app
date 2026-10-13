self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ClubTermine", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "ClubTermine";
  const options = {
    body: data.body || "",
    // PNG on purpose: SVG icons aren't rendered in notifications on most platforms.
    icon: "/icons/icon-192.png",
    // Android shows this white-on-transparent glyph in the status bar.
    badge: "/icons/badge-96.png",
    data: { url: data.url || "/" },
  };
  // Same tag = replaces the previous notification for that termin instead of stacking.
  if (data.tag) {
    options.tag = data.tag;
    options.renotify = true;
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    event.notification.data && event.notification.data.url ? event.notification.data.url : "/",
    self.location.origin,
  ).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // An already-open app window: bring it forward and send it to the right page.
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          return client.focus().then((focused) => (focused && "navigate" in focused ? focused.navigate(target) : focused));
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});

"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

const endpoint = "/api/renthome-push";

async function saveSubscription(body: unknown) {
  const response = await fetch(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await response.json()).error);
}

export function RentHomePushControl() {
  const [key, setKey] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const registration = await navigator.serviceWorker?.getRegistration();
      const subscription = await registration?.pushManager?.getSubscription();
      const query = new URLSearchParams(subscription ? { endpoint: subscription.endpoint } : {});
      const response = await fetch(endpoint + "?" + query, { cache: "no-store", signal: controller.signal });
      if (!response.ok) return;
      const data = await response.json();
      setKey(data.publicKey);
      setRegistered(data.registered);
    }
    void load().catch(() => {});
    return () => controller.abort();
  }, []);

  if (!key) return null;

  async function toggle() {
    setNotice("");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setNotice("Usa Chrome en Android o escritorio. En iPhone, abre DeptosBO desde la pantalla de inicio.");
      return;
    }
    setBusy(true);
    try {
      if (!registered && await Notification.requestPermission() !== "granted") {
        setNotice("Permite las notificaciones de DeptosBO en los ajustes del dispositivo.");
        return;
      }
      await navigator.serviceWorker.register("/renthome-push-sw.js");
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      if (registered && current) {
        await saveSubscription({ endpoint: current.endpoint, enabled: false });
        await current.unsubscribe();
        setRegistered(false);
      } else {
        const keyBytes = Uint8Array.from(atob(key!.replace(/-/g, "+").replace(/_/g, "/")), (value) => value.charCodeAt(0));
        const subscription = current ?? await registration.pushManager.subscribe({
          userVisibleOnly: true, applicationServerKey: keyBytes,
        });
        await saveSubscription(subscription.toJSON());
        setRegistered(true);
      }
    } catch {
      setNotice("No se pudo cambiar la configuración. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" onClick={toggle} disabled={busy}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line-2)] px-3 text-sm font-semibold hover:bg-[var(--bg-3)] disabled:opacity-60">
      <Bell size={16} aria-hidden="true" />
      {busy ? "Guardando…" : registered ? "Desactivar avisos" : "Activar notificaciones"}
    </button>
    <span role="status" className="text-sm text-[var(--ink-2)]">{notice}</span>
  </div>;
}

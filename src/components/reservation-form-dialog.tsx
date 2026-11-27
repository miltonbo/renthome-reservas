"use client";

import { useId, type FormEventHandler, type ReactNode } from "react";

export const reservationFieldLabel = "mb-1.5 block text-xs font-medium text-[var(--ink-3)]";
export const reservationFieldControl = "h-10 w-full rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-3 text-sm text-[var(--ink)]";

export function ReservationFormDialog({ title, description, children, error, saving, disabled, submitLabel, onClose, onSubmit }: {
  title: string;
  description: string;
  children: ReactNode;
  error: string;
  saving: boolean;
  disabled?: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  const titleId = useId();
  const descriptionId = useId();
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
    <form onSubmit={onSubmit} onKeyDown={(event) => {
      if (event.key === "Escape" && !event.defaultPrevented && !saving) onClose();
      if (event.key !== "Tab" || event.defaultPrevented) return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
      )).filter((element) => element.getClientRects().length > 0 && element.tabIndex >= 0);
      const first = controls[0];
      const last = controls.at(-1);
      const next = event.shiftKey && event.target === first ? last : !event.shiftKey && event.target === last ? first : null;
      if (next) {
        event.preventDefault();
        next.focus();
      }
    }} className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-5 shadow-2xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 id={titleId} className="text-lg font-semibold text-[var(--ink)]">{title}</h2>
          <p id={descriptionId} className="mt-1 text-xs text-[var(--ink-4)]">{description}</p>
        </div>
        <button type="button" disabled={saving} onClick={onClose} className="rounded-lg p-1.5 text-[var(--ink-4)] hover:bg-[var(--bg-3)] hover:text-[var(--ink)]" aria-label="Cerrar">✕</button>
      </div>
      {children}
      {error && <div role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-700 dark:text-red-300">{error}</div>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border border-[var(--line-2)] px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--bg-3)] disabled:opacity-45">Cancelar</button>
        <button type="submit" disabled={saving || disabled} className="rounded-lg bg-[var(--brand-orange)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--m-accent-2)] disabled:cursor-not-allowed disabled:opacity-45">{saving ? "Guardando…" : submitLabel}</button>
      </div>
    </form>
  </div>;
}

export function ReservationFormTotal({ description, children }: { description: string; children: ReactNode }) {
  return <div className="flex items-center justify-between rounded-xl border border-[var(--brand-orange)]/25 bg-[var(--brand-orange-soft)] px-4 py-3 sm:col-span-2">
    <div>
      <span className="block text-xs font-semibold text-[var(--ink)]">Monto total a cobrar</span>
      <span className="mt-0.5 block text-[10px] text-[var(--ink-4)]">{description}</span>
    </div>
    <span className="text-right text-sm font-bold tabular-nums text-[var(--brand-orange)]">{children}</span>
  </div>;
}

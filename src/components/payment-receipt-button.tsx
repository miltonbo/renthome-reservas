"use client";

import { useState } from "react";
import { downloadPaymentReceipt } from "@/lib/payment-receipt";

interface PaymentReceiptButtonProps {
  guestName: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  amount?: number | null;
  currency?: "BOB" | "USD";
  buttonClassName?: string;
}

export function PaymentReceiptButton({ guestName, propertyName, checkIn, checkOut, amount, currency = "BOB", buttonClassName }: PaymentReceiptButtonProps) {
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState(guestName);
  const [receiptAmount, setReceiptAmount] = useState(amount == null ? "" : String(amount));
  const [receiptCurrency, setReceiptCurrency] = useState<"BOB" | "USD">(currency);
  const [concept, setConcept] = useState("Pago por alojamiento correspondiente a la estadía indicada");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const showDialog = () => {
    setCustomerName(guestName);
    setReceiptAmount(amount == null ? "" : String(amount));
    setReceiptCurrency(currency);
    setConcept("Pago por alojamiento correspondiente a la estadía indicada");
    setError("");
    setOpen(true);
  };

  const download = async () => {
    const parsedAmount = Number(receiptAmount.replace(",", "."));
    if (!customerName.trim() || !concept.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Complete el nombre, el concepto y un monto válido.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      await downloadPaymentReceipt({
        customerName: customerName.trim(), propertyName, checkIn, checkOut,
        concept: concept.trim(), amount: parsedAmount, currency: receiptCurrency,
      });
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo generar el recibo.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <button type="button" onClick={showDialog} className={buttonClassName || "rounded-lg border border-[var(--line-2)] px-3 py-2 text-xs font-semibold text-[var(--ink-2)] hover:bg-[var(--bg-3)]"}>Descargar recibo de pago</button>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Generar recibo de pago" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-[var(--ink)]">Recibo de pago</h2><p className="mt-1 text-xs text-[var(--ink-4)]">Revise los datos antes de descargarlo.</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-[var(--line-2)] px-3 py-1.5 text-xs">Cerrar</button></div>
            <div className="mt-5 space-y-3">
              <label className="block text-xs font-semibold text-[var(--ink-3)]">Emitir a nombre de<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-3 text-sm text-[var(--ink)]" /></label>
              <label className="block text-xs font-semibold text-[var(--ink-3)]">Monto recibido<div className="mt-1.5 flex"><select value={receiptCurrency} onChange={(event) => setReceiptCurrency(event.target.value as "BOB" | "USD")} className="h-10 rounded-l-lg border border-r-0 border-[var(--line-2)] bg-[var(--bg-2)] px-3 text-sm"><option value="BOB">Bs</option><option value="USD">USD</option></select><input type="number" min="0.01" step="0.01" value={receiptAmount} onChange={(event) => setReceiptAmount(event.target.value)} className="h-10 min-w-0 flex-1 rounded-r-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-3 text-sm" /></div></label>
              <label className="block text-xs font-semibold text-[var(--ink-3)]">Concepto<textarea rows={3} value={concept} onChange={(event) => setConcept(event.target.value)} className="mt-1.5 w-full resize-none rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--ink)]" /></label>
            </div>
            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
            <button type="button" disabled={generating} onClick={download} className="mt-4 w-full rounded-lg bg-[var(--brand-orange)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{generating ? "Generando…" : "Descargar recibo"}</button>
          </div>
        </div>
      )}
    </>
  );
}

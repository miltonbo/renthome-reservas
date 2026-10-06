export interface PaymentReceiptData {
  customerName: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  concept: string;
  amount: number;
  currency: "BOB" | "USD";
}

const dateKey = (value: string) => value.slice(0, 10);

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo cargar el logotipo."));
    image.src = src;
  });
}

function safeFilename(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function boliviaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return { year: part("year"), month: part("month"), day: part("day") };
}

function nextReceiptNumber() {
  const today = boliviaToday();
  const datePart = `${today.month}${today.day}`;
  const key = `renthome-payment-receipt-${today.year}-${datePart}`;
  const next = Math.max(1, Number.parseInt(localStorage.getItem(key) || "0", 10) + 1);
  localStorage.setItem(key, String(next));
  return `RH-${today.year}-${datePart}-${String(next).padStart(3, "0")}`;
}

function spanishDate(value: string) {
  return new Date(`${dateKey(value)}T12:00:00`).toLocaleDateString("es-BO", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function stayLabel(checkIn: string, checkOut: string) {
  return `Del ${spanishDate(checkIn)} al ${spanishDate(checkOut)}`;
}

const UNITS = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
const SPECIAL = ["diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
const TENS = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const HUNDREDS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function underThousand(value: number): string {
  if (value === 0) return "";
  if (value === 100) return "cien";
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(HUNDREDS[hundreds]);
  if (rest < 10 && rest > 0) parts.push(UNITS[rest]);
  else if (rest >= 10 && rest <= 29) parts.push(SPECIAL[rest - 10]);
  else if (rest >= 30) parts.push(`${TENS[Math.floor(rest / 10)]}${rest % 10 ? ` y ${UNITS[rest % 10]}` : ""}`);
  return parts.join(" ");
}

function amountInWords(amount: number, currency: "BOB" | "USD") {
  const whole = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - whole) * 100);
  const millions = Math.floor(whole / 1_000_000);
  const thousands = Math.floor((whole % 1_000_000) / 1_000);
  const units = whole % 1_000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? "un millón" : `${underThousand(millions)} millones`);
  if (thousands) parts.push(thousands === 1 ? "mil" : `${underThousand(thousands)} mil`);
  if (units || parts.length === 0) parts.push(underThousand(units) || "cero");
  const noun = currency === "USD" ? "dólares estadounidenses" : "bolivianos";
  const text = `${parts.join(" ")} ${noun} ${String(cents).padStart(2, "0")}/100`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function money(value: number, currency: "BOB" | "USD") {
  return `${currency === "USD" ? "USD" : "Bs"} ${new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
}

function wrapText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 3) {
  const words = text.trim().split(/\s+/);
  let line = "";
  let lineIndex = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      context.fillText(line, x, y + lineIndex * lineHeight);
      line = word;
      lineIndex++;
      if (lineIndex >= maxLines - 1) break;
    } else line = candidate;
  }
  if (lineIndex < maxLines) context.fillText(line, x, y + lineIndex * lineHeight);
}

export async function downloadPaymentReceipt(data: PaymentReceiptData) {
  const canvas = document.createElement("canvas");
  canvas.width = 1275;
  canvas.height = 1650;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("El navegador no pudo generar el recibo.");
  const logo = await loadImage("/brand/renthome-reservation-logo.jpg");
  const receiptNumber = nextReceiptNumber();
  const issuedAt = new Date().toLocaleDateString("es-BO", { timeZone: "America/La_Paz", day: "numeric", month: "long", year: "numeric" });

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#102630";
  context.fillRect(0, 0, canvas.width, 18);
  context.drawImage(logo, 82, 64, 190, 190);
  context.textAlign = "left";
  context.fillStyle = "#102630";
  context.font = "700 42px Arial, sans-serif";
  context.fillText("RECIBO DE PAGO", 330, 122);
  context.font = "600 19px Arial, sans-serif";
  context.fillText(`N.º ${receiptNumber}`, 330, 164);
  context.fillStyle = "#77868d";
  context.font = "500 17px Arial, sans-serif";
  context.fillText(`Fecha de emisión: ${issuedAt}`, 330, 198);
  context.fillStyle = "#f28c28";
  context.fillRect(82, 280, 1111, 7);

  context.fillStyle = "#102630";
  context.font = "700 25px Arial, sans-serif";
  context.fillText("Constancia de pago recibido", 82, 360);

  const tableX = 82; const tableY = 405; const tableWidth = 1111; const labelWidth = 270; const rowHeight = 95;
  const rows = [
    ["HUÉSPED / CLIENTE", data.customerName],
    ["ALOJAMIENTO", data.propertyName],
    ["ESTADÍA", stayLabel(data.checkIn, data.checkOut)],
    ["CONCEPTO", data.concept],
  ];
  context.lineWidth = 2;
  context.strokeStyle = "#d8e1e4";
  rows.forEach(([label, value], index) => {
    const y = tableY + index * rowHeight;
    context.fillStyle = "#f5f7f7";
    context.fillRect(tableX, y, labelWidth, rowHeight);
    context.strokeRect(tableX, y, tableWidth, rowHeight);
    context.beginPath(); context.moveTo(tableX + labelWidth, y); context.lineTo(tableX + labelWidth, y + rowHeight); context.stroke();
    context.fillStyle = "#56676e";
    context.font = "700 15px Arial, sans-serif";
    context.fillText(label, tableX + 24, y + 52);
    context.fillStyle = "#142a33";
    context.font = "500 20px Arial, sans-serif";
    wrapText(context, value, tableX + labelWidth + 28, y + 39, tableWidth - labelWidth - 55, 25, 2);
  });

  const amountY = 840;
  context.strokeStyle = "#f28c28";
  context.lineWidth = 3;
  context.strokeRect(82, amountY, 1111, 290);
  context.fillStyle = "#56676e";
  context.font = "700 16px Arial, sans-serif";
  context.fillText("MONTO RECIBIDO", 105, amountY + 48);
  context.fillStyle = "#102630";
  context.font = "700 52px Arial, sans-serif";
  context.textAlign = "center";
  context.fillText(money(data.amount, data.currency), 637.5, amountY + 145);
  context.textAlign = "left";
  context.fillStyle = "#334951";
  context.font = "500 18px Arial, sans-serif";
  wrapText(context, amountInWords(data.amount, data.currency), 105, amountY + 205, 1045, 25, 2);
  context.fillStyle = "#159a73";
  context.font = "700 18px Arial, sans-serif";
  context.textAlign = "center";
  context.fillText("PAGO RECIBIDO", 637.5, amountY + 264);

  context.textAlign = "left";
  context.fillStyle = "#334951";
  context.font = "500 18px Arial, sans-serif";
  wrapText(context, "Se deja constancia de la recepción del monto señalado por concepto del alojamiento indicado.", 95, 1225, 1085, 27, 3);

  context.fillStyle = "#d8e1e4";
  context.fillRect(82, 1475, 1111, 2);
  context.fillStyle = "#102630";
  context.font = "700 19px Arial, sans-serif";
  context.textAlign = "center";
  context.fillText("RentHome Departamentos", 637.5, 1522);
  context.fillStyle = "#77868d";
  context.font = "500 16px Arial, sans-serif";
  context.fillText("Renta. Vive. Disfruta.", 637.5, 1555);
  context.fillText("Documento generado digitalmente. No requiere firma.", 637.5, 1605);

  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("No se pudo generar la imagen.")), "image/png"));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `recibo-pago-${receiptNumber.toLowerCase()}-${safeFilename(data.customerName)}.png`;
  link.click();
  URL.revokeObjectURL(url);
  return receiptNumber;
}

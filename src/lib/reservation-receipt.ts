export interface ReservationReceiptData {
  guestName: string;
  propertyName: string;
  channel: string;
  checkIn: string;
  checkOut: string;
  checkInTime?: string;
  checkOutTime?: string;
  nightlyPrice?: number | null;
  totalPrice?: number | null;
  currency: "BOB" | "USD";
}

const dateKey = (value: string) => value.slice(0, 10);

function nightsBetween(checkIn: string, checkOut: string) {
  const start = new Date(`${dateKey(checkIn)}T12:00:00Z`).getTime();
  const end = new Date(`${dateKey(checkOut)}T12:00:00Z`).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

function dateLabel(value: string) {
  return new Date(`${dateKey(value)}T12:00:00`).toLocaleDateString("es-BO", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

function money(value: number, currency: "BOB" | "USD") {
  return `${currency === "USD" ? "USD" : "Bs"} ${new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 }).format(value)}`;
}

export function splitPropertyName(propertyName: string) {
  const match = propertyName.trim().match(/^(.*\S)\s+([^\s]+)$/);
  return match ? { building: match[1], unit: match[2] } : { building: propertyName, unit: propertyName };
}

function drawField(context: CanvasRenderingContext2D, label: string, value: string, x: number, y: number, width: number, valueSize = 31) {
  context.fillStyle = "#77868d";
  context.font = "600 20px Arial, sans-serif";
  context.fillText(label.toUpperCase(), x, y);
  context.fillStyle = "#142a33";
  context.font = `600 ${valueSize}px Arial, sans-serif`;
  context.fillText(value, x, y + 44, width);
}

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

export async function downloadReservationReceipt(data: ReservationReceiptData) {
  const canvas = document.createElement("canvas");
  // US Letter at 150 dpi: suitable for printing and still light enough to
  // share as an image through WhatsApp.
  canvas.width = 1275;
  canvas.height = 1650;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("El navegador no pudo generar el comprobante.");

  const logo = await loadImage("/brand/renthome-reservation-logo.jpg");
  const { building, unit } = splitPropertyName(data.propertyName);
  const nights = nightsBetween(data.checkIn, data.checkOut);
  const nightlyPrice = data.nightlyPrice ?? ((data.totalPrice ?? 0) / nights);

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Formal letterhead: a restrained brand rule, logo and document title on
  // white instead of a large dark block.
  context.fillStyle = "#102630";
  context.fillRect(0, 0, 1275, 18);
  context.drawImage(logo, 82, 62, 190, 190);
  context.textAlign = "left";
  context.fillStyle = "#102630";
  context.font = "700 42px Arial, sans-serif";
  context.fillText("COMPROBANTE", 330, 118);
  context.fillText("DE RESERVA", 330, 169);
  context.fillStyle = "#f28c28";
  context.fillRect(330, 195, 130, 6);
  context.fillStyle = "#77868d";
  context.font = "500 19px Arial, sans-serif";
  context.fillText("Documento de confirmación de estadía", 330, 235);

  context.fillStyle = "#edf8f5";
  context.beginPath(); context.roundRect(894, 91, 288, 62, 31); context.fill();
  context.fillStyle = "#137f70";
  context.font = "700 21px Arial, sans-serif";
  context.textAlign = "center";
  context.fillText("✓  RESERVA CONFIRMADA", 1038, 130);

  context.strokeStyle = "#d8e1e4";
  context.lineWidth = 2;
  context.beginPath(); context.moveTo(82, 292); context.lineTo(1193, 292); context.stroke();

  context.textAlign = "left";
  context.fillStyle = "#f6f8f8";
  context.beginPath(); context.roundRect(82, 345, 1111, 176, 16); context.fill();
  drawField(context, "Huésped", data.guestName, 118, 400, 670, 38);
  drawField(context, "Canal", data.channel, 870, 400, 270, 30);

  context.fillStyle = "#102630";
  context.font = "700 23px Arial, sans-serif";
  context.fillText("DATOS DE LA ESTADÍA", 82, 600);
  context.fillStyle = "#f28c28";
  context.fillRect(82, 620, 1111, 4);

  context.strokeStyle = "#d8e1e4";
  context.lineWidth = 2;
  context.beginPath(); context.roundRect(82, 668, 1111, 292, 16); context.stroke();
  context.beginPath(); context.moveTo(637, 668); context.lineTo(637, 960); context.stroke();
  drawField(context, "Ingreso", dateLabel(data.checkIn), 118, 738, 465, 29);
  drawField(context, "Hora de ingreso", data.checkInTime || "14:00", 118, 850, 465, 31);
  drawField(context, "Salida", dateLabel(data.checkOut), 680, 738, 465, 29);
  drawField(context, "Hora de salida", data.checkOutTime || "11:00", 680, 850, 465, 31);

  context.font = "700 23px Arial, sans-serif";
  context.fillStyle = "#102630";
  context.fillText("DETALLE DE LA RESERVA", 82, 1046);
  context.fillStyle = "#f28c28";
  context.fillRect(82, 1066, 1111, 4);

  drawField(context, "Edificio", building, 82, 1146, 470);
  drawField(context, "Departamento", unit, 680, 1146, 470);
  drawField(context, "Total noches", String(nights), 82, 1262, 470);
  drawField(context, "Precio por noche", money(nightlyPrice, data.currency), 680, 1262, 470);

  context.fillStyle = "#f6f8f8";
  context.beginPath(); context.roundRect(82, 1350, 1111, 112, 16); context.fill();
  context.fillStyle = "#56676e";
  context.font = "600 22px Arial, sans-serif";
  context.fillText("TOTAL DE LA RESERVA", 118, 1397);
  context.fillStyle = "#102630";
  context.font = "700 40px Arial, sans-serif";
  context.textAlign = "right";
  context.fillText(money(data.totalPrice ?? nightlyPrice * nights, data.currency), 1157, 1418);

  context.fillStyle = "#d8e1e4";
  context.fillRect(82, 1530, 1111, 2);
  context.fillStyle = "#77868d";
  context.font = "500 19px Arial, sans-serif";
  context.textAlign = "center";
  context.fillText("RentHome Departamentos · Santa Cruz de la Sierra, Bolivia", 637.5, 1585);
  context.fillStyle = "#f28c28";
  context.font = "600 17px Arial, sans-serif";
  context.fillText("Gracias por elegirnos", 637.5, 1620);

  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("No se pudo generar la imagen.")), "image/png"));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `comprobante-reserva-${safeFilename(data.guestName)}-${safeFilename(data.propertyName)}.png`;
  link.click();
  URL.revokeObjectURL(url);
}

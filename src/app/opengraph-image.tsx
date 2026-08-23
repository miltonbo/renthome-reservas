import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "RentHome Departamentos — Gestión de reservas y departamentos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background:
            "linear-gradient(135deg, #0d1117 0%, #161b22 60%, #1f1218 100%)",
          color: "#e8e8ec",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "12px",
              background: "#1e1e22",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28px",
              fontWeight: 700,
              color: "#ff385c",
            }}
          >
            RT
          </div>
          <div style={{ fontSize: "32px", fontWeight: 600, letterSpacing: "-0.02em" }}>
            RentHome Departamentos
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div
            style={{
              fontSize: "28px",
              color: "#ff385c",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            RentHome Departamentos
          </div>
          <div
            style={{
              fontSize: "64px",
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              maxWidth: "1000px",
            }}
          >
            Reservas, calendarios, limpiezas y operación en un solo lugar.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "24px",
            color: "#a0a0a8",
          }}
        >
          <div>Santa Cruz de la Sierra</div>
          <div>RentHome Departamentos</div>
        </div>
      </div>
    ),
    size,
  );
}

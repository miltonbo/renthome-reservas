# RentHome Departamentos

Sistema interno para administrar las reservas y la disponibilidad de los 23 departamentos físicos operados por RentHome Departamentos.

## Funcionalidades principales

- Calendario maestro con las 23 unidades físicas.
- Sincronización de calendarios iCal de Airbnb.
- Registro manual de reservas directas, Booking.com y Vrbo.
- Modificación, extensión y cancelación de reservas.
- Control de importes de hospedaje, garantía y parqueo en bolivianos.
- Notas operativas por reserva.
- Programación de limpiezas según la salida final del huésped.
- Interfaz adaptable para computadora y dispositivos móviles.

## Desarrollo local

```bash
npm install
npm run db:push
npm run dev
```

La aplicación estará disponible por defecto en `http://localhost:3000`.

## Variables de entorno

Copiar `.env.example` a `.env.local` y configurar como mínimo:

- `DATABASE_URL` para SQLite local, o las credenciales de Turso.
- `SESSION_SECRET` con un valor seguro.
- `NEXT_PUBLIC_SITE_URL` con la URL pública al desplegar.
- `EMAIL_FROM` y las credenciales de correo si se habilitan notificaciones.

## Verificación

```bash
npm test
npm run build
```

El sistema es de uso interno de RentHome Departamentos. No deben incorporarse credenciales, enlaces privados de calendarios ni datos de huéspedes al repositorio.

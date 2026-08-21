# RentHome Reservas — arquitectura de implementación

## Objetivo

Convertir RentTools en el calendario maestro privado de RentHome Departamentos.
La fuente de verdad será la ocupación de cada unidad física, sin perder el
anuncio o canal mediante el cual se vendió la reserva.

## Regla central

Una reserva comercial y una asignación física son entidades diferentes.

Ejemplo:

- Canal: Booking.
- Publicación vendida: Luxe Suites 406.
- Cantidad vendida: 2 unidades.
- Asignaciones físicas: Luxe Suites 406 y Luxe Suites 205.

Mover la segunda asignación a Luxe Suites 104 no debe alterar el origen ni el
identificador de la reserva de Booking.

## Entidades objetivo

### PhysicalUnit

Departamento físico que puede ocuparse. Su identidad siempre incluye edificio
y número para evitar ambigüedades como Sky Elite 406 y Luxe Suites 406.

### ChannelListing

Publicación que existe en Airbnb, Booking, Vrbo u otro canal. Puede representar
una unidad física o un grupo vendible de unidades similares.

### Reservation

Contrato comercial con fechas, canal, huésped, moneda, importe y estado. Una
reserva puede solicitar una o varias unidades.

### ReservationAllocation

Asignación de una parte de la reserva a una unidad física. Es la entidad que
bloquea disponibilidad y que puede reubicarse.

### Payment

Movimiento económico asociado a una reserva. Debe admitir abonos parciales,
distintas monedas y clasificación de comisiones.

### SecurityDeposit

Garantía separada de ingresos, con estados recibida, devuelta, retenida o
pendiente.

## Inventario inicial

- 23 unidades publicadas en Airbnb.
- Stanza 5N adicional, publicada solamente en Booking.
- Sky Elite 528 publicada en Airbnb y todavía ausente de Booking.
- Grupo intercambiable inicial a validar: Luxe Suites 104, 204, 205 y 406.

La carga definitiva debe derivarse del dossier operativo de RentHome y no de
los nombres abreviados mostrados por las plataformas.

## Fases

### Fase 0 — línea base

- Fork y entorno local reproducible.
- Compilación y pruebas del proyecto heredado.
- Registro de defectos heredados antes de modificar funcionalidad.

### Fase 1 — núcleo operativo

- Unidades físicas y publicaciones por canal.
- Reservas manuales de una o varias unidades.
- Asignaciones físicas reubicables.
- Validación transaccional de cruces.
- Calendario multiunidad en zona horaria America/La_Paz.
- Registro de auditoría.

### Fase 2 — sincronización

- Importación iCal de Airbnb y Vrbo.
- Reconciliación de modificaciones y cancelaciones.
- Feed iCal externo por unidad física.
- Exclusión de eventos del mismo canal para evitar ciclos.

### Fase 3 — conciliación

- Importes, monedas, comisiones y pagos parciales.
- Comisión Booking separada del total cobrado.
- Garantías fuera de ingresos.
- Ingresos por cancelación sin ocupación.
- Exportación CSV mensual.

## Decisiones técnicas

- Mantener Next.js y TypeScript del proyecto base.
- Usar PostgreSQL antes de producción.
- Representar estadías como intervalos semiabiertos: `[check-in, check-out)`.
- Aplicar la prohibición de solapamientos en la base de datos, no solo en UI.
- Usar America/La_Paz como zona operativa y fechas civiles para las noches.
- Mantener datos sensibles fuera de feeds iCal públicos.
- Conservar el historial de reasignaciones y cancelaciones.

## Criterio de aceptación inicial

El sistema debe permitir vender dos unidades mediante la publicación Booking
Luxe Suites 406, asignarlas a Luxe Suites 406 y Luxe Suites 205, y mover la
segunda a Luxe Suites 104 sin cambiar la reserva comercial ni crear un cruce.

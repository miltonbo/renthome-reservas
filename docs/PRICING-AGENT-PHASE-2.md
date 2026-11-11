# Agente de precios de RentHome — Fase 2

La Fase 2 convierte el esquema de precios en un motor de recomendaciones en **modo sombra**. Calcula y muestra valores, pero no escribe precios ni promociones en Airbnb o Booking.

## Configuración

La pantalla `Administración → Operaciones → Agente de precios` permite:

- definir piso, objetivo y techo por propiedad y canal;
- guardar comisión y descuento máximo;
- mantener la ocupación base de dos personas y el tercer huésped en +20 %;
- configurar Genius, móvil, país, último minuto, semanal y mensual;
- marcar promociones acumulables;
- registrar eventos confirmados o tentativos con impacto y confianza;
- ejecutar manualmente el cálculo de los próximos 90 días.

No se crean políticas automáticamente con valores supuestos. Una propiedad empieza a generar recomendaciones solamente después de guardar al menos una política verificada.

## Motor de recomendaciones

Cada fecha combina:

- día de la semana;
- anticipación;
- proporción disponible del portafolio;
- reservas confirmadas y bloqueos sincronizados;
- impacto ponderado de eventos (`impacto × confianza`);
- comisión del canal;
- promociones activas y acumulables;
- tipo de cambio oficial almacenado;
- piso, objetivo y techo configurados.

El piso neto prevalece sobre cualquier promoción. Si comisión y descuentos requieren superar el techo para conservarlo, la recomendación queda en estado `needs_review` en lugar de sugerir una venta por debajo del piso.

## Frecuencia

El cron existente calcula 90 días tres veces al día, a las 08:00, 12:00 y 17:00 de Bolivia. Cada ventana es idempotente aunque el cron general se ejecute cada diez minutos. También puede ejecutarse manualmente desde la pantalla del agente.

## Calendario maestro

Las noches disponibles muestran la recomendación directa en bolivianos. Al pasar el cursor se muestran el piso y las razones principales. Las fechas ocupadas conservan la recomendación en la base para análisis, pero no muestran el valor encima de la reserva.

## Sincronización de Booking

La sección Booking incorpora el botón `Sincronizar Booking`. El endpoint recibe el filtro `platform=booking`, lo combina con las propiedades accesibles del usuario y descarga solamente esos feeds. No sincroniza Airbnb, Vrbo ni calendarios de otros usuarios.

## Límite de esta fase

`PricingChange` sigue vacío mientras las recomendaciones no se ejecuten en una plataforma. La escritura y verificación posterior en Airbnb o Booking corresponde a la Fase 3.

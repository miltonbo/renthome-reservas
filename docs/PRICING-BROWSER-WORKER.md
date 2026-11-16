# Trabajador de navegador del agente de precios

DeptosBO mantiene el motor, las políticas, los pisos y la auditoría. Un
trabajador separado con un perfil persistente de Chrome se limita a leer y
escribir en Airbnb y Booking. Nunca decide precios por su cuenta.

## Autenticación

Configurar `PRICING_WORKER_TOKEN` en DeptosBO y enviar:

```http
Authorization: Bearer <token>
```

Si la variable todavía no existe, el backend local acepta `CRON_SECRET` como
respaldo. Producción debe usar un token exclusivo para el trabajador.

## Protocolo

Todas las llamadas usan `POST /api/pricing/automation/worker`.

1. `claim`: reclama la siguiente ejecución de Airbnb o Booking y recibe la
   lista de propiedades que debe localizar.
2. `heartbeat`: renueva el bloqueo cada pocos minutos durante una navegación
   larga.
3. `snapshot`: entrega IDs externos, sesión, reseñas, calificación,
   promociones y calendario observado. DeptosBO persiste la información,
   recalcula 90 días y devuelve únicamente las fechas que requieren cambios.
4. El trabajador aplica el plan en la plataforma.
5. `complete`: devuelve el valor leído después de escribir. DeptosBO compara,
   actualiza el estado y crea auditoría compactada por rangos contiguos.
6. `fail`: registra `session_expired`, `verification_required`, `captcha` o un
   error técnico. Los demás canales continúan independientemente.

El trabajador no debe enviar nombres de huéspedes, códigos de reserva,
conversaciones ni credenciales. Las instantáneas aceptan únicamente metadatos
comerciales del anuncio y precios por fecha.

## Seguridad operativa

- No aplicar un plan si la lectura de promociones o del calendario está
  incompleta.
- No modificar una fecha que no aparezca en el plan devuelto por DeptosBO.
- Leer nuevamente precio y estadía mínima después de cada escritura.
- Reportar diferencias como `mismatch`; nunca declararlas verificadas.
- Ante CAPTCHA o autenticación, detener ese canal sin bloquear el otro.
- Mantener un perfil de Chrome exclusivo para RentHome Departamentos.

## Retención compacta

`ChannelPriceObservation` conserva una sola fila por propiedad, canal y fecha.
Las ejecuciones conservan solo contadores y estado. Los cambios exitosos se
agrupan por rangos contiguos en `PricingChange`; no se almacena una copia de
cada pantalla ni información privada de huéspedes.

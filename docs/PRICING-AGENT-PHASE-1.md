# Agente de precios de RentHome — Fase 1

Esta fase agrega únicamente la base de datos y las reglas matemáticas de seguridad. No modifica precios en Airbnb o Booking, no ejecuta automatizaciones y no despliega a producción.

## Modelo compacto en SQLite

- `PricingPolicy`: piso, objetivo y techo por propiedad y canal. La ocupación base predeterminada es de dos personas y el tercer huésped suma 20 %, también en tarifas semanales y mensuales.
- `DailyPrice`: una sola fila por propiedad y fecha. Guarda el precio directo en BOB, los precios de Airbnb y Booking en USD, el piso operativo en BOB y el estado de la recomendación.
- `PromotionPolicy`: reglas reutilizables para Genius, móvil, país, último minuto, semanal, mensual y promociones personalizadas. Cada regla conserva un piso neto.
- `MarketEvent`: feriados y eventos confirmados o todavía tentativos, con impacto y nivel de confianza para ajustar fechas futuras sin asumir que un anuncio incierto ya es oficial.
- `PricingChange`: auditoría compacta de operaciones realmente aplicadas. Las recomendaciones que no se ejecutan permanecen en `DailyPrice` y no generan ruido histórico.

Todos los importes nuevos se almacenan como enteros en unidades menores: centavos de boliviano o centavos de dólar. Los porcentajes se almacenan en puntos base (`2000 = 20 %`).

## Reglas implementadas

- Se exige `piso <= objetivo <= techo`.
- Una promoción nunca puede calcular un resultado menor al piso configurado.
- El precio bruto requerido se puede elevar para absorber comisión y descuentos sin cruzar el piso neto.
- Huéspedes uno y dos usan el precio base; desde el tercer huésped se aplica el recargo estándar de 20 %.
- La estadía normal conserva un mínimo de dos noches y los huecos pueden usar una noche mediante `gapMinNights`.

## Despliegue seguro

La Fase 1 se valida primero con una SQLite temporal. No se debe ejecutar `db:push` manualmente contra producción.

Los dos caminos de despliegue (`scripts/install-build.sh` y el respaldo `scripts/deploy.sh`) detectan cambios de esquema y ejecutan `scripts/backup-db.sh` antes de `prisma/push-schema.ts`. El respaldo usa la operación online de SQLite y exige que `PRAGMA integrity_check` devuelva `ok`; si el archivo no existe o la verificación falla, el despliegue se detiene antes de migrar.

Antes de un despliegue de esta fase se debe comprobar además que `/home/app/backups/latest` apunte al respaldo recién creado. Ese archivo es el punto de retorno previo a la migración.

## Verificación local

```bash
npx prisma validate
npx prisma generate
npx vitest run src/lib/pricing.test.ts
```

La siguiente fase debe poblar las políticas verificadas por propiedad, exponer una interfaz de administración y producir recomendaciones; todavía no debe escribir en plataformas sin el modo de aprobación y la verificación posterior definidos.

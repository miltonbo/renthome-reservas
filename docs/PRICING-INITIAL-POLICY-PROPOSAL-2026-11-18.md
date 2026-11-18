# Propuesta inicial de políticas de precios — RentHome Departamentos

Fecha de cálculo: **18 de noviembre de 2026**
Estado: **propuesta para revisión; no aplicada en producción**

## 1. Fuentes utilizadas

- Reporte Airbnb mayo–octubre de 2026: 139 reservas, 967 noches y ADR de alojamiento de USD 28,63, excluyendo limpieza y mascotas.
- Reporte Booking mayo–octubre de 2026: 138 reservas `OK`, 532 noches, ADR bruto de USD 31,20 y ADR neto después de comisión de USD 26,51.
- DeptosBO desde agosto de 2026: 453 reservas confirmadas con precio dentro del inventario relevante: 75 Airbnb, 114 Booking y 264 directas.
- Configuración verificada en Chrome el 16 de noviembre de 2026: precios mínimos/máximos vigentes, descuentos semanal y mensual, promociones, reputación e inventario de cada anuncio.
- Tipo de cambio operativo almacenado en DeptosBO el 18 de noviembre de 2026: **USD 1 = Bs 11,75**, fuente `BCB_TCO`.
- Criterios comerciales proporcionados por RentHome: Bs 240 como piso extremo para unidades económicas, alrededor de Bs 270–280 para unidades con balcón o mejor producto y aproximadamente Bs 290 o más para Sky Eclipse/Sky Moon.

Para Booking, las reservas reubicadas se atribuyeron al **anuncio de Booking que originó la venta**, no al departamento donde finalmente se alojó al huésped. Esto evita aprender precios incorrectos de las reubicaciones.

## 2. Interpretación de los valores

- **Piso directo:** neto mínimo por noche en bolivianos. No existe comisión de canal.
- **Referencia directa:** precio normal inicial por noche para 1–2 huéspedes, antes de ajustes de demanda.
- **Piso Airbnb:** neto mínimo en USD que debe quedar después de la comisión de Airbnb y cualquier descuento aplicable.
- **Referencia Airbnb:** precio bruto inicial del calendario en USD para 1–2 huéspedes. No es un techo.
- **Piso Booking:** neto mínimo en bolivianos después de comisión, Genius y promociones.
- **Referencia Booking:** precio bruto inicial del calendario en USD. El motor deberá elevarlo cuando se acumulen descuentos más profundos.
- Para un hueco habilitado de una sola noche, se mantiene la regla dura de **piso normal + Bs 50** antes de convertir al canal correspondiente.
- El piso de la matriz corresponde al segmento normal de **2–7 noches**. Las estadías de 8–27 noches tendrán un piso largo independiente y las de 28 o más noches un piso mensual independiente.
- Como inicialización conservadora, el piso largo de 8–27 noches puede partir del 95 % del piso normal. El piso mensual ya no se calcula como 90 % del precio diario: desde 28 noches utiliza la matriz económica de costos y pisos autorizados de `PRICING-MONTHLY-LOW-SEASON-FLOORS-2026-11-18.md`.
- La reserva raíz y sus extensiones se agrupan por duración acumulada. Una extensión de un día no se trata como hueco de una noche y no recibe el recargo de Bs 50.
- Las referencias de Airbnb fueron comprobadas contra la comisión del 15,5 % y los descuentos mensuales actualmente conocidos de hasta 20 %.
- Las referencias de Booking soportan la comisión del 15 % y una capa promocional ordinaria. Cuando coincidan Genius, móvil, país u otra promoción acumulable, el motor recalculará el bruto requerido para proteger el piso.

## 3. Matriz propuesta — 23 alojamientos × 3 canales

| Alojamiento | Directas piso / referencia (BOB) | Airbnb piso neto / referencia bruta (USD) | Booking piso neto (BOB) / referencia bruta (USD) | Observación |
|---|---:|---:|---:|---|
| Luxe Suites 104 | 240 / 290 | 20 / 30 | 240 / 40 | Sin balcón/vista; el histórico directo de 2–7 noches ronda Bs 300. |
| Luxe Suites 113 | 270 / 310 | 22 / 34 | 270 / 42 | Unidad con balcón; muestra OTA todavía reducida. |
| Luxe Suites 117 | 270 / 300 | 22 / 34 | 270 / 42 | Histórico directo cercano a Bs 286–304 y buen resultado Booking. |
| Luxe Suites 204 | 240 / 280 | 20 / 30 | 240 / 40 | Sin balcón; Booking funciona como inventario flexible de hasta 3 unidades. |
| Luxe Suites 205 | 240 / 280 | 20 / 30 | 240 / 40 | Sin balcón; mayor historial en Booking e inventario flexible. |
| Luxe Suites 316 | 270 / 300 | 22 / 34 | 270 / 42 | Balcón; muchas filas de un día son extensiones de una estadía larga y deben consolidarse antes de analizar duración. |
| Luxe Suites 406 | 240 / 280 | 20 / 30 | 240 / 40 | Sin balcón; buen volumen Booking e inventario flexible de hasta 3 unidades. |
| Sky Eclipse 1309 | 290 / 350 | 25 / 38 | 290 / 45 | Airbnb de 2–7 noches alrededor de USD 30–32; producto premium. |
| Sky Eclipse 1402 | 300 / 360 | 25 / 40 | 300 / 46 | Producto premium, balcón e inventario Booking de hasta 2 unidades. |
| Sky Eclipse 1409 | 300 / 360 | 25 / 40 | 300 / 46 **inactivo** | Clon comercial de 1402 pero propiedad independiente; Booking aún no está conectado. |
| Sky Eclipse 1602 | 290 / 350 | 25 / 38 | 290 / 45 | Airbnb estable cerca de USD 30 y producto premium. |
| Sky Eclipse 1709 | 290 / 350 | 25 / 38 | 290 / 45 | Historial fuerte en Airbnb; la referencia protege su capacidad de cobrar más. |
| Sky Elite 329 | 250 / 280 | 20 / 32 | 250 / 42 | Sin vista, pero con historial Booking suficiente e inventario flexible. |
| Sky Elite 331 | 250 / 290 | 21 / 33 | 250 / 42 | Máximo 2 huéspedes; no aplica cargo por tercer huésped. Buen historial por canal. |
| Sky Elite 406 | 250 / 290 | 21 / 34 | 250 / 43 | Buen historial Airbnb; tiene lavadora y no secadora. |
| Sky Elite 523 | 280 / 310 | 23 / 36 | 280 / 47 | Balcón; máximo 2 huéspedes y sin cargo por tercer huésped. |
| Sky Elite 527 | 250 / 290 | 21 / 34 | 250 / 43 | Sin balcón; hereda la referencia principal de Sky Elite 406. |
| Sky Elite 528 | 250 / 290 | 21 / 34 | 250 / 43 **inactivo** | Sin balcón; hereda Sky Elite 406. Máximo 3 huéspedes, lavadora y secadora; todavía no existe publicación Booking. |
| Sky Elite 540 | 280 / 320 | 23 / 36 | 280 / 44 | Balcón y buen historial Booking; se evita aprender el ADR bajo de estadías largas como tarifa normal. |
| Sky Luxia 112 | 270 / 300 | 22 / 34 | 270 / 44 | Balcón; histórico directo alrededor de Bs 290–300. |
| Sky Moon 706 | 290 / 340 | 24 / 38 | 290 / 46 | Producto premium; Booking histórico de 2–7 noches alrededor de USD 37–38. |
| Stanza 8B | 280 / 350 | 22 / 34 | 280 / 44 | Un dormitorio, historial consolidado y lavadora sin secadora. |
| Uptown Nuu 12D | 250 / 280 | 20 / 32 | 250 / 40 | Airbnb histórico dominado por estadías largas; no se usa ese ADR descontado como referencia normal. |

## 4. Comprobaciones de seguridad

1. Las referencias de Airbnb no atraviesan el piso propuesto aun después de comisión del 15,5 % y el descuento mensual normal actualmente observado en cada anuncio.
2. Las referencias Booking quedan por encima del piso con comisión del 15 % y descuentos ordinarios. El precio diario deberá subir automáticamente si existe una combinación promocional más agresiva.
3. Ninguna referencia funciona como máximo. Eventos, escasez, buena anticipación o fuerte ritmo de reservas pueden elevarla sin techo artificial.
4. Las estadías semanales y mensuales pueden usar su propio piso reducido. El neto posterior a todos los descuentos no puede atravesar el piso correspondiente a su banda de duración.
5. Las referencias se basan principalmente en estadías normales de 2–7 noches. Las reservas de una noche y las estadías largas se analizaron por separado.
6. Sky Elite 523 y Sky Elite 331 quedan configuradas conceptualmente para dos huéspedes, sin suplemento de tercero.

## 5. Casos fuera de la matriz principal

- **Sky Elite 305:** ya no se administra como unidad física propia, pero su anuncio de Booking puede seguir vendiéndose para reubicar al huésped. Se configurará como **inventario virtual Booking** con exactamente la misma política de precio que Sky Elite 329: piso neto **Bs 250** y referencia bruta **USD 42**. No debe reactivarse como departamento físico disponible.
- **Uptown Nuu 10D:** heredará las referencias de Uptown Nuu 12D: directas **Bs 250 / Bs 280**, Airbnb **USD 20 netos / USD 32 brutos** y Booking **Bs 250 netos / USD 40 brutos**. Solo se ejecutará en los canales para los que exista una publicación conectada.
- **Sky Eclipse 1409 en Booking:** DeptosBO no tiene actualmente un identificador de alojamiento/habitación de Booking asociado con 1409. Esto puede significar que todavía no está publicado como producto independiente o que existe pero aún no fue mapeado. La política queda preparada, pero el agente no debe intentar escribir hasta verificar y guardar ese identificador.
- **Sky Elite 528 en Booking:** se confirmó que todavía no fue creada en Booking. La política queda preparada para utilizarse cuando se publique y se registre su identificador.

El número 69 corresponde a las 23 unidades de la matriz principal multiplicadas por tres canales. Al añadir las tres políticas heredadas de Uptown Nuu 10D y la política virtual Booking de Sky Elite 305, el catálogo contiene **73 definiciones**, aunque solamente se ejecutan aquellas cuyo canal tenga una publicación conectada.

## 6. Nivel de confianza

- **Confianza alta:** reglas de canal, comisiones, tipo de cambio, pisos generales por familia y propiedades con historial amplio.
- **Confianza media:** referencias individuales de la mayoría de las unidades; deben recalibrarse semanalmente con nuevas ventas.
- **Confianza baja/provisional:** Sky Eclipse 1409, Sky Elite 528 y cualquier configuración Booking todavía no conectada.

Los pisos constituyen una decisión económica de RentHome y no deben aprenderse o reducirse automáticamente. Las referencias sí pueden recalibrarse a partir de ocupación, reservas, eventos y desempeño observado.

## 7. Siguiente paso propuesto

Después de la aprobación de esta matriz:

1. cargar las 69 políticas en DeptosBO en una sola transacción;
2. añadir las políticas heredadas de Uptown Nuu 10D y la política virtual Booking de Sky Elite 305;
3. dejar sin escritura las políticas cuyos canales todavía no tengan una publicación identificada;
4. ejecutar el motor para los próximos 90 días en modo sombra;
5. revisar fechas ordinarias, fines de semana, Navidad y Año Nuevo antes de autorizar escrituras en las plataformas.

# Descuentos semanales recomendados para Booking.com

Fecha: **18 de noviembre de 2026**
Alcance: reservas de **7 a 13 noches**, dos huéspedes y publicaciones Booking activas.
Estado: **propuesta inicial; no aplicada todavía en Booking**.

## Configuración base

Se recomienda crear una promoción básica con estadía mínima de siete noches y **10 % de descuento** para todas las publicaciones activas. Booking acepta actualmente descuentos de 10 % a 80 % al crear promociones mediante su API.

El 10 % se calcula sobre la tarifa estándar bruta. Antes de publicarlo, el motor debe simular la comisión de Booking, Genius y las tarifas dirigidas que puedan acumularse. El neto final convertido al tipo de cambio vigente nunca puede atravesar el piso de la unidad.

## Matriz propuesta

| Alojamiento | Descuento semanal base | Máximo ordinario de baja demanda | Observación |
|---|---:|---:|---|
| Luxe Suites 104 | **10 %** | 15 % | Sin balcón/vista; puede recibir impulso adicional en abril/mayo. |
| Luxe Suites 113 | **10 %** | 10 % | Balcón y margen más ajustado frente a Genius alto. |
| Luxe Suites 117 | **10 %** | 10 % | Mantener protección de precio. |
| Luxe Suites 204 | **10 %** | 15 % | Sin balcón e inventario flexible. |
| Luxe Suites 205 | **10 %** | 15 % | Sin balcón e inventario flexible. |
| Luxe Suites 316 | **10 %** | 10 % | Balcón; no necesita descuento semanal agresivo permanente. |
| Luxe Suites 406 | **10 %** | 15 % | Sin balcón e inventario flexible. |
| Sky Eclipse 1309 | **10 %** | 10 % | Producto premium. |
| Sky Eclipse 1402 | **10 %** | 10 % | Producto premium e inventario flexible. |
| Sky Eclipse 1409 | — | — | Booking no está conectado como producto independiente. |
| Sky Eclipse 1602 | **10 %** | 10 % | Producto premium. |
| Sky Eclipse 1709 | **10 %** | 10 % | Buen potencial de tarifa. |
| Sky Elite 305 | **10 %** | 15 % | Inventario virtual; hereda la lógica de Sky Elite 329. |
| Sky Elite 329 | **10 %** | 15 % | Sin vista e inventario flexible. |
| Sky Elite 331 | **10 %** | 10 % | Buen historial y máximo dos huéspedes. |
| Sky Elite 406 | **10 %** | 15 % | Puede moverse con mayor intensidad en baja demanda. |
| Sky Elite 523 | **10 %** | 10 % | Balcón y categoría superior. |
| Sky Elite 527 | **10 %** | 15 % | Sin balcón; comparable con 406. |
| Sky Elite 528 | — | — | Aún no existe publicación Booking. |
| Sky Elite 540 | **10 %** | 10 % | Balcón y piso mensual similar a 523. |
| Sky Luxia 112 | **10 %** | 10 % | Balcón y piso mensual alto. |
| Sky Moon 706 | **10 %** | 10 % | Producto premium. |
| Stanza 8B | **10 %** | 10 % | Piso mensual autorizado de Bs 6.500. |
| Uptown Nuu 10D | **10 %** | 15 % | Aplicable solo si la publicación Booking está conectada y activa. |
| Uptown Nuu 12D | **10 %** | 15 % | Conviene captar estadías largas en baja demanda. |

Stanza 5N se excluye porque ya no forma parte del inventario propio de RentHome Departamentos.

## Escenarios de seguridad

Con las referencias brutas actuales, un descuento semanal de 10 %, comisión de Booking de 15 % y una capa Genius de 25 % todavía conserva los pisos normales evaluados. Esto no autoriza la publicación automática: una tarifa móvil, geográfica o de grupo cerrado puede acumularse según la configuración particular de la cuenta.

El 15 % solo se habilita cuando se cumple una de estas condiciones:

1. el escenario exacto de mayor descuento acumulable conserva el piso;
2. la tarifa estándar se eleva antes de activar la promoción; o
3. Booking confirma que la promoción semanal sustituye a la otra promoción aplicable y no se acumula con ella.

Cuando dos promociones de la Promotions API se superponen, Booking indica que normalmente aplica la de mayor descuento. Sin embargo, Genius, tarifas móviles, geográficas y otros grupos cerrados pueden depender de la configuración de acumulación del establecimiento. El agente debe consultar o simular el precio real, no sumar ni descartar capas por su nombre.

## Reglas dinámicas

- Temporada alta, feriados, eventos o poca disponibilidad: desactivar la promoción semanal o mantenerla en 10 % elevando previamente la tarifa base.
- Abril/mayo y alta disponibilidad: permitir 15 % únicamente en las unidades marcadas, previa simulación.
- Último minuto: escoger la promoción con mejor alcance; no agregar otro descuento si Booking ya aplicará una promoción mayor.
- Tres huéspedes: conservar el suplemento de 20 % en todas las bandas de duración donde la capacidad sea de tres personas.
- El piso se valida en bolivianos con el tipo de cambio vigente, después de comisión y descuentos.

## Fuentes oficiales de Booking.com

- Gestión de promociones, descuento permitido y estadía mínima: https://developers.booking.com/connectivity/docs/b_xml-promotions
- Superposición de promociones: https://developers.booking.com/connectivity/docs/con-faq-promotions
- Tarifas y descuentos dirigidos y su posible acumulación: https://developers.booking.com/demand/docs/accommodations/discounts-target

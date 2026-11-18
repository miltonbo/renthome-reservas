# Evaluación de precios mensuales basada en costos

Fecha: **18 de noviembre de 2026**
Tipo de cambio: **USD 1 = Bs 11,75**
Estado: **evaluación comercial preliminar; sus pisos originales fueron reemplazados por la matriz económica de temporada baja**

> **Actualización:** los valores llamados “Piso mensual neto” en este documento eran pisos comerciales conservadores y resultaban demasiado cercanos a referencias de temporada media/alta. Para abril y mayo, la fuente vigente es `PRICING-MONTHLY-LOW-SEASON-FLOORS-2026-11-18.md`, que separa el piso económico de la referencia comercial. En esa matriz Sky Elite 540 queda en Bs 7.150 y Stanza 8B en Bs 6.500 por autorización del propietario.

## 1. Objetivo

Establecer por alojamiento un piso y una referencia mensual que combinen:

1. alquiler mensual;
2. servicios aproximados;
3. mantenimiento;
4. porcentaje de administración o gestión;
5. margen mínimo de contribución;
6. valor de oportunidad e historial comercial.

El precio mensual se expresa como **neto que debe quedar después de la comisión del canal**. Para Airbnb y Booking, el motor calculará hacia atrás la tarifa bruta que debe publicarse para conservar este neto después de comisión y promociones.

## 2. Método provisional

### Orden económico de una reserva

```text
precio bruto pagado por el huésped
− descuentos y comisión de Airbnb/Booking
= neto del canal
− administración o participación de gestión
= monto del operador/propietario
− alquiler, servicios y mantenimiento
= contribución o utilidad operativa
```

Todos los importes llamados **netos** en esta tabla se encuentran en el nivel `neto del canal`: después de comisión y promociones, pero antes de descontar la administración.

### Significado de las columnas

- **Costo mensual usado:** alquiler + servicios + mantenimiento. Puede ser real, estimado desde una unidad comparable o pendiente.
- **Punto de equilibrio:** neto mensual del canal necesario para que, después de administración, quede exactamente el costo mensual. No contiene utilidad.
- **Piso mensual neto:** límite mínimo autorizado para una reserva mensual. Es mayor que el punto de equilibrio porque también protege valor de oportunidad y evita liquidar todo el mes a costo.
- **Referencia mensual neta:** precio objetivo inicial para una reserva que activa la banda mensual desde 28 noches. El agente puede subirlo por demanda o bajarlo hasta el piso mensual, pero no atravesarlo.
- **Referencia por noche:** referencia mensual dividida entre 28 para mostrar el inicio de la banda mensual; sigue siendo un importe neto, no necesariamente el precio bruto mostrado por Airbnb o Booking.
- **Referencia USD/mes:** la misma referencia mensual convertida a USD con el TC 11,75. También es neta; la tarifa publicada en una OTA será mayor para absorber comisión y descuentos.

### Punto de equilibrio económico

```text
punto_equilibrio_mensual = costos_fijos / (1 - administración)
```

- Operación de Milton con distribución administrativa: 20 %.
- Propiedad con contrato `owner_fee`: porcentaje configurado para esa propiedad.
- Operación económica de Deysi: no se descuenta una segunda administración porque Deysi conserva el resultado de su propia operación.

### Piso mensual inicial

```text
piso_mensual = mayor(
  punto_equilibrio_mensual,
  piso_mensual_normalizado_del_mes
)
```

Airbnb activa el descuento mensual desde 28 noches. Para estadías de 28–30 noches se exige el piso mensual completo, porque bloquean prácticamente todo el ciclo mensual y deben cubrir los costos fijos del mes. El valor se inicializa con una referencia equivalente al 90 % del piso normal de 2–7 noches, sin bajar de Bs 230 por noche hasta que RentHome autorice otro piso absoluto. A partir de la noche 31, las noches adicionales se prorratean con la tarifa mensual correspondiente.

### Referencia mensual inicial

```text
referencia_mensual = mayor(
  costos_fijos × 1,20 / (1 - administración),
  piso_mensual × 1,10,
  referencia de mercado o estadía larga comparable
)
```

El 20 % de contribución sobre costos y el margen del 10 % sobre el piso son parámetros iniciales para revisión, no reglas definitivas.

## 3. Imputaciones utilizadas

- Luxe Suites 113: costo estimado Bs 3.830, mediana aproximada de las unidades comparables de Luxe Suites con costos completos.
- Sky Elite 329 y 406: heredan como referencia de costo Sky Elite 331, Bs 4.190.
- Sky Elite 527 y 528: no tienen balcón y heredan Sky Elite 406, con costo de referencia Bs 4.190. Sky Elite 523 conserva una categoría distinta por tener balcón.
- Sky Elite 305: producto virtual de Booking; hereda precio y costo de referencia de Sky Elite 329, pero no se trata como unidad física.
- Sky Elite 540 y Stanza 8B: se conserva el costo de caja real sin alquiler, pero el precio comercial mantiene un valor de oportunidad; no se reduce al simple costo de servicios.
- Uptown Nuu 10D y 12D: no existen costos de edificio cargados. Se usa como evidencia de mercado la estadía vigente de 10D: USD 26,68 por noche durante 30 noches, aproximadamente Bs 9.404 al TC actual.

## 4. Resultado propuesto

| Alojamiento | Costo mensual usado | Fuente | Punto de equilibrio | Piso mensual neto | Referencia mensual neta | Referencia neta por noche (28) | Referencia USD/mes |
|---|---:|---|---:|---:|---:|---:|---:|
| Luxe Suites 104 | Bs 3.690 | Real | Bs 4.612 | Bs 6.900 | **Bs 7.600** | Bs 271 | USD 646,81 |
| Luxe Suites 113 | Bs 3.830 | Estimado Luxe Suites | Bs 4.256 | Bs 7.290 | **Bs 8.000** | Bs 286 | USD 680,85 |
| Luxe Suites 117 | Bs 3.770 | Real | Bs 4.712 | Bs 7.290 | **Bs 8.000** | Bs 286 | USD 680,85 |
| Luxe Suites 204 | Bs 4.190 | Real | Bs 5.238 | Bs 6.900 | **Bs 7.600** | Bs 271 | USD 646,81 |
| Luxe Suites 205 | Bs 3.890 | Real | Bs 4.862 | Bs 6.900 | **Bs 7.600** | Bs 271 | USD 646,81 |
| Luxe Suites 316 | Bs 3.450 | Real | Bs 4.312 | Bs 7.290 | **Bs 8.000** | Bs 286 | USD 680,85 |
| Luxe Suites 406 | Bs 4.100 | Real | Bs 5.125 | Bs 6.900 | **Bs 7.600** | Bs 271 | USD 646,81 |
| Sky Eclipse 1309 | Bs 4.990 | Real | Bs 6.238 | Bs 7.830 | **Bs 8.600** | Bs 307 | USD 731,91 |
| Sky Eclipse 1402 | Bs 4.790 | Real | Bs 5.988 | Bs 8.100 | **Bs 8.900** | Bs 318 | USD 757,45 |
| Sky Eclipse 1409 | Bs 4.590 | Real | Bs 5.738 | Bs 8.100 | **Bs 8.900** | Bs 318 | USD 757,45 |
| Sky Eclipse 1602 | Bs 4.790 | Real | Bs 5.988 | Bs 7.830 | **Bs 8.600** | Bs 307 | USD 731,91 |
| Sky Eclipse 1709 | Bs 4.990 | Real | Bs 6.238 | Bs 7.830 | **Bs 8.600** | Bs 307 | USD 731,91 |
| Sky Elite 305 | Bs 4.190 | Virtual; hereda 329 | Bs 4.190 | Bs 6.900 | **Bs 7.600** | Bs 271 | USD 646,81 |
| Sky Elite 329 | Bs 4.190 | Estimado desde 331 | Bs 4.190 | Bs 6.900 | **Bs 7.600** | Bs 271 | USD 646,81 |
| Sky Elite 331 | Bs 4.190 | Real | Bs 5.238 | Bs 6.900 | **Bs 7.600** | Bs 271 | USD 646,81 |
| Sky Elite 406 | Bs 4.190 | Estimado desde 331 | Bs 4.190 | Bs 6.900 | **Bs 7.600** | Bs 271 | USD 646,81 |
| Sky Elite 523 | Bs 4.750 | Real | Bs 5.938 | Bs 7.560 | **Bs 8.300** | Bs 296 | USD 706,38 |
| Sky Elite 527 | Bs 4.190 | Estimado desde 406 | Bs 4.190 | Bs 6.900 | **Bs 7.600** | Bs 271 | USD 646,81 |
| Sky Elite 528 | Bs 4.190 | Estimado desde 406 | Bs 4.190 | Bs 6.900 | **Bs 7.600** | Bs 271 | USD 646,81 |
| Sky Elite 540 | Bs 970 | Real, sin alquiler | Bs 1.212 | Bs 7.560 | **Bs 8.300** | Bs 296 | USD 706,38 |
| Sky Luxia 112 | Bs 4.750 | Real | Bs 5.938 | Bs 7.290 | **Bs 8.000** | Bs 286 | USD 680,85 |
| Sky Moon 706 | Bs 4.690 | Real | Bs 5.862 | Bs 7.830 | **Bs 8.600** | Bs 307 | USD 731,91 |
| Stanza 8B | Bs 1.040 | Real, sin alquiler | Bs 1.300 | Bs 7.560 | **Bs 8.300** | Bs 296 | USD 706,38 |
| Uptown Nuu 10D | Pendiente | Mercado real 10D | Pendiente | Bs 6.900 | **Bs 9.400** | Bs 336 | USD 800,00 |
| Uptown Nuu 12D | Pendiente | Referencia 10D | Pendiente | Bs 6.900 | **Bs 9.400** | Bs 336 | USD 800,00 |

## 5. Lectura comercial

- El punto de equilibrio no es el precio de venta. En varias unidades el alquiler es bajo o inexistente, pero aceptar ese importe sacrificaría el valor de oportunidad de ocupar todo el mes.
- La referencia mensual es el punto de partida desde 28 noches, que es cuando Airbnb activa el descuento mensual. Puede subir por temporada, eventos, escasez o fuerte demanda.
- El agente puede bajar desde la referencia hacia el piso mensual cuando la anticipación, disponibilidad o duración lo justifiquen.
- La limpieza de una sola rotación se distribuye en la estadía mensual y se contabiliza aparte; no se aplica el recargo de Bs 50 propio de un hueco de una noche.
- Los importes son netos económicos. Airbnb y Booking requerirán una tarifa publicada mayor para absorber comisión y promociones.

### Ejemplo: Luxe Suites 104

```text
Alquiler                         Bs 2.700
Servicios                        Bs   740
Mantenimiento                    Bs   250
Costo mensual                    Bs 3.690

Punto de equilibrio:
Bs 3.690 / 80 %                  Bs 4.612,50

Piso mensual neto                Bs 6.900
Referencia mensual neta          Bs 7.600
Referencia neta por noche (28)   Bs   271
```

Si la reserva directa se vende en Bs 7.600, la administración del 20 % representa Bs 1.520; quedan Bs 6.080 para Milton y, después de Bs 3.690 de costos, la contribución estimada es Bs 2.390.

En Airbnb, Bs 7.600 equivalen a USD 646,81 netos. Con comisión del 15,5 % y un descuento mensual del 20 %, y sin contar la limpieza, la tarifa bruta de calendario necesaria sería aproximadamente USD 956,82 por 28 noches, o USD 34,17 por noche. El motor hará este cálculo con los descuentos realmente activos.

### Caso real: Sky Moon 706, 28 noches

La cotización observada en Airbnb muestra:

```text
Tarifa de habitación antes del descuento     USD 1.059,00
Descuento mensual 20 %                       USD  -211,80
Limpieza                                     USD     8,00
Subtotal sujeto a comisión                   USD   855,20
Comisión de anfitrión 15,5 %                 USD  -132,56
Payout mostrado                              USD   722,64
```

El payout de alojamiento sin considerar la limpieza como ganancia es aproximadamente USD 715,88. El payout total equivale a Bs 8.491,02 y se encuentra entre el piso mensual de Sky Moon —Bs 7.830 / USD 666,38— y la referencia —Bs 8.600 / USD 731,91—. Es una cotización aceptable y muy próxima al objetivo.

### Propiedades operadas económicamente por Deysi

En las propiedades marcadas con `financialOperator = deysi`, DeptosBO no descuenta otra administración del 20 % porque Deysi conserva el resultado económico de su propia operación. Por eso el punto de equilibrio de Sky Elite 527, por ejemplo, coincide con el costo estimado de Bs 4.190. Si RentHome desea tratar igualmente un 20 % como costo de oportunidad interno, el punto de equilibrio contable subiría a Bs 5.238; el piso Bs 6.900 y la referencia Bs 7.600 no cambiarían porque ya son superiores.

## 6. Datos pendientes

1. Costo real de Uptown Nuu 10D y 12D.
2. Confirmar si Luxe Suites 113 debe conservar el modelo de comisión del 10 % para una estadía mensual.
3. Confirmar si el margen inicial deseado sobre costos será 20 % o uno diferente.
4. Confirmar si Bs 230 sigue siendo el piso absoluto incluso para estadías de 28 o más noches.

Hasta confirmar estos cuatro puntos, esta tabla debe utilizarse en modo sombra y no como autorización para publicar automáticamente.

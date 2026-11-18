# Pisos mensuales netos de temporada baja

Fecha de cálculo: **18 de noviembre de 2026**
Tipo de cambio de referencia: **USD 1 = Bs 11,75**
Aplicación: estadías de **28 a 30 noches** en meses de baja demanda, principalmente abril y mayo, sin evento extraordinario.

## Definición definitiva

El **piso mensual neto** es el menor importe que RentHome puede aceptar por el alojamiento de una estadía mensual. Es el dinero que debe quedar después de comisión del canal y de todos los descuentos, pero antes de descontar la participación administrativa interna.

No es el precio de salida ni el precio que se publica directamente en Airbnb o Booking. Octubre, noviembre, diciembre, eventos y períodos de alta ocupación deben cotizarse por encima de este valor.

```text
piso mensual neto = costo fijo mensual × 1,20 / (1 − administración)
```

El resultado se redondea hacia arriba al siguiente múltiplo de Bs 50. De este modo, una vez descontada la administración, queda cubierto el costo mensual y una utilidad mínima cercana al **20 % del costo** para el operador económico.

## Pisos autorizables propuestos

| Alojamiento | Costo usado | Administración | Piso mensual neto | Neto por noche (28) | Equivalente neto USD/mes |
|---|---:|---:|---:|---:|---:|
| Luxe Suites 104 | Bs 3.690 | 20 % | **Bs 5.550** | Bs 198 | USD 472,34 |
| Luxe Suites 113 | Bs 3.830 estimado | 10 % | **Bs 5.150** | Bs 184 | USD 438,30 |
| Luxe Suites 117 | Bs 3.770 | 20 % | **Bs 5.700** | Bs 204 | USD 485,11 |
| Luxe Suites 204 | Bs 4.190 | 20 % | **Bs 6.300** | Bs 225 | USD 536,17 |
| Luxe Suites 205 | Bs 3.890 | 20 % | **Bs 5.850** | Bs 209 | USD 497,87 |
| Luxe Suites 316 | Bs 3.450 | 20 % | **Bs 5.200** | Bs 186 | USD 442,55 |
| Luxe Suites 406 | Bs 4.100 | 20 % | **Bs 6.150** | Bs 220 | USD 523,40 |
| Sky Eclipse 1309 | Bs 4.990 | 20 % | **Bs 7.500** | Bs 268 | USD 638,30 |
| Sky Eclipse 1402 | Bs 4.790 | 20 % | **Bs 7.200** | Bs 257 | USD 612,77 |
| Sky Eclipse 1409 | Bs 4.590 | 20 % | **Bs 6.900** | Bs 246 | USD 587,23 |
| Sky Eclipse 1602 | Bs 4.790 | 20 % | **Bs 7.200** | Bs 257 | USD 612,77 |
| Sky Eclipse 1709 | Bs 4.990 | 20 % | **Bs 7.500** | Bs 268 | USD 638,30 |
| Sky Elite 305 | Bs 4.190, referencia 329 | 0 % | **Bs 5.050** | Bs 180 | USD 429,79 |
| Sky Elite 329 | Bs 4.190 estimado | 0 % | **Bs 5.050** | Bs 180 | USD 429,79 |
| Sky Elite 331 | Bs 4.190 | 20 % | **Bs 6.300** | Bs 225 | USD 536,17 |
| Sky Elite 406 | Bs 4.190 estimado | 0 % | **Bs 5.050** | Bs 180 | USD 429,79 |
| Sky Elite 523 | Bs 4.750 | 20 % | **Bs 7.150** | Bs 255 | USD 608,51 |
| Sky Elite 527 | Bs 4.190, referencia 406 | 0 % | **Bs 5.050** | Bs 180 | USD 429,79 |
| Sky Elite 528 | Bs 4.190, referencia 406 | 0 % | **Bs 5.050** | Bs 180 | USD 429,79 |
| Sky Elite 540 | Bs 4.750, costo de oportunidad 523 | 20 % | **Bs 7.150** | Bs 255 | USD 608,51 |
| Sky Luxia 112 | Bs 4.750 | 20 % | **Bs 7.150** | Bs 255 | USD 608,51 |
| Sky Moon 706 | Bs 4.690 | 20 % | **Bs 7.050** | Bs 252 | USD 600,00 |
| Stanza 8B | Propiedad propia; piso autorizado | 20 % | **Bs 6.500** | Bs 232 | USD 553,19 |
| Uptown Nuu 10D | Bs 4.190 provisional | 15 % | **Bs 5.950** | Bs 212 | USD 506,38 |
| Uptown Nuu 12D | Bs 4.190 provisional | 0 % | **Bs 5.050** | Bs 180 | USD 429,79 |

## Cómo debe utilizarlo el agente

1. El piso se aplica al **neto del alojamiento**, no al bruto visible al huésped. La limpieza se contabiliza por separado y no se usa para fingir que se alcanzó el piso.
2. En una reserva directa, el importe mínimo del alojamiento coincide con el piso de la tabla.
3. En Airbnb y Booking, el motor calcula hacia atrás la tarifa bruta necesaria para que, después de comisión y descuentos acumulados, el neto nunca sea inferior al piso.
4. Para 28 a 30 noches se exige el piso mensual completo. Desde la noche 31, las noches adicionales se prorratean usando la tarifa mensual de la unidad.
5. Este piso solo es una barrera económica. El precio de salida debe ser mayor cuando haya temporada alta, evento, baja disponibilidad, buena anticipación o demanda comprobada.
6. El agente puede acercarse al piso en abril o mayo cuando exista baja demanda, alta disponibilidad y poca anticipación. No debe comenzar automáticamente en el piso.

## Curva de descuentos por duración

Los descuentos semanal, quincenal y mensual no son porcentajes fijos iguales para todo el portafolio. Se derivan del precio neto vigente de una noche normal y del piso mensual de cada unidad.

```text
descuento_mensual_máximo = 1 - piso_mensual / (referencia_neta_diaria × 28)
```

Para construir una curva gradual entre 7 y 28 noches, el motor puede inicializar los límites así:

| Duración | Fracción del descuento mensual máximo |
|---|---:|
| 2–6 noches | 0 % |
| 7 noches | 25 % |
| 14 noches | 50 % |
| 21 noches | 75 % |
| 28 noches | 100 % |

Los valores intermedios se interpolan. Esta curva representa el **máximo permitido en temporada baja**, no el descuento que debe mostrarse siempre. El descuento sugerido comienza más arriba en precio y se profundiza únicamente cuando la demanda, disponibilidad, anticipación y ritmo de reservas lo justifican.

### Ejemplos con tarifa directa de referencia

| Alojamiento | Referencia neta diaria | Piso mensual | Descuento máximo 7 noches | 14 noches | 28 noches |
|---|---:|---:|---:|---:|---:|
| Sky Elite 540 | Bs 320 | Bs 7.150 | 5,0 % | 10,1 % | 20,2 % |
| Stanza 8B | Bs 350 | Bs 6.500 | 8,4 % | 16,8 % | 33,7 % |

En Airbnb y Booking se realiza el mismo cálculo usando la referencia **neta** equivalente, después de convertir moneda y separar comisión. El porcentaje visible en la plataforma puede ser distinto porque Airbnb puede calcular promociones sobre su precio de referencia histórico y Booking puede acumular varias promociones.

## Casos estimados pendientes de costo real

- Luxe Suites 113 conserva un costo estimado de Bs 3.830.
- Sky Elite 329 y 406 usan temporalmente Sky Elite 331; Sky Elite 527 y 528 usan Sky Elite 406 porque no tienen balcón.
- Sky Elite 540 usa el costo de oportunidad de Sky Elite 523. Stanza 8B conserva el piso manual autorizado de Bs 6.500; ambos son propiedad de Milton y no se reducen al costo contable de servicios.
- Uptown Nuu 10D y 12D usan Bs 4.190 provisional hasta cargar alquiler, servicios y mantenimiento reales.

Cuando se confirme cualquiera de estos costos, el sistema debe recalcular el piso con la misma fórmula, registrar la versión anterior y no cambiar reservas ya confirmadas.

# Calibración histórica de precios de RentHome

Fecha del análisis: 13 de noviembre de 2026. Base local de DeptosBO para RentHome Departamentos.

## Cobertura y calidad de los datos

- 334 reservas registradas; 321 confirmadas con información de precio.
- Ventana disponible: 9 de agosto al 5 de diciembre de 2026.
- Canales con precio: 189 directas, 79 Booking y 53 Airbnb.
- Los importes y la duración son consistentes, pero `createdAt` no representa de forma fiable la fecha real de reserva en 231 registros importados. Por ahora no debe utilizarse para aprender anticipación histórica.
- Solo existen tipos de cambio almacenados desde el 28 de octubre de 2026. Las comparaciones anteriores deben realizarse dentro de cada moneda/canal, no mezclando BOB y USD.
- La base todavía no contiene doce meses completos. Navidad, Año Nuevo y Carnaval permanecen como hipótesis conservadoras hasta acumular observaciones.

## Caso verificable: Expocruz 2026

Ventana oficial analizada: 18 al 27 de septiembre de 2026.

- Ocupación aproximada previa: 67,8 %.
- Ocupación durante Expocruz: 87,6 %.
- Ocupación posterior: 68,9 %.
- Airbnb: mediana USD 25,60 antes y USD 28,42 durante el evento, aunque las comparaciones por propiedad muestran una mediana de incremento cercana a 0 %.
- Booking: mediana USD 29,60 antes y USD 34,43 durante; las comparaciones por propiedad muestran incrementos fuertes, pero con solo nueve pares comparables y alta dispersión.
- Directas BOB: mediana Bs 280 antes y Bs 300 durante; los pares comparables muestran una mediana aproximada de +11,6 %.

Conclusión: Expocruz produjo una señal clara de ocupación, pero RentHome no capturó el mismo incremento de tarifa en todos los canales. No corresponde aplicar un único +35 %. El punto inicial prudente es un impacto efectivo cercano a 10 %, que deberá calibrarse por canal al contar con más años.

## Priorización aplicada

- Expocruz: impacto potencial 12 %, confianza económica 80 %; efecto inicial 9,6 %.
- Año Nuevo: 15 % × 80 %; efecto inicial 12 %.
- Navidad: 12 % × 75 %; efecto inicial 9 %.
- Carnaval: 10 % × 70 %; efecto inicial 7 %.
- Feriados ordinarios: efecto inicial aproximado entre 2 % y 4 %.
- Ferias sectoriales: 3 % × 55 %; efecto inicial 1,65 %.
- Congresos: 5 % con confianza económica según la fuente.
- Conciertos y deportes sin información de capacidad: alrededor de 2,5 % efectivo.
- Actividades culturales principalmente locales: alrededor de 0,9 % efectivo.

Estos valores son priors conservadores, no conclusiones definitivas. La existencia confirmada de un evento no implica demanda hotelera.

## Datos que deben acumularse

1. Fecha real de creación de la reserva en Airbnb y Booking.
2. Precio bruto, descuentos, comisión y neto por noche.
3. Huéspedes y duración.
4. Disponibilidad real del portafolio al momento de cada cambio.
5. Precio publicado y precio finalmente vendido.
6. Evento o temporada asociados a cada fecha.
7. Procedencia estimada de asistentes y capacidad del evento cuando exista una fuente confiable.

## Método de aprendizaje futuro

Para cada evento recurrente se comparará el ADR y la ocupación contra días equivalentes por propiedad, canal, día de semana y temporada. El incremento observado se reducirá hacia cero cuando la muestra sea pequeña. Ningún evento nuevo recibirá un aumento alto exclusivamente por pertenecer a una categoría.

La calibración deberá ejecutarse semanalmente y conservar un resumen compacto por familia de evento y canal. No es necesario guardar grandes series duplicadas: las reservas siguen siendo la fuente primaria y el resumen puede almacenarse como configuración agregada.

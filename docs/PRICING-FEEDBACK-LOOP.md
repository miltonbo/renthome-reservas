# Módulo de aprendizaje del agente de precios

Fecha: **18 de noviembre de 2026**
Estado: **implementado localmente; pendiente de desplegar a producción**.

## Objetivo

El motor no aprende de una recomendación por el simple hecho de haberla generado. Aprende únicamente cuando puede cerrar este ciclo:

```text
recomendación → publicación verificada → exposición → reserva o fecha no vendida → resultado → calibración
```

Los pisos económicos, comisiones contractuales, capacidades y reglas operativas no se reducen automáticamente. El aprendizaje solo puede modificar de manera moderada la referencia comercial y, posteriormente, las curvas de duración y promociones.

## Datos implementados

- `PricingDecision`: historial inmutable de propuestas materiales, precio aplicado, contexto y versión del motor.
- `PricingExposure`: intervalo compacto durante el cual un precio estuvo visible para una fecha y canal. Una lectura idéntica extiende el intervalo y no crea filas repetidas.
- `PricingOutcome`: atribución de una reserva real a la exposición y decisión vigentes al reservar.
- `PricingCalibration`: resumen semanal por propiedad, canal y banda de duración.
- `ChannelPerformanceMetric`: métricas agregadas de Airbnb o Booking sin guardar grandes reportes crudos.

La retención elimina propuestas descartadas antiguas después de 180 días, exposiciones cerradas después de 550 días y métricas externas después de dos años. Las decisiones aplicadas y los resultados de reservas se conservan.

## Aprendizaje seguro

La primera calibración compara la venta observada de una propiedad con el conjunto del mismo canal. Exige al menos 14 noches de exposición vencida y reduce el resultado hacia cero mientras la muestra sea pequeña.

```text
ajuste aprendido máximo = ±5 %
```

Este ajuste se suma a las señales de reputación, disponibilidad, anticipación y eventos antes de calcular la tarifa. El piso neto continúa siendo la última barrera y no se altera.

La calibración se ejecuta automáticamente los lunes en la ventana de las 08:00 y también puede lanzarse desde `Administración > Operaciones > Precios > Aprendizaje de decisiones`.

## Airbnb

Airbnb ofrece, para anfitriones con herramientas profesionales, el panel `Insights > Performance > Conversion`. La fuente oficial confirma que incluye:

- impresiones en búsqueda y primera página;
- visitas a la publicación;
- conversión de búsqueda a publicación;
- conversión de publicación a reserva;
- anticipación promedio;
- huéspedes recurrentes;
- visualizaciones y adiciones a favoritos;
- comparación con anuncios similares.

Fuente oficial: https://www.airbnb.com/help/article/2714

No se encontró una API pública de anfitrión documentada para extraer estas métricas directamente. La integración inicial debe leerlas mediante el trabajador autenticado de Chrome y enviarlas en `performanceMetrics`. Si Airbnb habilita una API oficial para la cuenta, se priorizará sobre la lectura del navegador.

## Booking.com

Booking ofrece la **Market Insights API** para proveedores de conectividad. Incluye:

- demanda regional y duración buscada;
- ventana de búsqueda y reserva;
- países de origen;
- ritmo de reservas futuras y revenue forecast;
- habitaciones vendidas, ingresos y ADR;
- comparación contra año anterior, grupo comparable, competitive set o mercado.

Fuentes oficiales:

- https://developers.booking.com/connectivity/docs/market-insights-api/understanding-the-market-insights-api
- https://developers.booking.com/connectivity/docs/market-insights-api/managing-market-insights-demand-data

La propiedad debe conceder el permiso adicional **Performance data and insights**. Booking solicita consultar estos reportes bajo demanda y desaconseja precargarlos masivamente. DeptosBO almacena únicamente los agregados necesarios.

## Limitaciones actuales

- Las reservas históricas importadas pueden tener `createdAt` posterior a la fecha real de reserva. Se guardan con atribución `imported` y no se consideran equivalentes a una exposición exacta.
- Sin impresiones ni vistas, DeptosBO aprende del ritmo de ocupación, pero no puede medir la conversión completa.
- El ajuste general utiliza fechas de alojamiento vencidas. Las bandas semanal, extendida y mensual acumulan ADR y muestras, pero todavía no modifican automáticamente promociones hasta alcanzar evidencia suficiente.
- Toda promoción sigue requiriendo la simulación del payout más desfavorable antes de publicarse.

## Próxima conexión operativa

1. Ampliar el trabajador de Chrome para leer semanalmente Airbnb Insights.
2. Solicitar o confirmar acceso de DeptosBO como proveedor y permiso de Booking `Performance data and insights`.
3. Si el permiso de API no está disponible, leer temporalmente los reportes del Extranet mediante Chrome.
4. Comparar durante varias semanas las métricas externas con las reservas internas antes de permitir que afecten la tarifa.

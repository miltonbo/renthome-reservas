# Agente de precios de RentHome — Fase 2

La Fase 2 convierte el esquema de precios en un motor de recomendaciones en **modo sombra**. Calcula y muestra valores, pero no escribe precios ni promociones en Airbnb o Booking.

## Configuración

La pantalla `Administración → Operaciones → Agente de precios` permite:

- definir el piso neto y una referencia inicial por propiedad y canal;
- usar la comisión fija del canal: Directas 0 %, Airbnb 15,5 % y Booking 15 % para RentHome;
- mantener la ocupación base de dos personas y el tercer huésped en +20 %;
- configurar Genius, móvil, país, último minuto, semanal y mensual;
- marcar promociones acumulables;
- sincronizar automáticamente los feriados recurrentes de Bolivia y la efeméride de Santa Cruz;
- consultar comunicados del Ministerio de Trabajo, el calendario municipal de Cultura y Turismo —incluida la Larga Noche de Museos cuando sea publicada—, Fexpocruz y SuperTicket Santa Cruz;
- mostrar la disponibilidad de cada fuente y separar las señales en feriados, ferias/congresos, conciertos, cultura, deportes y otras;
- registrar manualmente únicamente correcciones o eventos especiales con impacto y confianza;
- ejecutar manualmente el cálculo de los próximos 90 días.

No se crean políticas automáticamente con valores supuestos. Una propiedad empieza a generar recomendaciones solamente después de guardar al menos una política verificada.

La moneda publicada queda fijada por el canal: reservas directas en BOB; Airbnb y Booking en USD. En Booking el piso puede guardarse en BOB y se convierte a USD con el TC oficial vigente en cada cálculo. El sistema nunca envía un precio BOB a Airbnb o Booking.

La referencia corresponde al precio inicial **por noche** para uno o dos huéspedes y estadías normales de 2 a 6 noches. No es un total de dos noches ni un precio máximo. Los descuentos semanal y mensual se calculan aparte y siguen sujetos al mismo piso neto.

No existe un techo automático. Si la demanda, escasez, un feriado o un evento justifican Bs 500, Bs 1.000 o un precio superior, el agente puede recomendarlo. Tampoco existe un “descuento máximo autorizado”: se consideran los descuentos realmente activos y se aumenta el bruto cuanto sea necesario para conservar el piso neto.

En reservas directas no se muestra ni se aplica comisión de canal. Airbnb usa automáticamente 15,5 % y Booking 15 % para RentHome.

Cuando se habilita una sola noche por un hueco entre reservas —o la noche de hoy antes de un ingreso mañana— el piso efectivo de todos los canales aumenta **Bs 50** para cubrir la limpieza adicional. Una noche futura aislada antes de una reserva no se clasifica automáticamente como hueco, evitando abrir estadías de una noche que RentHome no desea priorizar.

Comisión y promociones se aplican de forma secuencial. Por ejemplo, USD 40 con 10 % de promoción y 15 % de comisión deja aproximadamente USD 30,60 netos (`40 × 0,90 × 0,85`). El motor despeja el precio bruto necesario a partir del piso; no recorta el piso para poder ofrecer un descuento. En Booking solo se combinan las promociones marcadas como acumulables; en Airbnb se respeta la prioridad de la plataforma entre descuentos principales, y las ofertas semanal/mensual de Directas son alternativas según la duración.

En Airbnb las promociones personalizadas no toman simplemente el precio actual del calendario. Airbnb calcula un precio de referencia usando la mediana de cada noche durante los últimos 60 días y puede limitar la promoción por el precio más alto reservado durante el último año. Por ello, antes de activar una promoción, el adaptador de escritura deberá leer la vista previa final de Airbnb y rechazarla si el neto resultante cruza el piso. Cambiar hoy el calendario no altera inmediatamente esa mediana.

Fuentes oficiales de estas reglas: [tarifa única de Airbnb](https://www.airbnb.com/resources/hosting-homes/a/simplifying-airbnb-service-fees-746), [promociones personalizadas y mediana de 60 días](https://www.airbnb.com/help/article/2719), [combinación y prioridad de descuentos](https://www.airbnb.com/resources/hosting-homes/a/combining-discounts-and-rule-sets-694) y [términos contractuales de Booking](https://admin.booking.com/hotelreg/terms-and-conditions.html?cc1=gb&lang=en).

## Motor de recomendaciones

Cada fecha combina:

- día de la semana;
- anticipación;
- proporción disponible del portafolio;
- reservas confirmadas y bloqueos sincronizados;
- impacto ponderado de eventos (`impacto potencial × confianza económica`);
- comisión del canal;
- promociones activas y acumulables;
- tipo de cambio oficial almacenado;
- piso y referencia configurados.

También carga una base de conocimiento compacta por alojamiento con edificio,
segmento, balcón, vista, fortaleza del historial por canal, conteo semanal de
reseñas, prioridad de rotación, grupo comparable e inventario flexible de Booking.
La disponibilidad del portafolio se combina con la disponibilidad del edificio o
grupo comparable; esta última tiene un peso moderado para distinguir abundancia en
una familia de departamentos de escasez en otra.

El historial consolidado permite proteger mejor el precio en el canal
correspondiente, mientras una publicación nueva puede comenzar con un ajuste
conservador. Balcón, vista y prioridad de rotación agregan correcciones pequeñas y
explícitas: nunca sustituyen el piso ni la referencia configurada.

En Booking, los perfiles marcados con inventario flexible cuentan las unidades
vendibles en lugar de tratar la publicación como una única habitación. Esto permite
representar publicaciones que RentHome puede atender con unidades equivalentes sin
trasladar esa misma lógica a Airbnb.

La urgencia de una vacante para hoy aumenta durante el día: la mañana es
conservadora, el mediodía reduce más y la ventana de las 17:00 puede ser más
agresiva. Las promociones de último minuto solo se consideran dentro de su ventana
de anticipación; las semanales, mensuales y de publicación nueva se protegen en el
cálculo del bruto correspondiente.

La disponibilidad alta no autoriza liquidar prematuramente fechas lejanas. Desde
30 días antes, una noche ordinaria no baja de la referencia configurada; entre 14
y 29 días puede aplicarse como máximo una reducción inicial de 5 % sobre esa
referencia. Al acercarse la llegada, el motor recupera gradualmente la libertad de
bajar hacia el piso según ocupación y hora del día.

Los feriados se modelan como ventanas reales de alojamiento, no solamente como el
día que figura en el calendario civil. Navidad cubre 24–25 de diciembre y Año Nuevo
cubre 30 de diciembre–1 de enero. Mientras falten al menos siete días, el incremento
ponderado del evento funciona como mínimo sobre la referencia y no puede ser
anulado por alta disponibilidad, prioridad de rotación o poco historial del anuncio.

El piso neto prevalece sobre cualquier promoción. Si comisión y descuentos reducen el neto, el motor eleva el precio bruto necesario; no existe un techo que impida aprovechar demanda excepcional.

Las fuentes externas se consultan de forma tolerante a fallos: si una no responde, las demás y el calendario recurrente continúan funcionando. Una confirmación oficial de un feriado no se suma otra vez al mismo feriado recurrente; se conserva el impacto ponderado más fuerte. Eventos independientes que coinciden en una fecha sí pueden acumularse, con un límite de seguridad de +100 %.

La confirmación de que un evento existe se expresa mediante su estado y su fuente verificada. La confianza porcentual es específicamente **económica**: mide cuánta evidencia existe de que el evento genera pernoctaciones para RentHome. Por tanto, una feria confirmada puede tener confianza económica baja. Los eventos sectoriales nuevos parten con ajustes conservadores; los incrementos altos se reservan para eventos mayores o para patrones respaldados por reservas históricas.

## Frecuencia

El cron existente calcula 90 días tres veces al día, a las 08:00, 12:00 y 17:00 de Bolivia. Cada ventana es idempotente aunque el cron general se ejecute cada diez minutos. También puede ejecutarse manualmente desde la pantalla del agente.

## Calendario maestro

Las noches disponibles muestran la recomendación directa en bolivianos. Al pasar el cursor se muestran el piso y las razones principales. Las fechas ocupadas conservan la recomendación en la base para análisis, pero no muestran el valor encima de la reserva.

## Sincronización de Booking

La sección Booking incorpora el botón `Sincronizar Booking`. El endpoint recibe el filtro `platform=booking`, lo combina con las propiedades accesibles del usuario y descarga solamente esos feeds. No sincroniza Airbnb, Vrbo ni calendarios de otros usuarios.

## Preparación del trabajador de navegador

DeptosBO dispone de una cola independiente para Airbnb y Booking. Cada ventana
de precios programa una ejecución dinámica y los lunes a las 08:00 programa
además la actualización semanal del perfil. El trabajador se autentica con
`PRICING_WORKER_TOKEN`, reclama una ejecución y entrega una instantánea con:

- identificadores externos del anuncio, habitación y plan tarifario;
- estado de la sesión;
- reseñas y calificación;
- promociones realmente activas;
- precio, estadía mínima e inventario observados por fecha.

DeptosBO actualiza una sola fila vigente por propiedad, canal y fecha, recalcula
90 días y devuelve únicamente las fechas distintas. Después de la escritura, el
trabajador debe leer nuevamente la plataforma y reportar `verified`, `mismatch`
o `failed`. Airbnb y Booking fallan de manera independiente; una sesión vencida
en un canal no bloquea el otro.

La pantalla muestra conexiones, último resultado y errores. Las reseñas y
calificaciones son de solo lectura porque deben venir del trabajador, no de una
carga manual cotidiana. El contrato completo está en
`docs/PRICING-BROWSER-WORKER.md`.

## Límite de esta fase

`PricingChange` sigue vacío mientras las recomendaciones no se ejecuten en una
plataforma. El protocolo, la cola, la persistencia y la verificación de Fase 3
ya están preparados; falta conectar el adaptador que opera la interfaz real de
Chrome antes de habilitar escrituras desatendidas.

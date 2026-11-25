# Guía de Kioto · 11–15 diciembre 2026

Web estática en español, preparada para GitHub Pages. No necesita backend ni proceso de compilación.

## Versión

La esquina inferior derecha muestra **GUÍA · V6**. Comprueba esa etiqueta después de publicar para confirmar que estás viendo esta versión. El identificador también está en el metadato HTML `guide-version`. La leyenda de colores se muestra ahora justo debajo de los filtros y antes del mapa; aparece desplegada inicialmente y se puede plegar.

## Publicar en GitHub Pages

1. Sube `index.html`, `kyoto-points.kml`, `README.md` y `.nojekyll` a la raíz del repositorio.
2. En GitHub, abre **Settings → Pages**.
3. Selecciona **Deploy from a branch**, rama `main` y carpeta `/ (root)`.
4. Cuando termine el despliegue, comparte `https://TU-USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/`.

## Uso durante el viaje

La web es la interfaz principal. No hace falta importar el KML ni abrir Google Earth o Google My Maps.

1. Abre la URL HTTPS de GitHub Pages en Safari (iPhone) o Chrome (Android).
2. Entra en **Mapa** y filtra por día o muestra todos los puntos.
3. Pulsa **Mi ubicación** para obtener una posición GPS puntual. El navegador pedirá permiso si todavía no lo has concedido.
4. Pulsa **Seguir ubicación** para actualizar la posición mientras caminas. Pulsa **Detener seguimiento** para dejar de consultar el GPS.
5. La lista lateral muestra los siete puntos visibles más cercanos, por distancia en línea recta. Cada uno tiene un enlace para abrir la navegación de Google Maps.
6. Consulta la leyenda plegable, situada inmediatamente debajo de los filtros y antes del mapa, para identificar los colores de los marcadores.

La posición se procesa en el navegador, no se almacena ni se envía a un servidor. El seguimiento continuo solo funciona mientras la página esté abierta y el usuario lo mantenga activado; el navegador o el sistema operativo pueden limitar la ubicación en segundo plano.

## Compatibilidad móvil

La Geolocation API está ampliamente disponible en navegadores modernos, incluidos Safari en iOS y Chrome en Android. Requiere HTTPS y permiso explícito del usuario. En el teléfono también deben estar habilitados los servicios de localización y el permiso de ubicación para el navegador. Si la página se abre dentro de un navegador integrado de otra aplicación y la ubicación falla, ábrela directamente en Safari o Chrome.

## Mapa y dependencias

El mapa usa Leaflet y cartografía de OpenStreetMap, cargados desde internet. Requiere conexión de datos. Desde cada marcador hay enlaces a Google Maps para consultar el lugar y obtener indicaciones. Si Google Maps está instalado, el sistema puede abrir la aplicación; si no, se abrirá la web.

La leyenda plegable situada antes del mapa explica los colores: rojo (itinerario), dorado (eventos), verde (alternativas), azul oscuro (hotel), azul (posición actual) y círculo azul claro (precisión estimada del GPS).

Algunos puntos alternativos y la ubicación del Centro Cultural Tōbu son aproximados. Los marcadores sirven para orientarse; abre Google Maps desde cada ficha antes de iniciar el trayecto.

## KML opcional

`kyoto-points.kml` es una exportación separada con los puntos de interés. No es necesario para utilizar la web. Consérvalo como copia reutilizable para otras aplicaciones de mapas o para importarlo manualmente en Google Earth/My Maps.

Si editas los puntos del array `kyotoPoints` en `index.html`, recuerda actualizar también el KML para mantener ambos ficheros sincronizados.

## Editar y compartir

Edita `index.html` para cambiar horarios, enlaces o presentación. La lista de marcadores está definida en el array `kyotoPoints` del JavaScript. Comparte la URL pública de GitHub Pages con el grupo; todos verán la versión publicada más reciente.

El botón **Imprimir / guardar PDF** abre el diálogo de impresión del navegador.

## Fuentes oficiales para los eventos del 14 de diciembre

- [Kyoto City Tourism Navi · Yamashina Gishi Matsuri](https://ja.kyoto.travel/event/single.php?event_id=2335): 14 de diciembre de 2026, 10:00–15:00.
- [Asociación Kanken · Kanji del Año](https://www.kanken.or.jp/kotoshinokanji/): anuncio del 14 de diciembre en Kiyomizu-dera.
- [FAQ de Kanken](https://www.kanken.or.jp/kotoshinokanji/faq-contact/): el público no puede acceder al lugar de la caligrafía.


## Sección gastronómica y colores del mapa (V6)

- Nueva pestaña **Comer** con especialidades de Kioto, filtros y enlaces directos a Google Maps.
- Los puntos del mapa usan un color distinto por jornada (11, 12, 13 y 14 de diciembre).
- Los lugares alternativos se colorean por categoría: templos, barrios, naturaleza y cultura.
- El hotel mantiene un color propio; la ubicación GPS y su círculo de precisión conservan el azul.
- `kyoto-points.kml` se mantiene como exportación independiente.

Para publicar, sustituye `index.html`, `README.md` y `kyoto-points.kml` en la raíz del repositorio y ejecuta `git add index.html README.md kyoto-points.kml && git commit -m "Add Kyoto food guide and day-based map colors" && git push`.


## Directorio gastronómico y filtros por jornada (V6)

- La pestaña **Comer** contiene 20 paradas gastronómicas agrupadas por las zonas y jornadas del viaje.
- Hay filtros independientes por día y tipo de cocina para elegir sobre la marcha.
- Cada ficha abre el lugar directamente en Google Maps; no es necesario importar el KML.
- Las especialidades locales incluyen obanzai, yudofu/yuba, nishin soba, saba-zushi, matcha, shojin-ryori y platos de temporada.
- Los puntos del mapa mantienen un color por jornada: 11 (coral), 12 (azul), 13 (verde azulado) y 14 (violeta). Los puntos alternativos utilizan una paleta propia por categoría. El hotel y la ubicación GPS conservan colores independientes.

Los horarios y disponibilidad de los restaurantes deben volver a comprobarse antes del viaje. Las recomendaciones son opciones cercanas a los barrios del itinerario, no un plan de comidas obligatorio.


## Mapa gastronómico y filtros (V6)

- Los 20 restaurantes y paradas gastronómicas de la pestaña **Comer** también aparecen como marcadores en el mapa.
- Se representan con diamantes; los círculos siguen representando visitas, eventos, hotel y lugares alternativos.
- El color de cada restaurante corresponde a su jornada: 11 (coral), 12 (azul), 13 (verde azulado) y 14 (violeta).
- Hay dos filtros independientes: por jornada y por tipo de punto (**Todos los puntos**, **Solo visitas**, **Solo restaurantes**). Se pueden combinar; por ejemplo, 12 dic + Solo restaurantes.
- La lista de lugares cercanos respeta ambos filtros. Al seleccionar un resultado cercano, la guía activa los filtros necesarios para mostrar su marcador.
- Los marcadores gastronómicos tienen coordenadas orientativas para facilitar la exploración. El popup abre una búsqueda del establecimiento en Google Maps para comprobar la entrada y navegar.
- El KML opcional también incluye una carpeta con los 20 lugares gastronómicos.

Para publicar V6, sustituye `index.html`, `README.md`, `kyoto-points.kml` y `.nojekyll` en la raíz del repositorio.

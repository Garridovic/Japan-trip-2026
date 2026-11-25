# Guía de Kioto · 11–15 diciembre 2026

Web estática en español, preparada para GitHub Pages. No necesita backend ni proceso de compilación.

## Identificador de versión

La esquina inferior derecha de la web muestra **GUÍA · V2**. Comprueba esa etiqueta después de publicar para confirmar que estás viendo esta versión. El valor también está indicado en el metadato HTML `guide-version`.

## Publicar en GitHub Pages

1. Sube `index.html`, `kyoto-points.kml` y `README.md` a la raíz del repositorio.
2. En GitHub, abre **Settings → Pages**.
3. Selecciona **Deploy from a branch**, rama `main` y carpeta `/ (root)`.
4. Cuando el despliegue termine, comparte `https://TU-USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/`.

## Cómo usar la guía durante el viaje

La web es la interfaz principal; **no hace falta importar el KML ni abrir Google Earth o My Maps**.

1. Abre la web desde el móvil usando la URL HTTPS de GitHub Pages.
2. Entra en **Mapa** y filtra por día o muestra todos los puntos.
3. Pulsa **Encontrar lugares cerca de mí** y acepta el permiso de ubicación del navegador.
4. La web ordenará los lugares visibles por distancia en línea recta. Pulsa un lugar para centrarlo en el mapa o usa **Cómo llegar con Google Maps** para abrir la navegación.
5. También puedes tocar cualquier marcador del mapa para abrir su ficha en Google Maps o iniciar una ruta.

La ubicación del dispositivo se procesa en el navegador, no se almacena ni se envía a un servidor. Para que la geolocalización funcione, el sitio debe abrirse por HTTPS y el usuario debe conceder permiso. Si no deseas compartir ubicación, el mapa y los enlaces individuales a Google Maps siguen funcionando.

## Mapa y dependencias

El mapa web usa Leaflet y cartografía de OpenStreetMap, cargados desde internet. Requiere conexión de datos. Desde cada marcador hay enlaces a Google Maps para consultar el lugar y obtener indicaciones. La aplicación de Google Maps puede abrirse si está instalada; en caso contrario, se abrirá su versión web.

Algunos puntos alternativos y la ubicación del Centro Cultural Tōbu son aproximados. Los marcadores sirven para orientarse; abre Google Maps desde cada ficha antes de iniciar el trayecto.

## KML opcional

`kyoto-points.kml` es una exportación separada con los puntos de interés. No es necesario para utilizar la web. Consérvalo como copia reutilizable para otras aplicaciones de mapas o para importarlo manualmente en Google Earth/My Maps si alguna vez lo necesitas.

Si editas los puntos del array `kyotoPoints` en `index.html`, recuerda actualizar también el KML para mantener ambos ficheros sincronizados.

## Editar y compartir

Edita `index.html` para cambiar horarios, enlaces o la presentación. La lista de marcadores está definida en el array `kyotoPoints` del JavaScript. Comparte la URL pública de GitHub Pages con el grupo; todos verán la versión publicada más reciente.

El botón **Imprimir / guardar PDF** abre el diálogo de impresión del navegador.

## Fuentes oficiales para los eventos del 14 de diciembre

- [Kyoto City Tourism Navi · Yamashina Gishi Matsuri](https://ja.kyoto.travel/event/single.php?event_id=2335): 14 de diciembre de 2026, 10:00–15:00, del templo Bishamondō a Ōishi Jinja, con actuaciones en el Centro Cultural Tōbu.
- [Asociación Kanken · Kanji del Año](https://www.kanken.or.jp/kotoshinokanji/): anuncio del 14 de diciembre en Kiyomizu-dera.
- [FAQ de Kanken](https://www.kanken.or.jp/kotoshinokanji/faq-contact/): el público no puede acceder al lugar de la caligrafía.

Los horarios del desfile entre paradas son orientativos salvo que se indique fuente oficial; comprueba la información definitiva antes del viaje.

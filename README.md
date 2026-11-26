# Kyoto Guide · GitHub Pages

Guía estática para el viaje a Kioto (11–15 diciembre 2026). No requiere servidor, build ni dependencias locales. GitHub Pages sirve directamente los archivos.

## Estructura

- `index.html`: interfaz y estructura de la guía.
- `assets/styles.css`: estilos.
- `data/places.json`: hotel, visitas, eventos y lugares alternativos del mapa.
- `data/restaurants.json`: los 20 establecimientos gastronómicos y sus marcadores.
- `data/itinerary.json`: resumen estructurado de las jornadas (referencia editable; el texto editorial detallado del itinerario sigue en `index.html`).
- `data/details.json`: descripciones ampliadas, galerías, enlaces de llegada y audioguías cuando hay recursos identificados.
- `data/events.json`: recorrido y planificación del Yamashina Gishi Matsuri, separando horarios oficiales de estimaciones.
- `data/version.json`: versión visible en la esquina de la web.
- `kyoto-points.kml`: exportación independiente para otras aplicaciones cartográficas.

## Cambios habituales desde el iPhone

1. Abre el repositorio en Safari: https://github.com/Garridovic/Japan-trip-2026
2. Entra en `data/places.json` o `data/restaurants.json`.
3. Pulsa el lápiz **Edit**.
4. Modifica el JSON sin borrar comas, llaves ni corchetes. Mantén los campos `id` únicos.
5. Pulsa **Commit changes**. GitHub Pages publicará el cambio automáticamente.
6. Recarga la guía. Si ves datos antiguos, prueba una recarga completa o añade `?refresh=1` a la URL.

### Añadir un restaurante

Copia un objeto existente de `data/restaurants.json`, pégalo dentro del array y cambia al menos `id`, `name`, `lat`, `lng`, `day`, `foodCategory`, `desc` y `query`. Usa `day` igual a `11`, `12`, `13` o `14`. Las coordenadas son latitud (`lat`) y longitud (`lng`).

### Añadir un punto de interés

Añade un objeto en `data/places.json`. Para visitas usa `type: "itinerary"`; para eventos `type: "event"`; para alternativas `type: "alternative"` y un `altCategory` como `templos`, `barrios`, `naturaleza` o `cultura`. El hotel usa `type: "hotel"`.

### Cambiar la versión

Edita `data/version.json`, por ejemplo `{"version":"V7.1","updated":"2026-12-12"}`. El indicador inferior derecho se actualiza leyendo ese archivo, sin modificar el HTML.

## Cambios funcionales

Para cambiar el comportamiento del mapa, GPS, filtros o diseño, edita `index.html` y/o `assets/styles.css`. Para estos cambios puedes usar el editor web de GitHub o https://github.dev/Garridovic/Japan-trip-2026.

## Publicación

GitHub → Settings → Pages → **Deploy from a branch** → `main` → `/ (root)`. Cada commit en `main` se publica automáticamente.

## Validación local opcional

No abras `index.html` mediante `file://`, porque el navegador bloquea `fetch()` de JSON local. Usa GitHub Pages o un servidor local estático.

## Fichas de detalle (V8)

Los marcadores del mapa y la lista de lugares cercanos abren fichas con galería, descripción y enlaces de Google Maps (búsqueda, transporte público y a pie). Los enlaces de audioguía se muestran como catálogos externos cuando no hay una pista individual verificada en español. El evento Yamashina Gishi Matsuri incluye salida, paradas y final; el horario global 10:00–15:00 procede de Kyoto City, mientras que los horarios intermedios se identifican como aproximados. No se dibuja una ruta peatonal exacta no verificada.

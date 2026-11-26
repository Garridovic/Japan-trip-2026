(async () => {
      const [kyotoPoints, restaurantPoints, poiDetails, eventPlan] = await Promise.all([
        fetch('data/places.json').then((response) => {
          if (!response.ok) throw new Error('Failed to load data/places.json');
          return response.json();
        }),
        fetch('data/restaurants.json').then((response) => {
          if (!response.ok) throw new Error('Failed to load data/restaurants.json');
          return response.json();
        }),
        fetch('data/details.json').then((response) => { if (!response.ok) throw new Error('Failed to load data/details.json'); return response.json(); }),
        fetch('data/events.json').then((response) => { if (!response.ok) throw new Error('Failed to load data/events.json'); return response.json(); })
      ]);
      kyotoPoints.push(...restaurantPoints);
      const detailById = new Map(poiDetails.map((item) => [item.id,item]));
      const poiModal = document.getElementById('poi-modal');
      const poiPhoto = document.getElementById('poi-photo');
      let activePhotos = [];
      let activePhotoIndex = 0;
      let previousFocus = null;
      function renderPhoto() {
        const photo = activePhotos[activePhotoIndex];
        poiPhoto.classList.remove('is-fallback');
        poiPhoto.src = photo || '';
        poiPhoto.alt = photo ? 'Fotografía del lugar' : 'Fotografía no disponible';
        poiPhoto.onerror = () => { poiPhoto.classList.add('is-fallback'); };
        document.getElementById('poi-photo-count').textContent = activePhotos.length ? `${activePhotoIndex + 1} / ${activePhotos.length}` : 'Foto no disponible';
        document.getElementById('poi-photo-prev').hidden = activePhotos.length < 2;
        document.getElementById('poi-photo-next').hidden = activePhotos.length < 2;
      }
      function closeDetail() {
        poiModal.hidden = true;
        poiModal.setAttribute('aria-hidden','true');
        document.body.style.overflow = '';
        if (previousFocus && previousFocus.focus) previousFocus.focus();
      }
      document.querySelectorAll('[data-close-detail]').forEach((button) => button.addEventListener('click',closeDetail));
      document.addEventListener('keydown',(event) => { if (event.key === 'Escape' && !poiModal.hidden) closeDetail(); });
      document.getElementById('poi-photo-prev').addEventListener('click',() => { activePhotoIndex = (activePhotoIndex - 1 + activePhotos.length) % activePhotos.length; renderPhoto(); });
      document.getElementById('poi-photo-next').addEventListener('click',() => { activePhotoIndex = (activePhotoIndex + 1) % activePhotos.length; renderPhoto(); });
      function openDetail(pointId) {
        const point = kyotoPoints.find((item) => item.id === pointId);
        if (!point || point.type === 'restaurant') return;
        const detail = detailById.get(pointId) || {};
        previousFocus = document.activeElement;
        document.getElementById('poi-title').textContent = point.name;
        document.getElementById('poi-description').textContent = detail.description || point.desc || '';
        activePhotos = Array.isArray(detail.photos) ? detail.photos : [];
        activePhotoIndex = 0;
        renderPhoto();
        const directions = document.getElementById('poi-directions');
        directions.replaceChildren();
        const directionLinks = detail.directions || {};
        [['search','Ver ubicación'],['transit','Transporte público'],['walking','A pie']].forEach(([key,label]) => {
          if (!directionLinks[key]) return;
          const link = document.createElement('a'); link.href = directionLinks[key]; link.target = '_blank'; link.rel = 'noopener'; link.textContent = label; directions.appendChild(link);
        });
        const audioSection = document.getElementById('poi-audio-section');
        const audioLinks = document.getElementById('poi-audio-links');
        audioLinks.replaceChildren();
        const guides = detail.audioGuides || [];
        audioSection.hidden = guides.length === 0;
        guides.forEach((guide) => {
          const paragraph = document.createElement('p'); paragraph.textContent = guide.note || '';
          const link = document.createElement('a'); link.href = guide.url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = guide.label;
          audioLinks.append(paragraph,link);
        });
        const eventSection = document.getElementById('poi-event');
        eventSection.hidden = point.type !== 'event';
        eventSection.replaceChildren();
        if (point.type === 'event') {
          const heading = document.createElement('h3'); heading.textContent = `${eventPlan.title} · ${eventPlan.date}`;
          const intro = document.createElement('p'); intro.textContent = `Horario oficial del festival: ${eventPlan.officialHours}. Recomendación: llegar a ${eventPlan.recommendedArrival} a ${eventPlan.start} para buscar sitio antes de la salida.`;
          const list = document.createElement('ol');
          eventPlan.routeStops.forEach((stop) => {
            const item = document.createElement('li');
            const strong = document.createElement('strong'); strong.textContent = `${stop.time} · ${stop.name}`;
            const note = document.createElement('span'); note.textContent = stop.note;
            item.append(strong,note); list.appendChild(item);
          });
          const routeLink = document.createElement('a'); routeLink.href = eventPlan.routeUrl; routeLink.target = '_blank'; routeLink.rel = 'noopener'; routeLink.textContent = 'Ver recorrido y paradas en Google Maps';
          const source = document.createElement('p'); source.textContent = eventPlan.note;
          const official = document.createElement('a'); official.href = eventPlan.officialSource; official.target = '_blank'; official.rel = 'noopener'; official.textContent = 'Programa oficial de Kyoto City';
          eventSection.append(heading,intro,list,routeLink,source,official);
        }
        poiModal.hidden = false;
        poiModal.setAttribute('aria-hidden','false');
        document.body.style.overflow = 'hidden';
        document.querySelector('.poi-back').focus();
      }
      window.openPoiDetail = openDetail;


    const dayMarkerColors = { '11':'#c45a4a' , '12':'#3f70a5', '13':'#268577', '14':'#8554a4' };
    const alternativeMarkerColors = { templos:'#bd8a9d', barrios:'#c58b44', naturaleza:'#78a47d', cultura:'#7887a6' };
    const hotelMarkerColor = '#273d70';
    function markerColorForPoint(point) {
      if (point.type === 'hotel') return hotelMarkerColor;
      if (point.day === 'extra') return alternativeMarkerColors[point.altCategory] || alternativeMarkerColors.cultura;
      const primaryDay = String(point.day).split(',')[0];
      return dayMarkerColors[primaryDay] || '#64748b';
    }
    const map = L.map('kyoto-map', {scrollWheelZoom:false}).setView([35.005,135.765],12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:19,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }).addTo(map);

    const markerById = new Map();
    const markerLayer = L.featureGroup().addTo(map);
    kyotoPoints.forEach((point) => {
      const marker = point.type === 'restaurant'
        ? L.marker([point.lat,point.lng], {
            icon:L.divIcon({
              className:'restaurant-map-marker',
              html:`<span style="--marker-color:${markerColorForPoint(point)}" aria-hidden="true"></span>`,
              iconSize:[20,20],
              iconAnchor:[10,10]
            }),
            zIndexOffset:250
          })
        : L.circleMarker([point.lat,point.lng], {
            radius: point.type === 'hotel' ? 9 : point.type === 'event' ? 8 : 7,
            color:'#fff', weight:2, fillColor:markerColorForPoint(point), fillOpacity:.95
          });
      const googleSearch = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point.query + ', Kyoto, Japan')}`;
      const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(point.query + ', Kyoto, Japan')}&travelmode=transit`;
      const markerNote = point.type === 'restaurant'
        ? '<div class="popup-meta">Marcador orientativo. Abre Google Maps para confirmar la entrada exacta y navegar.</div>'
        : '';
      marker.bindPopup(`<div class="popup-title">${point.name}</div><div class="popup-meta">${point.desc}</div>${markerNote}<div class="popup-links">${point.type === 'restaurant' ? '' : `<button type="button" class="popup-detail-button" onclick="window.openPoiDetail('${point.id}')">Ver ficha del lugar</button>`}<a href="${googleSearch}" target="_blank" rel="noopener">Ver ficha en Google Maps ↗</a><a href="${directions}" target="_blank" rel="noopener">Cómo llegar ↗</a></div>`);
      marker.bindTooltip(point.name, {direction:'top',offset:[0,-7]});
      marker.pointData = point;
      markerById.set(point.id,marker);
      markerLayer.addLayer(marker);
    });
    map.fitBounds(markerLayer.getBounds().pad(.08));

    let currentFilter = 'todos';
    let currentKindFilter = 'todos';
    let userLatLng = null;
    let currentAccuracy = null;
    let watchId = null;
    let followMap = false;
    const nearbyStatus = document.getElementById('nearby-status');
    const nearbyList = document.getElementById('nearby-list');
    const locateButton = document.getElementById('locate-me');
    const followButton = document.getElementById('follow-me');
    const userLocationLayer = L.layerGroup().addTo(map);

    const mapFilterStatus = document.getElementById('map-filter-status');
    function visibleForFilter(point, filter) {
      if (filter === 'todos') return true;
      if (filter === 'extra') return point.day === 'extra';
      return point.day === filter || point.day.split(',').includes(filter);
    }
    function visibleForKind(point, kind) {
      if (kind === 'restaurantes') return point.type === 'restaurant';
      if (kind === 'visitas') return point.type !== 'restaurant';
      return true;
    }
    function filteredMapPoints() {
      return kyotoPoints.filter((point) => visibleForFilter(point,currentFilter) && visibleForKind(point,currentKindFilter));
    }
    function refreshMapPoints() {
      const visiblePoints = filteredMapPoints();
      markerLayer.clearLayers();
      visiblePoints.forEach((point) => markerLayer.addLayer(markerById.get(point.id)));
      mapFilterStatus.textContent = currentKindFilter === 'restaurantes'
        ? `Mostrando ${visiblePoints.length} restaurantes${currentFilter === 'todos' ? '' : ` · filtro ${currentFilter === 'extra' ? 'alternativas' : currentFilter + ' dic'}`}.`
        : currentKindFilter === 'visitas'
          ? `Mostrando ${visiblePoints.length} visitas y otros puntos${currentFilter === 'todos' ? '' : ` · filtro ${currentFilter === 'extra' ? 'alternativas' : currentFilter + ' dic'}`}.`
          : `Mostrando ${visiblePoints.length} puntos, incluidos restaurantes${currentFilter === 'todos' ? '' : ` · filtro ${currentFilter === 'extra' ? 'alternativas' : currentFilter + ' dic'}`}.`;
      if (visiblePoints.length) {
        const bounds = markerLayer.getBounds();
        if (userLatLng) {
          const nearestPointDistance = Math.min(...visiblePoints.map((point) => distanceKm(userLatLng,point)));
          if (nearestPointDistance < 15) bounds.extend([userLatLng.lat,userLatLng.lng]);
        }
        map.fitBounds(bounds.pad(.12));
      }
      if (userLatLng) renderNearby();
    }
    function applyMapFilter(filter) {
      currentFilter = filter;
      document.querySelectorAll('.map-filter').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mapFilter === filter)));
      refreshMapPoints();
    }
    function applyMapKindFilter(kind) {
      currentKindFilter = kind;
      document.querySelectorAll('.map-kind-filter').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mapKind === kind)));
      refreshMapPoints();
    }
    document.querySelectorAll('.map-filter').forEach((button) => button.addEventListener('click', () => applyMapFilter(button.dataset.mapFilter)));
    document.querySelectorAll('.map-kind-filter').forEach((button) => button.addEventListener('click', () => applyMapKindFilter(button.dataset.mapKind)));

    function distanceKm(a,b) {
      const toRad = (value) => value * Math.PI / 180;
      const dLat = toRad(b.lat-a.lat), dLng = toRad(b.lng-a.lng);
      const x = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
      return 6371 * 2 * Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
    }
    function formatDistance(distance) {
      return distance < 1 ? `${Math.round(distance*1000)} m` : `${distance.toFixed(1)} km`;
    }
    function renderNearby() {
      if (!userLatLng) return;
      const ordered = kyotoPoints.filter((point) => point.type !== 'hotel' && visibleForFilter(point,currentFilter) && visibleForKind(point,currentKindFilter))
        .map((point) => ({point,distance:distanceKm(userLatLng,point)}))
        .sort((a,b) => a.distance-b.distance).slice(0,7);
      nearbyList.innerHTML = '';
      ordered.forEach(({point,distance}) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.innerHTML = `${point.name}<small>${point.desc}</small>`;
        button.addEventListener('click', () => {
          const marker = markerById.get(point.id);
          if (!markerLayer.hasLayer(marker)) {
            if (!visibleForFilter(point,currentFilter)) applyMapFilter('todos');
            if (!visibleForKind(point,currentKindFilter)) applyMapKindFilter('todos');
          }
          map.setView([point.lat,point.lng],16);
          openDetail(point.id);
        });
        const span = document.createElement('span');
        span.className = 'nearby-distance';
        span.textContent = formatDistance(distance);
        const directions = document.createElement('a');
        directions.className = 'nearby-directions';
        directions.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(point.query + ', Kyoto, Japan')}&travelmode=transit`;
        directions.target = '_blank';
        directions.rel = 'noopener';
        directions.textContent = 'Cómo llegar con Google Maps ↗';
        li.append(button,span,directions);
        nearbyList.appendChild(li);
      });
      nearbyStatus.textContent = `Los ${ordered.length} lugares más próximos, ordenados por distancia en línea recta. La ruta real puede ser más larga.${currentAccuracy ? ` Precisión GPS aproximada: ${Math.round(currentAccuracy)} m.` : ''}`;
    }
    function updateUserLocation(position, centerMap) {
      userLatLng = {lat:position.coords.latitude,lng:position.coords.longitude};
      currentAccuracy = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null;
      userLocationLayer.clearLayers();
      if (currentAccuracy && currentAccuracy > 0) {
        L.circle([userLatLng.lat,userLatLng.lng], {
          radius:currentAccuracy,
          color:'#2466bd',
          weight:1,
          opacity:.55,
          fillColor:'#2466bd',
          fillOpacity:.10,
          interactive:false
        }).addTo(userLocationLayer);
      }
      const userIcon = L.divIcon({
        className:'user-location-marker',
        html:'<span aria-hidden="true"></span>',
        iconSize:[22,22],
        iconAnchor:[11,11]
      });
      L.marker([userLatLng.lat,userLatLng.lng],{icon:userIcon,keyboard:false,zIndexOffset:1000})
        .bindPopup(`Tu ubicación${currentAccuracy ? ` · precisión ±${Math.round(currentAccuracy)} m` : ''}`)
        .addTo(userLocationLayer);
      if (centerMap || followMap) map.setView([userLatLng.lat,userLatLng.lng], Math.max(map.getZoom(),15));
      renderNearby();
    }
    function geolocationError(error) {
      const messages = {
        1:'No se ha concedido el permiso de ubicación. Revisa los permisos de Safari/Chrome y los ajustes de localización del dispositivo.',
        2:'El dispositivo no ha podido determinar tu posición. Comprueba que la localización esté activada y vuelve a intentarlo.',
        3:'La petición de ubicación ha tardado demasiado. Prueba de nuevo en una zona despejada.'
      };
      nearbyStatus.textContent = messages[error.code] || 'No se ha podido acceder a tu ubicación.';
      locateButton.disabled = false;
      locateButton.textContent = '⌖ Volver a intentar';
      if (followMap) stopFollowing(false);
    }
    function geolocationAvailable() {
      if (!window.isSecureContext) {
        nearbyStatus.textContent = 'La ubicación requiere una conexión segura HTTPS. Abre la guía desde su dirección de GitHub Pages.';
        return false;
      }
      if (!('geolocation' in navigator)) {
        nearbyStatus.textContent = 'Este navegador no ofrece geolocalización. Abre la guía en Safari (iPhone) o Chrome (Android).';
        return false;
      }
      return true;
    }
    locateButton.addEventListener('click', () => {
      if (!geolocationAvailable()) return;
      locateButton.disabled = true;
      locateButton.textContent = 'Buscando ubicación…';
      nearbyStatus.textContent = 'Solicitando tu ubicación al dispositivo…';
      navigator.geolocation.getCurrentPosition((position) => {
        updateUserLocation(position,true);
        locateButton.disabled = false;
        locateButton.textContent = '⌖ Actualizar mi ubicación';
      }, geolocationError, {enableHighAccuracy:true,timeout:15000,maximumAge:10000});
    });
    function stopFollowing(updateStatus = true) {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
      followMap = false;
      followButton.setAttribute('aria-pressed','false');
      followButton.textContent = '◎ Seguir ubicación';
      if (updateStatus) nearbyStatus.textContent = userLatLng
        ? 'Seguimiento detenido. Tu última posición sigue marcada en el mapa.'
        : 'Seguimiento detenido.';
    }
    followButton.addEventListener('click', () => {
      if (followMap) {
        stopFollowing();
        return;
      }
      if (!geolocationAvailable()) return;
      followMap = true;
      followButton.setAttribute('aria-pressed','true');
      followButton.textContent = '■ Detener seguimiento';
      nearbyStatus.textContent = 'Siguiendo tu ubicación. Permite unos segundos para obtener una posición GPS precisa.';
      watchId = navigator.geolocation.watchPosition((position) => {
        updateUserLocation(position,true);
      }, geolocationError, {enableHighAccuracy:true,timeout:20000,maximumAge:5000});
    });
    window.addEventListener('pagehide', () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    });
    })().catch((error) => {
      console.error('Failed to initialize the map:', error);
      const status = document.getElementById('nearby-status');
      if (status) status.textContent = 'No se han podido cargar los datos del mapa. Comprueba la conexión y vuelve a cargar la página.';
    });

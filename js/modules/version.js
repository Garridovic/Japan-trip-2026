fetch('data/version.json')
  .then((response) => {
    if (!response.ok) throw new Error('Failed to load application version');
    return response.json();
  })
  .then(({ version }) => {
    const indicator = document.getElementById('version-indicator');
    indicator.textContent = `GUÍA · ${version}`;
    indicator.title = `Versión desplegada de la guía: ${version}`;
    indicator.setAttribute('aria-label', `Versión de la guía ${version}`);
    document.querySelector('meta[name="guide-version"]')?.setAttribute('content', version);
  })
  .catch(() => {
    document.getElementById('version-indicator').textContent = 'GUÍA · ?';
  });

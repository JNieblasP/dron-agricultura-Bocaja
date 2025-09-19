/* script.js
  - Carga data.json
  - Llena selects
  - Muestra before/after (usa imagen actual vs anterior)
  - Carga video y galería
  - Indica en UI si un archivo no existe (404)
*/

let data = null;
let currentProjectKey = null;
let currentIndex = 0;

// Helper: check if an image exists (calls cb(true/false))
function checkImage(url, cb) {
  const img = new Image();
  img.onload = () => cb(true);
  img.onerror = () => cb(false);
  img.src = url;
}

// Helper: check video existence (tries to fetch HEAD)
async function checkVideo(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch (e) {
    return false;
  }
}

// Mostrar mensajes breves al usuario
function showMessage(text, duration = 6000) {
  const box = document.getElementById('messages');
  box.innerText = text;
  box.classList.add('show');
  clearTimeout(box._timeout);
  box._timeout = setTimeout(() => box.classList.remove('show'), duration);
}

// Cargar JSON
async function loadData() {
  try {
    const resp = await fetch('data.json');
    data = await resp.json();
  } catch (e) {
    showMessage('Error cargando data.json: ' + e.message);
    console.error(e);
    return;
  }

  // Llenar select de proyectos
  const projectSelect = document.getElementById('projectSelect');
  projectSelect.innerHTML = '';
  Object.keys(data.projects).forEach((k, i) => {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = data.projects[k].name || k;
    projectSelect.appendChild(o);
  });

  projectSelect.addEventListener('change', () => {
    currentProjectKey = projectSelect.value;
    fillCaptures();
  });

  // Inicial
  currentProjectKey = projectSelect.options[0]?.value;
  projectSelect.value = currentProjectKey;
  fillCaptures();
}

// Llenar captures / fechas
function fillCaptures() {
  const project = data.projects[currentProjectKey];
  const sel = document.getElementById('captureSelect');
  sel.innerHTML = '';
  project.captures.forEach((c, i) => {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = c.fecha;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => {
    currentIndex = parseInt(sel.value);
    renderAll();
  });
  currentIndex = 0;
  sel.value = 0;
  renderAll();
  renderTimeline();
}

// Render timeline with colored circles by cobertura %
function renderTimeline() {
  const project = data.projects[currentProjectKey];
  const timeline = document.getElementById('timeline');
  timeline.innerHTML = '';
  project.captures.forEach((cap, idx) => {
    const div = document.createElement('div');
    div.className = 'circle-wrapper';
    const circle = document.createElement('div');
    circle.className = 'circle timeline-circle';
    circle.textContent = idx + 1;
    // color alpha by cobertura number (allow "40%" or "40")
    const raw = String(cap.metrics.cobertura || '0').replace('%','');
    const val = Math.max(0, Math.min(100, parseFloat(raw) || 0));
    // map 0->white, 100->dark green
    if (val <= 0) circle.style.background = '#ffffff';
    else {
      // interpolate between light green and dark
      const dark = [6,78,59]; // rgb dark green
      const light = [198,255,208]; // pale
      const t = val / 100;
      const r = Math.round(light[0] * (1-t) + dark[0] * t);
      const g = Math.round(light[1] * (1-t) + dark[1] * t);
      const b = Math.round(light[2] * (1-t) + dark[2] * t);
      circle.style.background = `rgb(${r},${g},${b})`;
    }
    circle.onclick = () => {
      document.getElementById('captureSelect').value = idx;
      currentIndex = idx;
      renderAll();
    };
    div.appendChild(circle);
    timeline.appendChild(div);
  });
}

// Render everything for current selection
async function renderAll() {
  const project = data.projects[currentProjectKey];
  const cap = project.captures[currentIndex];

  // Metrics
  document.getElementById('ndviValue').textContent = cap.metrics.ndvi;
  document.getElementById('coverValue').textContent = cap.metrics.cobertura;

  // ABOUT
  document.getElementById('aboutText').textContent = project.about || '';

  // BEFORE/AFTER: use capture.before & capture.after if present,
  // otherwise use capture.image for current and previous capture for 'before'
  let afterUrl = cap.after || cap.image || '';
  let beforeUrl = cap.before || '';
  if (!beforeUrl) {
    // take previous capture image if present
    if (currentIndex > 0) {
      const prev = project.captures[currentIndex - 1];
      beforeUrl = prev.after || prev.image || '';
    } else {
      beforeUrl = afterUrl; // fallback to same image
    }
  }

  const imgBefore = document.getElementById('imgBefore');
  const imgAfter = document.getElementById('imgAfter');
  const baHints = document.getElementById('baHints');
  baHints.textContent = '';

  // Verify and set images (with existence check)
  checkImage(beforeUrl, existsBefore => {
    if (existsBefore) {
      imgBefore.src = beforeUrl;
      imgBefore.style.display = 'block';
    } else {
      imgBefore.src = '';
      imgBefore.style.display = 'none';
      baHints.textContent = 'Imagen ANTES no encontrada: ' + beforeUrl;
      console.warn('ANTES not found:', beforeUrl);
      showMessage('ANTES no encontrado: ' + beforeUrl, 5000);
    }
  });

  checkImage(afterUrl, existsAfter => {
    if (existsAfter) {
      imgAfter.src = afterUrl;
      imgAfter.style.display = 'block';
    } else {
      imgAfter.src = '';
      imgAfter.style.display = 'none';
      baHints.textContent = (baHints.textContent ? baHints.textContent + ' | ' : '') + 'Imagen DESPUÉS no encontrada: ' + afterUrl;
      console.warn('DESPUES not found:', afterUrl);
      showMessage('DESPUÉS no encontrado: ' + afterUrl, 5000);
    }
  });

  // Reset range to 50
  document.getElementById('baRange').value = 50;
  updateBeforeClip(50);

  // Video
  const videoPlayer = document.getElementById('videoPlayer');
  if (cap.video) {
    const ok = await checkVideo(cap.video);
    if (ok) {
      videoPlayer.src = cap.video;
      document.getElementById('videoHint').textContent = '';
    } else {
      videoPlayer.src = '';
      document.getElementById('videoHint').textContent = 'Video no encontrado o no accesible: ' + cap.video;
      showMessage('Video no encontrado: ' + cap.video, 5000);
    }
  } else {
    videoPlayer.src = '';
    document.getElementById('videoHint').textContent = 'No hay video para esta captura.';
  }

  // Gallery
  const gallery = document.getElementById('galleryGrid');
  gallery.innerHTML = '';
  if (Array.isArray(cap.galeria) && cap.galeria.length > 0) {
    for (const imgPath of cap.galeria) {
      // create thumbnail
      const img = document.createElement('img');
      img.src = imgPath;
      img.alt = '';
      // on error show outline and message
      img.onerror = () => {
        img.style.opacity = 0.3;
        console.warn('Galería archivo no encontrado:', imgPath);
        showMessage('Galería no encontrada: ' + imgPath, 4000);
      };
      img.onclick = () => openModal(imgPath);
      gallery.appendChild(img);
    }
  } else {
    gallery.innerHTML = '<div class="hints">No hay imágenes en galería para esta captura.</div>';
  }
}

// range control update
function updateBeforeClip(value) {
  // value 0..100 → clip-path right inset
  const before = document.querySelector('.ba-before');
  if (before) {
    const rightPercent = 100 - value;
    before.style.clipPath = `inset(0 ${rightPercent}% 0 0)`;
  }
}

// modal functions
function openModal(src) {
  const modal = document.getElementById('modal');
  document.getElementById('modalImg').src = src;
  modal.classList.remove('hidden');
}
function closeModal() {
  const modal = document.getElementById('modal');
  document.getElementById('modalImg').src = '';
  modal.classList.add('hidden');
}

/* ---------- events ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // range event
  document.getElementById('baRange').addEventListener('input', (e) => updateBeforeClip(e.target.value));

  // modal close
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', (ev) => {
    if (ev.target.id === 'modal') closeModal();
  });

  // tabs
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // messages element exists
  const messages = document.getElementById('messages');
  if (!messages) {
    console.warn('No element #messages to show debug messages.');
  }

  // start
  loadData();
});

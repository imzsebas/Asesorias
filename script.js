// optional:true = no bloquea la descarga si falta ese archivo
const TEMPLATES = [
  { label: "ASESORÍA No.", prefix: "ASESORÍA No.", optional: true },
  { label: "ANEXOS ASESORÍA No.", prefix: "ANEXOS ASESORÍA No.", optional: true },
  { label: "FORMATO ARCHIVO ASESORIA No.", prefix: "FORMATO ARCHIVO ASESORIA No.", optional: false }
];

const AREAS = [
  { value: 'laboral', label: 'Derecho Laboral' },
  { value: 'penal', label: 'Derecho Penal' },
  { value: 'privado', label: 'Derecho Privado' },
  { value: 'publico', label: 'Derecho Público' }
];

// Genera opciones tipo "2026-1" / "2026-2" para un rango razonable de años
// alrededor del año actual, calculado en el navegador (siempre vigente).
function buildSemestreOptions(){
  const y = new Date().getFullYear();
  const opts = [];
  for(let year = 2020; year <= y; year++){
    opts.push(`${year}-1`);
    opts.push(`${year}-2`);
  }
  return opts;
}
const SEMESTRES = buildSemestreOptions();

// --- Tema claro/oscuro ---
const themeToggle = document.getElementById('themeToggle');
const themeToggleLabel = document.getElementById('themeToggleLabel');

function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  themeToggleLabel.textContent = theme === 'light' ? 'Modo oscuro' : 'Modo claro';
}

function getInitialTheme(){
  const saved = localStorage.getItem('theme');
  if(saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

applyTheme(getInitialTheme());

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  applyTheme(next);
  localStorage.setItem('theme', next);
});

// =====================================================================
// Autoguardado en IndexedDB
// Guarda cada fila (incluyendo los PDFs como Blob) en el disco del
// navegador. A diferencia de mantenerlo solo en memoria, esto sobrevive
// a un cierre inesperado, un cuelgue del PC o un refresh accidental.
// Limitación real: vive únicamente en este navegador y este equipo; no
// se sincroniza entre dispositivos ni sirve como respaldo en la nube.
// =====================================================================
const DB_NAME = 'asesorias-autosave';
const DB_VERSION = 1;
const STORE_NAME = 'rows';

function openDB(){
  return new Promise((resolve, reject) => {
    if(!window.indexedDB){
      reject(new Error('IndexedDB no disponible en este navegador'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(STORE_NAME)){
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise = null;
function getDB(){
  if(!dbPromise) dbPromise = openDB();
  return dbPromise;
}

function txDone(tx){
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function dbPutRow(id){
  const r = rowsData[id];
  if(!r) return;
  try{
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      id,
      numero: r.numero,
      numeroTouched: r.numeroTouched,
      area: r.area,
      semestre: r.semestre,
      files: r.files,
      detected: r.detected
    });
    await txDone(tx);
    setSaveIndicator('ok');
  }catch(e){
    console.error('No se pudo autoguardar la fila', e);
    setSaveIndicator('error');
  }
}

async function dbDeleteRow(id){
  try{
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    await txDone(tx);
  }catch(e){
    console.error('No se pudo borrar la fila guardada', e);
  }
}

async function dbGetAllRows(){
  try{
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    const rows = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    await txDone(tx);
    return rows;
  }catch(e){
    console.error('No se pudo leer el autoguardado', e);
    return [];
  }
}

async function dbClearAll(){
  try{
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    await txDone(tx);
  }catch(e){
    console.error('No se pudo vaciar el autoguardado', e);
  }
}

const saveIndicator = document.getElementById('saveIndicator');
let saveIndicatorTimeout = null;
function setSaveIndicator(state){
  if(!saveIndicator) return;
  if(state === 'ok'){
    saveIndicator.textContent = 'Guardado ✓';
    saveIndicator.className = 'save-indicator ok';
  }else{
    saveIndicator.textContent = 'Error al guardar localmente';
    saveIndicator.className = 'save-indicator error';
  }
  clearTimeout(saveIndicatorTimeout);
  if(state === 'ok'){
    saveIndicatorTimeout = setTimeout(() => { saveIndicator.textContent = ''; saveIndicator.className = 'save-indicator'; }, 1500);
  }
}

const rowsBody = document.getElementById('rowsBody');
const addRowBtn = document.getElementById('addRowBtn');
const clearSavedBtn = document.getElementById('clearSavedBtn');
const downloadBtn = document.getElementById('downloadBtn');
const actionMsg = document.getElementById('actionMsg');

let rowCounter = 0;
// id -> { numero, numeroTouched, area, semestre, files: [null,null,null], detected: [null,null,null] }
const rowsData = {};

// Evita que el navegador navegue a "file://" o abra el PDF a pantalla completa
// si el usuario suelta el archivo un poco fuera de una zona de drop.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

// `restored` (opcional) trae los datos de una fila recuperada del
// autoguardado: { id, numero, numeroTouched, area, semestre, files, detected }
function addRow(restored){
  const id = restored ? restored.id : 'row-' + (rowCounter++);
  rowsData[id] = restored
    ? {
        numero: restored.numero || '',
        numeroTouched: !!restored.numeroTouched,
        area: restored.area || '',
        semestre: restored.semestre || '',
        files: restored.files || [null, null, null],
        detected: restored.detected || [null, null, null]
      }
    : { numero: '', numeroTouched: false, area: '', semestre: '', files: [null, null, null], detected: [null, null, null] };

  const tr = document.createElement('tr');
  tr.id = id;

  const numTd = document.createElement('td');
  numTd.className = 'numero-cell';
  numTd.innerHTML = `<input type="text" placeholder="ej. 4113" id="numero-${id}">`;
  tr.appendChild(numTd);

  TEMPLATES.forEach((tpl, idx) => {
    const td = document.createElement('td');
    td.innerHTML = `
      <label class="drop" id="drop-${id}-${idx}">
        <input type="file" accept="application/pdf" id="file-${id}-${idx}">
        <span class="drop-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        <span id="dropText-${id}-${idx}">Arrastra o haz clic</span>
      </label>
      <div class="status-pill idle" id="status-${id}-${idx}">${tpl.optional ? 'opcional' : 'sin archivo'}</div>
      <div class="final-name" id="finalname-${id}-${idx}">${tpl.prefix} —.pdf</div>
    `;
    tr.appendChild(td);
  });

  const areaTd = document.createElement('td');
  areaTd.className = 'select-cell';
  areaTd.innerHTML = `
    <select id="area-${id}">
      <option value="">Selecciona…</option>
      ${AREAS.map(a => `<option value="${a.value}">${a.label}</option>`).join('')}
    </select>
  `;
  tr.appendChild(areaTd);

  const semestreTd = document.createElement('td');
  semestreTd.className = 'select-cell';
  semestreTd.innerHTML = `
    <select id="semestre-${id}">
      <option value="">Selecciona…</option>
      ${SEMESTRES.map(s => `<option value="${s}">${s}</option>`).join('')}
    </select>
  `;
  tr.appendChild(semestreTd);

  const rmTd = document.createElement('td');
  rmTd.innerHTML = `<button class="rm-btn" id="rm-${id}" title="Eliminar fila">✕</button>`;
  tr.appendChild(rmTd);

  rowsBody.appendChild(tr);

  const numeroInput = tr.querySelector(`#numero-${id}`);
  numeroInput.addEventListener('input', () => {
    rowsData[id].numero = numeroInput.value.trim();
    rowsData[id].numeroTouched = numeroInput.value.trim().length > 0;
    renderFinalNames(id);
    checkMismatch(id);
    updateRowEstado(id);
    updateDownloadState();
    dbPutRow(id);
  });

  const areaSelect = tr.querySelector(`#area-${id}`);
  areaSelect.addEventListener('change', () => {
    rowsData[id].area = areaSelect.value;
    updateRowEstado(id);
    updateDownloadState();
    dbPutRow(id);
  });

  const semestreSelect = tr.querySelector(`#semestre-${id}`);
  semestreSelect.addEventListener('change', () => {
    rowsData[id].semestre = semestreSelect.value;
    updateRowEstado(id);
    updateDownloadState();
    dbPutRow(id);
  });

  TEMPLATES.forEach((tpl, idx) => {
    const input = tr.querySelector(`#file-${id}-${idx}`);
    const dropLabel = tr.querySelector(`#drop-${id}-${idx}`);
    const dropText = tr.querySelector(`#dropText-${id}-${idx}`);
    const statusEl = tr.querySelector(`#status-${id}-${idx}`);

    ['dragenter','dragover','dragleave','drop'].forEach(evt => {
      dropLabel.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();

        if(evt === 'dragenter' || evt === 'dragover') dropLabel.classList.add('dragover');
        if(evt === 'dragleave' || evt === 'drop') dropLabel.classList.remove('dragover');

        if(evt !== 'drop') return;

        const dt = e.dataTransfer;
        const droppedFiles = dt && dt.files;

        if(droppedFiles && droppedFiles.length){
          input.files = droppedFiles;
          handleFile(droppedFiles[0]);
          return;
        }

        // Algunos orígenes (p.ej. la vista previa de un adjunto dentro de
        // Gmail) sueltan una referencia sin exponer el archivo real todavía.
        // En vez de fallar en silencio, avisamos qué hacer.
        statusEl.textContent = 'no se pudo leer el archivo';
        statusEl.className = 'status-pill warn';
        dropText.textContent = 'Descárgalo y suéltalo de nuevo aquí';
      });
    });

    input.addEventListener('change', () => {
      if(input.files.length) handleFile(input.files[0]);
    });

    async function handleFile(file){
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      if(!isPdf){
        statusEl.textContent = 'ese archivo no es un PDF';
        statusEl.className = 'status-pill warn';
        dropText.textContent = 'Arrastra o haz clic';
        return;
      }

      rowsData[id].files[idx] = file;
      rowsData[id].detected[idx] = null;
      dropLabel.classList.add('has-file');
      dropText.textContent = file.name;
      statusEl.textContent = 'buscando número...';
      statusEl.className = 'status-pill idle';

      const result = await detectNumero(file);

      if(result.numero){
        rowsData[id].detected[idx] = result.numero;
        statusEl.textContent = `detectado (${result.source})`;
        statusEl.className = 'status-pill ok';
        if(!rowsData[id].numeroTouched){
          numeroInput.value = result.numero;
          rowsData[id].numero = result.numero;
        }
      }else{
        statusEl.textContent = 'no detectado';
        statusEl.className = 'status-pill warn';
      }

      renderFinalNames(id);
      checkMismatch(id);
      updateRowEstado(id);
      updateDownloadState();
      dbPutRow(id);
    }

    // Si la fila se está restaurando desde el autoguardado, ya tenemos el
    // archivo (Blob/File) en memoria: no hace falta re-detectar, solo
    // reflejarlo en la interfaz.
    if(restored && restored.files && restored.files[idx]){
      const file = restored.files[idx];
      dropLabel.classList.add('has-file');
      dropText.textContent = file.name || 'archivo restaurado';
      if(restored.detected && restored.detected[idx]){
        statusEl.textContent = `detectado (${restored.detected[idx]})`.length > 40
          ? 'detectado'
          : `detectado`;
        statusEl.className = 'status-pill ok';
      }else{
        statusEl.textContent = 'restaurado';
        statusEl.className = 'status-pill ok';
      }
    }
  });

  const rmBtn = tr.querySelector(`#rm-${id}`);
  rmBtn.addEventListener('click', () => {
    delete rowsData[id];
    tr.remove();
    dbDeleteRow(id);
    updateDownloadState();
  });

  if(restored){
    numeroInput.value = rowsData[id].numero;
    areaSelect.value = rowsData[id].area;
    semestreSelect.value = rowsData[id].semestre;
    renderFinalNames(id);
    checkMismatch(id);
  }

  updateRowEstado(id);
  updateDownloadState();
}

// Detecta el número de asesoría probando primero el nombre del archivo
// y luego el contenido del PDF. Funciona igual sin importar cuál de las
// 3 columnas sea: cualquier archivo que traiga el dato es válido.
async function detectNumero(file){
  let numero = extractFromFilename(file.name);
  if(numero) return { numero, source: 'nombre del archivo' };

  try{
    numero = await extractFromPdfContent(file);
    if(numero) return { numero, source: 'contenido del PDF' };
  }catch(e){ /* seguimos sin dato */ }

  return { numero: null, source: null };
}

// Compara lo detectado en cada uno de los archivos de la fila.
// Si dos archivos traen números distintos, se marca visualmente para
// que el usuario lo revise, en vez de asumir que uno manda sobre otro.
function checkMismatch(id){
  const numeroInput = document.getElementById(`numero-${id}`);
  const detected = rowsData[id].detected.filter(Boolean);
  const unique = [...new Set(detected)];
  if(numeroInput){
    numeroInput.classList.toggle('mismatch', unique.length > 1);
    numeroInput.title = unique.length > 1
      ? `Los archivos traen números distintos: ${unique.join(', ')}. Verifica cuál es correcto.`
      : '';
  }
}

// Rellena el número con ceros a la izquierda hasta 4 dígitos (ej. "13" -> "0013").
// Si el número ya tiene 4 o más dígitos, se deja igual.
function formatNumero(numero){
  return numero.toString().padStart(4, '0');
}

function renderFinalNames(id){
  const n = rowsData[id].numero ? formatNumero(rowsData[id].numero) : '—';
  TEMPLATES.forEach((tpl, idx) => {
    const el = document.getElementById(`finalname-${id}-${idx}`);
    if(el) el.textContent = `${tpl.prefix}${n}.pdf`;
  });
}

// Requisitos mínimos de una fila: número + los archivos NO opcionales.
// ANEXOS puede faltar sin bloquear la fila.
function isRowComplete(id){
  const r = rowsData[id];
  const requiredOk = TEMPLATES.every((tpl, idx) => tpl.optional || r.files[idx] !== null);
  return r.numero.length > 0 && requiredOk && r.area !== '' && r.semestre !== '';
}

function updateRowEstado(id){
  const tr = document.getElementById(id);
  if(!tr) return;
  const complete = isRowComplete(id);
  tr.classList.toggle('row-incomplete', !complete);
}

addRowBtn.addEventListener('click', () => addRow());

if(clearSavedBtn){
  clearSavedBtn.addEventListener('click', async () => {
    const total = Object.keys(rowsData).length;
    const ok = confirm(
      total
        ? `Esto borrará las ${total} fila(s) actuales y todo lo guardado en este navegador. ¿Continuar?`
        : 'Esto borrará todo lo guardado en este navegador. ¿Continuar?'
    );
    if(!ok) return;
    await dbClearAll();
    Object.keys(rowsData).forEach(id => delete rowsData[id]);
    rowsBody.innerHTML = '';
    rowCounter = 0;
    addRow();
    actionMsg.textContent = 'Autoguardado vaciado';
  });
}

function updateDownloadState(){
  const ids = Object.keys(rowsData);
  if(ids.length === 0){
    downloadBtn.disabled = true;
    actionMsg.textContent = 'Agrega al menos una fila';
    return;
  }
  const allComplete = ids.every(isRowComplete);
  downloadBtn.disabled = !allComplete;
  actionMsg.textContent = allComplete
    ? `Listo para generar el ZIP (${ids.length} asesoría${ids.length > 1 ? 's' : ''})`
    : '';
}

downloadBtn.addEventListener('click', async () => {
  const ids = Object.keys(rowsData);
  if(ids.length === 0) return;
  downloadBtn.disabled = true;
  actionMsg.textContent = 'Generando ZIP...';

  try{
    const zip = new JSZip();
    const summaryLines = [
      'Código de asesoría | Área del derecho | Semestre',
      '-------------------------------------------------'
    ];

    // Agrupamos por "Área + Semestre" (p.ej. "Derecho Laboral 2026-1") y,
    // dentro de cada grupo, cada asesoría mantiene su propia subcarpeta.
    // Los nombres de los PDFs no cambian, solo las carpetas que los contienen.
    ids.forEach(id => {
      const r = rowsData[id];
      const areaLabel = AREAS.find(a => a.value === r.area)?.label || r.area;
      const numeroFmt = formatNumero(r.numero);
      const groupFolderName = `${areaLabel} ${r.semestre}`;
      const groupFolder = zip.folder(groupFolderName);
      const asesoriaFolder = groupFolder.folder(`ASESORÍA No.${numeroFmt}`);

      TEMPLATES.forEach((tpl, idx) => {
        const file = r.files[idx];
        if(!file) return; // ANEXOS puede no venir; no se incluye en el zip
        const finalName = `${tpl.prefix}${numeroFmt}.pdf`;
        asesoriaFolder.file(finalName, file);
      });

      summaryLines.push(`${numeroFmt} | ${areaLabel} | ${r.semestre}`);
    });

    zip.file('resumen_asesorias.txt', summaryLines.join('\n'));

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Asesorias.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    actionMsg.textContent = `ZIP descargado con ${ids.length} asesoría${ids.length > 1 ? 's' : ''}. Puedes usar "Vaciar guardado" si ya no necesitas conservar estos datos.`;
  }catch(err){
    actionMsg.textContent = 'Error al generar el ZIP: ' + err.message;
  }
  downloadBtn.disabled = false;
});

// Quita tildes/diacríticos para que "ASESORÍA" y "ASESORIA" matcheen igual
function normalize(text){
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function extractFromFilename(name){
  const clean = normalize(name);

  // Patrones típicos: "No. 4113", "N° 4113", "Nro 4113", "# 4113"
  const patterns = [
    /no\.?\s*(\d{3,6})/i,
    /n[°º]\s*(\d{3,6})/i,
    /nro\.?\s*(\d{3,6})/i,
    /#\s*(\d{3,6})/
  ];
  for(const p of patterns){
    const m = clean.match(p);
    if(m) return m[1];
  }

  // Sin prefijo reconocible: toma el número más largo (más específico)
  const all = clean.match(/\d{3,6}/g);
  if(all && all.length) return all.sort((a,b) => b.length - a.length)[0];
  return null;
}

async function extractFromPdfContent(file){
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const maxPages = Math.min(pdf.numPages, 2);
  let fullText = '';
  for(let i = 1; i <= maxPages; i++){
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map(it => it.str).join(' ') + ' ';
  }
  const clean = normalize(fullText);

  const patterns = [
    /asesor[i]a\s*no\.?\s*(\d{3,6})/i,
    /asesor[i]a\s*n[°º]\s*(\d{3,6})/i,
    /no\.?\s*(\d{3,6})/i,
    /n[°º]\s*(\d{3,6})/i
  ];
  for(const p of patterns){
    const m = clean.match(p);
    if(m) return m[1];
  }
  return null;
}

if(window.pdfjsLib){
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// --- Arranque: restaurar filas guardadas o empezar con una fila vacía ---
(async function init(){
  const saved = await dbGetAllRows();
  if(saved && saved.length){
    saved.sort((a, b) => {
      const na = parseInt(String(a.id).split('-')[1], 10) || 0;
      const nb = parseInt(String(b.id).split('-')[1], 10) || 0;
      return na - nb;
    });
    let maxIndex = -1;
    saved.forEach(r => {
      const n = parseInt(String(r.id).split('-')[1], 10);
      if(!isNaN(n) && n > maxIndex) maxIndex = n;
      addRow(r);
    });
    rowCounter = maxIndex + 1;
    actionMsg.textContent = `Se restauraron ${saved.length} fila${saved.length > 1 ? 's' : ''} guardada${saved.length > 1 ? 's' : ''} de la sesión anterior`;
  }else{
    addRow();
  }
})();

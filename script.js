// optional:true = no bloquea la descarga si falta ese archivo
const TEMPLATES = [
  { label: "ASESORÍA No.", prefix: "ASESORÍA No.", optional: false },
  { label: "ANEXOS ASESORÍA No.", prefix: "ANEXOS ASESORÍA No.", optional: true },
  { label: "FORMATO ARCHIVO ASESORIA No.", prefix: "FORMATO ARCHIVO ASESORIA No.", optional: false }
];

const rowsBody = document.getElementById('rowsBody');
const addRowBtn = document.getElementById('addRowBtn');
const downloadBtn = document.getElementById('downloadBtn');
const actionMsg = document.getElementById('actionMsg');

let rowCounter = 0;
// id -> { numero, numeroTouched, files: [null,null,null], detected: [null,null,null] }
const rowsData = {};

// Evita que el navegador navegue a "file://" o abra el PDF a pantalla completa
// si el usuario suelta el archivo un poco fuera de una zona de drop.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

function addRow(){
  const id = 'row-' + (rowCounter++);
  rowsData[id] = { numero: '', numeroTouched: false, files: [null, null, null], detected: [null, null, null] };

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
        <span id="dropText-${id}-${idx}">Arrastra o haz clic${tpl.optional ? ' (opcional)' : ''}</span>
      </label>
      <div class="status-pill idle" id="status-${id}-${idx}">${tpl.optional ? 'opcional' : 'sin archivo'}</div>
      <div class="final-name" id="finalname-${id}-${idx}">${tpl.prefix} —.pdf</div>
    `;
    tr.appendChild(td);
  });

  const estadoTd = document.createElement('td');
  estadoTd.className = 'estado-cell';
  estadoTd.innerHTML = `<span class="status-pill idle" id="estado-${id}">incompleto</span>`;
  tr.appendChild(estadoTd);

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
    }
  });

  const rmBtn = tr.querySelector(`#rm-${id}`);
  rmBtn.addEventListener('click', () => {
    delete rowsData[id];
    tr.remove();
    updateDownloadState();
  });

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

function renderFinalNames(id){
  const n = rowsData[id].numero || '—';
  TEMPLATES.forEach((tpl, idx) => {
    const el = document.getElementById(`finalname-${id}-${idx}`);
    if(el) el.textContent = `${tpl.prefix} ${n}.pdf`;
  });
}

// Requisitos mínimos de una fila: número + los archivos NO opcionales.
// ANEXOS puede faltar sin bloquear la fila.
function isRowComplete(id){
  const r = rowsData[id];
  const requiredOk = TEMPLATES.every((tpl, idx) => tpl.optional || r.files[idx] !== null);
  return r.numero.length > 0 && requiredOk;
}

function updateRowEstado(id){
  const el = document.getElementById(`estado-${id}`);
  if(!el) return;
  const complete = isRowComplete(id);
  el.textContent = complete ? 'completo' : 'incompleto';
  el.className = `status-pill ${complete ? 'ok' : 'warn'}`;
}

addRowBtn.addEventListener('click', addRow);

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
    ids.forEach(id => {
      const r = rowsData[id];
      const folder = zip.folder(`ASESORÍA No.${r.numero}`);
      TEMPLATES.forEach((tpl, idx) => {
        const file = r.files[idx];
        if(!file) return; // ANEXOS puede no venir; no se incluye en el zip
        const finalName = `${tpl.prefix}${r.numero}.pdf`;
        folder.file(finalName, file);
      });
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Asesorias.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    actionMsg.textContent = `ZIP descargado con ${ids.length} asesoría${ids.length > 1 ? 's' : ''}`;
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

addRow();
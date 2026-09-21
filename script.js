// multiple:true = la columna acepta varios archivos (se combinan en un solo PDF al exportar)
const TEMPLATES = [
  { label: "ASESORÍA No.", prefix: "ASESORÍA No.", multiple: false },
  { label: "ANEXOS ASESORÍA No.", prefix: "ANEXOS ASESORÍA No.", multiple: true },
  { label: "FORMATO ARCHIVO ASESORIA No.", prefix: "FORMATO ARCHIVO ASESORIA No.", multiple: false }
];

// label = texto del selector · folder = nombre de la carpeta dentro del ZIP
const AREAS = [
  { value: 'laboral', label: 'Derecho Laboral', folder: 'DERECHO LABORAL' },
  { value: 'penal', label: 'Derecho Penal', folder: 'DERECHO PENAL' },
  { value: 'privado', label: 'Derecho Privado', folder: 'DERECHO PRIVADO' },
  { value: 'publico', label: 'Derecho Público', folder: 'DERECHO PÚBLICO' }
];

const ROOT_FOLDER = 'FORMATOS Y ADJUNTOS ASESORIAS';
const ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Genera opciones tipo "2025-I" / "2025-II" desde 2020 hasta el año actual
function buildSemestreOptions(){
  const y = new Date().getFullYear();
  const opts = [];
  for(let year = 2020; year <= y; year++){
    opts.push(`${year}-I`);
    opts.push(`${year}-II`);
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

const rowsBody = document.getElementById('rowsBody');
const addRowBtn = document.getElementById('addRowBtn');
const downloadBtn = document.getElementById('downloadBtn');
const actionMsg = document.getElementById('actionMsg');

let rowCounter = 0;
// id -> { numero, numeroTouched, area, semestre, files, detected }
// files[idx] = File | null (columnas simples)  ·  File[] (columna múltiple, ANEXOS)
const rowsData = {};

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

// Tipo de archivo aceptado: 'pdf', 'docx', 'doc' (Word antiguo, no soportado) o null
function fileKind(file){
  const name = file.name || '';
  if(file.type === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if(/\.docx$/i.test(name) || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if(/\.doc$/i.test(name)) return 'doc';
  return null;
}

function filesOf(r, idx){
  const f = r.files[idx];
  if(Array.isArray(f)) return f;
  return f ? [f] : [];
}

function addRow(){
  const id = 'row-' + (rowCounter++);
  rowsData[id] = {
    numero: '', numeroTouched: false, area: '', semestre: '',
    files: TEMPLATES.map(t => t.multiple ? [] : null),
    detected: [null, null, null]
  };

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
        <input type="file" accept="${ACCEPT}" ${tpl.multiple ? 'multiple' : ''} id="file-${id}-${idx}">
        <span class="drop-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        <span id="dropText-${id}-${idx}">${tpl.multiple ? 'Arrastra o haz clic (varios)' : 'Arrastra o haz clic'}</span>
      </label>
      ${tpl.multiple ? `<ul class="file-list" id="list-${id}-${idx}"></ul>` : ''}
      <div class="status-pill idle" id="status-${id}-${idx}">sin archivo</div>
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
  });

  const areaSelect = tr.querySelector(`#area-${id}`);
  areaSelect.addEventListener('change', () => {
    rowsData[id].area = areaSelect.value;
    updateRowEstado(id);
    updateDownloadState();
  });

  const semestreSelect = tr.querySelector(`#semestre-${id}`);
  semestreSelect.addEventListener('change', () => {
    rowsData[id].semestre = semestreSelect.value;
    updateRowEstado(id);
    updateDownloadState();
  });

  TEMPLATES.forEach((tpl, idx) => {
    const input = tr.querySelector(`#file-${id}-${idx}`);
    const dropLabel = tr.querySelector(`#drop-${id}-${idx}`);
    const dropText = tr.querySelector(`#dropText-${id}-${idx}`);
    const statusEl = tr.querySelector(`#status-${id}-${idx}`);
    const listEl = tr.querySelector(`#list-${id}-${idx}`);

    const idleText = tpl.multiple ? 'Arrastra o haz clic (varios)' : 'Arrastra o haz clic';

    ['dragenter','dragover','dragleave','drop'].forEach(evt => {
      dropLabel.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();

        if(evt === 'dragenter' || evt === 'dragover') dropLabel.classList.add('dragover');
        if(evt === 'dragleave' || evt === 'drop') dropLabel.classList.remove('dragover');

        if(evt !== 'drop') return;

        const droppedFiles = e.dataTransfer && e.dataTransfer.files;
        if(droppedFiles && droppedFiles.length){
          handleFiles(droppedFiles);
          return;
        }

        statusEl.textContent = 'no se pudo leer el archivo';
        statusEl.className = 'status-pill warn';
        dropText.textContent = 'Descárgalo y suéltalo de nuevo aquí';
      });
    });

    input.addEventListener('change', () => {
      if(input.files.length) handleFiles(input.files);
    });

    // Pinta el estado actual de la celda (nombre / lista de anexos)
    function renderSlot(){
      const current = filesOf(rowsData[id], idx);
      dropLabel.classList.toggle('has-file', current.length > 0);

      if(tpl.multiple){
        dropText.textContent = current.length ? 'Añadir más archivos' : idleText;
        listEl.innerHTML = '';
        current.forEach((f, i) => {
          const li = document.createElement('li');
          const name = document.createElement('span');
          name.textContent = `${i + 1}. ${f.name}`;
          const rm = document.createElement('button');
          rm.type = 'button';
          rm.className = 'file-rm';
          rm.title = 'Quitar este archivo';
          rm.textContent = '✕';
          rm.addEventListener('click', () => {
            rowsData[id].files[idx].splice(i, 1);
            if(!rowsData[id].files[idx].length){
              rowsData[id].detected[idx] = null;
              statusEl.textContent = 'sin archivo';
              statusEl.className = 'status-pill idle';
            }
            renderSlot();
            renderFinalNames(id);
            checkMismatch(id);
            updateRowEstado(id);
            updateDownloadState();
          });
          li.appendChild(name);
          li.appendChild(rm);
          listEl.appendChild(li);
        });
      }else{
        dropText.textContent = current.length ? current[0].name : idleText;
      }
    }

    async function handleFiles(fileList){
      const picked = Array.from(fileList);
      input.value = ''; // permite volver a elegir el mismo archivo

      const valid = picked.filter(f => ['pdf', 'docx'].includes(fileKind(f)));
      const oldWord = picked.filter(f => fileKind(f) === 'doc');

      if(!valid.length){
        statusEl.textContent = oldWord.length
          ? 'guarda el .doc como .docx o PDF'
          : 'solo PDF o Word (.docx)';
        statusEl.className = 'status-pill warn';
        return;
      }

      if(tpl.multiple){
        rowsData[id].files[idx].push(...valid);
      }else{
        rowsData[id].files[idx] = valid[0];
        rowsData[id].detected[idx] = null;
      }
      renderSlot();

      statusEl.textContent = 'buscando número...';
      statusEl.className = 'status-pill idle';

      let found = null;
      for(const f of (tpl.multiple ? valid : [valid[0]])){
        found = await detectNumero(f);
        if(found.numero) break;
      }

      if(found && found.numero){
        rowsData[id].detected[idx] = found.numero;
        statusEl.textContent = `detectado (${found.source})`;
        statusEl.className = 'status-pill ok';
        if(!rowsData[id].numeroTouched){
          numeroInput.value = found.numero;
          rowsData[id].numero = found.numero;
        }
      }else{
        statusEl.textContent = 'no detectado';
        statusEl.className = 'status-pill warn';
      }

      if(oldWord.length){
        statusEl.textContent += ` · ${oldWord.length} .doc omitido(s): guárdalo(s) como .docx`;
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

// Detecta el número de asesoría: primero el nombre del archivo, luego el contenido (PDF o Word).
async function detectNumero(file){
  let numero = extractFromFilename(file.name);
  if(numero) return { numero, source: 'nombre del archivo' };

  try{
    const kind = fileKind(file);
    numero = kind === 'docx' ? await extractFromDocxContent(file) : await extractFromPdfContent(file);
    if(numero) return { numero, source: kind === 'docx' ? 'contenido del Word' : 'contenido del PDF' };
  }catch(e){ /* seguimos sin dato */ }

  return { numero: null, source: null };
}

function checkMismatch(id){
  const numeroInput = document.getElementById(`numero-${id}`);
  if(!rowsData[id]) return;
  const detected = rowsData[id].detected.filter(Boolean);
  const unique = [...new Set(detected)];
  if(numeroInput){
    numeroInput.classList.toggle('mismatch', unique.length > 1);
    numeroInput.title = unique.length > 1
      ? `Los archivos traen números distintos: ${unique.join(', ')}. Verifica cuál es correcto.`
      : '';
  }
}

// Rellena con ceros a la izquierda hasta 4 dígitos (ej. "13" -> "0013")
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

// Una fila está lista con: número + área + semestre + AL MENOS UNO de los 3 archivos
function isRowComplete(id){
  const r = rowsData[id];
  const hasAnyFile = TEMPLATES.some((tpl, idx) => filesOf(r, idx).length > 0);
  return r.numero.length > 0 && hasAnyFile && r.area !== '' && r.semestre !== '';
}

function updateRowEstado(id){
  const tr = document.getElementById(id);
  if(!tr) return;
  tr.classList.toggle('row-incomplete', !isRowComplete(id));
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

// ===================== CONVERSIÓN / COMBINADO =====================

// Word (.docx) -> PDF (bytes). Usa mammoth (docx -> HTML) y html2pdf (HTML -> PDF).
async function docxToPdfBytes(file){
  const arrayBuffer = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });

  const el = document.createElement('div');
  el.innerHTML = `
    <style>
      .docx-pdf{font-family:"Times New Roman", Times, serif; font-size:12pt; line-height:1.4; color:#000; background:#fff;}
      .docx-pdf p{margin:0 0 8pt;}
      .docx-pdf h1,.docx-pdf h2,.docx-pdf h3,.docx-pdf h4{margin:12pt 0 6pt;}
      .docx-pdf table{border-collapse:collapse; width:100%; margin:8pt 0;}
      .docx-pdf td,.docx-pdf th{border:1px solid #000; padding:4pt 6pt; vertical-align:top;}
      .docx-pdf img{max-width:100%;}
      .docx-pdf ul,.docx-pdf ol{margin:0 0 8pt 20pt;}
    </style>
    <div class="docx-pdf">${html}</div>`;

  const buf = await html2pdf().set({
    margin: [15, 15, 15, 15],
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] }
  }).from(el).outputPdf('arraybuffer');

  return new Uint8Array(buf);
}

// Cualquier archivo aceptado -> bytes de PDF
async function toPdfBytes(file){
  if(fileKind(file) === 'docx') return await docxToPdfBytes(file);
  return new Uint8Array(await file.arrayBuffer());
}

// Une varios PDFs (en el orden dado) en uno solo
async function mergePdfs(byteArrays){
  const out = await PDFLib.PDFDocument.create();
  for(const bytes of byteArrays){
    const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await out.copyPages(doc, doc.getPageIndices());
    pages.forEach(p => out.addPage(p));
  }
  return await out.save();
}

// Devuelve los bytes finales de una celda: 1 archivo -> convertido a PDF; varios -> combinados
async function buildCellPdf(files){
  if(files.length === 1) return await toPdfBytes(files[0]);
  const all = [];
  for(const f of files) all.push(await toPdfBytes(f));
  return await mergePdfs(all);
}

// ===================== DESCARGA =====================

downloadBtn.addEventListener('click', async () => {
  const ids = Object.keys(rowsData);
  if(ids.length === 0) return;
  downloadBtn.disabled = true;

  try{
    const zip = new JSZip();
    const root = zip.folder(ROOT_FOLDER);

    let step = 0;
    for(const id of ids){
      const r = rowsData[id];
      step++;
      const area = AREAS.find(a => a.value === r.area);
      const numeroFmt = formatNumero(r.numero);

      // FORMATOS Y ADJUNTOS ASESORIAS / 2025-I / DERECHO PÚBLICO / ASESORÍA No.XXXX / archivos
      const asesoriaFolder = root
        .folder(r.semestre)
        .folder(area ? area.folder : r.area.toUpperCase())
        .folder(`ASESORÍA No.${numeroFmt}`);

      for(let idx = 0; idx < TEMPLATES.length; idx++){
        const files = filesOf(r, idx);
        if(!files.length) continue;
        const tpl = TEMPLATES[idx];
        actionMsg.textContent = `Procesando asesoría ${step} de ${ids.length}: ${tpl.label}...`;
        try{
          const bytes = await buildCellPdf(files);
          asesoriaFolder.file(`${tpl.prefix}${numeroFmt}.pdf`, bytes);
        }catch(err){
          throw new Error(`No se pudo procesar "${files.map(f => f.name).join(', ')}" (${err.message})`);
        }
      }
    }

    actionMsg.textContent = 'Generando ZIP...';
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ROOT_FOLDER}.zip`;
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

// ===================== DETECCIÓN DEL NÚMERO =====================

// Quita tildes/diacríticos para que "ASESORÍA" y "ASESORIA" matcheen igual
function normalize(text){
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function extractFromFilename(name){
  const clean = normalize(name);

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

  const all = clean.match(/\d{3,6}/g);
  if(all && all.length) return all.sort((a,b) => b.length - a.length)[0];
  return null;
}

function extractFromText(text){
  const clean = normalize(text);
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
  return extractFromText(fullText);
}

async function extractFromDocxContent(file){
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  return extractFromText(value.slice(0, 3000));
}

if(window.pdfjsLib){
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

addRow();

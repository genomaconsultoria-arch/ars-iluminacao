/* =====================================================================
   ARS Iluminação — Relatório de Visitação Sodimac
   App 100% client-side: dados em localStorage
===================================================================== */

const STORAGE_KEY  = 'ars_visits_v3';
const CATALOG_KEY  = 'ars_catalog_v3';
const GS_URL_KEY   = 'ars_gsheets_url';

/* ---------- Google Sheets sync ---------- */
function getGSheetsUrl(){ return localStorage.getItem(GS_URL_KEY) || ''; }
function setGSheetsUrl(url){ localStorage.setItem(GS_URL_KEY, url||''); }

async function syncVisitToSheets(visit){
  const url = getGSheetsUrl();
  if(!url) return {ok:false, skipped:true};
  try{
    const resp = await fetch(url, {
      method:'POST',
      mode:'no-cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({action:'save', visita: visit})
    });
    return {ok:true};
  }catch(err){
    console.warn('Sync falhou:', err);
    return {ok:false, error: err.message};
  }
}

async function deleteVisitFromSheets(id){
  const url = getGSheetsUrl();
  if(!url) return;
  try{
    await fetch(url, {
      method:'POST',
      mode:'no-cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({action:'delete', id: id})
    });
  }catch(err){ console.warn('Delete remoto falhou:', err); }
}

async function loadVisitsFromSheets(){
  const url = getGSheetsUrl();
  if(!url){ alert('Configure a URL do Google Sheets em Configuracoes.'); return; }
  try{
    const resp = await fetch(url + '?action=list');
    const data = await resp.json();
    if(data.ok){
      const count = (data.visitas||[]).length;
      alert(`Dados carregados do Google Sheets: ${count} visita(s) encontrada(s).\n\nObservacao: a sincronizacao ocorre automaticamente a cada salvamento.`);
    }
  }catch(err){
    alert('Erro ao carregar do Google Sheets: ' + err.message);
  }
}

/* ---------- Catálogo padrão (extraído dos relatórios em papel) ---------- */
const mkItem = (codigo, produto) => ({codigo, ean:'', produto, estoqueIdeal:'', img:''});
const DEFAULT_CATALOG = [
  mkItem('946-ORPTBR',   'PLAFON QUADRADO ORION FILETE PRETO BRANCO 30X30CM'),
  mkItem('901-AED-CA',   'PLAFON REDONDO CADENCE BR 30x30'),
  mkItem('955-CDS',      'PLAFON REDONDO FOSCO 01 LAMPADA 23X25CM'),
  mkItem('PL1013/1-QD',  'PLAFON VIDRO 1 LAMP. MARANHAO 250MM QD'),
  mkItem('PL1013/1-RD',  'PLAFON VIDRO 1 LAMP. MARANHAO 250MM RD'),
  mkItem('PL1017/1-RD',  'PLAFON VIDRO 1 LAMP. RECIFE 250MM RD'),
  mkItem('PL1062-QD',    'PLAFON VIDRO 1 LAMP. RIO JAN. 250MM QD'),
  mkItem('PL10072-QD',   'PLAFON VIDRO 2 LAMP. ARACAJU 300MM QD'),
  mkItem('PL1012/2-RD',  'PLAFON VIDRO 2 LAMP. RECIFE 300MM RD'),
  mkItem('PL1062-QD2',   'PLAFON VIDRO 2 LAMP. RIO JAN. 300MM QD'),
  mkItem('945-BABR',     'PLAFON VIDRO 24E27 QUADRADO BAMBU BRANCO 30X30CM'),
  mkItem('0900-QUAD-RIS','PLAFON VIDRO RISK QUADRADO BRANCO'),
  mkItem('901-RED-RIS',  'PLAFON VIDRO RISK REDONDO BRANCO'),
  mkItem('6201-BR',      'PLAFON VIDRO ROCA TELA NA COR BRANCA PARA 01 LAMPADA'),
  mkItem('6201-PT',      'PLAFON VIDRO ROCA TELA NA COR PRETO PARA 01 LAMPADA'),
  mkItem('2227/1BR',     'SPOT BJ1 SINO ALUMINIO BRANCO'),
  mkItem('2227/1PT',     'SPOT BJ1 SINO ALUMINIO PRETO'),
  mkItem('4207/1BR',     'TUBOLALETA ALUMINIO BRANCO'),
];

/* Fotos do expositor da visita em edição */
let expoAntes = [];
let expoDepois = [];

/* ---------- Estado ---------- */
let state = {
  visits:  loadJSON(STORAGE_KEY,  []),
  catalog: loadJSON(CATALOG_KEY, DEFAULT_CATALOG),
  editingId: null,
  presentSlides: [],
  presentIndex: 0,
};

function loadJSON(key, fallback){
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch(e){ return fallback; }
}
function saveJSON(key,data){ localStorage.setItem(key, JSON.stringify(data)); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

/* ---------- NAVEGAÇÃO ---------- */
function showView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.view===name);
  });
  if(name==='dashboard') renderDashboard();
  if(name==='new' && !state.editingId) resetForm();
  if(name==='catalog') renderCatalog();
  if(name==='config') renderConfig();
}
document.querySelectorAll('.nav-btn').forEach(b=>{
  b.addEventListener('click', ()=>showView(b.dataset.view));
});

/* ---------- DASHBOARD ---------- */
function renderDashboard(){
  const list  = document.getElementById('visit-list');
  const empty = document.getElementById('empty-state');
  const hero  = document.getElementById('welcome-hero');
  const head  = document.getElementById('visits-head');
  const heroStats = document.getElementById('hero-stats');
  list.innerHTML='';

  // Hero stats
  const totalVisitas = state.visits.length;
  const totalProdutos = state.visits.reduce((s,v)=>s+v.produtos.length,0);
  const totalExpostos = state.visits.reduce((s,v)=>s+v.produtos.filter(p=>p.exposto==='S').length,0);
  if(heroStats){
    heroStats.innerHTML = `
      <div class="hero-stat"><div class="num">${totalVisitas}</div><div class="lbl">Visitas</div></div>
      <div class="hero-stat"><div class="num">${totalProdutos}</div><div class="lbl">Produtos</div></div>
      <div class="hero-stat"><div class="num">${totalExpostos}</div><div class="lbl">Expostos</div></div>
    `;
  }

  if(state.visits.length===0){
    empty.classList.remove('hidden');
    if(hero) hero.style.display='';
    if(head) head.style.display='none';
    return;
  }
  empty.classList.add('hidden');
  if(hero) hero.style.display='';
  if(head) head.style.display='flex';

  state.visits.slice().reverse().forEach(v=>{
    const total = v.produtos.length;
    const expostos = v.produtos.filter(p=>p.exposto==='S').length;
    const comDepois = v.produtos.filter(p=>p.fotoDepois).length;
    const card = document.createElement('div');
    card.className='visit-card';
    card.innerHTML=`
      <h3>${escapeHTML(v.loja || 'Sem loja')}</h3>
      <div class="meta">${escapeHTML(v.cidade||'')} • ${formatDate(v.data)} • ${escapeHTML(v.visitador||'—')}</div>
      <div class="stats">
        <span>📦 ${total} itens</span>
        <span>✅ ${expostos} expostos</span>
        <span>📷 ${comDepois} c/ depois</span>
      </div>
      <div class="actions">
        <button class="btn primary small" onclick="event.stopPropagation();openReport('${v.id}')">Relatório</button>
        <button class="btn ghost small" onclick="event.stopPropagation();editVisit('${v.id}')">Editar</button>
        <button class="btn ghost small" onclick="event.stopPropagation();deleteVisit('${v.id}')">Excluir</button>
      </div>`;
    card.addEventListener('click', ()=>openReport(v.id));
    list.appendChild(card);
  });
}

/* ---------- FORMULÁRIO ---------- */
function resetForm(){
  state.editingId=null;
  document.getElementById('form-title').textContent='Nova Visita';
  ['f-loja','f-cidade','f-visitador','f-br','f-conclusoes'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('f-data').value = new Date().toISOString().slice(0,10);
  document.getElementById('f-tipo').selectedIndex=2;
  document.getElementById('produtos-body').innerHTML='';
  expoAntes=[]; expoDepois=[];
  renderExpoGallery('antes');
  renderExpoGallery('depois');
  loadCatalogToVisit();
}

function loadCatalogToVisit(){
  const body=document.getElementById('produtos-body');
  body.innerHTML='';
  state.catalog.forEach(c=>addRow(c));
}

function addRow(data={}){
  const tr=document.createElement('tr');
  const id=uid();
  tr.dataset.id=id;
  const thumb = data.img
    ? `<img src="${data.img}" class="thumb-mini">`
    : `<div class="thumb-mini empty">—</div>`;
  tr.innerHTML=`
    <td>${thumb}<input type="hidden" data-f="img" value="${escapeAttr(data.img||'')}"></td>
    <td><input type="text" value="${escapeAttr(data.codigo||'')}" data-f="codigo"></td>
    <td><input type="text" value="${escapeAttr(data.ean||'')}" data-f="ean" placeholder="EAN"></td>
    <td><input type="text" value="${escapeAttr(data.produto||'')}" data-f="produto">
        <input type="hidden" data-f="estoqueIdeal" value="${escapeAttr(data.estoqueIdeal||'')}"></td>
    <td>
      <select data-f="exposto">
        <option value="">-</option>
        <option ${data.exposto==='S'?'selected':''}>S</option>
        <option ${data.exposto==='N'?'selected':''}>N</option>
      </select>
    </td>
    <td><input type="number" min="0" value="${escapeAttr(data.qtd||'')}" data-f="qtd"></td>
    <td><input type="text" value="${escapeAttr(data.obs||'')}" data-f="obs" placeholder="Observações..."></td>
    <td><button class="btn danger small" onclick="this.closest('tr').remove()">×</button></td>
  `;
  document.getElementById('produtos-body').appendChild(tr);
}

/* ---------- FOTOS DO EXPOSITOR ---------- */
function addExpoPhotos(ev, kind){
  const files = Array.from(ev.target.files||[]); if(!files.length) return;
  let remaining = files.length;
  files.forEach(file=>{
    const reader = new FileReader();
    reader.onload = e=>{
      const img = new Image();
      img.onload = ()=>{
        const max=1400;
        let w=img.width, h=img.height;
        if(w>h && w>max){ h=h*(max/w); w=max; }
        else if(h>max){ w=w*(max/h); h=max; }
        const c=document.createElement('canvas');
        c.width=w; c.height=h;
        c.getContext('2d').drawImage(img,0,0,w,h);
        const dataUrl = c.toDataURL('image/jpeg', 0.8);
        if(kind==='antes') expoAntes.push(dataUrl); else expoDepois.push(dataUrl);
        remaining--;
        if(remaining===0) renderExpoGallery(kind);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
  ev.target.value='';
}
function renderExpoGallery(kind){
  const arr = kind==='antes'?expoAntes:expoDepois;
  const el  = document.getElementById('expo-'+kind);
  if(!arr.length){
    el.innerHTML = `<div class="empty-gallery">Nenhuma foto do expositor ${kind.toUpperCase()}.<br>Clique em "+ Adicionar fotos" acima.</div>`;
    return;
  }
  el.innerHTML = arr.map((src,i)=>`
    <div class="expo-item">
      <img src="${src}" onclick="openLightbox('${kind}',${i})">
      <button class="remove" onclick="removeExpoPhoto('${kind}',${i})">×</button>
    </div>`).join('');
}
function removeExpoPhoto(kind,i){
  if(kind==='antes') expoAntes.splice(i,1); else expoDepois.splice(i,1);
  renderExpoGallery(kind);
}
function openLightbox(kind,i){
  const src = (kind==='antes'?expoAntes:expoDepois)[i];
  const w = window.open('','_blank');
  w.document.write(`<body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh"><img src="${src}" style="max-width:100%;max-height:100%"></body>`);
}

function collectForm(){
  const produtos=[];
  document.querySelectorAll('#produtos-body tr').forEach(tr=>{
    const obj={};
    tr.querySelectorAll('[data-f]').forEach(el=>{
      obj[el.dataset.f]=el.value;
    });
    if(obj.codigo||obj.produto||obj.ean) produtos.push(obj);
  });
  return {
    id: state.editingId || uid(),
    loja:  document.getElementById('f-loja').value,
    cidade:document.getElementById('f-cidade').value,
    visitador:document.getElementById('f-visitador').value,
    data:  document.getElementById('f-data').value,
    br:    document.getElementById('f-br').value,
    tipo:  document.getElementById('f-tipo').value,
    conclusoes: document.getElementById('f-conclusoes').value,
    expoAntes: expoAntes.slice(),
    expoDepois: expoDepois.slice(),
    produtos,
    createdAt: state.editingId ? (state.visits.find(v=>v.id===state.editingId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
function saveVisit(){
  const v=collectForm();
  if(!v.loja){ alert('Informe a loja Sodimac.'); return; }
  if(state.editingId){
    state.visits = state.visits.map(x=>x.id===v.id ? v : x);
  } else {
    state.visits.push(v);
  }
  saveJSON(STORAGE_KEY, state.visits);
  state.editingId=null;

  // Sincronizar com Google Sheets (nao bloqueia)
  const visitNoPhotos = {...v, expoAntes:[], expoDepois:[], produtos: v.produtos.map(p=>({...p, img:''}))};
  syncVisitToSheets(visitNoPhotos).then(r=>{
    if(r.ok) console.log('Sincronizado com Google Sheets');
  });

  showView('dashboard');
}
function editVisit(id){
  const v = state.visits.find(x=>x.id===id); if(!v) return;
  state.editingId=id;
  document.getElementById('form-title').textContent='Editar Visita';
  document.getElementById('f-loja').value=v.loja||'';
  document.getElementById('f-cidade').value=v.cidade||'';
  document.getElementById('f-visitador').value=v.visitador||'';
  document.getElementById('f-data').value=v.data||'';
  document.getElementById('f-br').value=v.br||'';
  document.getElementById('f-tipo').value=v.tipo||'Comparativa (antes + depois)';
  document.getElementById('f-conclusoes').value=v.conclusoes||'';
  document.getElementById('produtos-body').innerHTML='';
  v.produtos.forEach(p=>addRow(p));
  expoAntes = (v.expoAntes||[]).slice();
  expoDepois= (v.expoDepois||[]).slice();
  renderExpoGallery('antes');
  renderExpoGallery('depois');
  showView('new');
}
function deleteVisit(id){
  if(!confirm('Excluir esta visita? Não é possível desfazer.')) return;
  state.visits = state.visits.filter(v=>v.id!==id);
  saveJSON(STORAGE_KEY, state.visits);
  deleteVisitFromSheets(id);
  renderDashboard();
}

/* ---------- CONFIGURACOES ---------- */
function saveGSheetsConfig(){
  const url = document.getElementById('f-gsheets-url').value.trim();
  setGSheetsUrl(url);
  alert(url ? 'URL salva! As proximas visitas serao sincronizadas automaticamente.' : 'URL removida. Sincronizacao desativada.');
  renderConfig();
}
function renderConfig(){
  const input = document.getElementById('f-gsheets-url');
  if(input) input.value = getGSheetsUrl();
  const status = document.getElementById('sync-status');
  if(status){
    const url = getGSheetsUrl();
    status.innerHTML = url
      ? '<span style="color:#16a34a">&#9679; Sincronizacao ATIVA</span>'
      : '<span style="color:#6b7280">&#9679; Sincronizacao desativada (salvando apenas localmente)</span>';
  }
}
async function syncAllVisits(){
  const url = getGSheetsUrl();
  if(!url){ alert('Configure a URL antes.'); return; }
  if(!confirm('Sincronizar todas as '+state.visits.length+' visitas para o Google Sheets?')) return;
  let ok = 0;
  for(const v of state.visits){
    const vNoPhotos = {...v, expoAntes:[], expoDepois:[], produtos: v.produtos.map(p=>({...p, img:''}))};
    const r = await syncVisitToSheets(vNoPhotos);
    if(r.ok) ok++;
  }
  alert(`Sincronizacao concluida: ${ok}/${state.visits.length} visitas enviadas.`);
}

/* ---------- CATÁLOGO ---------- */
function renderCatalog(){
  const body=document.getElementById('catalog-body'); body.innerHTML='';
  state.catalog.forEach((c,i)=>{
    const tr=document.createElement('tr');
    const thumb = c.img
      ? `<img src="${c.img}" class="thumb-cat">`
      : `<div class="thumb-cat empty">+ foto</div>`;
    tr.innerHTML=`
      <td>
        <label class="thumb-upload" title="Clique para enviar imagem">
          ${thumb}
          <input type="file" accept="image/*" style="display:none" onchange="handleCatalogImage(event,${i})">
        </label>
        ${c.img?`<button class="btn danger small" style="margin-top:4px" onclick="removeCatalogImage(${i})">×</button>`:''}
      </td>
      <td><input type="text" value="${escapeAttr(c.codigo)}" onchange="updateCatalogField(${i},'codigo',this.value)"></td>
      <td><input type="text" value="${escapeAttr(c.ean||'')}" placeholder="EAN" onchange="updateCatalogField(${i},'ean',this.value)"></td>
      <td><input type="text" value="${escapeAttr(c.produto)}" onchange="updateCatalogField(${i},'produto',this.value)"></td>
      <td><input type="number" min="0" value="${escapeAttr(c.estoqueIdeal||'')}" onchange="updateCatalogField(${i},'estoqueIdeal',this.value)"></td>
      <td><button class="btn danger small" onclick="removeCatalogItem(${i})">×</button></td>`;
    body.appendChild(tr);
  });
}
function updateCatalogField(i,field,value){
  state.catalog[i][field]=value;
  saveJSON(CATALOG_KEY,state.catalog);
}
function handleCatalogImage(ev,i){
  const file=ev.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      const max=400;
      let w=img.width,h=img.height;
      if(w>h && w>max){ h=h*(max/w); w=max; }
      else if(h>max){ w=w*(max/h); h=max; }
      const c=document.createElement('canvas');
      c.width=w; c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      state.catalog[i].img=c.toDataURL('image/jpeg',0.8);
      saveJSON(CATALOG_KEY,state.catalog);
      renderCatalog();
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}
function removeCatalogImage(i){
  state.catalog[i].img='';
  saveJSON(CATALOG_KEY,state.catalog);
  renderCatalog();
}
function addCatalogItem(){
  state.catalog.push({codigo:'',ean:'',produto:'',estoqueIdeal:'',img:''});
  saveJSON(CATALOG_KEY,state.catalog);
  renderCatalog();
}
function removeCatalogItem(i){
  state.catalog.splice(i,1);
  saveJSON(CATALOG_KEY,state.catalog);
  renderCatalog();
}
function resetCatalog(){
  if(!confirm('Restaurar catálogo padrão? As alterações serão perdidas.')) return;
  state.catalog=JSON.parse(JSON.stringify(DEFAULT_CATALOG));
  saveJSON(CATALOG_KEY,state.catalog);
  renderCatalog();
}

/* ============================================================
   RELATÓRIO COMPARATIVO
============================================================ */
function openReport(id){
  const v=state.visits.find(x=>x.id===id); if(!v) return;
  const r = analyzeVisit(v);

  const antesImgs  = (v.expoAntes ||[]).map(s=>`<div class="ph"><img src="${s}"></div>`).join('') || '<div class="ph">Sem foto do expositor ANTES</div>';
  const depoisImgs = (v.expoDepois||[]).map(s=>`<div class="ph"><img src="${s}"></div>`).join('') || '<div class="ph">Sem foto do expositor DEPOIS</div>';

  const html = `
    <div class="report-header">
      <div><strong>Loja</strong>${escapeHTML(v.loja||'-')}</div>
      <div><strong>Cidade / UF</strong>${escapeHTML(v.cidade||'-')}</div>
      <div><strong>Data</strong>${formatDate(v.data)}</div>
      <div><strong>Visitador</strong>${escapeHTML(v.visitador||'-')}</div>
      <div><strong>Gerente</strong>${escapeHTML(v.br||'-')}</div>
      <div><strong>Tipo</strong>${escapeHTML(v.tipo||'-')}</div>
    </div>

    <h3>Indicadores</h3>
    <div class="kpis">
      <div class="kpi"><div class="num">${r.total}</div><div class="lbl">Itens analisados</div></div>
      <div class="kpi good"><div class="num">${r.expostos}</div><div class="lbl">Expostos</div></div>
      <div class="kpi"><div class="num">${r.percCobertura}%</div><div class="lbl">Cobertura do mix</div></div>
      <div class="kpi ${r.expostos>r.naoExpostos?'good':'bad'}"><div class="num">${r.naoExpostos}</div><div class="lbl">Não expostos</div></div>
    </div>

    <h3>Comparativo do Expositor</h3>
    <div class="expo-report">
      <div>
        <div class="expo-lbl">ANTES</div>
        <div class="expo-photos">${antesImgs}</div>
      </div>
      <div>
        <div class="expo-lbl">DEPOIS</div>
        <div class="expo-photos">${depoisImgs}</div>
      </div>
    </div>

    <h3>Produtos vistoriados</h3>
    <div class="table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Img</th><th>Código</th><th>EAN</th><th>Produto</th>
            <th>Exp.</th><th>Qtd</th><th>Obs.</th>
          </tr>
        </thead>
        <tbody>
          ${r.linhas.map(l=>`
            <tr class="${l.exposto==='S'?'row-ok':l.exposto==='N'?'row-bad':''}">
              <td>${l.img?`<img src="${l.img}" class="thumb-report">`:'<div class="thumb-report empty">—</div>'}</td>
              <td>${escapeHTML(l.codigo||'')}</td>
              <td>${escapeHTML(l.ean||'')}</td>
              <td>${escapeHTML(l.produto||'')}</td>
              <td><strong>${escapeHTML(l.exposto||'—')}</strong></td>
              <td>${escapeHTML(l.qtd||'—')}</td>
              <td>${escapeHTML(l.obs||'')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="suggestions">
      <h3>Sugestões automáticas e conclusões</h3>
      <ul>${r.sugestoes.map(s=>`<li>${escapeHTML(s)}</li>`).join('')}</ul>
      ${v.conclusoes ? `<p style="margin-top:10px"><strong>Comentário do visitador:</strong> ${escapeHTML(v.conclusoes)}</p>` : ''}
    </div>
  `;
  document.getElementById('report-content').innerHTML=html;
  document.getElementById('modal-report').classList.remove('hidden');
  state._currentReport = {visit:v, analysis:r};
}

function analyzeVisit(v){
  const linhas = v.produtos.map(p=>({
    img:p.img, codigo:p.codigo, ean:p.ean, produto:p.produto,
    exposto:p.exposto, qtd:p.qtd,
    estoqueIdeal:p.estoqueIdeal, obs:p.obs,
  }));
  const total = linhas.length;
  const expostos = linhas.filter(l=>l.exposto==='S').length;
  const naoExpostos = linhas.filter(l=>l.exposto==='N').length;
  const percCobertura = total ? Math.round((expostos/total)*100) : 0;

  // Sugestões automáticas
  const sug=[];
  const ausentes = linhas.filter(l=>l.exposto!=='S');
  const temAntes  = (v.expoAntes ||[]).length;
  const temDepois = (v.expoDepois||[]).length;

  if(!temAntes)  sug.push('Nenhuma foto do expositor ANTES foi registrada — essencial para comprovar a evolução.');
  if(!temDepois) sug.push('Nenhuma foto do expositor DEPOIS foi registrada — registrar para fechar a visita.');
  if(temAntes && temDepois) sug.push(`Expositor documentado com ${temAntes} foto(s) ANTES e ${temDepois} foto(s) DEPOIS — evidências completas.`);

  if(ausentes.length){
    sug.push(`${ausentes.length} produto(s) sem exposição na gancheira — priorizar reposição na próxima visita.`);
    ausentes.slice(0,5).forEach(l=>sug.push(`Sugerir exposição imediata: ${l.codigo||'—'}${l.ean?' (EAN '+l.ean+')':''} — ${l.produto||''}.`));
  }
  if(percCobertura>=80) sug.push(`Excelente cobertura: ${percCobertura}% do mix ARS exposto — manter padrão na próxima visita.`);
  else if(percCobertura>=50) sug.push(`Cobertura intermediária (${percCobertura}%) — espaço para crescer com negociação de pontos extras.`);
  else sug.push(`Cobertura baixa (${percCobertura}%) — recomenda-se reunião com a gerência da loja para revisão de planograma.`);

  return {linhas,total,expostos,naoExpostos,percCobertura,sugestoes:sug};
}

function closeModal(){
  document.getElementById('modal-report').classList.add('hidden');
}

/* ============================================================
   MODO APRESENTAÇÃO
============================================================ */
function presentMode(){
  const ctx = state._currentReport; if(!ctx) return;
  const v=ctx.visit, r=ctx.analysis;
  const slides=[];
  // Capa
  slides.push(`
    <div class="lbl">ARS Iluminação</div>
    <h2>Relatório de Visitação</h2>
    <h3>${escapeHTML(v.loja||'')} — ${formatDate(v.data)}</h3>
    <p style="opacity:.7">Visitador: ${escapeHTML(v.visitador||'-')}</p>
  `);
  // KPIs
  slides.push(`
    <div class="lbl">Visão geral</div>
    <h2>Resultados da visita</h2>
    <div class="present-summary">
      <div class="kpi"><div class="num">${r.total}</div><div class="lbl">Itens</div></div>
      <div class="kpi"><div class="num">${r.expostos}</div><div class="lbl">Expostos</div></div>
      <div class="kpi"><div class="num">${r.naoExpostos}</div><div class="lbl">Ausentes</div></div>
      <div class="kpi"><div class="num">${r.percCobertura}%</div><div class="lbl">Cobertura</div></div>
    </div>
  `);
  // Slide comparativo do expositor (principal par de fotos)
  const antesMain  = (v.expoAntes ||[])[0];
  const depoisMain = (v.expoDepois||[])[0];
  slides.push(`
    <div class="lbl">Comparativo do Expositor</div>
    <h2>Antes × Depois</h2>
    <div class="compare">
      <div>
        <div class="lbl">Antes</div>
        <div class="ph">${antesMain?`<img src="${antesMain}">`:'sem registro'}</div>
      </div>
      <div>
        <div class="lbl">Depois</div>
        <div class="ph">${depoisMain?`<img src="${depoisMain}">`:'sem registro'}</div>
      </div>
    </div>
  `);
  // Slides adicionais para fotos extras do expositor
  const extraCount = Math.max((v.expoAntes||[]).length, (v.expoDepois||[]).length);
  for(let i=1;i<extraCount;i++){
    const a=(v.expoAntes||[])[i], d=(v.expoDepois||[])[i];
    slides.push(`
      <div class="lbl">Expositor — ângulo ${i+1}</div>
      <h2>Antes × Depois</h2>
      <div class="compare">
        <div><div class="lbl">Antes</div><div class="ph">${a?`<img src="${a}">`:'sem registro'}</div></div>
        <div><div class="lbl">Depois</div><div class="ph">${d?`<img src="${d}">`:'sem registro'}</div></div>
      </div>
    `);
  }
  // Sugestões
  slides.push(`
    <div class="lbl">Próximos passos</div>
    <h2>Sugestões e conclusões</h2>
    <ul style="text-align:left;font-size:18px;line-height:1.6;max-width:800px;margin:0 auto">
      ${r.sugestoes.map(s=>`<li>${escapeHTML(s)}</li>`).join('')}
    </ul>
  `);

  state.presentSlides=slides;
  state.presentIndex=0;
  document.getElementById('modal-present').classList.remove('hidden');
  renderSlide();
}
function renderSlide(){
  document.getElementById('present-slide').innerHTML = state.presentSlides[state.presentIndex];
  document.getElementById('present-counter').textContent = `${state.presentIndex+1} / ${state.presentSlides.length}`;
}
function presentNav(d){
  state.presentIndex = (state.presentIndex+d+state.presentSlides.length)%state.presentSlides.length;
  renderSlide();
}
function closePresent(){
  document.getElementById('modal-present').classList.add('hidden');
}
document.addEventListener('keydown', e=>{
  if(document.getElementById('modal-present').classList.contains('hidden')) return;
  if(e.key==='ArrowRight'||e.key===' ') presentNav(1);
  if(e.key==='ArrowLeft') presentNav(-1);
  if(e.key==='Escape') closePresent();
});

/* ---------- HELPERS ---------- */
function escapeHTML(s){return (s==null?'':String(s)).replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))}
function escapeAttr(s){return escapeHTML(s)}
function formatDate(d){
  if(!d) return '—';
  const [y,m,day]=d.split('-');
  return `${day}/${m}/${y}`;
}

/* ---------- INIT ---------- */
renderDashboard();

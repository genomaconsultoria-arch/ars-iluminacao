/**
 * ARS Iluminacao - Backend Google Sheets
 *
 * INSTRUCOES DE USO:
 * 1. Crie uma planilha no Google Sheets (https://sheets.google.com)
 * 2. Renomeie a planilha para "ARS Visitas"
 * 3. Va em Extensoes > Apps Script
 * 4. Apague o codigo padrao e cole este codigo todo
 * 5. Clique no disquete para salvar
 * 6. Clique em "Implantar" > "Nova implantacao"
 * 7. Clique na engrenagem e selecione "Aplicativo da Web"
 * 8. Execute como: "Eu" / Quem tem acesso: "Qualquer pessoa"
 * 9. Clique em "Implantar" e copie a URL do aplicativo da web
 * 10. Cole essa URL na tela de configuracao do app ARS
 */

const SHEET_VISITAS = 'Visitas';
const SHEET_PRODUTOS = 'Produtos';

// Cabecalhos das planilhas
const HEADER_VISITAS = ['id','data','loja','cidade','visitador','gerente','tipo','conclusoes','totalProdutos','totalExpostos','percCobertura','createdAt','updatedAt'];
const HEADER_PRODUTOS = ['visitId','loja','data','codigo','ean','produto','exposto','qtd','estoqueIdeal','obs'];

function doGet(e){
  const action = (e && e.parameter && e.parameter.action) || 'list';
  if(action === 'list'){
    return jsonResponse({ok:true, visitas: listVisitas(), produtos: listProdutos()});
  }
  return jsonResponse({ok:true, message:'ARS Backend ativo'});
}

function doPost(e){
  try{
    const body = JSON.parse(e.postData.contents);
    const action = body.action || 'save';

    if(action === 'save'){
      saveVisita(body.visita);
      return jsonResponse({ok:true, message:'Visita salva'});
    }
    if(action === 'delete'){
      deleteVisita(body.id);
      return jsonResponse({ok:true, message:'Visita excluida'});
    }
    if(action === 'list'){
      return jsonResponse({ok:true, visitas: listVisitas(), produtos: listProdutos()});
    }
    return jsonResponse({ok:false, message:'Acao desconhecida'});
  }catch(err){
    return jsonResponse({ok:false, error: err.toString()});
  }
}

function jsonResponse(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name, headers){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if(!sheet){
    sheet = ss.insertSheet(name);
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,headers.length).setFontWeight('bold').setBackground('#1a2a5e').setFontColor('#ffffff');
  }
  return sheet;
}

function saveVisita(v){
  const sheetV = getSheet(SHEET_VISITAS, HEADER_VISITAS);
  const sheetP = getSheet(SHEET_PRODUTOS, HEADER_PRODUTOS);

  // Remover registros antigos dessa visita (caso seja edicao)
  removeRowsById(sheetV, v.id, 0);
  removeRowsByVisitId(sheetP, v.id);

  // Estatisticas
  const totalProd = (v.produtos||[]).length;
  const totalExp  = (v.produtos||[]).filter(p=>p.exposto==='S').length;
  const percCov   = totalProd ? Math.round((totalExp/totalProd)*100) : 0;

  // Inserir visita
  sheetV.appendRow([
    v.id, v.data||'', v.loja||'', v.cidade||'', v.visitador||'',
    v.br||'', v.tipo||'', v.conclusoes||'',
    totalProd, totalExp, percCov,
    v.createdAt||'', v.updatedAt||''
  ]);

  // Inserir produtos
  (v.produtos||[]).forEach(p=>{
    sheetP.appendRow([
      v.id, v.loja||'', v.data||'',
      p.codigo||'', p.ean||'', p.produto||'',
      p.exposto||'', p.qtd||'', p.estoqueIdeal||'', p.obs||''
    ]);
  });
}

function deleteVisita(id){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetV = ss.getSheetByName(SHEET_VISITAS);
  const sheetP = ss.getSheetByName(SHEET_PRODUTOS);
  if(sheetV) removeRowsById(sheetV, id, 0);
  if(sheetP) removeRowsByVisitId(sheetP, id);
}

function removeRowsById(sheet, id, colIndex){
  const data = sheet.getDataRange().getValues();
  for(let i = data.length-1; i>=1; i--){
    if(String(data[i][colIndex]) === String(id)){
      sheet.deleteRow(i+1);
    }
  }
}

function removeRowsByVisitId(sheet, visitId){
  removeRowsById(sheet, visitId, 0);
}

function listVisitas(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_VISITAS);
  if(!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if(data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row=>{
    const obj = {};
    headers.forEach((h,i)=>obj[h]=row[i]);
    return obj;
  });
}

function listProdutos(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PRODUTOS);
  if(!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if(data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row=>{
    const obj = {};
    headers.forEach((h,i)=>obj[h]=row[i]);
    return obj;
  });
}

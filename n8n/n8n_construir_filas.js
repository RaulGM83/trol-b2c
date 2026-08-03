// Nodo "Construir filas" — auto-detecta columnas, agrega SIEFOREs a su AFORE y filtra basura.
function strip(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();}
function num(v){const x=parseFloat(String(v??'').replace(/[^0-9.\-]/g,''));return isFinite(x)?x:null;}

function parseCSV(text){
  const clean=(text||'').replace(/\r/g,'').trim();
  if(!clean) return {headers:[],rows:[]};
  const lines=clean.split('\n');
  const c=(lines[0].match(/;/g)||[]).length, d=(lines[0].match(/,/g)||[]).length;
  const delim=c>d?';':',';
  const headers=lines[0].split(delim).map(h=>h.trim());
  const rows=lines.slice(1).map(l=>{const cells=l.split(delim);const o={};headers.forEach((h,i)=>o[h]=(cells[i]||'').trim());return o;});
  return {headers,rows};
}
// Encuentra el encabezado cuyo nombre (sin acentos/minúsculas) contenga alguna palabra clave.
function col(headers,kws){return headers.find(h=>{const k=strip(h);return kws.some(w=>k.includes(w));});}

// AFOREs válidas → nombre del catálogo. Las demás filas se descartan.
const CANON=[['xxi banorte','Banorte'],['xxi-banorte','Banorte'],['banorte','Banorte'],
 ['banamex','Citibanamex'],['citibanamex','Citibanamex'],['azteca','Azteca'],['coppel','Coppel'],
 ['inbursa','Inbursa'],['invercap','Invercap'],['pensionissste','PensionISSSTE'],
 ['principal','Principal'],['profuturo','Profuturo'],['sura','SURA']];
function canon(name){const k=strip(name);for(const [p,v] of CANON){if(k===p||k.startsWith(p+' ')||k.startsWith(p)) return v;}return null;}

function ingest(nodeName, valKeys, field, periodKeys){
  const {headers,rows}=parseCSV($(nodeName).first().json.data);
  const aforeCol=col(headers,['afore','administrador','siefore','denominacion','nombre'])||headers[0];
  const valCol=col(headers,valKeys);
  const perCol=periodKeys?col(headers,periodKeys):null;
  return {headers, aforeCol, valCol, perCol, rows};
}

const out={}; const debug={};
function up(a){const k=canon(a);if(!k)return null;if(!out[k])out[k]={afore:k};return out[k];}

// CUENTAS administradas
{const x=ingest('Descargar cuentas',['administrad','total de cuentas','cuentas'],'cuentas',['periodo','fecha','mes','corte']);
 debug.cuentas={headers:x.headers,aforeCol:x.aforeCol,valCol:x.valCol,perCol:x.perCol};
 x.rows.forEach(r=>{const o=up(r[x.aforeCol]);if(o){const n=num(r[x.valCol]);if(n!=null)o.cuentas=(o.cuentas||0)+n; if(x.perCol)o.periodo=r[x.perCol]||o.periodo;}});}

// ACTIVOS netos (a nivel SIEFORE → se suman por AFORE)
{const x=ingest('Descargar activos',['activo','neto','recurso','saldo'],'aum_mdp');
 debug.activos={headers:x.headers,aforeCol:x.aforeCol,valCol:x.valCol};
 x.rows.forEach(r=>{const o=up(r[x.aforeCol]);if(o){const n=num(r[x.valCol]);if(n!=null)o.aum_mdp=(o.aum_mdp||0)+n;}});}

// TRASPASOS (cedidos = salen, recibidos = entran)
{const {headers,rows}=parseCSV($('Descargar traspasos').first().json.data);
 const aforeCol=col(headers,['afore','administrador','nombre'])||headers[0];
 const cedCol=col(headers,['cedid','salida','enviad','salen','egreso']);
 const recCol=col(headers,['recibid','entrada','reciben','ingreso']);
 debug.traspasos={headers,aforeCol,cedCol,recCol};
 rows.forEach(r=>{const o=up(r[aforeCol]);if(o){const c=num(r[cedCol]),re=num(r[recCol]);if(c!=null)o.cedidos_cuentas=(o.cedidos_cuentas||0)+c;if(re!=null)o.recibidos_cuentas=(o.recibidos_cuentas||0)+re;}});}

const rows=Object.values(out).filter(o=>o.afore);
return [{ json: { rows, _debug: debug } }];

'use strict';
/* Precificador de Cestaria — app estático, dados salvos no navegador (localStorage). */

const KEY = 'precificador-cestaria-v1';
const CATS_INSUMO = ['Filamento 3D', 'Embalagem e cesta', 'Café da manhã / Comida', 'Bebidas', 'Flores e plantas', 'Papelaria / Personalizados', 'Outros'];
const CATS_PRODUTO = ['Cesta de presente', 'Café da manhã', 'Flores', 'Impresso 3D', 'Personalizado', 'Outro'];
const UNIDADES = ['un', 'g', 'kg', 'ml', 'L', 'm', 'cm', 'folha'];
const ARREDONDAMENTOS = { none: 'Sem arredondar', up1: 'Para cima, inteiro (R$ 45)', x90: 'Terminar em ,90 (R$ 44,90)' };

const uid = () => Math.random().toString(36).slice(2, 9);
const brl = n => isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- Estado ---------- */
function seed() {
  const ins = (nome, cat, un, preco, qtd) => ({ id: uid(), nome, cat, un, preco, qtd });
  const pla = ins('Filamento PLA (rolo 1kg)', 'Filamento 3D', 'g', 110, 1000);
  const cesta = ins('Cesta de vime média', 'Embalagem e cesta', 'un', 18, 1);
  const palha = ins('Palha / enchimento (pacote)', 'Embalagem e cesta', 'g', 12, 500);
  const fita = ins('Fita de cetim (rolo 10m)', 'Embalagem e cesta', 'm', 8, 10);
  const celo = ins('Papel celofane (folha)', 'Embalagem e cesta', 'folha', 2.5, 1);
  const bolo = ins('Bolo caseiro (pote)', 'Café da manhã / Comida', 'un', 9, 1);
  const choc = ins('Chocolate em barra 90g', 'Café da manhã / Comida', 'un', 7.5, 1);
  const suco = ins('Suco de uva integral 300ml', 'Bebidas', 'un', 6, 1);
  const rosa = ins('Rosa (haste)', 'Flores e plantas', 'un', 4.5, 1);
  const cartao = ins('Cartão personalizado impresso', 'Papelaria / Personalizados', 'un', 1.8, 1);
  const chav = ins('Argola de chaveiro', 'Outros', 'un', 0.6, 1);
  const chaveiro = {
    id: uid(), nome: 'Chaveiro nome 3D', cat: 'Impresso 3D',
    linhas: [{ kind: 'insumo', ref: chav.id, qtd: 1 }, { kind: 'insumo', ref: celo.id, qtd: 0.25 }],
    imp: { on: true, gramas: 14, horas: 1.2, fil: pla.id, watts: null, falha: null },
    maoObraMin: 6, extras: [], margem: null, taxas: null, arred: 'x90', rateio: true
  };
  const cafe = {
    id: uid(), nome: 'Cesta café da manhã romântica', cat: 'Café da manhã',
    linhas: [
      { kind: 'insumo', ref: cesta.id, qtd: 1 }, { kind: 'insumo', ref: palha.id, qtd: 40 },
      { kind: 'insumo', ref: bolo.id, qtd: 1 }, { kind: 'insumo', ref: choc.id, qtd: 1 },
      { kind: 'insumo', ref: suco.id, qtd: 1 }, { kind: 'insumo', ref: rosa.id, qtd: 3 },
      { kind: 'insumo', ref: fita.id, qtd: 1 }, { kind: 'insumo', ref: celo.id, qtd: 1 },
      { kind: 'insumo', ref: cartao.id, qtd: 1 }, { kind: 'produto', ref: chaveiro.id, qtd: 1 }
    ],
    imp: { on: false, gramas: 0, horas: 0, fil: pla.id, watts: null, falha: null },
    maoObraMin: 35, extras: [{ desc: 'Entrega / frete', valor: 8 }], margem: null, taxas: null, arred: 'x90', rateio: true
  };
  return {
    settings: { hora: 20, kwh: 0.95, watts: 200, desgasteHora: 1.5, falha: 5, perda: 3, fixosMes: 600, producaoMes: 80, margem: 40, taxas: 5 },
    insumos: [pla, cesta, palha, fita, celo, bolo, choc, suco, rosa, cartao, chav],
    produtos: [cafe, chaveiro],
    sel: cafe.id
  };
}
let S;
try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
if (!S || !S.settings) S = seed();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Não foi possível salvar neste navegador'); } };

/* ---------- Cálculo ---------- */
const unitCost = i => i && i.qtd > 0 ? i.preco / i.qtd : 0;
const prod = id => S.produtos.find(p => p.id === id);
const insumo = id => S.insumos.find(i => i.id === id);

function calc(p, stack = []) {
  const st = S.settings;
  const r = { mat: 0, perda: 0, filamento: 0, energia: 0, maquina: 0, mao: 0, fixo: 0, extras: 0, custo: 0, linhas: [], ciclo: false, semFil: false };
  if (stack.includes(p.id)) { r.ciclo = true; return r; }
  let matIns = 0, matProd = 0;
  for (const l of p.linhas) {
    let u = 0, ok = false;
    if (l.kind === 'insumo') { const i = insumo(l.ref); if (i) { u = unitCost(i); ok = true; } }
    else { const q = prod(l.ref); if (q) { const c = calc(q, [...stack, p.id]); u = c.custo; ok = true; if (c.ciclo) r.ciclo = true; } }
    const sub = u * num(l.qtd);
    r.linhas.push({ u, sub, ok });
    if (l.kind === 'insumo') matIns += sub; else matProd += sub;
  }
  r.perda = matIns * num(st.perda) / 100;
  r.mat = matIns + matProd;
  if (p.imp && p.imp.on) {
    const f = insumo(p.imp.fil);
    let porGrama = 0;
    if (f) porGrama = f.un === 'kg' ? unitCost(f) / 1000 : unitCost(f);
    else r.semFil = num(p.imp.gramas) > 0;
    const falha = p.imp.falha ?? st.falha;
    r.filamento = num(p.imp.gramas) * (1 + num(falha) / 100) * porGrama;
    const w = p.imp.watts ?? st.watts;
    r.energia = num(p.imp.horas) * num(w) / 1000 * num(st.kwh);
    r.maquina = num(p.imp.horas) * num(st.desgasteHora);
  }
  r.mao = num(p.maoObraMin) / 60 * num(st.hora);
  r.fixo = p.rateio !== false && num(st.producaoMes) > 0 ? num(st.fixosMes) / num(st.producaoMes) : 0;
  r.extras = (p.extras || []).reduce((a, e) => a + num(e.valor), 0);
  r.custo = r.mat + r.perda + r.filamento + r.energia + r.maquina + r.mao + r.fixo + r.extras;

  const m = p.margem ?? st.margem, t = p.taxas ?? st.taxas;
  const den = 1 - (num(m) + num(t)) / 100;
  r.margemPct = num(m); r.taxasPct = num(t);
  r.valido = den > 0.01;
  let preco = r.valido ? r.custo / den : NaN;
  if (isFinite(preco)) {
    if (p.arred === 'up1') preco = Math.ceil(preco - 1e-9);
    else if (p.arred === 'x90') { preco = Math.ceil(preco + 0.1 - 1e-9) - 0.1; if (preco < r.custo) preco += 1; }
  }
  r.preco = preco;
  r.taxasVal = isFinite(preco) ? preco * num(t) / 100 : NaN;
  r.lucro = isFinite(preco) ? preco - r.custo - r.taxasVal : NaN;
  r.lucroPct = isFinite(preco) && preco > 0 ? r.lucro / preco * 100 : NaN;
  r.markup = isFinite(preco) && r.custo > 0 ? (preco / r.custo - 1) * 100 : NaN;
  r.minimo = r.custo / (1 - num(t) / 100); // preço sem lucro (só cobre custo + taxas)
  return r;
}

/* ---------- UI helpers ---------- */
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }
const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
const numIn = (attrs, v, ph = '') => `<input type="number" step="any" min="0" inputmode="decimal" placeholder="${esc(ph)}" value="${v ?? ''}" ${attrs}>`;
function getPath(o, path) { return path.split('.').reduce((a, k) => a?.[k], o); }
function setPath(o, path, v) { const ks = path.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[last] = v; }

let tab = 'produtos';
let filtro = { q: '', cat: '' };
const app = $('#app');

$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  tab = b.dataset.tab;
  $$('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  render();
});

function render() {
  if (tab === 'produtos') renderProdutos();
  else if (tab === 'insumos') renderInsumos();
  else renderConfig();
}

/* ---------- Aba Produtos ---------- */
function renderProdutos() {
  const cur = prod(S.sel) || S.produtos[0];
  if (cur) S.sel = cur.id;
  app.innerHTML = `
  <div class="layout">
    <aside>
      <div class="bar"><button class="btn pri" id="novoProd">+ Novo produto</button></div>
      <div class="list" id="listaProd"></div>
    </aside>
    <section id="editor">${cur ? '' : '<div class="card empty">Crie seu primeiro produto para começar.</div>'}</section>
  </div>`;
  $('#novoProd').onclick = () => {
    const p = { id: uid(), nome: 'Novo produto', cat: 'Cesta de presente', linhas: [], imp: { on: false, gramas: 0, horas: 0, fil: S.insumos.find(i => i.cat === 'Filamento 3D')?.id || '', watts: null, falha: null }, maoObraMin: 0, extras: [], margem: null, taxas: null, arred: 'none', rateio: true };
    S.produtos.unshift(p); S.sel = p.id; save(); renderProdutos();
  };
  renderLista();
  if (cur) renderEditor(cur);
}

function renderLista() {
  const el = $('#listaProd'); if (!el) return;
  el.innerHTML = S.produtos.length ? S.produtos.map(p => {
    const c = calc(p);
    return `<button class="item${p.id === S.sel ? ' on' : ''}" data-id="${p.id}"><span class="pr">${brl(c.preco)}</span><b>${esc(p.nome) || 'Sem nome'}</b><small>${esc(p.cat)} · custo ${brl(c.custo)}</small></button>`;
  }).join('') : '<div class="empty">Nenhum produto ainda.</div>';
}
document.addEventListener('click', e => {
  const it = e.target.closest('#listaProd .item');
  if (it) { S.sel = it.dataset.id; save(); renderProdutos(); window.scrollTo({ top: 0 }); }
});

function itemOptions(l) {
  const cur = l.kind === 'insumo' ? 'i:' + l.ref : 'p:' + l.ref;
  const grupos = CATS_INSUMO.map(c => {
    const its = S.insumos.filter(i => i.cat === c);
    return its.length ? `<optgroup label="${esc(c)}">${its.map(i => opt('i:' + i.id, `${i.nome} (${brl(unitCost(i))}/${i.un})`, cur)).join('')}</optgroup>` : '';
  }).join('');
  const prods = S.produtos.filter(p => p.id !== S.sel);
  const pg = prods.length ? `<optgroup label="Outros produtos (sub-itens)">${prods.map(p => opt('p:' + p.id, p.nome, cur)).join('')}</optgroup>` : '';
  const missing = (l.kind === 'insumo' ? insumo(l.ref) : prod(l.ref)) ? '' : `<option value="" selected>⚠ item removido — escolha outro</option>`;
  return missing + grupos + pg;
}

function renderEditor(p) {
  const st = S.settings;
  const filaments = S.insumos.filter(i => i.cat === 'Filamento 3D');
  const linhasHtml = p.linhas.map((l, idx) => {
    const un = l.kind === 'insumo' ? (insumo(l.ref)?.un || '') : 'un';
    return `<div class="line">
      <select data-line="${idx}" data-f="ref">${itemOptions(l)}</select>
      ${numIn(`data-line="${idx}" data-f="qtd"`, l.qtd, 'qtd')}
      <div><span class="un">${esc(un)}</span><div class="sub" data-sub="${idx}"></div></div>
      <button class="x" data-del-line="${idx}" title="Remover">✕</button></div>`;
  }).join('');
  const extrasHtml = (p.extras || []).map((x, idx) => `<div class="extra">
      <input placeholder="Descrição (ex.: frete)" value="${esc(x.desc)}" data-extra="${idx}" data-f="desc">
      ${numIn(`data-extra="${idx}" data-f="valor"`, x.valor, 'R$')}
      <button class="x" data-del-extra="${idx}" title="Remover">✕</button></div>`).join('');

  $('#editor').innerHTML = `
  <div class="editor">
   <div class="card">
    <div class="grid">
      <div style="grid-column:span 2"><label>Nome do produto</label><input data-p="nome" value="${esc(p.nome)}"></div>
      <div><label>Categoria</label><select data-p="cat">${CATS_PRODUTO.map(c => opt(c, c, p.cat)).join('')}</select></div>
    </div>

    <h3>Itens (insumos e outros produtos)</h3>
    <p class="hint">Inclua tudo o que vai na cesta/produto: cesta, enchimento, comidas, flores, fita, cartão… Você também pode usar outro produto seu como item (ex.: um chaveiro 3D dentro da cesta).</p>
    ${linhasHtml || '<p class="hint">Nenhum item ainda.</p>'}
    <div class="bar"><button class="btn" id="addLinha">+ Adicionar item</button></div>

    <div class="sec"><h3>Impressão 3D</h3>
      <label class="toggle"><input type="checkbox" data-p="imp.on" ${p.imp.on ? 'checked' : ''}> Este produto tem peça impressa em 3D</label>
      ${p.imp.on ? `
      <div class="grid" style="margin-top:10px">
        <div style="grid-column:span 2"><label>Filamento usado</label><select data-p="imp.fil">${filaments.length ? filaments.map(f => opt(f.id, `${f.nome} (${brl(f.un === 'kg' ? unitCost(f) / 1000 : unitCost(f))}/g)`, p.imp.fil)).join('') : '<option value="">Cadastre um filamento em Insumos</option>'}</select></div>
        <div><label>Peso da peça (g)</label>${numIn('data-p="imp.gramas"', p.imp.gramas)}</div>
        <div><label>Tempo de impressão (h)</label>${numIn('data-p="imp.horas"', p.imp.horas)}</div>
        <div><label>Potência (W)</label>${numIn('data-p="imp.watts" data-nullable', p.imp.watts, 'padrão ' + st.watts)}</div>
        <div><label>Falhas / purga (%)</label>${numIn('data-p="imp.falha" data-nullable', p.imp.falha, 'padrão ' + st.falha)}</div>
      </div>
      <p class="hint">Dica: pegue peso e tempo no fatiador (Cura, Bambu Studio, Orca…). A energia e o desgaste da máquina saem das Configurações.</p>` : ''}
    </div>

    <div class="sec"><h3>Mão de obra e extras</h3>
      <div class="grid"><div><label>Tempo de montagem / acabamento (min)</label>${numIn('data-p="maoObraMin"', p.maoObraMin)}</div></div>
      <p class="hint">Só o seu tempo ativo — o tempo da impressora rodando sozinha não entra aqui.</p>
      ${extrasHtml}
      <div class="bar"><button class="btn" id="addExtra">+ Custo extra (frete, taxa, arte…)</button></div>
    </div>

    <div class="sec"><h3>Preço de venda</h3>
      <div class="grid">
        <div><label>Margem de lucro (%)</label>${numIn('data-p="margem" data-nullable', p.margem, 'padrão ' + st.margem)}</div>
        <div><label>Taxas: cartão/marketplace (%)</label>${numIn('data-p="taxas" data-nullable', p.taxas, 'padrão ' + st.taxas)}</div>
        <div><label>Arredondamento</label><select data-p="arred">${Object.entries(ARREDONDAMENTOS).map(([k, v]) => opt(k, v, p.arred || 'none')).join('')}</select></div>
      </div>
      <label class="toggle" style="margin-top:10px"><input type="checkbox" data-p="rateio" ${p.rateio !== false ? 'checked' : ''}> Ratear custos fixos (aluguel, internet, etc.)</label>
    </div>

    <div class="bar" style="margin-top:16px">
      <button class="btn" id="dupProd">Duplicar produto</button>
      <button class="btn" id="delProd" style="color:var(--bad)">Excluir produto</button>
    </div>
   </div>

   <aside class="card result" id="result"></aside>
  </div>`;
  updateResults();
}

function updateResults() {
  const p = prod(S.sel); if (!p) return;
  const c = calc(p);
  $$('[data-sub]').forEach(el => { const l = c.linhas[+el.dataset.sub]; el.textContent = l ? brl(l.sub) : ''; });
  const seg = [
    ['Materiais', c.mat + c.perda, 'var(--c1)'],
    ['Impressão 3D', c.filamento + c.energia + c.maquina, 'var(--c3)'],
    ['Mão de obra', c.mao, 'var(--c2)'],
    ['Custos fixos', c.fixo, 'var(--c5)'],
    ['Extras', c.extras, 'var(--c4)'],
    ['Taxas', isFinite(c.taxasVal) ? c.taxasVal : 0, 'var(--c6)'],
    ['Lucro', isFinite(c.lucro) ? Math.max(c.lucro, 0) : 0, 'var(--c7)']
  ];
  const total = seg.reduce((a, s) => a + s[1], 0) || 1;
  const r = $('#result');
  const msgs = [];
  if (c.ciclo) msgs.push('Um produto está dentro dele mesmo (referência circular).');
  if (!c.valido) msgs.push('Margem + taxas precisam somar menos de 100%.');
  if (c.semFil) msgs.push('Escolha o filamento para calcular o custo da impressão.');
  if (p.linhas.some(l => !(l.kind === 'insumo' ? insumo(l.ref) : prod(l.ref)))) msgs.push('Há itens removidos na lista.');
  r.innerHTML = `
    <label>Preço de venda sugerido</label>
    <div class="big">${brl(c.preco)}</div>
    <div class="hint">Lucro líquido ${brl(c.lucro)} (${isFinite(c.lucroPct) ? c.lucroPct.toFixed(1).replace('.', ',') : '—'}% do preço) · markup ${isFinite(c.markup) ? c.markup.toFixed(0) : '—'}%</div>
    ${msgs.map(m => `<div class="warn">⚠ ${esc(m)}</div>`).join('')}
    <div class="stack">${seg.map(s => `<span style="width:${s[1] / total * 100}%;background:${s[2]}" title="${s[0]}"></span>`).join('')}</div>
    <div class="legend">${seg.map(s => `<span><i style="background:${s[2]}"></i>${s[0]} ${(s[1] / total * 100).toFixed(0)}%</span>`).join('')}</div>
    <div style="margin-top:12px">
      <div class="kv"><span>Materiais</span><span>${brl(c.mat)}</span></div>
      ${c.perda ? `<div class="kv"><span>Perdas/quebras (${S.settings.perda}%)</span><span>${brl(c.perda)}</span></div>` : ''}
      ${p.imp.on ? `<div class="kv"><span>Filamento</span><span>${brl(c.filamento)}</span></div>
      <div class="kv"><span>Energia</span><span>${brl(c.energia)}</span></div>
      <div class="kv"><span>Desgaste da impressora</span><span>${brl(c.maquina)}</span></div>` : ''}
      <div class="kv"><span>Mão de obra</span><span>${brl(c.mao)}</span></div>
      ${c.fixo ? `<div class="kv"><span>Rateio custos fixos</span><span>${brl(c.fixo)}</span></div>` : ''}
      ${c.extras ? `<div class="kv"><span>Extras</span><span>${brl(c.extras)}</span></div>` : ''}
      <div class="kv tot"><span>Custo total</span><span>${brl(c.custo)}</span></div>
      <div class="kv"><span>Preço mínimo (lucro zero)</span><span>${brl(c.minimo)}</span></div>
    </div>
    <div class="bar"><button class="btn pri" id="cpDesc">Copiar descrição p/ cliente</button><button class="btn" id="cpCusto">Copiar resumo de custos</button></div>`;
  renderLista();
}

function textoCliente(p, c) {
  const itens = p.linhas.map(l => {
    const o = l.kind === 'insumo' ? insumo(l.ref) : prod(l.ref); if (!o) return null;
    const q = num(l.qtd);
    const un = l.kind === 'insumo' && o.un !== 'un' ? ' ' + o.un : '';
    return `• ${q > 1 && !un ? q + 'x ' : (un ? q + un + ' de ' : '')}${o.nome.replace(/\s*\(.*\)\s*$/, '')}`;
  }).filter(Boolean);
  return `*${p.nome}*\n${itens.join('\n')}\n\nValor: *${brl(c.preco)}*`;
}
function textoCusto(p, c) {
  return `${p.nome}\nMateriais: ${brl(c.mat + c.perda)}\n3D: ${brl(c.filamento + c.energia + c.maquina)}\nMão de obra: ${brl(c.mao)}\nFixos: ${brl(c.fixo)}\nExtras: ${brl(c.extras)}\nCUSTO: ${brl(c.custo)}\nPREÇO: ${brl(c.preco)} (margem ${c.margemPct}% + taxas ${c.taxasPct}%)\nLucro: ${brl(c.lucro)}`;
}
async function copiar(txt) {
  try { await navigator.clipboard.writeText(txt); toast('Copiado!'); }
  catch (e) { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); toast('Copiado!'); } catch (_) { toast('Não foi possível copiar'); } t.remove(); }
}

/* Eventos do editor (delegação) */
app.addEventListener('input', e => {
  const t = e.target, p = prod(S.sel);
  if (tab === 'produtos' && p) {
    if (t.dataset.p) {
      let v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? (t.value === '' && 'nullable' in t.dataset ? null : num(t.value)) : t.value;
      setPath(p, t.dataset.p, v);
      save();
      if (t.type === 'checkbox' || t.tagName === 'SELECT') { if (t.dataset.p === 'imp.on' || t.dataset.p === 'rateio') renderEditor(p); else updateResults(); }
      else updateResults();
    } else if (t.dataset.line !== undefined) {
      const l = p.linhas[+t.dataset.line];
      if (t.dataset.f === 'qtd') l.qtd = num(t.value);
      else if (t.value) { const [k, id] = t.value.split(':'); l.kind = k === 'i' ? 'insumo' : 'produto'; l.ref = id; }
      save();
      if (t.dataset.f === 'ref') renderEditor(p); else updateResults();
    } else if (t.dataset.extra !== undefined) {
      const x = p.extras[+t.dataset.extra];
      x[t.dataset.f] = t.dataset.f === 'valor' ? num(t.value) : t.value;
      save(); updateResults();
    }
  }
  if (tab === 'insumos' && t.dataset.i) {
    const i = insumo(t.dataset.i); if (!i) return;
    const f = t.dataset.f;
    i[f] = ['preco', 'qtd'].includes(f) ? num(t.value) : t.value;
    save();
    const uc = $(`[data-uc="${i.id}"]`); if (uc) uc.textContent = `${brl(unitCost(i))} / ${i.un}`;
  }
  if (tab === 'config' && t.dataset.s) { S.settings[t.dataset.s] = num(t.value); save(); }
  if (t.id === 'fq') { filtro.q = t.value; renderListaInsumos(); }
});
app.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'fc') { filtro.cat = t.value; renderListaInsumos(); }
  if (tab === 'insumos' && t.dataset.i && ['cat', 'un'].includes(t.dataset.f)) renderListaInsumos();
});
app.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const p = prod(S.sel);
  if (tab === 'produtos' && p) {
    if (b.id === 'addLinha') {
      const first = S.insumos[0]; if (!first) { toast('Cadastre insumos primeiro'); return; }
      p.linhas.push({ kind: 'insumo', ref: first.id, qtd: 1 }); save(); renderEditor(p);
    } else if (b.dataset.delLine !== undefined) { p.linhas.splice(+b.dataset.delLine, 1); save(); renderEditor(p); }
    else if (b.id === 'addExtra') { p.extras.push({ desc: '', valor: 0 }); save(); renderEditor(p); }
    else if (b.dataset.delExtra !== undefined) { p.extras.splice(+b.dataset.delExtra, 1); save(); renderEditor(p); }
    else if (b.id === 'dupProd') { const n = JSON.parse(JSON.stringify(p)); n.id = uid(); n.nome += ' (cópia)'; S.produtos.unshift(n); S.sel = n.id; save(); renderProdutos(); }
    else if (b.id === 'delProd') {
      if (!confirm(`Excluir "${p.nome}"?`)) return;
      S.produtos = S.produtos.filter(x => x.id !== p.id);
      S.produtos.forEach(q => q.linhas = q.linhas.filter(l => !(l.kind === 'produto' && l.ref === p.id)));
      S.sel = S.produtos[0]?.id; save(); renderProdutos();
    }
    else if (b.id === 'cpDesc') copiar(textoCliente(p, calc(p)));
    else if (b.id === 'cpCusto') copiar(textoCusto(p, calc(p)));
  }
  if (tab === 'insumos') {
    if (b.id === 'novoIns') { S.insumos.unshift({ id: uid(), nome: '', cat: filtro.cat || CATS_INSUMO[0], un: 'un', preco: 0, qtd: 1 }); save(); filtro.q = ''; renderInsumos(); $('.irow input')?.focus(); }
    else if (b.dataset.delIns) {
      const i = insumo(b.dataset.delIns);
      const usado = S.produtos.filter(q => q.linhas.some(l => l.kind === 'insumo' && l.ref === i.id)).map(q => q.nome);
      if (!confirm(`Excluir "${i.nome || 'insumo'}"?` + (usado.length ? `\n\nEle é usado em: ${usado.join(', ')}.` : ''))) return;
      S.insumos = S.insumos.filter(x => x.id !== i.id);
      S.produtos.forEach(q => q.linhas = q.linhas.filter(l => !(l.kind === 'insumo' && l.ref === i.id)));
      save(); renderListaInsumos();
    }
  }
  if (tab === 'config') {
    if (b.id === 'exp') {
      const url = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `precificador-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
    } else if (b.id === 'imp') $('#impFile').click();
    else if (b.id === 'reset') { if (confirm('Apagar TODOS os dados e voltar ao exemplo inicial?')) { S = seed(); save(); renderConfig(); toast('Dados reiniciados'); } }
    else if (b.id === 'vazio') { if (confirm('Apagar TODOS os dados e começar do zero?')) { S = { settings: S.settings, insumos: [], produtos: [], sel: null }; save(); renderConfig(); toast('Tudo limpo'); } }
  }
});
app.addEventListener('change', e => {
  if (e.target.id !== 'impFile') return;
  const f = e.target.files[0]; if (!f) return;
  f.text().then(t => {
    const d = JSON.parse(t);
    if (!d.settings || !Array.isArray(d.insumos) || !Array.isArray(d.produtos)) throw 0;
    S = d; save(); toast('Backup importado'); renderConfig();
  }).catch(() => toast('Arquivo inválido'));
});

/* ---------- Aba Insumos ---------- */
function renderInsumos() {
  app.innerHTML = `
  <h2>Insumos</h2>
  <p class="hint">Tudo o que você compra. Informe o preço pago e a quantidade da embalagem — o custo por unidade é calculado sozinho. Ex.: filamento R$ 110 por 1000 g; fita R$ 8 por 10 m; bombom R$ 15 por 12 un.</p>
  <div class="filters">
    <button class="btn pri" id="novoIns">+ Novo insumo</button>
    <input id="fq" placeholder="Buscar…" value="${esc(filtro.q)}">
    <select id="fc"><option value="">Todas as categorias</option>${CATS_INSUMO.map(c => opt(c, c, filtro.cat)).join('')}</select>
  </div>
  <div class="card" id="listaIns"></div>`;
  renderListaInsumos();
}
function renderListaInsumos() {
  const q = filtro.q.trim().toLowerCase();
  const its = S.insumos.filter(i => (!filtro.cat || i.cat === filtro.cat) && (!q || i.nome.toLowerCase().includes(q)));
  $('#listaIns').innerHTML = its.length ? its.map(i => `
    <div class="irow">
      <div><label>Nome</label><input data-i="${i.id}" data-f="nome" value="${esc(i.nome)}" placeholder="Nome do insumo"></div>
      <div><label>Categoria</label><select data-i="${i.id}" data-f="cat">${CATS_INSUMO.map(c => opt(c, c, i.cat)).join('')}</select></div>
      <div><label>Preço pago (R$)</label>${numIn(`data-i="${i.id}" data-f="preco"`, i.preco)}</div>
      <div><label>Qtd. na embalagem</label>${numIn(`data-i="${i.id}" data-f="qtd"`, i.qtd)}</div>
      <div><label>Unidade</label><select data-i="${i.id}" data-f="un">${UNIDADES.map(u => opt(u, u, i.un)).join('')}</select></div>
      <div class="uc" data-uc="${i.id}">${brl(unitCost(i))} / ${esc(i.un)}</div>
      <button class="x" data-del-ins="${i.id}" title="Excluir">✕</button>
    </div>`).join('') : '<div class="empty">Nenhum insumo encontrado.</div>';
}

/* ---------- Aba Configurações ---------- */
function renderConfig() {
  const s = S.settings;
  const f = (k, label, hint) => `<div><label>${label}</label>${numIn(`data-s="${k}"`, s[k])}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
  app.innerHTML = `
  <h2>Configurações</h2>
  <p class="hint">Valores padrão usados em todos os produtos (você pode sobrescrever margem, taxas, potência e falhas em cada produto).</p>
  <div class="card">
    <h3 style="margin-top:0">Mão de obra e custos fixos</h3>
    <div class="grid">
      ${f('hora', 'Valor da sua hora de trabalho (R$)', 'Quanto você quer ganhar por hora.')}
      ${f('fixosMes', 'Custos fixos do mês (R$)', 'Aluguel, internet, MEI, luz da oficina, ferramentas…')}
      ${f('producaoMes', 'Produtos feitos por mês', 'Divide os custos fixos entre eles (rateio).')}
    </div>
    <h3>Impressão 3D</h3>
    <div class="grid">
      ${f('kwh', 'Tarifa de energia (R$/kWh)', 'Veja na sua conta de luz.')}
      ${f('watts', 'Potência média da impressora (W)', 'Em geral 120–250 W com mesa aquecida.')}
      ${f('desgasteHora', 'Desgaste da máquina (R$/hora)', 'Bico, correias, peças + depreciação.')}
      ${f('falha', 'Falhas / purga de filamento (%)', 'Margem de erro em cada peça.')}
    </div>
    <h3>Perdas e preço</h3>
    <div class="grid">
      ${f('perda', 'Perdas e quebras de insumos (%)', 'Itens que estragam, quebram ou sobram.')}
      ${f('margem', 'Margem de lucro padrão (%)', 'Sobre o preço de venda.')}
      ${f('taxas', 'Taxas padrão (%)', 'Cartão, Pix, marketplace, imposto.')}
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <h3 style="margin-top:0">Seus dados</h3>
    <p class="hint">Tudo fica salvo apenas neste navegador/aparelho. Faça backup para não perder ou para levar para outro aparelho.</p>
    <div class="bar">
      <button class="btn pri" id="exp">Baixar backup (.json)</button>
      <button class="btn" id="imp">Importar backup</button>
      <input type="file" id="impFile" accept="application/json" hidden>
      <button class="btn" id="reset">Voltar ao exemplo</button>
      <button class="btn" id="vazio" style="color:var(--bad)">Apagar tudo</button>
    </div>
  </div>`;
}

render();

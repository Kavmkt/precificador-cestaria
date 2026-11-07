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
    maoObraMin: 35, extras: [], adicionais: [{ desc: 'Entrega / frete', valor: 8 }], margem: null, taxas: null, arred: 'x90', rateio: true
  };
  return {
    settings: { hora: 20, kwh: 0.95, watts: 200, desgasteHora: 1.5, falha: 5, perda: 3, fixosMes: 600, producaoMes: 80, margem: 100, taxas: 20 },
    insumos: [pla, cesta, palha, fita, celo, bolo, choc, suco, rosa, cartao, chav],
    produtos: [cafe, chaveiro],
    vendas: [],
    sel: cafe.id
  };
}
/* Migração: "frete/entrega" que estava em custos extras passa para "somado no final" (não leva lucro nem taxas). */
function migrate(d) {
  d.vendas = d.vendas || [];
  for (const p of d.produtos || []) {
    p.adicionais = p.adicionais || [];
    const keep = [];
    for (const e of p.extras || []) (/frete|entrega/i.test(e.desc || '') ? p.adicionais : keep).push(e);
    p.extras = keep;
  }
  return d;
}
let S;
let HAD_LOCAL = false;
try { HAD_LOCAL = !!localStorage.getItem(KEY); S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
if (!S || !S.settings) S = seed();
migrate(S);
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Não foi possível salvar neste navegador'); } scheduleSync(); };

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
  // Duas formas de aplicar a margem:
  //  'custo' (padrão): preço = custo × (1 + margem) ÷ (1 − taxas)   → margem é % em cima do custo; taxas saem do preço final
  //  'preco': preço = custo ÷ (1 − margem − taxas)                  → margem é % do preço de venda
  const modo = p.modoMargem ?? st.modoMargem ?? 'custo';
  r.modo = modo;
  r.margemPct = num(m); r.taxasPct = num(t);
  let preco;
  if (modo === 'custo') {
    const den = 1 - num(t) / 100;
    r.valido = den > 0.01;
    preco = r.valido ? r.custo * (1 + num(m) / 100) / den : NaN;
    r.comMargem = r.custo * (1 + num(m) / 100);
  } else {
    const den = 1 - (num(m) + num(t)) / 100;
    r.valido = den > 0.01;
    preco = r.valido ? r.custo / den : NaN;
  }
  const arr = v => !isFinite(v) ? v : p.arred === 'up1' ? Math.ceil(v - 1e-9) : p.arred === 'x90' ? Math.ceil(v + 0.1 - 1e-9) - 0.1 : v;
  r.precoTabela = arr(preco);
  r.desconto = Math.min(Math.max(num(p.desconto), 0), 100);
  preco = r.desconto > 0 ? arr(r.precoTabela * (1 - r.desconto / 100)) : r.precoTabela;
  r.preco = preco; // preço final cobrado do cliente (já com desconto)
  // Preço para o site/e-commerce: mesma margem, mas sem a taxa do marketplace (usa só "taxas do site", padrão 0%)
  const ts = num(st.taxasSite);
  const denSite = modo === 'custo' ? 1 - ts / 100 : 1 - (num(m) + ts) / 100;
  const baseSite = denSite > 0.01 ? (modo === 'custo' ? r.custo * (1 + num(m) / 100) : r.custo) / denSite : NaN;
  r.precoSiteTabela = arr(baseSite);
  r.precoSite = r.desconto > 0 ? arr(r.precoSiteTabela * (1 - r.desconto / 100)) : r.precoSiteTabela;
  r.lucroSite = isFinite(r.precoSite) ? r.precoSite - r.custo - r.precoSite * ts / 100 : NaN;
  r.taxasVal = isFinite(preco) ? preco * num(t) / 100 : NaN;
  r.lucro = isFinite(preco) ? preco - r.custo - r.taxasVal : NaN;
  r.lucroPct = isFinite(preco) && preco > 0 ? r.lucro / preco * 100 : NaN;
  r.markup = isFinite(preco) && r.custo > 0 ? (preco / r.custo - 1) * 100 : NaN;
  r.minimo = r.custo / (1 - num(t) / 100); // preço sem lucro (só cobre custo + taxas)
  // Valores somados NO FINAL (frete/entrega): repassados ao cliente, sem margem, taxas nem desconto.
  r.adic = (p.adicionais || []).reduce((a, e) => a + num(e.valor), 0);
  r.precoProduto = r.preco;
  for (const k of ['preco', 'precoTabela', 'precoSite', 'precoSiteTabela']) r[k] += r.adic;
  r.minimo += r.adic;
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
  else if (tab === 'vendas') renderVendas();
  else if (tab === 'estoque') renderEstoque();
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
    const p = { id: uid(), nome: 'Novo produto', cat: 'Cesta de presente', linhas: [], imp: { on: false, gramas: 0, horas: 0, fil: S.insumos.find(i => i.cat === 'Filamento 3D')?.id || '', watts: null, falha: null }, maoObraMin: 0, extras: [], adicionais: [], margem: null, taxas: null, arred: 'none', rateio: true };
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
  const adicHtml = (p.adicionais || []).map((x, idx) => `<div class="extra">
      <input placeholder="Descrição (ex.: frete)" value="${esc(x.desc)}" data-adic="${idx}" data-f="desc">
      ${numIn(`data-adic="${idx}" data-f="valor"`, x.valor, 'R$')}
      <button class="x" data-del-adic="${idx}" title="Remover">✕</button></div>`).join('');
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
      <div class="bar"><button class="btn" id="addExtra">+ Custo extra (arte, embalagem especial…)</button></div>
      <p class="hint">Custos extras entram no custo — recebem lucro e taxas.</p>
    </div>

    <div class="sec"><h3>Somado no final do preço (frete, entrega)</h3>
      <p class="hint">Valores que o cliente paga <b>por cima</b> do preço: entram só no final, sem lucro, sem taxas e sem desconto. Ex.: preço R$ 100 + frete R$ 20 = R$ 120.</p>
      ${adicHtml}
      <div class="bar"><button class="btn" id="addAdic">+ Frete / valor no final</button></div>
    </div>

    <div class="sec"><h3>Preço de venda</h3>
      <div class="grid">
        <div><label>Lucro sobre o custo (%) · 100 = dobro</label>${numIn('data-p="margem" data-nullable', p.margem, 'padrão ' + st.margem)}</div>
        <div><label>Desconto ao cliente (%)</label>${numIn('data-p="desconto"', p.desconto || '', '0')}</div>
        <div><label>Taxas: cartão/marketplace (%)</label>${numIn('data-p="taxas" data-nullable', p.taxas, 'padrão ' + st.taxas)}</div>
        <div><label>Como aplicar a margem</label><select data-p="modoMargem" data-nullable><option value=""${p.modoMargem ? '' : ' selected'}>Padrão (${st.modoMargem === 'preco' ? 'sobre o preço' : 'sobre o custo'})</option><option value="custo"${p.modoMargem === 'custo' ? ' selected' : ''}>% sobre o custo</option><option value="preco"${p.modoMargem === 'preco' ? ' selected' : ''}>% do preço de venda</option></select></div>
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
    ['Frete no final', c.adic, 'var(--muted)'],
    ['Lucro', isFinite(c.lucro) ? Math.max(c.lucro, 0) : 0, 'var(--c7)']
  ];
  const total = seg.reduce((a, s) => a + s[1], 0) || 1;
  const r = $('#result');
  const msgs = [];
  if (c.ciclo) msgs.push('Um produto está dentro dele mesmo (referência circular).');
  if (!c.valido) msgs.push(c.modo === 'custo' ? 'As taxas precisam ser menores que 100%.' : 'Margem + taxas precisam somar menos de 100%.');
  if (c.semFil) msgs.push('Escolha o filamento para calcular o custo da impressão.');
  if (p.linhas.some(l => !(l.kind === 'insumo' ? insumo(l.ref) : prod(l.ref)))) msgs.push('Há itens removidos na lista.');
  r.innerHTML = `
    <label>${c.desconto > 0 ? `Preço com ${c.desconto}% de desconto` : 'Preço de venda sugerido'}</label>
    <div class="big">${brl(c.preco)}</div>
    ${c.desconto > 0 ? `<div class="hint">Preço de tabela: <s>${brl(c.precoTabela)}</s></div>` : ''}
    ${c.adic ? `<div class="hint">Inclui ${brl(c.adic)} somados no final (${esc((p.adicionais || []).filter(x => num(x.valor)).map(x => x.desc || 'extra').join(', '))}). Produto sem frete: ${brl(c.precoProduto)}.</div>` : ''}
    ${c.lucro < 0 ? '<div class="warn">⚠ Com esse desconto você teria prejuízo.</div>' : ''}
    <button class="btn" data-copy="${isFinite(c.preco) ? c.preco.toFixed(2).replace('.', ',') : ''}" style="margin-top:6px">Copiar ${brl(c.preco)}</button>
    <div class="site">
      <label>🌐 Preço para o site (sem as taxas do iFood)</label>
      <div class="big2">${brl(c.precoSite)}</div>
      ${c.desconto > 0 ? `<div class="hint">Preço de tabela no site: <s>${brl(c.precoSiteTabela)}</s></div>` : ''}
      ${c.adic ? `<div class="hint">Já com ${brl(c.adic)} de frete somado no final.</div>` : ''}
      <div class="hint">Mesmo lucro, sem os ${c.taxasPct}% do iFood${num(S.settings.taxasSite) ? ` (só ${num(S.settings.taxasSite)}% de taxas do site)` : ''}. Lucro líquido: ${brl(c.lucroSite)}.</div>
      <button class="btn pri" data-copy="${isFinite(c.precoSite) ? c.precoSite.toFixed(2).replace('.', ',') : ''}">Copiar ${isFinite(c.precoSite) ? c.precoSite.toFixed(2).replace('.', ',') : '—'} para o site</button>
    </div>
    <div class="hint">Lucro líquido ${brl(c.lucro)} (${isFinite(c.lucroPct) ? c.lucroPct.toFixed(1).replace('.', ',') : '—'}% do preço) · markup ${isFinite(c.markup) ? c.markup.toFixed(0) : '—'}%</div>
    ${msgs.map(m => `<div class="warn">⚠ ${esc(m)}</div>`).join('')}
    ${c.valido ? `<div class="hint" style="margin-top:8px">${c.modo === 'custo'
      ? `Conta: custo ${brl(c.custo)} + ${c.margemPct}% de margem = ${brl(c.comMargem)} → dividido por (1 − ${c.taxasPct}% de taxas) = ${brl(c.comMargem / (1 - c.taxasPct / 100))}${p.arred && p.arred !== 'none' ? ', depois arredondado' : ''}.`
      : `Conta: custo ${brl(c.custo)} ÷ (1 − ${c.margemPct}% margem − ${c.taxasPct}% taxas).`}</div>` : ''}
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
      ${c.adic ? `<div class="kv"><span>Somado no final (frete)</span><span>+ ${brl(c.adic)}</span></div>` : ''}
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
  return `*${p.nome}*\n${itens.join('\n')}\n\n${c.desconto > 0 ? `De ${brl(c.precoTabela)} por ` : 'Valor: '}*${brl(c.preco)}*`;
}
function textoCusto(p, c) {
  return `${p.nome}\nMateriais: ${brl(c.mat + c.perda)}\n3D: ${brl(c.filamento + c.energia + c.maquina)}\nMão de obra: ${brl(c.mao)}\nFixos: ${brl(c.fixo)}\nExtras: ${brl(c.extras)}\nCUSTO: ${brl(c.custo)}\nPREÇO: ${brl(c.preco)} (margem ${c.margemPct}% + taxas ${c.taxasPct}%)${c.adic ? `\nFrete somado no final: ${brl(c.adic)}` : ''}\nLucro: ${brl(c.lucro)}`;
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
      if (v === '' && 'nullable' in t.dataset) v = null;
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
    } else if (t.dataset.adic !== undefined) {
      const x = p.adicionais[+t.dataset.adic];
      x[t.dataset.f] = t.dataset.f === 'valor' ? num(t.value) : t.value;
      save(); updateResults();
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
  if (tab === 'config' && t.dataset.s) { S.settings[t.dataset.s] = 'str' in t.dataset ? t.value : num(t.value); save(); }
  if (tab === 'config' && t.dataset.ai) {
    AI[t.dataset.ai] = t.value.trim();
    if (t.dataset.ai === 'provider') AI.model = AI_MODELS[AI.provider][0][0];
    saveAI(); if (t.dataset.ai === 'provider') renderConfig();
  }
  if (tab === 'config' && t.dataset.sy) { SY[t.dataset.sy] = t.value.trim(); if (t.dataset.sy !== 'token') SY.sha = null; saveSY(); }
  if (t.id === 'fq') { filtro.q = t.value; renderListaInsumos(); }
});
app.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'fc') { filtro.cat = t.value; renderListaInsumos(); }
  if (tab === 'insumos' && t.dataset.i && ['cat', 'un'].includes(t.dataset.f)) renderListaInsumos();
});
app.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.copy) { copiar(b.dataset.copy); return; }
  const p = prod(S.sel);
  if (tab === 'produtos' && p) {
    if (b.id === 'addLinha') {
      const first = S.insumos[0]; if (!first) { toast('Cadastre insumos primeiro'); return; }
      p.linhas.push({ kind: 'insumo', ref: first.id, qtd: 1 }); save(); renderEditor(p);
    } else if (b.dataset.delLine !== undefined) { p.linhas.splice(+b.dataset.delLine, 1); save(); renderEditor(p); }
    else if (b.id === 'addAdic') { (p.adicionais ||= []).push({ desc: 'Frete', valor: 0 }); save(); renderEditor(p); }
    else if (b.dataset.delAdic !== undefined) { p.adicionais.splice(+b.dataset.delAdic, 1); save(); renderEditor(p); }
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
    if (b.id === 'syConnect') {
      if (!SY.token || !/^[\w.-]+\/[\w.-]+$/.test(SY.repo)) { toast('Preencha o repositório (dono/nome) e o token'); return; }
      SY.sha = null; saveSY(); syDirty = false; syBusy = false; syncDown(true).then(() => { renderConfig(); if ($('#sy').className === 'ok') toast('Sincronização ativada ✓'); });
    } else if (b.id === 'syLink') {
      const raw = btoa(unescape(encodeURIComponent(JSON.stringify({ repo: SY.repo, token: SY.token, ai: AI.key ? { provider: AI.provider, key: AI.key, model: AI.model } : undefined })))).replace(/\+/g, '-').replace(/\//g, '_');
      copiar(location.origin + location.pathname + '#sync=' + raw);
    } else if (b.id === 'syOff') {
      if (!confirm('Desconectar este aparelho da nuvem? Os dados continuam salvos aqui e no GitHub.')) return;
      SY.token = ''; SY.sha = null; saveSY(); setSy('off'); renderConfig();
    } else if (b.id === 'exp') {
      const url = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `precificador-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
    } else if (b.id === 'imp') $('#impFile').click();
    else if (b.id === 'reset') { if (confirm('Apagar TODOS os dados e voltar ao exemplo inicial?')) { S = seed(); save(); renderConfig(); toast('Dados reiniciados'); } }
    else if (b.id === 'vazio') { if (confirm('Apagar TODOS os dados e começar do zero?')) { S = { settings: S.settings, insumos: [], produtos: [], vendas: [], sel: null }; save(); renderConfig(); toast('Tudo limpo'); } }
  }
});
app.addEventListener('change', e => {
  if (e.target.id !== 'impFile') return;
  const f = e.target.files[0]; if (!f) return;
  f.text().then(t => {
    const d = JSON.parse(t);
    if (!d.settings || !Array.isArray(d.insumos) || !Array.isArray(d.produtos)) throw 0;
    S = migrate(d); save(); toast('Backup importado'); renderConfig();
  }).catch(() => toast('Arquivo inválido'));
});

/* ---------- Aba Insumos ---------- */
function renderInsumos() {
  app.innerHTML = `
  <h2>Insumos</h2>
  <p class="hint">Tudo o que você compra. Informe o preço pago e a quantidade da embalagem — o custo por unidade é calculado sozinho. Ex.: filamento R$ 110 por 1000 g; fita R$ 8 por 10 m; bombom R$ 15 por 12 un.</p>
  <div class="filters">
    <button class="btn pri" id="novoIns">+ Novo insumo</button>
    <button class="btn" id="nfBtn">📷 Importar nota fiscal</button>
    <input type="file" id="nfFile" accept="image/*,application/pdf" hidden>
    <input id="fq" placeholder="Buscar…" value="${esc(filtro.q)}">
    <select id="fc"><option value="">Todas as categorias</option>${CATS_INSUMO.map(c => opt(c, c, filtro.cat)).join('')}</select>
  </div>
  <div id="nfPanel"></div>
  <div class="card" id="listaIns"></div>`;
  renderListaInsumos();
  renderNF();
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

/* ---------- Aba Vendas ---------- */
const CANAIS = { ifood: 'iFood', site: 'Site' };
const PERIODOS = { hoje: 'Hoje', '7d': 'Últimos 7 dias', mes: 'Este mês', mesAnt: 'Mês passado', tudo: 'Todo o período' };
let vPeriodo = 'mes';
let VF = null; // rascunho do formulário de nova venda
const isoLocal = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const hoje = () => isoLocal(new Date());
const fmtData = s => { const [y, m, d] = String(s).split('-'); return d ? `${d}/${m}/${y.slice(2)}` : s; };

function vPrecoSugerido(p, canal) {
  if (!p) return 0;
  const c = calc(p); const v = canal === 'ifood' ? c.preco : c.precoSite;
  return isFinite(v) ? Math.round(v * 100) / 100 : 0;
}
function vFormReset(keep) {
  const prodId = keep?.prodId && prod(keep.prodId) ? keep.prodId : (S.produtos[0]?.id || '');
  const canal = keep?.canal || 'ifood';
  VF = { prodId, canal, qtd: 1, data: keep?.data || hoje(), obs: '', preco: vPrecoSugerido(prod(prodId), canal) };
}
// Resultado de uma venda com os valores congelados no momento do registro
function vCalc(v) {
  const q = num(v.qtd), pr = num(v.preco);
  const rec = pr * q;
  const base = Math.max(pr - num(v.adic), 0) * q; // frete é repassado, não é receita do produto
  const taxa = base * num(v.taxaPct) / 100;
  const custo = num(v.custo) * q;
  return { rec, taxa, custo, lucro: base - taxa - custo };
}
function vDentro(v) {
  const h = hoje();
  if (vPeriodo === 'tudo') return true;
  if (vPeriodo === 'hoje') return v.data === h;
  if (vPeriodo === '7d') { const d = new Date(); d.setDate(d.getDate() - 6); return v.data >= isoLocal(d); }
  const ini = h.slice(0, 8) + '01';
  if (vPeriodo === 'mes') return v.data >= ini;
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  const iniAnt = isoLocal(d); return v.data >= iniAnt && v.data < ini;
}

function renderVendas() {
  if (!VF) vFormReset();
  app.innerHTML = `
  <h2>Vendas</h2>
  <p class="hint">Registre cada venda escolhendo a cesta e o canal. O preço vem pronto (iFood ou site) e você pode alterá-lo.</p>
  <div class="card" id="vForm"></div>
  <div class="filters" style="margin-top:16px"><select id="vPer">${Object.entries(PERIODOS).map(([k, l]) => opt(k, l, vPeriodo)).join('')}</select></div>
  <div id="vResumo"></div>
  <div class="card" id="vLista" style="margin-top:14px"></div>`;
  renderVForm(); renderVResumo(); renderVLista();
}
function renderVForm() {
  const el = $('#vForm'); if (!el) return;
  if (!S.produtos.length) { el.innerHTML = '<div class="empty">Cadastre um produto/cesta na aba Produtos para registrar vendas.</div>'; return; }
  const p = prod(VF.prodId); const c = p ? calc(p) : null;
  el.innerHTML = `
    <div class="grid">
      <div style="grid-column:span 2"><label>Cesta / produto vendido</label>
        <select data-vf="prodId">${S.produtos.map(x => opt(x.id, x.nome || 'Sem nome', VF.prodId)).join('')}</select></div>
      <div><label>Canal da venda</label>
        <div class="seg">${Object.entries(CANAIS).map(([k, l]) => `<button class="${VF.canal === k ? 'on' : ''}" data-canal="${k}">${l}</button>`).join('')}</div></div>
    </div>
    <div class="grid" style="margin-top:10px">
      <div><label>Preço cobrado (R$)</label>${numIn('data-vf="preco"', VF.preco)}
        <div class="hint">Sugerido ${VF.canal === 'ifood' ? 'iFood' : 'site'}: <a href="#" data-usar-sug>${brl(vPrecoSugerido(p, VF.canal))}</a>${c && c.adic ? ` (inclui ${brl(c.adic)} de frete)` : ''}</div></div>
      <div><label>Quantidade</label>${numIn('data-vf="qtd"', VF.qtd)}</div>
      <div><label>Data</label><input type="date" data-vf="data" value="${esc(VF.data)}"></div>
      <div><label>Observação (opcional)</label><input data-vf="obs" value="${esc(VF.obs)}" placeholder="Cliente, pedido…"></div>
    </div>
    <div class="bar"><button class="btn pri" id="vAdd">Registrar venda</button></div>`;
}
function renderVResumo() {
  const el = $('#vResumo'); if (!el) return;
  const vs = S.vendas.filter(vDentro);
  const tot = vs.reduce((a, v) => { const r = vCalc(v); a.rec += r.rec; a.lucro += r.lucro; a.q += num(v.qtd); return a; }, { rec: 0, lucro: 0, q: 0 });
  const porCanal = Object.keys(CANAIS).map(k => {
    const x = vs.filter(v => v.canal === k).reduce((a, v) => { const r = vCalc(v); a.rec += r.rec; a.lucro += r.lucro; a.q += num(v.qtd); return a; }, { rec: 0, lucro: 0, q: 0 });
    return { k, ...x };
  });
  const top = Object.values(vs.reduce((a, v) => { (a[v.nome] ||= { nome: v.nome, q: 0, rec: 0 }).q += num(v.qtd); a[v.nome].rec += vCalc(v).rec; return a; }, {})).sort((a, b) => b.q - a.q).slice(0, 5);
  el.innerHTML = `
    <div class="kpis">
      <div class="kpi"><label>Faturamento</label><b>${brl(tot.rec)}</b></div>
      <div class="kpi"><label>Lucro líquido</label><b class="${tot.lucro < 0 ? 'bad' : 'ok'}">${brl(tot.lucro)}</b></div>
      <div class="kpi"><label>Cestas vendidas</label><b>${tot.q}</b></div>
      <div class="kpi"><label>Ticket médio</label><b>${brl(tot.q ? tot.rec / tot.q : 0)}</b></div>
    </div>
    <div class="grid g2" style="margin-top:12px">
      <div class="card"><h3 style="margin-top:0">Por canal</h3>
        ${porCanal.map(x => `<div class="kv"><span><span class="pill">${CANAIS[x.k]}</span> ${x.q} un.</span><span>${brl(x.rec)} · lucro ${brl(x.lucro)}</span></div>`).join('')}
        <div class="stack">${porCanal.map((x, i) => `<span style="width:${tot.rec ? x.rec / tot.rec * 100 : 0}%;background:${i ? 'var(--c3)' : 'var(--c6)'}"></span>`).join('')}</div></div>
      <div class="card"><h3 style="margin-top:0">Mais vendidos</h3>
        ${top.length ? top.map(t => `<div class="kv"><span>${esc(t.nome)}</span><span>${t.q} un. · ${brl(t.rec)}</span></div>`).join('') : '<div class="hint">Sem vendas no período.</div>'}</div>
    </div>`;
}
function vLinhaCalc(v) { const r = vCalc(v); return `<span class="${r.lucro < 0 ? 'bad' : 'ok'}">${brl(r.lucro)}</span>`; }
function renderVLista() {
  const el = $('#vLista'); if (!el) return;
  const vs = S.vendas.filter(vDentro).sort((a, b) => b.data.localeCompare(a.data));
  el.innerHTML = `<h3 style="margin-top:0">Vendas do período (${vs.length})</h3>` + (vs.length ? vs.map(v => `
    <div class="vrow">
      <div><b>${esc(v.nome)}</b><div class="hint">${fmtData(v.data)} · <span class="pill">${CANAIS[v.canal] || v.canal}</span>${v.obs ? ' · ' + esc(v.obs) : ''}</div></div>
      <div><label>Qtd.</label>${numIn(`data-vs="${v.id}" data-f="qtd"`, v.qtd)}</div>
      <div><label>Preço (R$)</label>${numIn(`data-vs="${v.id}" data-f="preco"`, v.preco)}</div>
      <div class="uc"><label>Lucro</label><span data-vl="${v.id}">${vLinhaCalc(v)}</span></div>
      <button class="x" data-del-venda="${v.id}" title="Excluir venda">✕</button>
    </div>`).join('') : '<div class="empty">Nenhuma venda neste período.</div>');
}
app.addEventListener('input', e => {
  if (tab !== 'vendas') return;
  const t = e.target;
  if (t.dataset.vf) {
    const f = t.dataset.vf;
    if (f === 'prodId') { VF.prodId = t.value; VF.preco = vPrecoSugerido(prod(VF.prodId), VF.canal); renderVForm(); }
    else if (f === 'preco' || f === 'qtd') VF[f] = num(t.value);
    else VF[f] = t.value;
  } else if (t.dataset.vs) {
    const v = S.vendas.find(x => x.id === t.dataset.vs); if (!v) return;
    const antes = num(v.qtd); v[t.dataset.f] = num(t.value);
    if (t.dataset.f === 'qtd' && v.baixa) { const pv = prod(v.prodId); if (pv && pv.estoque != null) pv.estoque = fq(num(pv.estoque) - (num(v.qtd) - antes)); }
    save();
    const c = $(`[data-vl="${v.id}"]`); if (c) c.innerHTML = vLinhaCalc(v);
    renderVResumo();
  }
});
app.addEventListener('change', e => { if (tab === 'vendas' && e.target.id === 'vPer') { vPeriodo = e.target.value; renderVResumo(); renderVLista(); } });
app.addEventListener('click', e => {
  if (tab !== 'vendas') return;
  const a = e.target.closest('[data-usar-sug]');
  if (a) { e.preventDefault(); VF.preco = vPrecoSugerido(prod(VF.prodId), VF.canal); renderVForm(); return; }
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.canal) { VF.canal = b.dataset.canal; VF.preco = vPrecoSugerido(prod(VF.prodId), VF.canal); renderVForm(); }
  else if (b.id === 'vAdd') {
    const p = prod(VF.prodId); if (!p) return;
    if (!(VF.qtd > 0)) { toast('Informe a quantidade'); return; }
    if (!(VF.preco > 0)) { toast('Informe o preço cobrado'); return; }
    const c = calc(p);
    const venda = { id: uid(), data: VF.data || hoje(), prodId: p.id, nome: p.nome, canal: VF.canal, qtd: VF.qtd, preco: VF.preco, custo: c.custo, adic: c.adic, taxaPct: VF.canal === 'ifood' ? c.taxasPct : num(S.settings.taxasSite), obs: VF.obs.trim() };
    if (p.estoque != null) { p.estoque = fq(num(p.estoque) - VF.qtd); venda.baixa = true; }
    S.vendas.unshift(venda);
    save(); toast(`Venda registrada: ${p.nome} · ${brl(VF.preco * VF.qtd)} ✓${venda.baixa ? ` (estoque: ${p.estoque})` : ''}`);
    vFormReset(VF); renderVForm(); renderVResumo(); renderVLista();
  } else if (b.dataset.delVenda) {
    const v = S.vendas.find(x => x.id === b.dataset.delVenda);
    if (!v || !confirm(`Excluir a venda de "${v.nome}" (${fmtData(v.data)})?`)) return;
    const pv = prod(v.prodId); if (v.baixa && pv && pv.estoque != null) pv.estoque = fq(num(pv.estoque) + num(v.qtd));
    S.vendas = S.vendas.filter(x => x.id !== v.id); save(); renderVResumo(); renderVLista();
  }
});

/* ---------- Aba Estoque (insumos e cestas) ---------- */
// i.estoque / p.estoque: quantidade atual (vazio = não controlado). i.minimo / p.minimo: alerta de reposição.
let eSub = 'insumos';
let eFiltro = { q: '', cat: '', falta: false };
const fq = n => Math.round(num(n) * 100) / 100;
const stepUn = u => ['g', 'ml'].includes(u) ? 100 : 1;
function estStatus(est, min) {
  if (est == null) return ['não controlado', 'hint'];
  if (est <= 0) return ['Sem estoque', 'bad'];
  if (num(min) > 0 && est <= num(min)) return ['Baixo', 'warn'];
  return ['OK', 'ok'];
}
// Quanto de cada insumo uma receita consome (inclui sub-produtos e filamento da impressão 3D)
function consumo(p, mult, acc = {}, stack = []) {
  if (stack.includes(p.id)) return acc;
  for (const l of p.linhas) {
    if (l.kind === 'insumo') { if (insumo(l.ref)) acc[l.ref] = (acc[l.ref] || 0) + num(l.qtd) * mult; }
    else { const q = prod(l.ref); if (q) consumo(q, num(l.qtd) * mult, acc, [...stack, p.id]); }
  }
  if (p.imp && p.imp.on && insumo(p.imp.fil) && num(p.imp.gramas) > 0) {
    const f = insumo(p.imp.fil);
    acc[f.id] = (acc[f.id] || 0) + num(p.imp.gramas) * (1 + num(p.imp.falha ?? S.settings.falha) / 100) * mult / (f.un === 'kg' ? 1000 : 1);
  }
  return acc;
}
function capacidade(p) {
  const need = consumo(p, 1); let min = Infinity, lim = '';
  for (const [id, n] of Object.entries(need)) {
    const i = insumo(id); if (!i || i.estoque == null || n <= 0) continue;
    const c = Math.floor(num(i.estoque) / n + 1e-9);
    if (c < min) { min = c; lim = i.nome.trim(); }
  }
  return isFinite(min) ? { n: Math.max(min, 0), lim } : null;
}

function renderEstoque() {
  app.innerHTML = `
  <h2>Estoque</h2>
  <p class="hint">Controle separado do preço: quanto você tem de cada insumo e quantas cestas prontas. Deixe o campo vazio para não controlar um item.</p>
  <div class="seg" style="max-width:340px;margin:10px 0">
    <button class="${eSub === 'insumos' ? 'on' : ''}" data-esub="insumos">🍫 Insumos</button>
    <button class="${eSub === 'cestas' ? 'on' : ''}" data-esub="cestas">🧺 Cestas prontas</button>
  </div>
  <div id="eBody"></div>`;
  renderEBody();
}
function renderEBody() {
  const el = $('#eBody'); if (!el) return;
  if (eSub === 'insumos') {
    el.innerHTML = `<div id="eKpis"></div>
      <div class="filters">
        <input id="eq" placeholder="Buscar insumo…" value="${esc(eFiltro.q)}">
        <select id="ec"><option value="">Todas as categorias</option>${CATS_INSUMO.map(c => opt(c, c, eFiltro.cat)).join('')}</select>
        <label class="toggle"><input type="checkbox" id="ef" ${eFiltro.falta ? 'checked' : ''}> Só em falta / baixo</label>
      </div>
      <div class="card" id="eLista"></div>`;
    renderEInsumos();
  } else {
    el.innerHTML = `<div id="eKpis"></div><div class="card" id="eLista" style="margin-top:12px"></div>`;
    renderECestas();
  }
  renderEKpis();
}
function renderEKpis() {
  const el = $('#eKpis'); if (!el) return;
  if (eSub === 'insumos') {
    const ctrl = S.insumos.filter(i => i.estoque != null);
    const falta = ctrl.filter(i => estStatus(i.estoque, i.minimo)[1] !== 'ok').length;
    const val = ctrl.reduce((a, i) => a + Math.max(num(i.estoque), 0) * unitCost(i), 0);
    el.innerHTML = `<div class="kpis"><div class="kpi"><label>Insumos controlados</label><b>${ctrl.length}</b></div><div class="kpi"><label>Em falta / baixo</label><b class="${falta ? 'bad' : 'ok'}">${falta}</b></div><div class="kpi"><label>Valor parado em insumos</label><b>${brl(val)}</b></div></div>`;
  } else {
    const ctrl = S.produtos.filter(p => p.estoque != null);
    const un = ctrl.reduce((a, p) => a + Math.max(num(p.estoque), 0), 0);
    const val = ctrl.reduce((a, p) => a + Math.max(num(p.estoque), 0) * calc(p).custo, 0);
    const falta = ctrl.filter(p => estStatus(p.estoque, p.minimo)[1] !== 'ok').length;
    el.innerHTML = `<div class="kpis"><div class="kpi"><label>Cestas prontas</label><b>${un}</b></div><div class="kpi"><label>Em falta / baixo</label><b class="${falta ? 'bad' : 'ok'}">${falta}</b></div><div class="kpi"><label>Custo em estoque</label><b>${brl(val)}</b></div></div>`;
  }
}
function renderEInsumos() {
  const q = eFiltro.q.trim().toLowerCase();
  const its = S.insumos.filter(i => (!eFiltro.cat || i.cat === eFiltro.cat) && (!q || i.nome.toLowerCase().includes(q))
    && (!eFiltro.falta || (i.estoque != null && estStatus(i.estoque, i.minimo)[1] !== 'ok')))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  $('#eLista').innerHTML = its.length ? its.map(i => {
    const [st, cl] = estStatus(i.estoque, i.minimo);
    return `<div class="erow">
      <div><b>${esc(i.nome.trim())}</b><div class="hint">${esc(i.cat)} · ${brl(unitCost(i))}/${esc(i.un)}</div></div>
      <div><label>Em estoque (${esc(i.un)})</label><div class="stepper"><button class="btn" data-estep="${i.id}" data-d="-1">−</button>${numIn(`data-ei="${i.id}" data-f="estoque"`, i.estoque, '—')}<button class="btn" data-estep="${i.id}" data-d="1">+</button></div></div>
      <div><label>Avisar abaixo de</label>${numIn(`data-ei="${i.id}" data-f="minimo"`, i.minimo, '—')}</div>
      <div class="uc"><span class="${cl}" data-est-st="${i.id}">${st}</span></div>
    </div>`;
  }).join('') : '<div class="empty">Nenhum insumo encontrado.</div>';
}
function renderECestas() {
  $('#eLista').innerHTML = S.produtos.length ? S.produtos.map(p => {
    const [st, cl] = estStatus(p.estoque, p.minimo); const cap = capacidade(p);
    return `<div class="erow erow2">
      <div><b>${esc(p.nome)}</b><div class="hint">${esc(p.cat)} · custo ${brl(calc(p).custo)}${cap ? ` · dá para montar mais <b>${cap.n}</b> (limite: ${esc(cap.lim)})` : ''}</div></div>
      <div><label>Prontas em estoque</label><div class="stepper"><button class="btn" data-pstep="${p.id}" data-d="-1">−</button>${numIn(`data-ep="${p.id}" data-f="estoque"`, p.estoque, '—')}<button class="btn" data-pstep="${p.id}" data-d="1">+</button></div></div>
      <div><label>Avisar abaixo de</label>${numIn(`data-ep="${p.id}" data-f="minimo"`, p.minimo, '—')}</div>
      <div><label>Montar novas</label><div class="stepper">${numIn(`data-eq="${p.id}"`, 1)}<button class="btn pri" data-produzir="${p.id}">Produzir</button></div></div>
      <div class="uc"><span class="${cl}" data-est-st="${p.id}">${st}</span></div>
    </div>`;
  }).join('') : '<div class="empty">Cadastre produtos na aba Produtos.</div>';
}
function estSet(obj, f, v) { obj[f] = v === '' ? null : num(v); }
function estRefreshStatus(obj) {
  const el = $(`[data-est-st="${obj.id}"]`); if (!el) return;
  const [st, cl] = estStatus(obj.estoque, obj.minimo); el.textContent = st; el.className = cl;
}
app.addEventListener('input', e => {
  if (tab !== 'estoque') return;
  const t = e.target;
  if (t.dataset.ei || t.dataset.ep) {
    const obj = t.dataset.ei ? insumo(t.dataset.ei) : prod(t.dataset.ep); if (!obj) return;
    estSet(obj, t.dataset.f, t.value); save(); estRefreshStatus(obj); renderEKpis();
  } else if (t.id === 'eq') { eFiltro.q = t.value; renderEInsumos(); }
});
app.addEventListener('change', e => {
  if (tab !== 'estoque') return;
  if (e.target.id === 'ec') { eFiltro.cat = e.target.value; renderEInsumos(); }
  if (e.target.id === 'ef') { eFiltro.falta = e.target.checked; renderEInsumos(); }
});
app.addEventListener('click', e => {
  if (tab !== 'estoque') return;
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.esub) { eSub = b.dataset.esub; renderEstoque(); return; }
  const stepIt = (obj, d, step) => { obj.estoque = Math.max(fq(num(obj.estoque) + d * step), 0); save(); renderEBody(); };
  if (b.dataset.estep) { const i = insumo(b.dataset.estep); if (i) stepIt(i, +b.dataset.d, stepUn(i.un)); }
  else if (b.dataset.pstep) { const p = prod(b.dataset.pstep); if (p) { p.estoque = fq(num(p.estoque) + +b.dataset.d); save(); renderEBody(); } }
  else if (b.dataset.produzir) {
    const p = prod(b.dataset.produzir); if (!p) return;
    const q = num($(`[data-eq="${p.id}"]`).value);
    if (!(q > 0)) { toast('Informe quantas cestas vai montar'); return; }
    const need = consumo(p, q);
    const ctrl = Object.entries(need).map(([id, n]) => [insumo(id), n]).filter(([i]) => i && i.estoque != null);
    const falta = ctrl.filter(([i, n]) => num(i.estoque) < n - 1e-9);
    let msg = `Montar ${q}× "${p.nome}"?\n\nVai dar baixa em:\n` + (ctrl.length ? ctrl.slice(0, 10).map(([i, n]) => `• ${i.nome.trim()}: −${fq(n)} ${i.un}`).join('\n') : '(nenhum insumo controlado)');
    if (falta.length) msg += `\n\n⚠ Estoque insuficiente de: ${falta.map(([i, n]) => `${i.nome.trim()} (tem ${fq(i.estoque)}, precisa ${fq(n)})`).join(', ')}.\nMontar mesmo assim? (o estoque ficará negativo)`;
    if (!confirm(msg)) return;
    ctrl.forEach(([i, n]) => { i.estoque = fq(num(i.estoque) - n); });
    p.estoque = fq(num(p.estoque) + q);
    save(); renderEBody(); toast(`${q}× ${p.nome} montada(s) ✓`);
  }
});

/* ---------- Nota fiscal com IA ---------- */
const AI_KEY = 'precificador-ai-v1';
let AI = null;
try { AI = JSON.parse(localStorage.getItem(AI_KEY)); } catch (e) { AI = null; }
AI = Object.assign({ provider: 'openai', key: '', model: 'gpt-4o-mini' }, AI || {});
const saveAI = () => { try { localStorage.setItem(AI_KEY, JSON.stringify(AI)); } catch (e) { /* sem storage */ } };
const AI_MODELS = { openai: [['gpt-4o-mini', 'GPT-4o mini (barato)'], ['gpt-4o', 'GPT-4o (mais preciso)']], claude: [['claude-sonnet-5-5', 'Claude Sonnet 5.5 (mais preciso)'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (mais barato)']], gemini: [['gemini-2.5-flash', 'Gemini 2.5 Flash (grátis)']] };

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const NF_SCHEMA = {
  type: 'object',
  properties: {
    data: { type: 'string', description: 'Data da compra (AAAA-MM-DD) se visível' },
    itens: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nome_na_nota: { type: 'string', description: 'Texto como aparece na nota' },
          nome: { type: 'string', description: 'Nome limpo e legível em português, sem códigos' },
          quantidade: { type: 'number' },
          valor_unitario: { type: 'number', description: 'Preço de 1 unidade em reais (se só houver total e quantidade, divida)' },
          categoria: { type: 'string', enum: CATS_INSUMO },
          match_id: { type: ['string', 'null'], description: 'id do insumo cadastrado que é o MESMO produto, ou null' },
          confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] }
        },
        required: ['nome_na_nota', 'nome', 'quantidade', 'valor_unitario', 'categoria', 'match_id', 'confianca']
      }
    }
  },
  required: ['itens']
};
const nfPrompt = lista => `Você lê notas fiscais e cupons de compra de uma cestaria (cestas de presente, café da manhã, flores, personalizados e impressão 3D).
Extraia CADA item comprado. Ignore totais, subtotais, descontos globais, troco, impostos e formas de pagamento.
Para cada item informe: nome limpo em português (sem códigos), quantidade, valor unitário em reais, categoria e, se for o MESMO produto de um insumo já cadastrado, o id dele em match_id (senão null).
Regras de correspondência: abreviações e caixa alta do mesmo produto contam como o mesmo (ex.: "FERRERO ROCHER T3" = "Ferrero Roche"). Tamanho, gramatura, sabor ou marca diferentes são produtos diferentes — nesse caso use null. Na dúvida, use null e confiança "baixa".
Use ponto decimal nos números.
Insumos já cadastrados (JSON): ${JSON.stringify(lista)}`;

async function prepararArquivo(file) {
  const toB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  if (file.type === 'application/pdf') {
    if (file.size > 20e6) throw new Error('PDF muito grande (máx. 20 MB).');
    return { media: 'application/pdf', data: await toB64(file) };
  }
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  return { media: 'image/jpeg', data: cv.toDataURL('image/jpeg', 0.88).split(',')[1] };
}
async function lerNota(file) {
  if (!AI.key) throw new Error('Configure a chave da IA em Configurações.');
  const { media, data } = await prepararArquivo(file);
  const lista = S.insumos.map(i => ({ id: i.id, nome: i.nome.trim(), un: i.un, qtd_embalagem: i.qtd, preco: i.preco }));
  const prompt = nfPrompt(lista);
  if (AI.provider === 'openai') {
    const arquivo = media === 'application/pdf'
      ? { type: 'file', file: { filename: 'nota.pdf', file_data: `data:${media};base64,${data}` } }
      : { type: 'image_url', image_url: { url: `data:${media};base64,${data}`, detail: 'high' } };
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AI.key },
      body: JSON.stringify({
        model: AI.model, temperature: 0, response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [arquivo, { type: 'text', text: prompt + '\n\nResponda SOMENTE com JSON neste formato: ' + JSON.stringify({ data: 'AAAA-MM-DD', itens: [{ nome_na_nota: '', nome: '', quantidade: 1, valor_unitario: 0, categoria: CATS_INSUMO[0], match_id: null, confianca: 'alta' }] }) }] }]
      })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 401 ? 'Chave da OpenAI inválida.' : r.status === 429 ? 'Sem créditos ou limite da OpenAI atingido.' : (j.error?.message || 'Erro da IA (' + r.status + ')'));
    try { return JSON.parse(j.choices?.[0]?.message?.content || ''); } catch (e) { throw new Error('A IA devolveu uma resposta ilegível. Tente outra foto.'); }
  }
  if (AI.provider === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(AI.model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': AI.key },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: media, data } }, { text: prompt + '\n\nResponda SOMENTE com JSON neste formato: ' + JSON.stringify({ data: 'AAAA-MM-DD', itens: [{ nome_na_nota: '', nome: '', quantidade: 1, valor_unitario: 0, categoria: CATS_INSUMO[0], match_id: null, confianca: 'alta' }] }) }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 }
      })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error?.message || 'Erro da IA (' + r.status + ')');
    const txt = j.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    try { return JSON.parse(txt.replace(/^```json|```$/g, '').trim()); } catch (e) { throw new Error('A IA devolveu uma resposta ilegível. Tente outra foto.'); }
  }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': AI.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({
      model: AI.model, max_tokens: 8000,
      tools: [{ name: 'registrar_itens', description: 'Registra os itens lidos da nota fiscal', input_schema: NF_SCHEMA }],
      tool_choice: { type: 'tool', name: 'registrar_itens' },
      messages: [{ role: 'user', content: [
        media === 'application/pdf' ? { type: 'document', source: { type: 'base64', media_type: media, data } } : { type: 'image', source: { type: 'base64', media_type: media, data } },
        { type: 'text', text: prompt }
      ] }]
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 401 ? 'Chave da IA inválida.' : (j.error?.message || 'Erro da IA (' + r.status + ')'));
  const tu = (j.content || []).find(c => c.type === 'tool_use');
  if (!tu) throw new Error('A IA não devolveu itens. Tente outra foto.');
  return tu.input;
}

let NF = null; // { loading, erro, data, rows }
function nfRows(res) {
  return (res.itens || []).filter(it => it && (it.nome || it.nome_na_nota)).map(it => {
    let m = S.insumos.find(i => i.id === it.match_id);
    if (!m) m = S.insumos.find(i => norm(i.nome) === norm(it.nome));
    const preco = Math.round(num(it.valor_unitario) * 100) / 100;
    return { inc: preco > 0, match: m ? m.id : 'new', nome: String(it.nome || it.nome_na_nota).trim(), nomeNota: it.nome_na_nota || '', cat: CATS_INSUMO.includes(it.categoria) ? it.categoria : 'Outros', preco, qtdComp: num(it.quantidade) || 1, conf: it.confianca || 'media' };
  });
}
function nfDelta(r) {
  const i = insumo(r.match); if (!i) return '';
  const d = i.preco ? (r.preco / i.preco - 1) * 100 : 0;
  if (Math.abs(r.preco - i.preco) < 0.005) return '<span class="hint">sem mudança</span>';
  return `<span class="${d > 0 ? 'bad' : 'ok'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(0)}%</span>`;
}
function renderNF() {
  const el = $('#nfPanel'); if (!el) return;
  if (!NF) { el.innerHTML = ''; return; }
  if (NF.loading) { el.innerHTML = '<div class="card empty">🔎 Lendo a nota fiscal… (uns segundos)</div>'; return; }
  if (NF.erro) { el.innerHTML = `<div class="card"><div class="warn">⚠ ${esc(NF.erro)}</div><div class="bar"><button class="btn" id="nfCancel">Fechar</button></div></div>`; return; }
  const opts = [...S.insumos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const nUp = NF.rows.filter(r => r.inc && r.match !== 'new').length, nAdd = NF.rows.filter(r => r.inc && r.match === 'new').length;
  el.innerHTML = `<div class="card" style="margin-bottom:14px">
    <h3 style="margin-top:0">Nota fiscal${NF.data ? ' · ' + esc(NF.data) : ''}</h3>
    <p class="hint">Confira antes de aplicar: itens que já existem têm o <b>preço atualizado</b>; os demais são <b>adicionados</b>. Você pode trocar a correspondência ou corrigir nome e preço.</p>
    ${NF.rows.length ? NF.rows.map((r, k) => {
      const i = insumo(r.match);
      return `<div class="nfrow">
        <label class="toggle"><input type="checkbox" data-nf="inc" data-k="${k}" ${r.inc ? 'checked' : ''}> <span class="pill">${i ? 'Atualizar' : 'Novo'}</span></label>
        <div><label>Na nota: ${esc(r.nomeNota)} ${r.conf === 'baixa' ? '<span class="warn">· conferir</span>' : ''}</label>
          <select data-nf="match" data-k="${k}"><option value="new"${r.match === 'new' ? ' selected' : ''}>➕ Adicionar como novo item</option>${opts.map(o => opt(o.id, `↻ ${o.nome.trim()} (${brl(o.preco)})`, r.match)).join('')}</select>
          ${i ? '' : `<div class="grid g2" style="margin-top:6px"><input data-nf="nome" data-k="${k}" value="${esc(r.nome)}"><select data-nf="cat" data-k="${k}">${CATS_INSUMO.map(c => opt(c, c, r.cat)).join('')}</select></div>`}
          ${i && i.qtd !== 1 ? `<div class="hint">Atenção: este insumo é cadastrado com embalagem de ${i.qtd} ${esc(i.un)} — o preço vale pela embalagem inteira.</div>` : ''}</div>
        <div><label>Novo preço (R$)</label>${numIn(`data-nf="preco" data-k="${k}"`, r.preco)}<div data-nfd="${k}">${nfDelta(r)}</div></div>
      </div>`;
    }).join('') : '<div class="empty">Nenhum item encontrado nesta foto.</div>'}
    <div class="bar"><button class="btn pri" id="nfApply" ${NF.rows.length ? '' : 'disabled'}>Aplicar (${nUp} atualizar, ${nAdd} adicionar)</button><button class="btn" id="nfCancel">Cancelar</button></div>
  </div>`;
}
function nfBind() {
  app.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || tab !== 'insumos') return;
    if (b.id === 'nfBtn') { if (!AI.key) { toast('Primeiro configure a chave da IA em Configurações'); return; } $('#nfFile').click(); }
    else if (b.id === 'nfCancel') { NF = null; renderNF(); }
    else if (b.id === 'nfApply') {
      let up = 0, add = 0;
      for (const r of NF.rows) {
        if (!r.inc) continue;
        const i = insumo(r.match);
        if (i) { i.preco = r.preco; up++; }
        else { S.insumos.unshift({ id: uid(), nome: r.nome || r.nomeNota, cat: r.cat, un: 'un', preco: r.preco, qtd: 1 }); add++; }
      }
      NF = null; save(); renderInsumos(); toast(`${up} preço(s) atualizado(s), ${add} item(ns) adicionado(s) ✓`);
    }
  });
  app.addEventListener('change', async e => {
    const t = e.target;
    if (t.id === 'nfFile') {
      const f = t.files[0]; t.value = ''; if (!f) return;
      NF = { loading: true }; renderNF();
      try { const res = await lerNota(f); NF = { data: res.data || '', rows: nfRows(res) }; }
      catch (err) { NF = { erro: err.message || String(err) }; }
      renderNF();
    }
  });
  app.addEventListener('input', e => {
    const t = e.target; if (!NF || !NF.rows || !t.dataset.nf) return;
    const r = NF.rows[+t.dataset.k]; if (!r) return;
    const f = t.dataset.nf;
    if (f === 'inc') { r.inc = t.checked; renderNF(); }
    else if (f === 'match') { r.match = t.value; r.inc = r.preco > 0; renderNF(); }
    else if (f === 'preco') { r.preco = num(t.value); const d = $(`[data-nfd="${t.dataset.k}"]`); if (d) d.innerHTML = nfDelta(r); }
    else r[f] = t.value;
  });
}
nfBind();

/* ---------- Sincronização com GitHub (repositório privado de dados) ---------- */
const SYNC_KEY = 'precificador-sync-v1';
let SY = null;
try { SY = JSON.parse(localStorage.getItem(SYNC_KEY)); } catch (e) { SY = null; }
SY = Object.assign({ repo: 'Kavmkt/precificador-dados', path: 'data.json', token: '', sha: null }, SY || {});
const saveSY = () => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(SY)); } catch (e) { /* sem storage */ } };
/* Link de acesso: https://site/#sync=<base64 {repo,token}> — o fragmento (#) nunca vai para o servidor. */
(function importLink() {
  const m = location.hash.match(/^#sync=([\w+/=-]+)$/);
  if (!m) return;
  try {
    const d = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))));
    if (d.token && /^[\w.-]+\/[\w.-]+$/.test(d.repo || '')) { SY.repo = d.repo; SY.token = d.token; SY.sha = null; saveSY(); }
    if (d.ai && d.ai.key && AI_MODELS[d.ai.provider]) { AI = Object.assign(AI, { provider: d.ai.provider, key: d.ai.key, model: d.ai.model || AI_MODELS[d.ai.provider][0][0] }); saveAI(); }
  } catch (e) { /* link inválido */ }
  history.replaceState(null, '', location.pathname + location.search);
})();
let syTimer, syDirty = false, syBusy = false;

const b64enc = s => btoa(unescape(encodeURIComponent(s)));
const b64dec = s => decodeURIComponent(escape(atob(s.replace(/\s/g, ''))));
function setSy(state, msg) {
  const el = $('#sy'); if (!el) return;
  const map = { off: ['☁ local', 'Sincronização desligada — dados só neste navegador'], pending: ['☁ …', 'Alterações aguardando envio'], saving: ['☁ salvando…', ''], ok: ['☁ salvo ✓', 'Sincronizado com o GitHub'], err: ['☁ erro ⚠', msg || ''] };
  el.textContent = map[state][0]; el.title = map[state][1]; el.className = state;
}
async function ghApi(method, body) {
  const r = await fetch(`https://api.github.com/repos/${SY.repo}/contents/${SY.path}` + (method === 'GET' ? `?t=${Date.now()}` : ''), {
    method, cache: 'no-store',
    headers: { Authorization: 'Bearer ' + SY.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (r.status === 401 || r.status === 403) throw new Error('Token inválido ou sem permissão (Contents: leitura e escrita).');
  return r;
}
async function pull() {
  const r = await ghApi('GET');
  if (r.status === 404) {
    const repoOk = await fetch(`https://api.github.com/repos/${SY.repo}`, { headers: { Authorization: 'Bearer ' + SY.token } });
    if (!repoOk.ok) throw new Error('Repositório não encontrado ou sem acesso: ' + SY.repo);
    return { exists: false };
  }
  if (!r.ok) throw new Error('GitHub respondeu ' + r.status);
  const j = await r.json();
  const data = JSON.parse(b64dec(j.content));
  if (!data.settings || !Array.isArray(data.insumos) || !Array.isArray(data.produtos)) throw new Error('data.json inválido no repositório.');
  return { exists: true, sha: j.sha, data };
}
function applyRemote(rm) {
  S = migrate(rm.data); SY.sha = rm.sha; saveSY();
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
  syDirty = false; render();
}
async function push(retry = true) {
  const r = await ghApi('PUT', { message: 'Atualiza dados', content: b64enc(JSON.stringify(S, null, 1)), ...(SY.sha ? { sha: SY.sha } : {}) });
  if ((r.status === 409 || r.status === 422) && retry) {
    const rm = await pull();
    if (rm.exists && rm.sha !== SY.sha) {
      if (confirm('Os dados na nuvem foram alterados em outro aparelho.\n\nOK = usar os dados da nuvem (descarta as alterações feitas aqui)\nCancelar = sobrescrever a nuvem com os dados deste aparelho')) { applyRemote(rm); return; }
      SY.sha = rm.sha;
    } else if (!rm.exists) SY.sha = null;
    return push(false);
  }
  if (!r.ok) throw new Error('Falha ao salvar (' + r.status + ')');
  SY.sha = (await r.json()).content.sha; saveSY();
}
function scheduleSync() {
  if (!SY.token) return;
  syDirty = true; setSy('pending');
  clearTimeout(syTimer); syTimer = setTimeout(flushSync, 1500);
}
async function flushSync() {
  if (!SY.token || !syDirty) return;
  if (syBusy) { syTimer = setTimeout(flushSync, 800); return; }
  syBusy = true; syDirty = false; setSy('saving');
  try { await push(); setSy(syDirty ? 'pending' : 'ok'); }
  catch (e) { syDirty = true; setSy('err', e.message); }
  finally { syBusy = false; }
}
async function syncDown(first) {
  if (!SY.token || syDirty || syBusy) return;
  setSy('saving');
  try {
    const rm = await pull();
    if (!rm.exists) { syDirty = true; await flushSync(); return; }
    if (rm.sha !== SY.sha) {
      if (first && !SY.sha && HAD_LOCAL && !confirm('Já existem dados salvos na nuvem.\n\nOK = usar os dados da nuvem\nCancelar = enviar os dados deste aparelho para a nuvem')) {
        SY.sha = rm.sha; syDirty = true; await flushSync(); return;
      }
      applyRemote(rm);
    }
    setSy('ok');
  } catch (e) { setSy('err', e.message); if (first) toast(e.message); }
}
$('#sy').addEventListener('click', () => { tab = 'config'; $$('#tabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === 'config')); render(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSync(); else syncDown(false); });
window.addEventListener('beforeunload', e => { if (syDirty) { e.preventDefault(); e.returnValue = ''; } });
setSy(SY.token ? 'ok' : 'off');
if (SY.token) syncDown(!SY.sha);

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
      ${f('margem', 'Lucro sobre o custo padrão (%)', '100 = lucrar o mesmo valor do custo (preço base = dobro). 50 = lucrar metade do custo.')}
      ${f('taxas', 'Taxas padrão — iFood (%)', 'iFood, cartão, Pix, imposto — saem do preço final.')}
      ${f('taxasSite', 'Taxas do site (%)', 'Usadas só no preço do site. Deixe 0 se não houver (ou ponha a taxa do cartão/Pix da loja).')}
      <div><label>Como aplicar a margem</label><select data-s="modoMargem" data-str><option value="custo"${(s.modoMargem || 'custo') === 'custo' ? ' selected' : ''}>% sobre o custo (markup)</option><option value="preco"${s.modoMargem === 'preco' ? ' selected' : ''}>% do preço de venda</option></select>
        <div class="hint">Sobre o custo: custo R$ 100 + 45% = R$ 145 de base. Do preço: R$ 45 de cada R$ 100 vendidos ficam de lucro — dá um preço bem mais alto.</div></div>
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <h3 style="margin-top:0">☁ Salvar na nuvem (GitHub)</h3>
    <p class="hint">Seus insumos, produtos e configurações ficam num repositório <b>privado</b> seu e abrem iguais em qualquer navegador. Em cada aparelho novo, cole o token uma única vez.</p>
    <div class="grid g2">
      <div><label>Repositório de dados (dono/nome)</label><input data-sy="repo" value="${esc(SY.repo)}" autocomplete="off"></div>
      <div><label>Token de acesso (GitHub)</label><input data-sy="token" type="password" value="${esc(SY.token)}" placeholder="github_pat_…" autocomplete="off"></div>
    </div>
    <div class="bar"><button class="btn pri" id="syConnect">${SY.token && SY.sha ? 'Sincronizar agora' : 'Conectar e sincronizar'}</button>${SY.token ? '<button class="btn" id="syLink">Copiar link para outro aparelho</button><button class="btn" id="syOff">Desconectar este aparelho</button>' : ''}</div>
    ${SY.token ? '<p class="hint">📱 <b>Celular/outro computador:</b> clique em “Copiar link para outro aparelho”, mande o link para você mesmo (WhatsApp, e-mail) e abra lá — conecta sozinho, sem digitar nada. O link contém seu token: não compartilhe com ninguém.</p>' : ''}
    <details><summary class="hint" style="cursor:pointer">Como criar o token (1 minuto)</summary>
      <ol class="hint">
        <li>Abra <b>github.com/settings/personal-access-tokens/new</b></li>
        <li>Nome: <i>precificador</i> · Expiração: a maior disponível (ou sem expiração)</li>
        <li><b>Repository access → Only select repositories</b> → escolha <i>precificador-dados</i></li>
        <li><b>Permissions → Repository permissions → Contents → Read and write</b></li>
        <li>Generate token, copie e cole acima. O token só dá acesso a esse repositório.</li>
      </ol>
    </details>
  </div>
  <div class="card" style="margin-top:16px">
    <h3 style="margin-top:0">📷 Leitura de nota fiscal (IA)</h3>
    <p class="hint">Tire foto da nota (ou envie PDF) na aba Insumos: a IA lê os itens, atualiza o preço dos que já existem e adiciona os novos. A foto é enviada ao provedor escolhido apenas para a leitura.</p>
    <div class="grid">
      <div><label>Provedor</label><select data-ai="provider"><option value="openai"${AI.provider === 'openai' ? ' selected' : ''}>OpenAI (ChatGPT) — pago, centavos por nota</option><option value="claude"${AI.provider === 'claude' ? ' selected' : ''}>Claude (Anthropic) — pago, centavos por nota</option><option value="gemini"${AI.provider === 'gemini' ? ' selected' : ''}>Gemini (Google) — plano grátis</option></select></div>
      <div><label>Modelo</label><select data-ai="model">${AI_MODELS[AI.provider].map(([v, l]) => opt(v, l, AI.model)).join('')}</select></div>
      <div><label>Chave de API</label><input data-ai="key" type="password" value="${esc(AI.key)}" placeholder="${AI.provider === 'openai' ? 'sk-proj-…' : AI.provider === 'claude' ? 'sk-ant-…' : 'AIza…'}" autocomplete="off"></div>
    </div>
    <details><summary class="hint" style="cursor:pointer">Onde pegar a chave</summary>
      <ol class="hint">
        <li><b>Gemini (grátis):</b> entre em aistudio.google.com/apikey → <i>Create API key</i>.</li>
        <li><b>Claude:</b> console.anthropic.com/settings/keys → <i>Create key</i>, e adicione uns US$ 5 de crédito em Billing (rendem centenas de notas). Defina um limite mensal de gasto.</li>
        <li>A chave fica só neste aparelho. O botão “Copiar link para outro aparelho” (na seção da nuvem) leva a chave junto.</li>
      </ol>
    </details>
  </div>
  <div class="card" style="margin-top:16px">
    <h3 style="margin-top:0">Backup manual</h3>
    <p class="hint">Opcional: uma cópia em arquivo, além da nuvem. O token nunca entra no backup.</p>
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

# 🧺 Precificador de Cestaria

Calculadora de custos e preços para cestas de presente, café da manhã, flores e produtos personalizados (incluindo impressão 3D).

App 100% estático (HTML + CSS + JS, sem build e sem servidor). Os dados ficam no navegador (localStorage) e, opcionalmente, sincronizados com um repositório **privado** do GitHub (`precificador-dados/data.json`) via token fine-grained (Contents: read/write) colado em Configurações. Também há backup `.json` manual.

## O que calcula

- **Insumos**: preço pago ÷ quantidade da embalagem = custo por unidade.
- **Produtos / cestas**: lista de insumos e até outros produtos como sub-itens (ex.: chaveiro 3D dentro de uma cesta).
- **Impressão 3D**: filamento (com % de falha), energia (W × horas × tarifa) e desgaste da máquina (R$/h).
- **Mão de obra**, **rateio de custos fixos**, **perdas** e **custos extras** (frete, arte…).
- **Preço de venda** = custo ÷ (1 − margem − taxas), com arredondamento (inteiro ou ,90), preço mínimo e lucro líquido.
- Copia a descrição para o cliente (WhatsApp) e o resumo de custos.

## Rodar localmente

```bash
python3 -m http.server 8000   # e abra http://localhost:8000
```

## Publicar grátis

- **GitHub Pages**: Settings → Pages → Deploy from branch → `main` / root.
- **Vercel**: importe o repositório (framework "Other", sem build).

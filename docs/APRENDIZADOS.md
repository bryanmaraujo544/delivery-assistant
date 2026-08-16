# Aprendizados e Decisões

Registro acumulativo. **Adicione aqui toda vez que aprender algo novo** — descoberta de domínio, armadilha técnica, correção de premissa, feedback do Bryan.

Regra deste arquivo: **se não tem fonte, escreva "não apurado". Não preencha com plausibilidade.**

Formato de entrada nova: `### [AAAA-MM-DD] Título` + o que se aprendeu + por que importa + fonte.

---

## Índice

- [A. Produto e posicionamento](#a-produto-e-posicionamento)
- [B. Domínio: precificação de confeitaria](#b-domínio-precificação-de-confeitaria)
- [C. Princípios de UX](#c-princípios-de-ux)
- [D. Decisões técnicas](#d-decisões-técnicas)
- [E. Padrões de implementação](#e-padrões-de-implementação)
- [F. Premissas corrigidas](#f-premissas-corrigidas)
- [G. Não apurado](#g-não-apurado--não-trate-como-fato)
- [H. Processo de trabalho](#h-processo-de-trabalho)

---

## A. Produto e posicionamento

### [2026-08-15] A promessa do produto em uma frase

> Você atualiza o preço do insumo em um lugar, e o custo de todos os produtos que o usam se atualiza sozinho.

**Por que importa:** não é detalhe de implementação, é a razão pela qual um app ganha de uma planilha. Nas reviews dos concorrentes é o elogio mais recorrente — *"Once you edit an ingredient cost, it updates all of your recipes."* **Nada pode quebrar o recálculo em cascata.**

### [2026-08-15] Público e contexto de uso

Confeiteiras autônomas / MEI, Brasil. **Android 77,59% / iOS 22,41%** (StatCounter, jul/2026); dos iPhones, ~67% já em iOS 26.5.

Usam o app **dentro da cozinha**: mão suja de massa, celular na bancada, pressa, Wi-Fi ruim. Baixo repertório de gestão — margem, rateio e ponto de equilíbrio não são intuitivos para elas.

### [2026-08-15] O mercado é MUITO mais lotado do que o briefing supunha

~17 concorrentes só no Brasil, faixa **R$ 15–45/mês**. Confirmados com fonte: Lucro na Confeitaria (+50k downloads, 3,8★), Doce Preço, Doce Cálculo, Receitório, PrecifiCerto, Gestly, Precifica Fácil, MultyBook, ZupConfeitaria, Confe.it, Chef de Bolso, ConfeiGo, Doce Lucro, Menu Control, Chef.IA.

**Consequência:** precificação pura é commodity. Não é diferencial.

### [2026-08-15] As três brechas reais do mercado

1. **QR Code / XML da NF-e** — só Receitório (câmera) e PrecifiCerto (upload XML). É infraestrutura pública brasileira que concorrente internacional não consegue copiar, e mata a dor nº1 (cadastro).
2. **Conversão por densidade real** — 1 xícara de farinha ≈ 120 g, de açúcar ≈ 200 g, de leite condensado ≈ 300 g. Só a BakeProfit resolve. Agravado no BR por "1 lata", "1 caixinha".
3. **Auditabilidade** — o app líder BR tem relato de somar errado. A planilha ganha porque a pessoa **vê a fórmula**.

### [2026-08-15] A dor nº1 é o cold start do catálogo de insumos

Reviews reais:
> *"Be prepared to spend time manually entering all of your ingredients and cost of goods for each recipe."* (CakeBoss, Capterra)
> *"there was a spot for ingredients as a master list"* / *"some entries are gonna be entered twice"* (CakeCost, 3,2★)

A pessoa abre o app, vê tela vazia pedindo 40 insumos, e desiste. **O valor só chega depois do trabalho todo — a curva é invertida.**

### [2026-08-15] Por que ainda usam planilha

Verificado: existe oferta abundante de planilha **grátis e sem cadastro**; um app grátis foi elogiado justamente por **não exigir login**. Inferência (não comprovada): assinatura de R$ 15–45/mês compete com custo de insumo para quem fatura ~R$ 1.500/mês; a planilha é auditável e é dela para sempre; e ela **vem pronta**, enquanto o app chega vazio.

### [2026-08-15] Modelo de negócio decidido

SaaS multi-tenant com assinatura. **Requisito explícito do Bryan:** suportar **contas isentas** — teste, parceiros, suporte, uso interno.

**Decisão:** `billing_status: trial | active | past_due | exempt` como campo de primeira classe. **Não** implementar como cupom de 100% de desconto — conta isenta é *estado*, não desconto, e misturar os dois vira dívida técnica na primeira reconciliação financeira.

---

## B. Domínio: precificação de confeitaria

### [2026-08-15] Terminologia PT-BR — não invente nomes

Vocabulário de navegação convergente entre todos os concorrentes:

> **Fichas técnicas · Insumos · Encomendas · Precificação · Clientes · Etiquetas**

- "Ficha técnica", não "receita padronizada" nem "recipe card"
- "Insumo" no contexto de compra/estoque
- "Encomenda", não "pedido" genérico
- "Sinal" = entrada/adiantamento
- "Cento" = 100 docinhos
- "Gramatura" = peso padrão da unidade

### [2026-08-15] O insumo tem 4 campos de entrada, não 2

Resolve simultaneamente kg→g e "cartela de 30 ovos, uso 3":

```
Insumo
  nome_canonico
  unidade_compra        # kg, L, un, pacote, lata
  tamanho_embalagem     # 1 (kg) | 30 (un) | 395 (g)
  preco_embalagem       # inteiro em centavos
  unidade_uso           # g, ml, un
  fator_correcao        # DEFAULT 1.0000
  → custo_por_unidade_uso  (DERIVADO, nunca digitado)
```

Validado pela calculadora Meslo, que modela exatamente esses campos. **`custo_por_unidade_uso` é computado** — nunca ofereça campo para digitar (checklist NN/g: compute o que der para computar).

**Histórico de preço é obrigatório** — preço de insumo muda toda semana. Habilita alerta de margem, "cadastrado há 2 meses", e torna autosave seguro em campo de dinheiro.

### [2026-08-15] Fator de correção é quase sempre 1,00 — descoberta que evita fricção

Fonte acadêmica (Guia UFV, PDF lido integralmente): **FC = 1,00 para praticamente todo insumo de confeitaria** — farinha, açúcar, leite condensado, manteiga, creme de leite, chocolate, todos os queijos. Razão declarada: são produtos prontos para consumo, sem parte não comestível.

FC só importa para:
- **Frutas**: maracujá **2,61** (mais da metade do que se paga vai pro lixo), coco maduro 2,04, manga 1,95, abacaxi 1,83, banana nanica 1,66, morango 1,12
- **Ovo quando se separa gema/clara** (a própria fonte destaca: *"especialmente na confeitaria"*)

**Decisão:** campo **opcional, colapsado, default 1,00**. Se fosse obrigatório, criaria atrito em 90% dos casos por causa de 10%.

Tabela pré-populada como sugestão, sempre sobrescrevível — as tabelas publicadas divergem entre si (manga 1,16–1,42 vs 1,55; melão 1,60 vs 1,04) e a literatura manda cada operação medir a sua.

Fórmulas: `FC = PB / PL` · `FCy (cocção) = PC / PL`

### [2026-08-15] Rendimento precisa ser teórico E real

As fontes mandam usar o rendimento do **último lote**, não o que a receita promete — há resíduo na panela e "degustação de controle de qualidade".

**A prova:** uma lata de leite condensado rende **40 ou 55 brigadeiros** dependendo da fonte (diferença de gramatura assumida, 15g vs 20g). Sem `rendimento_real` editável, o custo unitário mente.

### [2026-08-15] Sub-receitas não são opcionais

Bolo decorado = **massa + recheio + cobertura**, cada uma com custo próprio. É como o trabalho realmente é organizado, e é o que faz o recálculo em cascata propagar de verdade.

Modelar como grafo (ficha referencia ficha). **Detectar ciclos na escrita, não na leitura.**

### [2026-08-15] Perdas: 4 tipos com percentuais distintos

| Tipo | Percentual |
|---|---|
| Preparo (pré-processo) | 0,5–1,5% dos sólidos |
| **Assamento (bolos)** | **8–12%** |
| Produtos defeituosos | 0,5–2% (até 5% em pico) |
| Não vendido | variável |

Genérico quando não se quer detalhar: **3–5%** sobre custo dos insumos.

**Nota técnica:** a perda de assamento é conceitualmente **fator de cocção**, não desperdício. Vendido por kg → afeta preço direto; por unidade → afeta rendimento.

Pasta americana: prever **15% extra** para aparas (espessura padrão 3 mm).

### [2026-08-15] Mão de obra é 40–50% do preço em bolo decorado

E é chamada nas fontes de **"o mais esquecido de todos"**. Exemplo real: bolo de 30 cm com **R$ 7,82 de insumo e R$ 22,00 de mão de obra**.

```
valor_hora = salario_desejado_mensal / horas_mes
custo_mo   = valor_hora × tempo_preparo
```

**`horas_mes` precisa ser configurável** — as fontes divergem entre **176h** e **220h**, o que muda o valor/hora em 25% (R$ 17,05 vs R$ 13,63 para o mesmo salário de R$ 3.000).

### [2026-08-15] Markup vs Margem — a confusão é endêmica e está nas fontes

- `margem = 1 − 1/markup` · `markup = 1/(1 − margem)`
- Markup incide sobre o **custo**; margem sobre o **preço de venda**.

**O erro clássico:** aplicar "30% de markup" achando que dá 30% de margem — a margem real é **23%**. Inverso: querer 50% de margem e multiplicar por 1,5, quando o correto é 2,0.

**A confusão está nas próprias fontes do nicho:** Meslo rotula "Margem de Lucro (%)" mas descreve aplicação *sobre o custo* (isso é markup); Confeitaria Online chama de "% Markup" um número usado em `÷(1−%)` (isso é margem).

**Decisão:** a UI **nunca** exibe "markup 3x" sem dizer 3x sobre o quê. Mostra sempre os dois números lado a lado, com a base nomeada.

Convenção mais defensável do nicho: **markup ~2,5× sobre materiais + mão de obra somada por fora**.

### [2026-08-15] CMV e markup por canal

**CMV saudável para doce artesanal: 25–35%** (referência SEBRAE).

| Canal | Markup sobre CMV |
|---|---|
| Balcão / pronta entrega | 60–150% |
| **Encomenda / personalizado** | **150–300%** |

**Gross-up de canal é por DIVISÃO, não soma:**
```
preco_canal = preco_base / (1 − taxa_canal)
```
Somar a taxa **não** recompõe a margem. iFood 2026: Básico ~15,2% (12% comissão + 3,2% pagamento), Entrega ~26,5% (23% + 3,5%). Mensalidade só acima de R$ 1.800/mês de faturamento.

### [2026-08-15] "Cento" é entidade de negócio, não formatação

Docinho se vende por 100 unidades, com tabela própria: cento simples R$ 120–180, gourmet R$ 200–300, casamento R$ 280–380.

### [2026-08-15] Encomenda: sinal de 50% é o padrão

> *"Doce personalizado não se revende: topo com o nome da aniversariante e forminha temática viram lixo se o pedido cair."*

Não há legislação específica, mas é prática comum e aceita. A entidade Encomenda precisa de: `data_entrega`, `data_limite_alteracao`, `valor_sinal`, `status_pagamento`.

### [2026-08-15] Dinheiro: regras de precisão

- Preço digitado pela usuária: **inteiro em centavos**. Nunca float.
- Custos derivados (custo/grama): Postgres `numeric(18,8)`.
- ~~Agregação acontece no banco, não em JS.~~ **REVOGADO em 15/08/2026** — quebrava o offline-first. Ver § D "Onde a agregação de custo acontece".
- **Centavo fracionado é correto durante o cálculo.** Farinha a R$ 12,00/kg custa 1,2 centavos/g; arredondar isso para 1 erraria o custo em 17%. O pipeline é: entrada inteira → cálculo fracionado → **arredonda uma única vez no fim**. Arredondar no meio é o erro clássico de sistema de custo.

---

## C. Princípios de UX

### [2026-08-15] A regra dos 3 cliques é FALSA — reformular a premissa

O briefing original pedia "sempre economize cliques". **Há evidência contra.**

- A regra nunca foi sustentada por nenhum estudo publicado (NN/g).
- Estudo UIE: 44 usuários, 620 tarefas, 8.000+ cliques → **nenhuma correlação** entre número de cliques e sucesso.
- Teste NN/g: encontrar produtos **aumentou 600%** quando o caminho foi de 3 para **4** cliques.
- Motivo: espremer passos produz listas longas e **aumenta carga cognitiva** (Hick's Law contra-atacando).

**Reformulação:** o instinto está certo, o alvo estava errado. Aqui o gargalo não é o dedo, **é o teclado**. A meta é **orçamento de digitação**:

| Tarefa | Orçamento |
|---|---|
| Adicionar insumo recorrente a uma ficha | **0 caracteres** (chip de frecency) |
| Insumo conhecido não recorrente | ≤ 4 caracteres (autocomplete) |
| Criar insumo novo com preço | 1 campo texto + 1 campo valor, **sem trocar de tela** |
| Criar ficha a partir de existente | 1 toque (duplicar) + editar nome |
| Importar receita colada | 1 colagem + 1 revisão |

Medir **time-on-task**, taxa de conclusão e **% adicionado via sugestão vs. digitado**. Não medir taps.

### [2026-08-15] Reordenar, nunca esconder

O padrão "último álbum usado" do iOS tem armadilha documentada: o iOS 18 Photos levou reclamação pública porque os defaults "inteligentes" nunca acertavam o álbum.

**Regra:** frecency **reordena**. Nunca oculta opções nem troca destino por adivinhação. A busca completa fica sempre a um toque.

### [2026-08-15] Mostre a conta

A planilha ganha do app em um ponto: **a pessoa vê a fórmula**. O app é caixa-preta. O app líder BR tem relato de somar errado — e um app de precificação que erra a conta perde o usuário para sempre.

Toda tela de preço precisa de detalhamento expansível: insumos → mão de obra → indiretos → perda → markup → preço. **Nunca entregue só o número final.**

### [2026-08-15] Undo em vez de confirmação

Confirmação é proporcional ao **custo de reconstruir**, não ao fato de ser um delete. Modais rotineiros treinam a pessoa a dispensar sem ler (NN/g).

| Ação | Padrão |
|---|---|
| Remover insumo da ficha | Direto + snackbar "Desfazer" (5s) |
| Excluir ficha | Soft delete + Desfazer; lixeira 30 dias |
| Excluir insumo **usado em N fichas** | Confirmação **informativa**: "Açúcar é usado em 12 fichas. Excluir vai zerar o custo delas." Botão nomeado pela ação, nunca "OK/Cancelar" |
| Alterar preço | Sem confirmação; autosave + histórico reversível |

Ressalva: toasts são criticados por serem efêmeros e problemáticos para acessibilidade. Mitigar com `aria-live="polite"` e **sempre** ter caminho de recuperação persistente (lixeira).

### [2026-08-15] Autosave precisa de âncora de confiança

Autosave puro gera ansiedade — há evidência de que usuários **entram em pânico** sem botão de salvar. É questão de confiança, não de função.

Desenho obrigatório:
- Autosave + optimistic UI em toda edição incremental
- **Indicador de estado permanente**: "Salvo" / "Salvando…" / "Salvo offline — sincroniza ao conectar"
- Botão **"Concluir"** explícito nos bottom sheets, mesmo já estando salvo

### [2026-08-15] Nunca a tela vazia — provavelmente a maior alavanca do produto

O maior ponto de abandono é o cold start.

- **Seed de 80–150 insumos PT-BR** com nome canônico, unidade padrão, embalagem típica e **preço de referência marcado como estimado**
- Onboarding de **1 pergunta**, não wizard: "O que você mais faz? Bolos / Doces de festa / Tortas" → seleciona subconjunto e **cria 2–3 fichas de exemplo editáveis**
- Ela precisa precificar a primeira receita **antes de cadastrar qualquer coisa**
- O seed precisa ser removível em massa
- Estado vazio residual: **ghost row** (linha fantasma em baixa opacidade) em vez de ilustração centralizada

---

## D. Decisões técnicas

### [2026-08-15] SPA (Vite + React Router) em vez de Next.js — contraria a hipótese inicial

**Decisão:** Vite 8 + React Router 8 em modo SPA.

**Por quê:**
- É **ferramenta logada** → SSR e SEO valem zero
- **RSC trabalha contra o offline**: o service worker teria que lidar com payloads `.rsc`, não só HTML/JSON
- **Server Actions são incompatíveis com escrita offline por premissa** — assumem servidor alcançável no submit. Numa cozinha com internet ruim, o submit precisa funcionar sem rede, o que exige mutação local + fila
- SPA tem contrato trivial com service worker: precache do app shell, resto é API que controlamos

**Trade-off aceito:** sem SSR, first paint um pouco pior. Landing page com SEO, se precisar, vira site estático separado.

### [2026-08-15] Stack — versões verificadas no registry npm em 15/08/2026

| Camada | Escolha | Versão |
|---|---|---|
| Build | Vite | 8.2.1 |
| Router | React Router (SPA) | 8.3.0 |
| Runtime | React | 19.2.8 |
| Service Worker | `vite-plugin-pwa` | 1.3.0 ✅ testado |
| Estilo | Tailwind CSS | 4.3.3 ✅ testado |
| Componentes | shadcn/ui **com Base UI** | ✅ Base UI é o default desde jul/2026 |
| Dados/cache | TanStack Query | 5.101.4 |
| Storage local | Dexie (cache + outbox) | 4.4.5 |
| Formulários | React Hook Form + Zod | 7.85.0 / 4.4.3 |
| Gráficos | Recharts | 3.10.1 |
| Auth | Better Auth | 1.6.29 |
| Banco | Neon Postgres **`us-east-1`** | — |
| ORM | Drizzle **`node-postgres`** (`pg.Pool`) | **0.45.2** (não use o RC) |

### [2026-08-15] Banco: Neon em São Paulo, e a armadilha de região

- Neon tem **`aws-sa-east-1` (São Paulo)**
- **A API precisa ficar na mesma região do banco.** Default da Vercel é `iad1` (Virgínia) → trocar para **`gru1`**, senão são ~120ms extras por round-trip
- Usar host com sufixo **`-pooler`** na aplicação; conexão direta só para migrations
- **API (Fastify)**: `pg.Pool` contra o host `-pooler`, com handler de `pool.on('error')`
- Free tier: 0,5 GB/projeto, scale-to-zero após 5 min (não desativável no Free)
- **Vercel Postgres não existe mais** — migrado para Neon e desligado em 2025
- **Supabase Free pausa o projeto após 7 dias de inatividade** → desqualifica para produção sem pagar $25/mês

### [2026-08-15] Drizzle vs Prisma — "Drizzle é o moderno, Prisma é o pesado" deixou de ser verdade

- **Drizzle 1.0 está em RC há ~17 meses** (estável é 0.45.2) e o 1.0 traz breaking change nas relational queries (RQB v1 → v2)
- **Prisma 7.9.1 removeu o Rust engine**, ficou em 1,6 MB e não precisa mais de Accelerate para serverless

**Decisão:** Drizzle 0.45.2 com `neon-http`. Não adotar o RC. Se estabilidade de versão virar prioridade, Prisma 7 é alternativa madura.

### [2026-08-15] Offline: a escada mínima, sem engine de sync

Não usar Electric/Zero/PowerSync. É over-engineering para app com **um usuário por conta**.

1. App shell offline via service worker — *obrigatório*
2. Cache de leitura: TanStack Query persistido em IndexedDB — *obrigatório*
3. **Outbox no Dexie**: mutação vira registro local, UI otimista, worker drena quando volta conexão. Disparar em `online` e `visibilitychange` — **não confiar em Background Sync**
4. Engine de sync completa — *evitar*

Um usuário por conta ⇒ **last-write-wins**. Sem CRDT.

**Regra de ouro:** o servidor é a fonte da verdade; IndexedDB é cache + fila. **Nunca deixar o único exemplar de um dado existir só no celular** (quota e evicção no iOS não foram apuradas).

### [2026-08-15] WhatsApp: `wa.me` na v1, Cloud API só com demanda comprovada

**Fase 1:** gerar `https://wa.me/55DDDNUMERO?text=<urlencoded>`. Custo **R$ 0**, zero aprovação Meta, zero template. A mensagem sai **do número dela, com a cara dela**, e a resposta cai na conversa normal. Não precisa de internet do nosso servidor para gerar o link.

**Fase 2:** Cloud API, justificável apenas para **envio automático sem a pessoa presente** (lembrete de retirada, cobrança de sinal).

- Cobrança da Meta é **por mensagem entregue** desde 01/07/2025 (modelo por conversa foi aposentado)
- Tarifas BR (fonte terceira): marketing ~US$ 0,0625, utility ~US$ 0,0080, auth ~US$ 0,0315. **Marketing custa ~8× utility** — categorizar errado é caro
- Faturamento em BRL para o Brasil desde 01/07/2026
- **O custo real é burocracia**, não tarifa: 1.000 pedidos/mês ≈ US$ 16
- ⚠️ **Investigar Coexistence antes**: historicamente migrar o número para Cloud API fazia perder o app WhatsApp Business nele. Inaceitável — o WhatsApp dela *é* o negócio

### [2026-08-15] Backend: Fastify em Node — e o que isso REVOGA

**Decisão do Bryan:** API em Node com **Fastify 5.12.0**.

Isso muda três coisas que estavam decididas de outro jeito:

**1. Driver do banco: `neon-http` → `node-postgres`.** ~~`drizzle-orm/neon-http`~~ era a escolha certa para serverless, onde cada invocação é um processo novo e não há conexão a reusar. Num processo Fastify de longa duração o cálculo se inverte: um `pg.Pool` mantém TCP aberto e elimina o handshake por query. Agora é **`drizzle-orm/node-postgres` + `pg.Pool`** (`server/db.ts`).

**2. Deploy deixa de ser trivial.** SPA vira arquivos estáticos em qualquer CDN; Fastify é processo de longa duração e precisa de host que rode processo (**Fly / Railway / Render / VPS**). Não roda em Vercel Functions sem adaptador. São **dois deploys em dois hosts**.

**3. Origens diferentes ⇒ CORS + sessão cross-origin.** Front e API em domínios distintos. Cookie de sessão exigirá `SameSite=None; Secure` com domínio pai, ou usaremos bearer token. Já configurado via `CORS_ORIGINS`.

**Cuidado com o pool no free tier:** o compute do Neon suspende após 5 min de ociosidade. Configurado `idleTimeoutMillis: 30s`, `connectionTimeoutMillis: 10s` e um handler de `pool.on('error')` — sem ele, uma conexão ociosa derrubada pelo suspend derruba o processo Node inteiro.

### [2026-08-15] Sincronização: LWW por registro, NÃO fila de outbox — REVOGA o plano anterior

O plano dizia "outbox no Dexie: toda mutação vira registro local, worker drena a fila". **Implementado diferente, de propósito.**

Como cada conta tem **uma usuária** e a resolução é **last-write-wins**, sincronizar o **registro inteiro** por `atualizadoEm` é equivalente e mais simples:

- **idempotente por construção** — reenviar o mesmo registro não faz mal;
- **não duplica payload** — a fila guardaria uma cópia de cada mutação;
- **deletes já viajam** como soft delete (`excluidoEm`), sem operação especial.

Uma fila de verdade só se justificaria com operações **não-idempotentes** ou **ordem relevante** entre mutações. Nenhuma das duas existe aqui.

**Detalhes que importam:**
- **PUSH antes de PULL.** O contrário faz o servidor devolver versão antiga por cima de edição local não enviada.
- **Carimbo do servidor**, nunca do cliente (`servidorEm`). Relógio de celular erra; um adiantado faria o cliente pular mudanças na rodada seguinte.
- **LWW nos dois sentidos.** Na subida via `setWhere: lt(tabela.atualizadoEm, novoValor)`; na descida comparando antes de gravar no Dexie.
- **`tenantId` vem SEMPRE da sessão**, nunca do corpo. Confiar no cliente para dizer de quem são os dados é vazamento garantido.
- **Sem Background Sync API** — só existe em Chromium e falha calada nos demais. `online` + `visibilitychange` + intervalo cobrem os casos reais.

### [2026-08-15] Id sintético no seed quebrou só na primeira sincronização

`construirSeed` gerava `id: "seed-0"`, `"seed-1"`… Funcionou perfeitamente por duas telas inteiras. Quebrou na **primeira sincronização**: a coluna no Postgres é `uuid`, o Zod rejeitou, e o servidor devolveu **400 para o lote inteiro** — 57 insumos parados.

Pior: não bastava corrigir o gerador, porque os dados **já gravados** mantinham os ids antigos, e fichas + ranking de frecency apontavam para eles.

**Correção:** migração Dexie v3 que remapeia ids de insumo para UUID **e reescreve as referências** em `fichas.itens[].insumoId` e nas chaves de `usoInsumos`, tudo na mesma transação. Verificado: 57 insumos migrados, **zero referências quebradas**.

**Lição:** id gerado pelo cliente precisa nascer no formato que o servidor aceita, mesmo que o servidor ainda não exista. "Depois eu ajusto" vira migração com reescrita de referências.

### [2026-08-15] Login por senha — REVOGA "OTP é o único método"

**Motivo da mudança:** OTP depende de enviar e-mail, e enviar e-mail depende de **domínio verificado** no Resend. O `onboarding@resend.dev` só entrega para o e-mail da própria conta — serve para o dono testar, mas **nenhuma usuária real consegue receber o código**. Isso bloqueava a v1 inteira.

Senha remove a dependência e **mantém a propriedade que motivou o OTP**: o fluxo nunca sai do app, então não há como perder a sessão voltando do Safari em PWA standalone no iOS.

**As rotas de OTP continuam no ar.** No dia em que existir domínio, voltam a ser oferecidas — o código não foi jogado fora.

**DÍVIDA CONHECIDA:** recuperação de senha **também** precisa de e-mail. Sem domínio, quem esquecer depende de reset manual no banco. A tela diz isso explicitamente em vez de fingir que existe "esqueci minha senha".

**Decisões de hash (`server/auth/senha.ts`):**

| Decisão | Por quê |
|---|---|
| **scrypt** do `node:crypto` | Sem dependência nativa para compilar no deploy. Argon2id seria marginalmente melhor, mas módulo nativo é das formas mais comuns de quebrar build em container |
| **Nunca** sha256/md5 | São rápidos *de propósito* — GPU testa bilhões por segundo. scrypt é memory-hard e derruba essa vantagem |
| N=2^15, r=8, p=1 | ~100 ms por verificação: lento para o atacante, imperceptível para quem loga. Há teste que falha se cair abaixo de 20 ms |
| Salt aleatório por usuária | Sem ele, duas pessoas com a mesma senha teriam o mesmo hash, e quebrar uma quebraria as duas |
| Parâmetros **dentro** do hash (`scrypt$N$r$p$salt$hash`) | Permite encarecer no futuro sem invalidar as senhas existentes |
| `normalize('NFKC')` | "pão" digitado no iPhone e no Android pode chegar com bytes diferentes e falharia o login |
| scrypt "à toa" quando a conta não existe | Sem isso, "usuária inexistente" responde na hora e "senha errada" demora 100 ms — a diferença de tempo revela quais e-mails têm conta |
| Mensagem idêntica para senha errada e conta inexistente | Mesma razão |

**Enumeração no registro é aceita conscientemente:** `/auth/registrar` responde 409 "já existe uma conta". Fingir sucesso deixaria a pessoa presa sem entender. Rate limit contém o abuso.

**Erro de tipo que os testes NÃO pegaram:** `promisify(scrypt)` colapsa as sobrecargas e **perde o parâmetro de opções** — `{N, r, p}` seria silenciosamente ignorado e o hash sairia com parâmetros padrão, bem mais fracos. Vitest não faz typecheck, então os 8 testes passaram; só o `tsc` acusou. Corrigido com wrapper tipado à mão.

### [2026-08-15] Decisões de segurança do OTP (e por que cada uma)

Implementado em `server/auth/otp.ts` (primitivas puras) e `server/auth/rotas.ts`.

| Decisão | Por quê |
|---|---|
| **HMAC-SHA256**, não SHA-256 puro, para o código | 6 dígitos = 1 milhão de combinações. Um hash simples cai por força bruta offline em segundos se o banco vazar. Sem o `AUTH_SECRET`, o hash não serve para nada |
| E-mail entra na mensagem do HMAC | O mesmo código emitido a duas pessoas gera hashes diferentes |
| **`randomInt`**, nunca `Math.random()` | `Math.random()` é previsível a partir de saídas anteriores |
| **`timingSafeEqual`** | `a === b` retorna no primeiro byte diferente e vaza, pelo tempo, quantos caracteres iniciais estavam certos |
| **Máx. 5 tentativas**, depois queima o código | Sem isso, 1M de combinações cai por força bruta online |
| **Uso único** (`consumido_em`) | Código reaproveitável é senha permanente |
| Validade de **10 min** | Reduz a janela de ataque |
| Resposta **sempre `{ok:true}`** em `/solicitar` | Diferenciar respostas transformaria o endpoint num verificador de e-mails cadastrados (enumeração de usuários) |
| Falha de envio de e-mail **não** vaza para o cliente | Mesmo motivo acima |
| Rate limit **5/15min** em solicitar, 10/15min em verificar | Protege a cota do Resend e a caixa de entrada de quem for alvo |
| Sessão por **bearer token**, não cookie | Front e API em origens diferentes; cookie exigiria `SameSite=None` + domínio pai |
| `sha256` simples para o **token de sessão** | 256 bits de entropia não têm espaço de busca viável — HMAC seria teatro aqui |
| Tenant criado no **primeiro login** | A usuária não deve encarar uma etapa "criar organização" antes de precificar um bolo |

**Auditado no banco após o teste:** `codigo_hash` com 64 hex e zero dígitos em claro; contador de tentativas em 5 com `consumido_em` preenchido; `token_hash` de 64 chars; zero sessões após logout.

### [2026-08-15] `drizzle-kit` gera ALTER inválido em text → uuid, e engole o erro

Ao converter `tenant_membro.usuario_id` de `text` para `uuid`, o drizzle-kit gerou:

```sql
ALTER TABLE "tenant_membro" ALTER COLUMN "usuario_id" SET DATA TYPE uuid;
```

O Postgres recusa: *"column cannot be cast automatically to type uuid — You might need to specify USING usuario_id::uuid"*. Vale **mesmo com a tabela vazia**, porque a validação do cast é do tipo, não das linhas.

Pior: `drizzle-kit migrate` **terminou sem reportar o erro**. Descobri porque fui conferir as tabelas no banco e ainda eram 12.

**Regra:** depois de `db:migrate`, **verificar o estado real no banco** — não confiar na ausência de mensagem de erro. Migrations com mudança de tipo geralmente precisam de edição manual para incluir o `USING`.

### [2026-08-15] CORS não se testa por status HTTP

Ao validar o CORS eu testei o status de uma requisição com `Origin: http://evil.com` e recebi **200** — quase reportei como falha de segurança.

**200 é o comportamento correto.** CORS é aplicado pelo **navegador**, não pelo servidor. O servidor responde normalmente; o navegador decide bloquear com base no header `access-control-allow-origin`.

**Como testar de verdade:** inspecionar o header, não o status.
```
http://localhost:5173  -> access-control-allow-origin: http://localhost:5173
http://evil.com        -> (header ausente: navegador bloqueia)
```

### [2026-08-15] Latência real medida: ~150 ms até o Neon us-east-1

Primeira chamada 159 ms, segunda 146 ms (`/health` fazendo `select 1`). Confirma a ordem de grandeza que tinha sido estimada, agora **medida** e não mais suposição.

É aceitável porque o app é offline-first — o Dexie é a leitura primária e a API só participa da sincronização. Se um dia a latência incomodar, mover **Neon e API juntos** para `sa-east-1`, nunca só um.

### [2026-08-15] Onde a agregação de custo acontece — REVOGA decisão anterior

**Decisão anterior (errada):** "agregação de custo acontece no banco, não em JS".

**Por que estava errada:** o app é offline-first. Se a soma de uma ficha só existe no Postgres, a confeiteira não vê o custo sem rede — exatamente o cenário da cozinha que motiva o produto. A regra otimizava precisão e sacrificava o requisito central.

**Decisão nova:**
- **A função JS (`src/dominio/custo.ts`) é a implementação da agregação.** Funciona online e offline, e alimenta o optimistic UI.
- **O banco mantém a coluna gerada por insumo** (`custo_por_unidade_base`). Isso é integridade **por linha**, não agregação — continua valendo e continua sendo impossível gravar custo inconsistente.

**Como a precisão fica protegida sem o Postgres:** dinheiro entra como inteiro em centavos, o cálculo usa centavos fracionados (`number`), e o arredondamento acontece **uma única vez** na saída. Há teste cobrindo drift de float (`0.1 + 0.2`) e rejeição de `NaN`/`Infinity` para não propagar valor inválido pelo custo.

### [2026-08-15] Decisões do cálculo de custo que não eram óbvias

- **Perdas reduzem o rendimento, não inflam o custo.** As duas formas circulam nas fontes, mas reduzir rendimento é mais defensável: a perda de assamento (8–12%) é massa que evaporou — o lote rende menos, o custo do lote não mudou.
- **Perdas são multiplicativas, não somadas.** Perder 10% no preparo e 10% no forno deixa **81%**, não 80%.
- **Dimensão é validada.** Usar `ml` para um insumo de massa é erro, não conversão silenciosa — não existe conversão volume↔massa sem densidade do ingrediente.
- **Ciclo de sub-receita lança `CicloDeSubReceitaError`** com o caminho completo, em vez de estourar a pilha. O `CHECK` do banco só pega auto-referência direta; ciclo indireto (A→B→A) é responsabilidade da aplicação.
- **`markupParaMargem` / `margemParaMarkup`** existem para a UI exibir os dois números lado a lado, nunca só um.

### [2026-08-15] Banco provisionado em us-east-1 — e a consequência de deploy

O projeto Neon foi criado em **AWS US East 1 (N. Virginia)**, não em `sa-east-1`. Decisão consciente do Bryan (latência não é prioridade nesta fase).

**Consequência que inverte o conselho anterior:** a API deve ficar em **`iad1`** (default da Vercel). **NÃO trocar para `gru1`** — isso colocaria a API longe do banco e criaria exatamente a latência que se queria evitar. Como `iad1` já é o default, na prática é menos trabalho.

Se um dia a latência BR virar prioridade, mover **os dois juntos** (Neon `sa-east-1` + Vercel `gru1`), nunca só um.

### [2026-08-15] Não existe coluna `unidade_uso` — a unidade base é derivável

A unidade base do custo é totalmente determinada pela **dimensão** da unidade de compra:

| Dimensão | Unidade base |
|---|---|
| massa | `g` |
| volume | `ml` |
| contagem | `un` |

Como `embalagem_unidade` → `unidade.dimensao` já dá isso, uma coluna `unidade_uso` seria redundante e um segundo lugar para dessincronizar. `custo_por_unidade_base` significa "centavos por unidade base **da dimensão do insumo**".

Descoberto porque um script de teste tentou inserir a coluna e o banco recusou — o erro estava no teste, não no schema.

### [2026-08-15] Spike 1 — compatibilidade de versões VERIFICADA com build real

Não confie só no `peerDependencies`; foi feito build de verdade em `scratchpad/spike-pwa`.

**`vite-plugin-pwa@1.3.0` declara `vite: "^3 || ^4 || ^5 || ^6 || ^7 || ^8"`** — suporte ao Vite 8 é explícito, apesar do plugin ser de maio e o Vite 8 de agosto.

Build combinado com **Vite 8.2.1 + vite-plugin-pwa 1.3.0 + Tailwind 4.3.3 + React Router 8.3.0 + React 19.2.8**: instalação sem conflito de peer deps, build em 227ms, e artefatos corretos:

```
PWA v1.3.0
mode      generateSW
precache  5 entries (279.90 KiB)
files generated
  dist/sw.js
  dist/workbox-9c191d2f.js
```

Também gerados: `manifest.webmanifest`, `registerSW.js`, e CSS do Tailwind. `workbox-build@7.4.1` resolvido corretamente.

**Conclusão: o plano B (Serwist standalone) não é necessário.**

### [2026-08-15] Spike 3 — shadcn/ui está saudável, e Base UI virou o default

- **Desde julho/2026, projetos novos usam Base UI por padrão** no shadcn/ui (antes era Radix, desde jan/2023)
- **Radix NÃO foi descontinuado.** Continua suportado, e toda atualização/componente novo sai para as duas libs — exceto primitivas que só existem no Base UI
- Em fev/2026 o Radix foi consolidado num pacote único `radix-ui`, depreciando os `@radix-ui/react-*` individuais
- Existe comando de migração: `pnpm dlx shadcn@latest migrate radix`
- A recomendação oficial para projetos existentes é **não migrar** ("if your app works, keep shipping")

**Decisão:** projeto novo ⇒ **shadcn/ui com Base UI**, que é o caminho default e o que recebe as primitivas exclusivas.

Fontes: [changelog jul/2026](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default) · [changelog jan/2026](https://ui.shadcn.com/docs/changelog/2026-01-base-ui) · [Discussion #9562](https://github.com/shadcn-ui/ui/discussions/9562)

### [2026-08-15] Correção sobre o mercado mobile BR

O briefing supunha público majoritariamente iPhone. **Errado para o Brasil**: iOS é ~22%, e ~2/3 desses já estão em iOS 26.5 (Safari moderno).

**Consequência:** as limitações do Safari afetam uma minoria que está em versão recente. Isso **fortalece** a decisão por PWA em vez de nativo/Capacitor. Tratar iOS como **degradação graciosa**, não paridade. Não deixar o iOS ditar a arquitetura de 78% dos usuários.

---

## E. Padrões de implementação

### [2026-08-15] Frecency: usar o modelo do Slack, não o do Firefox

Buckets discretos, calculáveis no cliente sem job de recálculo:

| Idade do uso | Pontos |
|---|---|
| ≤ 4h | 100 |
| ≤ 1 dia | 80 |
| ≤ 3 dias | 60 |
| ≤ 1 semana | 40 |
| ≤ 1 mês | 20 |
| ≤ 90 dias | 10 |
| > 90 dias | 0 |

```
score = count_total × (Σ pontos / nº timestamps, máx 10)
```

O termo de recência satura em 100 e a frequência é ilimitada — é isso que deixa o item muito frequente eventualmente ultrapassar o muito recente.

O modelo do Firefox (decaimento exponencial duplo, meia-vida 30 dias) só compensa com milhares de itens; aqui são 50–300 insumos.

Aplicações:
- **Chips MRU acima do campo de busca** — 6–8 insumos, sempre visíveis, na thumb zone
- **Frecency por contexto** (ranking em "bolo" difere de "brigadeiro"), não global
- **Unidade também tem frecency** — se farinha foi cadastrada 9/10 vezes em gramas, abrir em gramas
- **Preço usa "último valor", não frecency** — pré-preencher e mostrar a data ("R$ 6,49 — cadastrado há 2 meses")

### [2026-08-15] Combobox com criação inline

- Máximo **4–8 sugestões no mobile**. Mais não ajuda
- Autocomplete é escolhido só **~23%** das vezes (NN/g) — é rede de segurança; **os chips é que carregam o fluxo**
- `+ Criar "X"` como item da própria lista. Ao escolher, **expandir bottom sheet inline** com 3 campos — nunca abrir tela nova
- **Preço pode ser adiado.** Permitir criar sem preço, marcado como "sem custo", com lembrete agregado. Bloquear por falta de preço mata o cadastro no meio
- **Dedupe na criação**: comparar sem acento, sem caixa, com stemming leve. "acucar cristal" deve oferecer "Açúcar cristal" existente. **Duplicata de insumo é veneno para relatório de custo**

### [2026-08-15] Parsing de ingrediente: `parse-ingredient` 2.2.0

MIT, ativo (abr/2026, ~2,5k downloads/semana), dependência única. **Uma engine serve dois recursos**: campo de linguagem natural **e** colar-receita.

Saída: `{ quantity, quantity2, unitOfMeasure, description, isGroupHeader, meta }`. `quantity2` cobre faixas ("2 a 3 colheres"); `isGroupHeader` detecta "Para a massa:".

Configurar para PT-BR (a lib tem os hooks, mas **não traz dicionário pt pronto** — o léxico é trabalho nosso, e é pequeno):
- `decimalSeparator: ','`
- `additionalUOMs`: xícara, xíc, colher de sopa, cs, colher de chá, cc, pitada, lata, caixa, pacote, tablete, gema, clara
- `groupHeaderPatterns`: "Para a massa:", "Para a cobertura:"
- `rangeSeparators`: "a", "ou"

Regras:
- **Feedback de parse em tempo real** — destacar o que foi entendido enquanto digita (padrão Todoist). Sem isso o recurso vira ansiedade
- Ordem invertida deve funcionar: "farinha 250g" == "250g farinha"
- **Falha graciosa**: não parseou → texto vira o nome, campos numéricos vazios e focados. Nunca erro bloqueante
- Ambiguidade → chips selecionáveis com o de maior frecency pré-selecionado
- Fallback LLM apenas nas linhas de baixa confiança, com JSON Schema. Determinístico primeiro (offline, grátis, instantâneo)

O parser da NYT (`ingredient-phrase-tagger`) está **arquivado desde 2019**, é Python + CRF++ e treinado em inglês. Não é caminho.

### [2026-08-15] Input mobile

- `type="text" inputmode="decimal"` para preço/quantidade. **Nunca `type="number"`** — spinners, rejeita separador de milhar, decimais inconsistentes entre locales
- Alvo mínimo **44×44px** (ideal 48px+ — mão suja), gap ≥ 8px
- **Zero dropdown longo.** Unidade = 4–6 chips horizontais ordenados por frecency
- **Todo fluxo de criação em bottom sheet**, nunca página nova nem modal central
- Stepper para quantidade (discreto, com default claro); **nunca stepper para preço** (contínuo — NN/g desaconselha)
- Formatar dinheiro **apenas no blur** — reformatar durante a digitação move o cursor
- Entrada de valor da direita para a esquerda em centavos (padrão caixa eletrônico): digitar `125000` exibe `R$ 1.250,00` e elimina a vírgula do caminho
- **Não fechar o teclado entre campos do mesmo tipo** — agrupar numéricos em sequência
- Ações destrutivas **fora** da thumb zone fácil, de propósito

### [2026-08-15] `markupParaMargem()` NÃO é a margem real quando a base é "materiais"

Bug pego rodando a tela de ficha. O painel exibia, ao mesmo tempo:

- `Margem 41,4%` (a margem verdadeira, calculada)
- `Multiplicador 2,5× sobre materiais = 60,0% de margem` (conversão teórica)

**Dois números contraditórios na mesma tela — reproduzindo exatamente a confusão markup/margem que este produto existe para eliminar.**

A razão: `markupParaMargem(m) = 1 − 1/m` só vale quando o multiplicador incide sobre o custo **total**. Com base `materiais`, a mão de obra entra por fora e não é multiplicada, então a margem efetiva é menor.

**Regra:** só exibir a conversão teórica quando `base === 'custo_total'`. Com base `materiais`, mostrar apenas "2,5× sobre **materiais**, com mão de obra somada por fora" e deixar a margem real (já calculada) ser a única resposta na tela.

### [2026-08-15] NUNCA exibir custo por grama

Bug pego rodando a tela, não no build. O preview mostrava maracujá como **"R$ 0,03 por g"** — o valor real é 3,132 centavos/g, e o arredondamento fazia parecer preciso enquanto escondia 4% de erro. Farinha vira "R$ 0,01" e perde ainda mais.

**Regra:** custo sempre exibido na unidade de compra — **kg** (massa), **L** (volume), **un** (contagem). É a mesma informação no vocabulário que a pessoa usa, e o arredondamento deixa de mentir. Implementado em `custoExibicao()` (`src/db/local.ts`), usado tanto na lista quanto no preview do formulário.

Lição de processo: build verde e typecheck limpo **não pegam erro de apresentação de número**. Rodar a tela pegou em 30 segundos.

### [2026-08-15] Duplicar é caminho primário, não função escondida

O trabalho de confeitaria é variação sobre base (bolo de chocolate → com nozes; brigadeiro → de leite ninho).

- "Duplicar" na **primeira posição** do menu de contexto, não em "…"
- Nome pré-preenchido `"Bolo de cenoura (cópia)"` **com o texto já selecionado**
- Fichas-base como templates de primeira classe: massa branca, ganache, brigadeiro de corte
- **Escalonamento é duplicação**: "para 20 porções" recalcula tudo, zero digitação

### [2026-08-15] Câmera: código de barras ANTES de OCR

- **`BarcodeDetector`** é API nativa (Chromium; polyfill nos demais), devolve identificador **exato**. Escanear EAN da embalagem → nome/marca/tamanho vêm do catálogo, sobra só o preço
- **OCR de cupom fiscal brasileiro é caso adversarial** — fonte de matriz, papel amassado, abreviações opacas (`LT COND MOCA 395G`). Mesmo com OCR perfeito ainda precisa mapear abreviação → insumo, o que empurra para LLM
- Tesseract.js 6.x é viável no navegador (WASM, Web Worker, ~1-2s de init) mas restrinja a região pequena e a dígitos
- Captura via `<input type="file" accept="image/*" capture="environment">` é o caminho de menor risco de compatibilidade

---

## F. Premissas corrigidas

Registro de coisas que acreditávamos e se mostraram erradas. **Consultar antes de repetir.**

| Premissa original | Realidade | Fonte |
|---|---|---|
| Público majoritariamente iPhone | **Android 77,6% / iOS 22,4%** no BR | StatCounter jul/2026 |
| Next.js é bom para PWA | RSC e Server Actions **trabalham contra** offline | análise de arquitetura |
| React Router está na v7 | Está na **v8.3.0** | registry npm |
| "Economize cliques" é a meta | Regra dos 3 cliques é **falsa**; a meta é orçamento de **digitação** | NN/g, UIE |
| Drizzle é a escolha moderna óbvia | Drizzle 1.0 em RC há 17 meses; Prisma 7 ficou leve | registry npm |
| Concorrentes lideram com WhatsApp | WhatsApp é sempre **saída** (PDF/link colado), nunca manchete | análise competitiva |
| ~6 concorrentes no BR | **~17 confirmados**, R$ 15–45/mês | análise competitiva |

---

## G. Não apurado — não trate como fato

Não deixe o código depender disso sem verificar na fonte primária:

- **MEI e rotulagem** (limite de faturamento, DAS, CNAE, RDC 429/2020, RDC 26/2015 alergênicos, Lei 10.674/2003 glúten) — **seção inteira não apurada**. São dados onde errar custa caro
- **PWA no iOS 26**: estado do Web Push, quota de IndexedDB, política de evicção, `navigator.storage.persist()`
- **OAuth / magic link em PWA standalone no iOS** — historicamente quebravam (abrem no Safari, sessão não volta). Não confirmado para 2026
- **Web Speech API em PWA standalone no iOS** — há relato de que não funciona, mas é da era iOS 14.5. Tratar voz como **Android-first**
- **Deploy**: preços e regiões 2026 de Vercel/Netlify/Cloudflare/Fly
- **Concorrentes não confirmados**: "Minha Confeitaria", "Maya", "Dora", "Jarbas", "Confeitaria Pro" apareceram em uma rodada de pesquisa e **não foram confirmados** em verificação independente. Um agente listou `minhaconfeitaria.com.br` como fonte — conflito não resolvido
- **Hotmart/Eduzz/Kiwify**: preços de planilhas pagas (suposto concorrente nº1) — zero cobertura
- **Reddit / grupos de Facebook**: evidência crua de usuárias — zero cobertura
- **Preços do catálogo semente** (`src/db/seed-insumos.ts`) — os **tamanhos de embalagem** são convenção real do mercado BR (leite condensado 395 g, ovo em cartela de 30), mas os **preços são placeholders inventados**, não pesquisados. Todos entram com `precoEstimado: true`. Substituir por pesquisa de cesta antes de lançar
- Densidades xícara→grama, custo de gás/kWh, depreciação de equipamento, atacado/consignado, ponto de equilíbrio

---

## H. Processo de trabalho

### [2026-08-15] Limitar subagentes e proibir fan-out recursivo

Numa rodada de discovery lancei 4 agentes de pesquisa. Um deles criou ~80 sub-agentes recursivamente — **85 no total**, e a árvore inteira foi abortada de uma vez, perdendo trabalho já pago em tokens.

Bryan interrompeu: *"cuidado com esse número de tasks rodando ao mesmo tempo"*.

**Regras:**
- Incluir no prompt de todo agente de pesquisa: **"NÃO use a ferramenta Agent, NÃO crie sub-agentes"**
- Teto de ~4 agentes simultâneos salvo pedido explícito
- **Medir antes de relatar** quantos agentes estão rodando (`ls` nos arquivos de subagente). Eu relatei "~10" quando eram 85, por estimativa
- Se a árvore morrer, **retomar via SendMessage pedindo consolidação** do que já foi pesquisado — recupera o trabalho em vez de refazer

### [2026-08-15] Exigir "NÃO APURADO" explícito

Um agente inventou nomes de concorrentes ("Minha Confeitaria", "Maya", "Dora", "Jarbas", "Confeitaria Pro") e **eu repassei como fato ao Bryan** sem verificar. Um agente independente não encontrou nenhum deles.

**Regra:** todo prompt de pesquisa deve exigir marcação explícita de **VERIFICADO (com URL)** vs **NÃO APURADO**, e proibir preenchimento por plausibilidade. Vale para mim também: não repassar achado de agente como fato sem checar.

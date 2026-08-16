# Progresso

Log de onde estamos, o que já foi feito e para onde vamos.

**Leia no início de cada sessão. Atualize ao final.**
Decisões e aprendizados vão em [APRENDIZADOS.md](APRENDIZADOS.md) — aqui fica só o *estado* e o *log*.

---

## Onde queremos chegar

**Produto:** SaaS de precificação e custo para confeitaria artesanal (bolos, doces de festa, bolo no pote).

**Promessa:**
> Você atualiza o preço do insumo em um lugar, e o custo de todos os produtos que o usam se atualiza sozinho.

**Modelo:** assinatura multi-tenant, com suporte a **contas isentas** (teste, parceiros, suporte, uso interno).

**Diferencial que perseguimos:** o mercado BR tem ~17 concorrentes a R$ 15–45/mês, então precificação pura é commodity. Nossa aposta é ganhar em **atrito de cadastro** (a dor nº1 documentada) e em **auditabilidade** (mostrar a conta, não só o número).

---

## Onde estamos

**Status: v1 funcional ponta a ponta — login, catálogo, fichas, cálculo de custo e sincronização com o Postgres.**

- [x] Pesquisa de domínio (precificação de confeitaria BR)
- [x] Análise competitiva
- [x] Discovery de stack
- [x] Pesquisa de padrões de UX de baixa fricção
- [x] Decisões de produto (escopo v1, modelo de negócio)
- [x] Decisões de arquitetura registradas
- [x] Spike 1 — compat de versões (Vite 8 × PWA × Tailwind 4 × RR8) ✅ passou
- [x] Spike 3 — saúde do shadcn/ui ✅ passou (Base UI é o default)
- [ ] **Spike 2 — login em iPhone real** ← bloqueado, precisa do Bryan
- [x] Scaffold do projeto (build + typecheck limpos)
- [x] Modelo de dados / migration inicial (12 tabelas)
- [x] Banco no Neon provisionado (us-east-1), migration + seed aplicados e verificados
- [x] Cálculo de custo (função pura + 29 testes)
- [x] Tela de catálogo de insumos (Dexie local, verificada rodando)
- [x] Tela de fichas técnicas + montador de receita
- [x] Chips de frecency (modelo Slack, funcionando na UI)
- [x] Backend: fundação Fastify + Drizzle `node-postgres`, `/health` verificado contra o Neon
- [x] Auth OTP com Resend (endpoints prontos, aguardando domínio verificado)
- [x] **Auth por e-mail e senha** (scrypt) — método ativo da v1, sem dependência de domínio
- [x] Endpoints de sincronização (push/pull) com LWW e isolamento por tenant
- [x] Sincronização no cliente + tela de login + guarda de rota
- [x] Host da API decidido: **Railway** (~US$ 5/mês) — config e build de produção prontos
- [x] **Escopo da v1 completo** (núcleo de custo + UX anti-digitação)
- [ ] Destravar boot em produção sem `RESEND_API_KEY` (senha não usa e-mail)
- [ ] Deploy no Railway

---

## Escopo da v1

Decidido com o Bryan em 15/08/2026. **Duas frentes, nada além disso:**

### 1. Núcleo de custo
- Insumos com embalagem → unidade de uso (4 campos, custo derivado)
- Histórico de preço por insumo
- Fichas técnicas com rendimento teórico + real
- Sub-receitas (massa + recheio + cobertura) com propagação de custo
- **Recálculo em cascata** — o coração do produto
- Markup com base declarada + mão de obra + perdas

### 2. UX anti-digitação
- Chips de frecency (modelo Slack)
- Combobox com criação inline em bottom sheet
- Parse de "250g farinha" (`parse-ingredient` + léxico PT-BR)
- Colar receita inteira
- Duplicar como caminho primário
- Seed de 80–150 insumos PT-BR + onboarding de 1 pergunta

### Fora da v1 (registrado para não voltar à discussão)
- **Encomendas / clientes / agenda** — é table stake, todo concorrente tem, mas justamente por isso não ganha ninguém. Fica para v2
- **Câmera / código de barras** — alto valor, mas depende de ter base de produtos
- **OCR de nota fiscal** — experimento, não feature
- **WhatsApp Cloud API** — v1 usa só link `wa.me`
- **Voz** — Android-first, e só depois de validar em aparelho real

---

## Spikes

| # | Spike | Resultado |
|---|---|---|
| 1 | `vite-plugin-pwa` 1.3.0 × Vite 8.2.1 | ✅ **PASSOU** — build real gerou `sw.js` + workbox. Testado junto com Tailwind 4.3.3 e React Router 8.3.0. Plano B (Serwist) desnecessário |
| 3 | Saúde do shadcn/ui, Radix vs Base UI | ✅ **PASSOU** — saudável; **Base UI é o default para projetos novos desde jul/2026**. Radix não foi descontinuado |
| 2 | **Login em iPhone real (app na tela de início)** | ⏳ **BLOQUEADO** — precisa de dispositivo físico. Ver roteiro abaixo |

### Spike 2 — roteiro para o Bryan executar

Só pode ser feito em iPhone real, com o app **instalado na tela de início** (não no Safari). É exatamente aí que o bug histórico aparece.

1. Subir um app mínimo em HTTPS (Vercel preview serve) com Better Auth configurado
2. No iPhone: Safari → Compartilhar → **Adicionar à Tela de Início**
3. Abrir **pelo ícone**, não pelo Safari
4. Testar **magic link**: pedir o link, abrir do e-mail → *a sessão volta para o app instalado ou abre no Safari?*
5. Testar **Google OAuth**: → *volta para o app standalone ou perde a sessão?*

**Se qualquer um falhar:** trocar por **OTP de 6 dígitos digitado dentro do app**. Imune ao problema (nunca sai do app), igualmente sem senha, e o público não-técnico já conhece o padrão de banco.

Enquanto não rodar, **não commitar a escolha de auth**.

---

## Log

### 2026-08-15 — Discovery

**Feito:**
- Pesquisa em 4 frentes: domínio, concorrentes, stack, UX
- `CLAUDE.md` inicial com o discovery consolidado — depois **substituído** pelas diretrizes comportamentais do Bryan, com o conteúdo realocado para `APRENDIZADOS.md`
- Criados `docs/PROGRESSO.md` e `docs/APRENDIZADOS.md`

**Decidido:**
- SaaS para vender, com `billing_status` incluindo `exempt` como estado de primeira classe
- v1 = núcleo de custo + UX anti-digitação
- **SPA (Vite 8 + React Router 8), não Next.js** — RSC e Server Actions trabalham contra offline
- Neon `aws-sa-east-1` + Drizzle 0.45.2 (`neon-http`), API em `gru1`
- Offline via outbox no Dexie, sem engine de sync
- WhatsApp por link `wa.me` na v1

**Incidente:**
- A rodada de pesquisa criou **85 subagentes** por fan-out recursivo e a árvore morreu de uma vez. Trabalho recuperado retomando os agentes via `SendMessage` pedindo consolidação. Regras derivadas em [APRENDIZADOS.md § H](APRENDIZADOS.md#h-processo-de-trabalho)
- Um agente **inventou nomes de concorrentes** e eu os repassei como fato antes de verificar. Correção registrada em [APRENDIZADOS.md § F](APRENDIZADOS.md#f-premissas-corrigidas)

### 2026-08-15 — Spikes 1 e 3

**Feito:**
- **Spike 1 passou.** Build real em `scratchpad/spike-pwa` com Vite 8.2.1 + vite-plugin-pwa 1.3.0 + Tailwind 4.3.3 + React Router 8.3.0 + React 19.2.8. Sem conflito de peer deps; `sw.js`, workbox, `manifest.webmanifest` e CSS gerados. O plugin declara `^8.0.0` explicitamente no peerDeps de vite
- **Spike 3 passou.** shadcn/ui saudável; **Base UI virou o default em jul/2026**. Decisão atualizada: usar shadcn/ui **com Base UI**, não Radix
- Removidos de § G os dois itens agora verificados

**Bloqueado:**
- **Spike 2** precisa de iPhone físico — roteiro documentado acima. Não commitar escolha de auth antes disso

### 2026-08-15 — Scaffold + modelo de dados

**Feito:**
- Scaffold: Vite 8.2.1 + React 19.2.8 + React Router 8.3.0 + Tailwind 4.3.3 + vite-plugin-pwa 1.3.0 + TypeScript strict. `npm run build` e `tsc --noEmit` limpos, SW gerado
- Schema Drizzle em `src/db/schema.ts` → migration `drizzle/0000_talented_goblin_queen.sql`, **12 tabelas**
- `drizzle/seed-unidades.sql` — lookup de unidades (g/kg/ml/l/un/porcao/fatia/cento)

**Decidido:**
- **Auth = OTP de 6 dígitos por e-mail.** Como o spike 2 não pode ser executado (sem iPhone), escolhi o método **imune** ao problema em vez de adiar a decisão: OTP nunca sai do app, então não há como perder a sessão no retorno do Safari. Magic link/Google ficam como adição futura, se um dia o teste em dispositivo real liberar
- As tabelas de autenticação **não** foram criadas — `tenant_membro.usuario_id` é `text` solto, para não acoplar ao provedor antes da decisão final

**Integridade garantida no banco (não só na UI):**
- `custo_por_unidade_base` é **coluna GENERATED STORED** — impossível gravar custo inconsistente com preço/embalagem/FC
- `num_nonnulls(insumo_id, sub_ficha_id) = 1` — item da ficha é insumo XOR sub-receita
- `sub_ficha_id <> ficha_id` — barra auto-referência (ciclos indiretos ficam na aplicação)
- unique parcial em `(tenant_id, nome_normalizado) WHERE excluido_em IS NULL` — duplicata de insumo destrói relatório de custo
- `taxa_percentual < 100` no canal — evita divisão por zero no gross-up
- `fator_correcao >= 1` — FC menor que 1 é fisicamente impossível

**Bloqueado:**
- Aplicar a migration precisa de um projeto Neon em `aws-sa-east-1` e da `DATABASE_URL_UNPOOLED` no `.env`. Ver `.env.example`

### 2026-08-15 — Banco no ar

**Feito:**
- Projeto Neon `delivery-assistant` em **AWS us-east-1** (região escolhida pelo Bryan; latência não é prioridade agora)
- Migration `0000` aplicada: **12 tabelas**
- Seed de unidades aplicado: `g, kg, ml, l, un, porcao, fatia, cento`
- `dotenv` adicionado ao `drizzle.config.ts` — sem ele o drizzle-kit não lê o `.env`

**Verificado contra o banco real (não só inspeção de schema):**
- `R$ 12,00/kg` → `1.2` centavos/g; 250 g → `300` centavos (R$ 3,00) ✅
- FC 2,61 (maracujá): `R$ 10,00/kg` → `2.61` centavos/g de polpa ✅
- **Recálculo em cascata:** mudar o preço para R$ 15,00 recalculou o custo para `1.5` sozinho ✅
- Constraints rejeitaram: insumo duplicado, FC < 1, canal com taxa ≥ 100%, item de ficha sem alvo, ficha referenciando a si mesma ✅
- Dados de teste removidos ao final

**Aprendido:** não existe coluna `unidade_uso` — a unidade base é derivável da dimensão. Ver [APRENDIZADOS § D](APRENDIZADOS.md#d-decisões-técnicas)

### 2026-08-15 — Cálculo de custo

**Feito:**
- `src/dominio/dinheiro.ts` — centavos, arredondamento à prova de drift, parse de entrada pt-BR
- `src/dominio/custo.ts` — materiais com conversão de unidade, sub-receitas recursivas, perdas, mão de obra, rateio, markup com base declarada, gross-up de canal
- `src/dominio/custo.test.ts` — **29 testes, todos passando**. `npm test`

**Decidido (revoga decisão anterior):**
- A **agregação de custo é em JS**, não no banco. A regra antiga quebrava o offline-first. O banco mantém a coluna gerada por insumo, que é integridade por linha. Ver [APRENDIZADOS § D](APRENDIZADOS.md#d-decisões-técnicas)

**Testes que travam as armadilhas do domínio:**
- Gross-up por divisão: R$ 30,00 no iFood Entrega vira **R$ 40,82**; somando 26,5% daria R$ 37,95 — R$ 2,87 a menos por pedido
- `markupParaMargem(1.3)` = **23,08%** — o erro clássico de achar que 30% de markup dá 30% de margem
- Rendimento real (40 brigadeiros) vs teórico (55): usar o teórico subestima o custo unitário em ~27%
- Perdas multiplicativas: 10% + 10% deixa **81%**, não 80%
- Base `materiais` vs `custo_total` com os mesmos números: **R$ 17,50 vs R$ 32,50**. Prova por que a base nunca pode ficar implícita
- Bolo de 30 cm do discovery: mão de obra = **74% do custo total**

**Aprendido:** `Intl` pt-BR usa espaço não-quebrável (U+00A0) antes do valor — quebra comparação de string em teste, mas é o comportamento tipograficamente correto. Normalizar só na asserção, não no formatador.

### 2026-08-15 — Tela de catálogo de insumos

**Feito:**
- `src/db/local.ts` — store Dexie (offline-first: leitura primária é local)
- `src/db/seed-insumos.ts` — catálogo semente com **57 insumos** PT-BR
- `src/componentes/` — `CampoDinheiro`, `BottomSheet`, `Snackbar` (undo)
- `src/rotas/insumos.tsx` — lista, busca, criação/edição, exclusão com desfazer
- `.claude/launch.json` para `preview_start`

**Verificado rodando no navegador (375×812), não só no build:**
- Estado vazio → "Carregar catálogo inicial" popula 57 insumos
- Custo derivado correto: cacau 200 g/R$ 18,00 → **R$ 90,00/kg**; creme de avelã 140 g/R$ 14,00 → **R$ 100,00/kg**
- **FC aplicado**: maracujá R$ 12,00/kg × 2,61 → **R$ 31,32/kg de polpa**
- **Busca sem acento**: "maracuja" acha "Maracujá azedo"
- **Dedupe**: digitar "ACUCAR REFINADO" detecta "Açúcar refinado" e oferece abrir o existente
- **Campo de dinheiro caixa-eletrônico**: `5`→R$ 0,05, `525`→R$ 5,25, `5250`→R$ 52,50

**Bug pego rodando (que o build não pegaria):** o preview do sheet exibia custo **por grama** — maracujá aparecia como "R$ 0,03", que parece preciso e esconde os 3,132 centavos reais. Corrigido com `custoExibicao()`, que normaliza para kg/L/un. **Nunca exibir custo por grama.**

**Limitação consciente:** a tela é **100% local (Dexie)**. Não há sincronização com o Postgres ainda — o outbox é o próximo passo. Nada do que for cadastrado aqui chega ao servidor.

**⚠️ Dívida registrada:** os **preços do seed são placeholders inventados**, não pesquisados. Entram com `precoEstimado: true` e badge "est." na UI. Antes de qualquer lançamento, substituir por pesquisa de cesta real.

### 2026-08-15 — Fichas técnicas + frecency

**Feito:**
- `src/db/frecency.ts` — ranking modelo Slack (buckets discretos)
- `src/db/catalogo.ts` — adaptador Dexie → função pura de custo
- `src/rotas/fichas.tsx` (lista, com duplicar) e `src/rotas/ficha-editor.tsx` (montador)
- `src/componentes/NavInferior.tsx` — navegação na base
- Dexie migrado v1 → v2 (`fichas`, `config`) sem perder os 57 insumos

**Verificado rodando — receita de brigadeiro do discovery:**
```
Leite condensado 395 g      R$  7,00
Manteiga sem sal 25 g       R$  1,50
Chocolate em pó 50% 40 g    R$  1,80
Mão de obra 40 min a R$ 17,05/h  R$ 11,36
Total do lote               R$ 21,66
÷ 50 un                     R$  0,43
Preço R$ 0,74 · Margem 41,4% · CMV 58,6%
```
- **Frecency**: numa segunda ficha, os 3 insumos usados aparecem como chips ("Você usa sempre") — adicionar custa **zero caractere**
- Chips de unidade filtrados por dimensão (só kg/g em insumo de massa)
- Aviso automático de CMV acima de 35%
- Autosave com indicador "Salvo"

**Bug pego rodando (grave, e irônico):** o painel exibia `Margem 41,4%` e `2,5× = 60,0% de margem` lado a lado. `markupParaMargem()` só equivale à margem real quando a base é o custo **total**; com base `materiais` a mão de obra entra por fora. **O app estava reproduzindo a confusão markup/margem que ele existe para eliminar.** Corrigido — ver [APRENDIZADOS § E](APRENDIZADOS.md#e-padrões-de-implementação).

Também corrigidos separadores decimais pt-BR (`2.5×` → `2,5×`, `41.4%` → `41,4%`, `17.05 R$/h` → `R$ 17,05/h`).

### 2026-08-15 — Fundação do backend (Fastify)

**Feito:**
- `server/db.ts` — `pg.Pool` + Drizzle `node-postgres`
- `server/app.ts` — Fastify 5.12.0, CORS, logger com `redact` de authorization/cookie
- `server/main.ts` — bind em `0.0.0.0`, shutdown gracioso em SIGINT/SIGTERM
- Scripts `api:dev` (tsx watch) e `api:start`

**Verificado contra o Neon real:**
- `GET /health` → `{"ok":true,"banco":"conectado","latenciaMs":159}` e 146 ms na segunda
- CORS: header presente para `localhost:5173`, **ausente** para `evil.com`; preflight OPTIONS 204 com `allow-credentials`

**Decidido (revoga decisões anteriores):** driver `neon-http` → `node-postgres`; deploy passa a exigir host que rode processo; front e API em origens distintas. Ver [APRENDIZADOS § D](APRENDIZADOS.md#d-decisões-técnicas).

**Erro meu no caminho:** testei CORS pelo status HTTP e vi 200 para `evil.com` — quase reportei falha. 200 é correto; CORS é do navegador. O teste válido é inspecionar o header.

**Ainda NÃO existe:** autenticação, endpoints de dados, sincronização. O cliente continua 100% local.

### 2026-08-15 — Autenticação OTP com Resend

**Feito:**
- Tabelas `usuario`, `sessao`, `otp_codigo` (migration `0001`) — **15 tabelas** no total
- `tenant_membro.usuario_id`: `text` → `uuid` com FK real
- `server/auth/otp.ts` — primitivas puras (HMAC, timing-safe, geração cripto)
- `server/auth/rotas.ts` — solicitar / verificar / eu / sair
- `server/email.ts` — Resend em produção, console em dev (falha alto se faltar chave com `NODE_ENV=production`)
- `server/auth/otp.test.ts` — **11 testes** (total do projeto: **40**)

**Fluxo verificado ponta a ponta contra o Neon:**
| Cenário | Resultado |
|---|---|
| Solicitar código | `{ok:true}`, código no console dev |
| Código errado | 401 |
| Código certo | token + usuário, tenant criado no 1º login |
| Reusar o mesmo código | 401 (uso único) |
| `/auth/eu` com token | usuarioId + email + **tenantId** |
| Sem token / token inválido | 401 |
| Logout e reusar token | 401 |
| **5 erros e depois o código CERTO** | **401 — código queimado** |
| E-mail nunca visto | `{ok:true}` idêntico (sem enumeração) |

**Auditado no banco:** `codigo_hash` 64 hex sem dígitos em claro; `token_hash` 64 chars; zero sessões após logout. Dados de teste removidos — banco limpo (`usuario:0, tenant:0, sessao:0, otp:0`).

**Dois erros meus no caminho:**
1. `drizzle-kit migrate` **falhou silenciosamente** — gerou `ALTER COLUMN ... SET DATA TYPE uuid` sem `USING`, que o Postgres recusa, e saiu sem mensagem. Descoberto conferindo as tabelas. Corrigido à mão no SQL
2. Testei a API com `J='-H Content-Type:...'` e `$J` — **zsh não faz word-splitting**, o header virou um argumento só e tudo deu 400. A API estava certa

**Falta para o login funcionar de verdade:** chave do Resend + domínio verificado, e a tela de login no cliente.

### 2026-08-15 — Login e sincronização (ciclo fechado)

**Feito:**
- `server/sync/` — `POST /sync/push`, `GET /sync/pull`, validação Zod na fronteira
- `src/auth/sessao.ts`, `src/rotas/login.tsx`, `src/componentes/Guardiao.tsx`, `src/db/sync.ts`
- Migração Dexie **v3**: ids de seed `"seed-0"` → UUID, com reescrita das referências

**Verificado ponta a ponta:**
| Cenário | Resultado |
|---|---|
| Rota protegida sem sessão | redireciona para `/login` |
| Login por código de 6 dígitos | entra e vai para `/fichas` |
| `/sync/push` sem token | 401 |
| Push de insumo + ficha | servidor decompõe em `ficha_item`/`ficha_perda` |
| Pull do zero | recompõe a ficha idêntica |
| **Escrita antiga sobre uma nova** | **rejeitada (LWW)** |
| **Conta B lendo dados da conta A** | **0 registros — sem vazamento** |
| **Apagar todo o IndexedDB e recarregar** | **57 insumos + 2 fichas + config restaurados; preço idêntico (R$ 0,74 / custo R$ 0,43)** |

No Postgres após o sync do navegador: 57 insumos, 2 fichas, 3 itens com quantidades corretas, config de R$ 3.000/176h.

**Bug pego rodando:** o push falhou com 400 na primeira tentativa — ids `seed-N` não são UUID. Corrigido no gerador **e** com migração que remapeia as referências existentes. Ver [APRENDIZADOS § D](APRENDIZADOS.md#d-decisões-técnicas).

**Decidido (revoga o plano):** sincronização é **LWW por registro**, não fila de outbox. Justificativa nos aprendizados.

### 2026-08-15 — Preparação de deploy (Railway)

**Feito:**
- `railway.json` — build, start, healthcheck em `/health`, restart on failure
- `npm run build:server` — esbuild gera bundle único de **31 kb**
- `docs/DEPLOY.md` — variáveis, migrations, fallback de SPA, checklist

**Bug pego antes de virar incidente:** `dotenv` estava em `devDependencies` e o
servidor importa em runtime. Em produção, com devDeps podados, o boot quebraria.
Movido para `dependencies`.

**Verificado:** bundle de produção rodado com `node dist-server/main.js` —
`/health` conectou no Neon em 135 ms, auth respondeu 200, `/sync` seguiu
protegido com 401.

**Decidido:** Railway em vez de Render. Railway **não tem free tier real em
2026** (US$ 5/mês mínimo no Hobby; o plano Free dá só US$ 1/mês em créditos que
não acumulam). Render tem free de verdade mas hiberna — tolerável aqui por ser
offline-first. Bryan preferiu pagar para não ter hibernação. Troca não exige
mudança de código.

**Migrations NÃO rodam automaticamente no deploy**, de propósito — este projeto
já apanhou de migration que falha em silêncio.

### 2026-08-15 — Login por senha (destrava a v1)

**Por quê:** OTP exige domínio verificado no Resend; `onboarding@resend.dev` só
entrega para o dono da conta, então nenhuma usuária real conseguiria entrar.
Senha remove a dependência e mantém a propriedade que motivou o OTP — o fluxo
nunca sai do app, então não quebra em PWA standalone no iOS.

**Feito:**
- `server/auth/senha.ts` — scrypt com N=2^15, salt por usuária, parâmetros no hash
- `server/auth/senha-rotas.ts` — `/auth/registrar` e `/auth/entrar`
- Migration `0002` — coluna `senha_hash` (nullable: OTP e senha coexistem)
- Tela de login reescrita com alternância entre entrar e criar conta
- 8 testes novos (total: **48**)

**Verificado contra o banco e no navegador:**
| Cenário | Resultado |
|---|---|
| Registrar | 201 + token, tenant criado |
| Registrar de novo | 409 |
| Senha errada | 401 `e-mail ou senha inválidos` |
| E-mail inexistente | 401 **mensagem idêntica** — sem enumeração |
| Login correto | token válido para `/sync` e `/auth/eu` |
| Senha < 8 | 400 |
| Hash no banco | `scrypt$32768$8$1$…`, sem senha em claro |
| Navegador: criar conta → `/fichas` | sessão gravada, sync inicia |
| Navegador: sair → senha errada → senha certa | volta ao login, mensagem genérica, entra |

**Três erros meus no caminho:**
1. **`pkill -f "tsx server/main.ts"` matava só o processo pai.** O filho sobrevivia segurando a porta 3333, e todo servidor "novo" falhava em bindar em silêncio — eu estava testando contra um servidor antigo, sem as rotas novas. Agora mato **pela porta**, não pelo nome
2. **`promisify(scrypt)` perdia o parâmetro de opções** — o hash sairia com parâmetros padrão. Vitest não faz typecheck e os 8 testes passaram; só o `tsc` pegou
3. **Vite não lê `PORT`** — quando a 5173 estava ocupada ele pulou para a 5174 enquanto o orquestrador apontava para outra porta. Corrigido em `vite.config.ts`

**Também:** CORS em dev agora aceita `localhost` em qualquer porta (produção
continua só com a lista explícita) — porta fixa fazia o CORS falhar de um jeito
que parecia bug da aplicação.

### 2026-08-15 — UX anti-digitação: parser + colar receita

**Feito:**
- `src/dominio/parser-ingrediente.ts` — léxico PT-BR + resolução contra o catálogo (23 testes)
- Campo do picker virou **duplo**: `farinha` busca, `250g farinha` interpreta e oferece adicionar
- `src/componentes/ColarReceita.tsx` — colar bloco de texto → revisão linha a linha → criação em lote

**Verificado rodando, com receita real de WhatsApp:**
```
250g farinha de trigo                → Farinha de trigo · 250 g          [ok]
200 g de açúcar refinado             → Açúcar refinado · 200 g           [ok]
3 ovos                               → Ovo · 3 un                        [ok]
1/2 xícara de óleo de soja           → "xícara" depende da densidade      [confira]
1 lata de leite condensado           → 395 g · "1 lata = 395 g"          [ok]
2 colheres de sopa de chocolate      → "colher" depende da densidade      [confira]
50g de pistache                      → não está no catálogo               [novo]
```
Os 2 títulos ("Para a massa:", "Para a cobertura:") foram filtrados; só os 4
resolvidos entram marcados. Depois de adicionar, o custo apareceu correto
(farinha 250 g = R$ 1,50; açúcar 200 g = R$ 1,00).

**A decisão que mais importa aqui é o que o parser NÃO faz.** Medida caseira
não vira grama automaticamente: 1 xícara de farinha ≈ 120 g, de açúcar ≈ 200 g,
de leite condensado ≈ 300 g. Converter sem densidade daria número errado com
cara de certo — o pior tipo de erro num app de custo. Mesma regra para `ml` em
insumo de massa e para termo ambíguo (devolve candidatos em vez de escolher).

### 2026-08-15 — Onboarding de 1 pergunta (fecha a UX da v1)

**Feito:**
- `src/componentes/Comecar.tsx` — uma pergunta ("O que você mais faz?"), três
  perfis, e uma receita de exemplo montada com insumos reais do catálogo
- Aparece só quando **não há nada local NEM no servidor**

**Verificado rodando — conta nova cai direto numa ficha com custo pronto:**
```
Total do lote   R$ 17,30
÷ 50 un         R$  0,35
Preço R$ 0,87 · Margem 60,2% · CMV 39,8%
```

**Bug pego rodando:** o onboarding não aparecia. `jaSincronizou()` era lido em
tempo de render, mas numa conta nova o servidor não devolve nada, o Dexie não
muda, e nada dispara re-render — a tela ficava presa no estado anterior. Virou
**estado** no `Guardiao`, propagado por contexto do roteador.

**Cuidado deliberado:** o onboarding só aparece se o banco local está vazio **e**
já houve um sync bem-sucedido. Sem isso, quem entra num dispositivo novo veria
"o que você mais faz?" antes do pull chegar — e responder criaria dado duplicado
por cima de uma conta que já tem fichas.

**Escopo da v1 fechado.** Núcleo de custo e UX anti-digitação completos.

**Pendências abertas:**
- Renomear o repositório: `delivery-assistant` não tem relação com o produto
- Fechar as lacunas de [APRENDIZADOS.md § G](APRENDIZADOS.md#g-não-apurado--não-trate-como-fato), com prioridade para **MEI e rotulagem** antes de qualquer feature de etiqueta

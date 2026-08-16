import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/* ────────────────────────────── enums ────────────────────────────── */

/** Conta isenta e ESTADO, nao desconto de 100%. Ver APRENDIZADOS § A. */
export const billingStatus = pgEnum('billing_status', ['trial', 'active', 'past_due', 'exempt'])

export const dimensao = pgEnum('dimensao', ['massa', 'volume', 'contagem'])

/** Os 4 tipos tem percentuais distintos. Ver APRENDIZADOS § B. */
export const tipoPerda = pgEnum('tipo_perda', ['preparo', 'assamento', 'defeito', 'nao_vendido'])

/**
 * A base do markup e obrigatoria e explicita. O mercado confunde markup com
 * margem justamente por omitir isto. Ver APRENDIZADOS § B.
 */
export const markupBase = pgEnum('markup_base', ['materiais', 'custo_total'])

/* ───────────────────────────── tenancy ───────────────────────────── */

export const tenant = pgTable('tenant', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  billingStatus: billingStatus('billing_status').notNull().default('trial'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

export const tenantMembro = pgTable(
  'tenant_membro',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tenant_membro_unico').on(t.tenantId, t.usuarioId)],
)

/* ──────────────────────── autenticacao (OTP) ─────────────────────── */

export const usuario = pgTable(
  'usuario',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** sempre minusculo e sem espaco — a normalizacao acontece na aplicacao */
    email: text('email').notNull(),
    /**
     * scrypt$N$r$p$salt$hash. NULL para quem entrou por OTP e nunca definiu
     * senha — os dois metodos coexistem.
     */
    senhaHash: text('senha_hash'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    ultimoLoginEm: timestamp('ultimo_login_em', { withTimezone: true }),
  },
  (t) => [uniqueIndex('usuario_email_unico').on(t.email)],
)

/**
 * Codigo OTP de 6 digitos.
 *
 * Escolhido em vez de magic link porque e IMUNE ao problema de PWA standalone
 * no iOS: o fluxo nunca sai do app, entao nao ha como perder a sessao ao voltar
 * do Safari. E o publico ja conhece o padrao de banco.
 *
 * `codigoHash` guarda HMAC-SHA256(codigo, AUTH_SECRET) — nunca o codigo em
 * claro. 6 digitos e so 1 milhao de combinacoes: se o banco vazar e o hash for
 * simples, quebra-se offline em segundos. Com HMAC, sem o segredo do servidor
 * o hash nao serve para nada.
 */
export const otpCodigo = pgTable(
  'otp_codigo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    codigoHash: text('codigo_hash').notNull(),
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    /** limite de tentativas: sem isso, 1M de combinacoes cai por forca bruta */
    tentativas: integer('tentativas').notNull().default(0),
    consumidoEm: timestamp('consumido_em', { withTimezone: true }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('otp_email_idx').on(t.email, t.criadoEm)],
)

/**
 * Sessao por bearer token opaco.
 *
 * Nao usamos cookie porque front e API ficam em origens diferentes (SPA
 * estatica + processo Fastify), o que exigiria SameSite=None e dominio pai.
 * Bearer e mais simples e nao sofre com isso.
 *
 * Guardamos SHA-256 do token. Aqui sha256 basta (ao contrario do OTP): o token
 * tem 256 bits de entropia, entao nao existe forca bruta viavel.
 */
export const sessao = pgTable(
  'sessao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    ultimoUsoEm: timestamp('ultimo_uso_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('sessao_token_unico').on(t.tokenHash), index('sessao_usuario_idx').on(t.usuarioId)],
)

/* ───────────────────────────── unidades ──────────────────────────── */

/**
 * Lookup global (sem tenant). `fatorBase` converte para a unidade base da
 * dimensao: massa→g, volume→ml, contagem→un.
 *
 * Medida caseira (xicara, colher) NAO entra aqui: a conversao depende do
 * ingrediente (1 xic de farinha ≈ 120g, de acucar ≈ 200g). Isso e uma tabela
 * de densidade por insumo, fora do escopo da v1. Ver APRENDIZADOS § G.
 */
export const unidade = pgTable('unidade', {
  codigo: text('codigo').primaryKey(),
  dimensao: dimensao('dimensao').notNull(),
  fatorBase: numeric('fator_base', { precision: 18, scale: 8 }).notNull(),
})

/* ───────────────────────────── insumos ───────────────────────────── */

export const insumo = pgTable(
  'insumo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),

    nome: text('nome').notNull(),
    /** sem acento, minusculo — usado para deduplicar na criacao inline */
    nomeNormalizado: text('nome_normalizado').notNull(),
    categoria: text('categoria'),

    // --- como se COMPRA ---
    embalagemQuantidade: numeric('embalagem_quantidade', { precision: 14, scale: 4 }).notNull(),
    embalagemUnidade: text('embalagem_unidade')
      .notNull()
      .references(() => unidade.codigo),
    /** dinheiro digitado pela usuaria: SEMPRE inteiro em centavos, nunca float */
    precoEmbalagemCentavos: integer('preco_embalagem_centavos').notNull(),

    /** embalagemQuantidade × unidade.fatorBase, gravado pela aplicacao na escrita */
    quantidadeBase: numeric('quantidade_base', { precision: 18, scale: 8 }).notNull(),

    /**
     * Default 1.0 e proposital: FC = 1,00 para praticamente todo insumo de
     * confeitaria. So importa para frutas (maracuja 2,61) e ovo com gema/clara
     * separada. Campo opcional na UI. Ver APRENDIZADOS § B.
     */
    fatorCorrecao: numeric('fator_correcao', { precision: 8, scale: 4 })
      .notNull()
      .default('1.0000'),

    /** preco veio do catalogo semente e ainda nao foi confirmado pela usuaria */
    precoEstimado: boolean('preco_estimado').notNull().default(false),
    origemSeed: boolean('origem_seed').notNull().default(false),

    /**
     * DERIVADO — nunca digitado (checklist NN/g: compute o que der para computar).
     * Centavos por unidade base, ja corrigido pelo FC.
     */
    custoPorUnidadeBase: numeric('custo_por_unidade_base', { precision: 18, scale: 8 })
      .generatedAlwaysAs(
        sql`(preco_embalagem_centavos::numeric / NULLIF(quantidade_base, 0)) * fator_correcao`,
      ),

    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
    excluidoEm: timestamp('excluido_em', { withTimezone: true }),
  },
  (t) => [
    // duplicata de insumo destroi relatorio de custo — barra no banco, nao so na UI
    uniqueIndex('insumo_nome_unico')
      .on(t.tenantId, t.nomeNormalizado)
      .where(sql`excluido_em IS NULL`),
    index('insumo_tenant_idx').on(t.tenantId),
    check('insumo_quantidade_positiva', sql`embalagem_quantidade > 0 AND quantidade_base > 0`),
    check('insumo_preco_nao_negativo', sql`preco_embalagem_centavos >= 0`),
    check('insumo_fc_valido', sql`fator_correcao >= 1`),
  ],
)

/**
 * Preco de insumo muda toda semana. Historico habilita alerta de margem,
 * "cadastrado ha 2 meses" e torna o autosave seguro em campo de dinheiro.
 */
export const insumoPrecoHistorico = pgTable(
  'insumo_preco_historico',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    insumoId: uuid('insumo_id')
      .notNull()
      .references(() => insumo.id, { onDelete: 'cascade' }),
    precoEmbalagemCentavos: integer('preco_embalagem_centavos').notNull(),
    embalagemQuantidade: numeric('embalagem_quantidade', { precision: 14, scale: 4 }).notNull(),
    registradoEm: timestamp('registrado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('insumo_preco_hist_idx').on(t.insumoId, t.registradoEm)],
)

/* ─────────────────────────── fichas tecnicas ─────────────────────── */

export const fichaTecnica = pgTable(
  'ficha_tecnica',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),

    nome: text('nome').notNull(),
    categoria: text('categoria'),

    /** o que a receita promete */
    rendimentoTeorico: numeric('rendimento_teorico', { precision: 14, scale: 4 }).notNull(),
    /**
     * o que o ultimo lote deu — USE ESTE no custo unitario.
     * Uma lata de leite condensado rende 40 ou 55 brigadeiros dependendo da
     * gramatura real. Sem este campo o custo unitario mente.
     */
    rendimentoReal: numeric('rendimento_real', { precision: 14, scale: 4 }),
    unidadeRendimento: text('unidade_rendimento')
      .notNull()
      .references(() => unidade.codigo),

    tempoPreparoMin: integer('tempo_preparo_min'),
    /** massa branca, ganache, brigadeiro de corte — templates de 1a classe */
    ehBase: boolean('eh_base').notNull().default(false),

    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
    excluidoEm: timestamp('excluido_em', { withTimezone: true }),
  },
  (t) => [
    index('ficha_tenant_idx').on(t.tenantId),
    check('ficha_rendimento_positivo', sql`rendimento_teorico > 0`),
    check('ficha_rendimento_real_positivo', sql`rendimento_real IS NULL OR rendimento_real > 0`),
  ],
)

/**
 * Item da ficha: OU um insumo, OU outra ficha (sub-receita).
 * Bolo decorado = massa + recheio + cobertura, cada uma com custo proprio.
 * E isso que faz o recalculo em cascata propagar de verdade.
 */
export const fichaItem = pgTable(
  'ficha_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fichaId: uuid('ficha_id')
      .notNull()
      .references(() => fichaTecnica.id, { onDelete: 'cascade' }),

    insumoId: uuid('insumo_id').references(() => insumo.id, { onDelete: 'restrict' }),
    subFichaId: uuid('sub_ficha_id').references(() => fichaTecnica.id, { onDelete: 'restrict' }),

    quantidade: numeric('quantidade', { precision: 14, scale: 4 }).notNull(),
    unidade: text('unidade')
      .notNull()
      .references(() => unidade.codigo),
    ordem: integer('ordem').notNull().default(0),
  },
  (t) => [
    index('ficha_item_ficha_idx').on(t.fichaId),
    index('ficha_item_insumo_idx').on(t.insumoId),
    // exatamente um dos dois: insumo OU sub-ficha
    check('ficha_item_alvo_unico', sql`num_nonnulls(insumo_id, sub_ficha_id) = 1`),
    // auto-referencia direta. Ciclos indiretos sao barrados na escrita (app).
    check('ficha_item_sem_autoref', sql`sub_ficha_id IS NULL OR sub_ficha_id <> ficha_id`),
    check('ficha_item_quantidade_positiva', sql`quantidade > 0`),
  ],
)

export const fichaPerda = pgTable(
  'ficha_perda',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fichaId: uuid('ficha_id')
      .notNull()
      .references(() => fichaTecnica.id, { onDelete: 'cascade' }),
    tipo: tipoPerda('tipo').notNull(),
    /** ex.: assamento em bolos = 8 a 12 */
    percentual: numeric('percentual', { precision: 6, scale: 3 }).notNull(),
  },
  (t) => [
    uniqueIndex('ficha_perda_unica').on(t.fichaId, t.tipo),
    check('ficha_perda_faixa', sql`percentual >= 0 AND percentual < 100`),
  ],
)

/* ────────────────────────── precificacao ─────────────────────────── */

/**
 * Mao de obra e 40-50% do preco em bolo decorado, e e "o mais esquecido de
 * todos". `horasMes` e configuravel porque as fontes divergem entre 176h e
 * 220h — 25% de diferenca no valor/hora. Ver APRENDIZADOS § B.
 */
export const configProducao = pgTable(
  'config_producao',
  {
    tenantId: uuid('tenant_id')
      .primaryKey()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    salarioDesejadoCentavos: integer('salario_desejado_centavos').notNull().default(0),
    horasMes: integer('horas_mes').notNull().default(176),
    custoFixoMensalCentavos: integer('custo_fixo_mensal_centavos').notNull().default(0),
    unidadesMes: integer('unidades_mes').notNull().default(0),
    /** fator de perda generico do nicho quando nao se detalha: 3 a 5% */
    perdaPadraoPercentual: numeric('perda_padrao_percentual', { precision: 6, scale: 3 })
      .notNull()
      .default('4.000'),
  },
  (t) => [
    check('config_horas_positivas', sql`horas_mes > 0`),
    check('config_unidades_nao_negativas', sql`unidades_mes >= 0`),
  ],
)

export const precificacao = pgTable(
  'precificacao',
  {
    fichaId: uuid('ficha_id')
      .primaryKey()
      .references(() => fichaTecnica.id, { onDelete: 'cascade' }),
    /** sobre o que o multiplicador incide — nunca implicito */
    base: markupBase('base').notNull().default('materiais'),
    /** convencao mais defensavel do nicho: ~2,5x sobre materiais + MO por fora */
    multiplicador: numeric('multiplicador', { precision: 8, scale: 4 }).notNull().default('2.5000'),
  },
  (t) => [check('precificacao_multiplicador_valido', sql`multiplicador > 0`)],
)

/**
 * Gross-up de canal e por DIVISAO: preco / (1 - taxa). Somar a taxa nao
 * recompoe a margem. iFood 2026: Basico ~15,2%, Entrega ~26,5%.
 */
export const canal = pgTable(
  'canal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    nome: text('nome').notNull(),
    taxaPercentual: numeric('taxa_percentual', { precision: 6, scale: 3 }).notNull().default('0'),
  },
  (t) => [
    index('canal_tenant_idx').on(t.tenantId),
    // >= 100% tornaria a divisao (1 - taxa) zero ou negativa
    check('canal_taxa_faixa', sql`taxa_percentual >= 0 AND taxa_percentual < 100`),
  ],
)

/* ─────────────────────────── frecency (UX) ───────────────────────── */

/**
 * Modelo do Slack (buckets discretos), nao o do Firefox (decaimento
 * exponencial): calculavel no cliente, sem job de recalculo. Sao 50-300
 * insumos, nao milhares. Ver APRENDIZADOS § E.
 *
 * `contexto` particiona o ranking — o top de "bolo" difere do de "brigadeiro".
 */
export const usoInsumo = pgTable(
  'uso_insumo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    insumoId: uuid('insumo_id')
      .notNull()
      .references(() => insumo.id, { onDelete: 'cascade' }),
    contexto: text('contexto').notNull().default('global'),
    /** componente de frequencia: ilimitado */
    contagem: integer('contagem').notNull().default(0),
    /** componente de recencia: array de ISO timestamps, no maximo 10 */
    ultimosUsos: jsonb('ultimos_usos').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  },
  (t) => [
    uniqueIndex('uso_insumo_unico').on(t.tenantId, t.insumoId, t.contexto),
    index('uso_insumo_ranking_idx').on(t.tenantId, t.contexto, t.contagem),
  ],
)

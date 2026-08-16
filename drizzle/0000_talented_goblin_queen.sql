CREATE TYPE "public"."billing_status" AS ENUM('trial', 'active', 'past_due', 'exempt');--> statement-breakpoint
CREATE TYPE "public"."dimensao" AS ENUM('massa', 'volume', 'contagem');--> statement-breakpoint
CREATE TYPE "public"."markup_base" AS ENUM('materiais', 'custo_total');--> statement-breakpoint
CREATE TYPE "public"."tipo_perda" AS ENUM('preparo', 'assamento', 'defeito', 'nao_vendido');--> statement-breakpoint
CREATE TABLE "canal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"taxa_percentual" numeric(6, 3) DEFAULT '0' NOT NULL,
	CONSTRAINT "canal_taxa_faixa" CHECK (taxa_percentual >= 0 AND taxa_percentual < 100)
);
--> statement-breakpoint
CREATE TABLE "config_producao" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"salario_desejado_centavos" integer DEFAULT 0 NOT NULL,
	"horas_mes" integer DEFAULT 176 NOT NULL,
	"custo_fixo_mensal_centavos" integer DEFAULT 0 NOT NULL,
	"unidades_mes" integer DEFAULT 0 NOT NULL,
	"perda_padrao_percentual" numeric(6, 3) DEFAULT '4.000' NOT NULL,
	CONSTRAINT "config_horas_positivas" CHECK (horas_mes > 0),
	CONSTRAINT "config_unidades_nao_negativas" CHECK (unidades_mes >= 0)
);
--> statement-breakpoint
CREATE TABLE "ficha_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ficha_id" uuid NOT NULL,
	"insumo_id" uuid,
	"sub_ficha_id" uuid,
	"quantidade" numeric(14, 4) NOT NULL,
	"unidade" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ficha_item_alvo_unico" CHECK (num_nonnulls(insumo_id, sub_ficha_id) = 1),
	CONSTRAINT "ficha_item_sem_autoref" CHECK (sub_ficha_id IS NULL OR sub_ficha_id <> ficha_id),
	CONSTRAINT "ficha_item_quantidade_positiva" CHECK (quantidade > 0)
);
--> statement-breakpoint
CREATE TABLE "ficha_perda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ficha_id" uuid NOT NULL,
	"tipo" "tipo_perda" NOT NULL,
	"percentual" numeric(6, 3) NOT NULL,
	CONSTRAINT "ficha_perda_faixa" CHECK (percentual >= 0 AND percentual < 100)
);
--> statement-breakpoint
CREATE TABLE "ficha_tecnica" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"categoria" text,
	"rendimento_teorico" numeric(14, 4) NOT NULL,
	"rendimento_real" numeric(14, 4),
	"unidade_rendimento" text NOT NULL,
	"tempo_preparo_min" integer,
	"eh_base" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "ficha_rendimento_positivo" CHECK (rendimento_teorico > 0),
	CONSTRAINT "ficha_rendimento_real_positivo" CHECK (rendimento_real IS NULL OR rendimento_real > 0)
);
--> statement-breakpoint
CREATE TABLE "insumo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"categoria" text,
	"embalagem_quantidade" numeric(14, 4) NOT NULL,
	"embalagem_unidade" text NOT NULL,
	"preco_embalagem_centavos" integer NOT NULL,
	"quantidade_base" numeric(18, 8) NOT NULL,
	"fator_correcao" numeric(8, 4) DEFAULT '1.0000' NOT NULL,
	"preco_estimado" boolean DEFAULT false NOT NULL,
	"origem_seed" boolean DEFAULT false NOT NULL,
	"custo_por_unidade_base" numeric(18, 8) GENERATED ALWAYS AS ((preco_embalagem_centavos::numeric / NULLIF(quantidade_base, 0)) * fator_correcao) STORED,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "insumo_quantidade_positiva" CHECK (embalagem_quantidade > 0 AND quantidade_base > 0),
	CONSTRAINT "insumo_preco_nao_negativo" CHECK (preco_embalagem_centavos >= 0),
	CONSTRAINT "insumo_fc_valido" CHECK (fator_correcao >= 1)
);
--> statement-breakpoint
CREATE TABLE "insumo_preco_historico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insumo_id" uuid NOT NULL,
	"preco_embalagem_centavos" integer NOT NULL,
	"embalagem_quantidade" numeric(14, 4) NOT NULL,
	"registrado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "precificacao" (
	"ficha_id" uuid PRIMARY KEY NOT NULL,
	"base" "markup_base" DEFAULT 'materiais' NOT NULL,
	"multiplicador" numeric(8, 4) DEFAULT '2.5000' NOT NULL,
	CONSTRAINT "precificacao_multiplicador_valido" CHECK (multiplicador > 0)
);
--> statement-breakpoint
CREATE TABLE "tenant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"billing_status" "billing_status" DEFAULT 'trial' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_membro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"usuario_id" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unidade" (
	"codigo" text PRIMARY KEY NOT NULL,
	"dimensao" "dimensao" NOT NULL,
	"fator_base" numeric(18, 8) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uso_insumo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"insumo_id" uuid NOT NULL,
	"contexto" text DEFAULT 'global' NOT NULL,
	"contagem" integer DEFAULT 0 NOT NULL,
	"ultimos_usos" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canal" ADD CONSTRAINT "canal_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_producao" ADD CONSTRAINT "config_producao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_item" ADD CONSTRAINT "ficha_item_ficha_id_ficha_tecnica_id_fk" FOREIGN KEY ("ficha_id") REFERENCES "public"."ficha_tecnica"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_item" ADD CONSTRAINT "ficha_item_insumo_id_insumo_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumo"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_item" ADD CONSTRAINT "ficha_item_sub_ficha_id_ficha_tecnica_id_fk" FOREIGN KEY ("sub_ficha_id") REFERENCES "public"."ficha_tecnica"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_item" ADD CONSTRAINT "ficha_item_unidade_unidade_codigo_fk" FOREIGN KEY ("unidade") REFERENCES "public"."unidade"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_perda" ADD CONSTRAINT "ficha_perda_ficha_id_ficha_tecnica_id_fk" FOREIGN KEY ("ficha_id") REFERENCES "public"."ficha_tecnica"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_tecnica" ADD CONSTRAINT "ficha_tecnica_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_tecnica" ADD CONSTRAINT "ficha_tecnica_unidade_rendimento_unidade_codigo_fk" FOREIGN KEY ("unidade_rendimento") REFERENCES "public"."unidade"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insumo" ADD CONSTRAINT "insumo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insumo" ADD CONSTRAINT "insumo_embalagem_unidade_unidade_codigo_fk" FOREIGN KEY ("embalagem_unidade") REFERENCES "public"."unidade"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insumo_preco_historico" ADD CONSTRAINT "insumo_preco_historico_insumo_id_insumo_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precificacao" ADD CONSTRAINT "precificacao_ficha_id_ficha_tecnica_id_fk" FOREIGN KEY ("ficha_id") REFERENCES "public"."ficha_tecnica"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_membro" ADD CONSTRAINT "tenant_membro_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uso_insumo" ADD CONSTRAINT "uso_insumo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uso_insumo" ADD CONSTRAINT "uso_insumo_insumo_id_insumo_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canal_tenant_idx" ON "canal" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "ficha_item_ficha_idx" ON "ficha_item" USING btree ("ficha_id");--> statement-breakpoint
CREATE INDEX "ficha_item_insumo_idx" ON "ficha_item" USING btree ("insumo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ficha_perda_unica" ON "ficha_perda" USING btree ("ficha_id","tipo");--> statement-breakpoint
CREATE INDEX "ficha_tenant_idx" ON "ficha_tecnica" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "insumo_nome_unico" ON "insumo" USING btree ("tenant_id","nome_normalizado") WHERE excluido_em IS NULL;--> statement-breakpoint
CREATE INDEX "insumo_tenant_idx" ON "insumo" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "insumo_preco_hist_idx" ON "insumo_preco_historico" USING btree ("insumo_id","registrado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_membro_unico" ON "tenant_membro" USING btree ("tenant_id","usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uso_insumo_unico" ON "uso_insumo" USING btree ("tenant_id","insumo_id","contexto");--> statement-breakpoint
CREATE INDEX "uso_insumo_ranking_idx" ON "uso_insumo" USING btree ("tenant_id","contexto","contagem");
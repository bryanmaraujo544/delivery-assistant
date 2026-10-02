CREATE TYPE "public"."tipo_movimento_caixa" AS ENUM('sangria', 'suprimento');--> statement-breakpoint
CREATE TABLE "caixa_movimento" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sessao_id" uuid NOT NULL,
	"tipo" "tipo_movimento_caixa" NOT NULL,
	"valor_centavos" integer NOT NULL,
	"motivo" text NOT NULL,
	"criado_em" timestamp with time zone NOT NULL,
	"sincronizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "caixa_movimento_valor_positivo" CHECK (valor_centavos > 0)
);
--> statement-breakpoint
CREATE TABLE "caixa_sessao" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"aberta_em" timestamp with time zone NOT NULL,
	"fundo_troco_centavos" integer NOT NULL,
	"fechada_em" timestamp with time zone,
	"contado_centavos" integer,
	"observacao" text,
	"sincronizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "caixa_sessao_fundo_nao_negativo" CHECK (fundo_troco_centavos >= 0),
	CONSTRAINT "caixa_sessao_contado_nao_negativo" CHECK (contado_centavos IS NULL OR contado_centavos >= 0)
);
--> statement-breakpoint
CREATE TABLE "produto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"categoria" text,
	"preco_centavos" integer NOT NULL,
	"ficha_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "produto_preco_nao_negativo" CHECK (preco_centavos >= 0)
);
--> statement-breakpoint
CREATE TABLE "venda" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sessao_id" uuid NOT NULL,
	"itens" jsonb NOT NULL,
	"desconto_centavos" integer DEFAULT 0 NOT NULL,
	"total_centavos" integer NOT NULL,
	"pagamentos" jsonb NOT NULL,
	"troco_centavos" integer DEFAULT 0 NOT NULL,
	"criada_em" timestamp with time zone NOT NULL,
	"cancelada_em" timestamp with time zone,
	"motivo_cancelamento" text,
	"sincronizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venda_valores_nao_negativos" CHECK (total_centavos >= 0 AND desconto_centavos >= 0 AND troco_centavos >= 0)
);
--> statement-breakpoint
ALTER TABLE "caixa_movimento" ADD CONSTRAINT "caixa_movimento_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caixa_movimento" ADD CONSTRAINT "caixa_movimento_sessao_id_caixa_sessao_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."caixa_sessao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caixa_sessao" ADD CONSTRAINT "caixa_sessao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto" ADD CONSTRAINT "produto_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venda" ADD CONSTRAINT "venda_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venda" ADD CONSTRAINT "venda_sessao_id_caixa_sessao_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."caixa_sessao"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "caixa_movimento_sync_idx" ON "caixa_movimento" USING btree ("tenant_id","sincronizado_em");--> statement-breakpoint
CREATE INDEX "caixa_sessao_sync_idx" ON "caixa_sessao" USING btree ("tenant_id","sincronizado_em");--> statement-breakpoint
CREATE INDEX "produto_tenant_idx" ON "produto" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "venda_sync_idx" ON "venda" USING btree ("tenant_id","sincronizado_em");--> statement-breakpoint
CREATE INDEX "venda_tenant_data_idx" ON "venda" USING btree ("tenant_id","criada_em");
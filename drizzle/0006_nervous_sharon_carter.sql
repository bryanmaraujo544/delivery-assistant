CREATE TABLE "estoque_contagem" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"quantidade" integer,
	"criado_em" timestamp with time zone NOT NULL,
	"sincronizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estoque_contagem_nao_negativa" CHECK (quantidade IS NULL OR quantidade >= 0)
);
--> statement-breakpoint
ALTER TABLE "estoque_contagem" ADD CONSTRAINT "estoque_contagem_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "estoque_contagem_sync_idx" ON "estoque_contagem" USING btree ("tenant_id","sincronizado_em");
CREATE TABLE "despesa" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"categoria" text NOT NULL,
	"valor_centavos" integer NOT NULL,
	"mes" text NOT NULL,
	"repete" boolean DEFAULT false NOT NULL,
	"serie_id" uuid NOT NULL,
	"parcela" integer,
	"parcelas" integer,
	"pago_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "despesa_valor_nao_negativo" CHECK (valor_centavos >= 0),
	CONSTRAINT "despesa_mes_formato" CHECK (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "despesa_parcela_coerente" CHECK ((parcela IS NULL AND parcelas IS NULL) OR (parcela >= 1 AND parcela <= parcelas))
);
--> statement-breakpoint
ALTER TABLE "despesa" ADD CONSTRAINT "despesa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "despesa_tenant_mes_idx" ON "despesa" USING btree ("tenant_id","mes");
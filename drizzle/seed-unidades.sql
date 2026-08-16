-- Lookup global de unidades. Rodar uma vez, depois das migrations.
--
-- `fator_base` converte para a unidade base da dimensao:
--   massa    -> g
--   volume   -> ml
--   contagem -> un
--
-- Medida caseira (xicara, colher) NAO entra aqui de proposito: a conversao
-- depende do ingrediente (1 xic de farinha ~120g, de acucar ~200g, de leite
-- condensado ~300g). Isso exige tabela de densidade por insumo — fora da v1.
-- Ver docs/APRENDIZADOS.md § G.

INSERT INTO unidade (codigo, dimensao, fator_base) VALUES
  ('g',   'massa',    1),
  ('kg',  'massa',    1000),
  ('ml',  'volume',   1),
  ('l',   'volume',   1000),
  ('un',  'contagem', 1),
  -- unidades de rendimento: quantas pecas/fatias a ficha produz
  ('porcao', 'contagem', 1),
  ('fatia',  'contagem', 1),
  -- "cento" e unidade de venda real do nicho: docinho se vende por 100
  ('cento',  'contagem', 100)
ON CONFLICT (codigo) DO NOTHING;

import type { InsumoLocal } from './local'
import { normalizar, unidadePorCodigo } from './local'

/**
 * Catalogo semente — mata o cold start.
 *
 * A tela vazia pedindo 40 insumos e o maior ponto de abandono do nicho
 * ("Be prepared to spend time manually entering all of your ingredients").
 * Com o seed, a usuaria precifica a primeira receita ANTES de cadastrar nada.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ ATENCAO — OS PRECOS ABAIXO SAO PLACEHOLDERS, NAO PESQUISADOS.        │
 * │                                                                      │
 * │ Os TAMANHOS DE EMBALAGEM sao convencao real do mercado brasileiro    │
 * │ (leite condensado 395g, creme de leite 200g, ovo em cartela de 30).  │
 * │ Os PRECOS sao chute plausivel para a UI ter o que mostrar.           │
 * │                                                                      │
 * │ Todos entram com `precoEstimado: true` e a UI OBRIGATORIAMENTE       │
 * │ sinaliza isso. Antes de qualquer lancamento real, substituir por     │
 * │ pesquisa de cesta (ex.: media de 3 atacados por regiao).             │
 * │ Ver docs/APRENDIZADOS.md § G.                                        │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Fator de correcao: 1.0 para tudo, EXCETO frutas — onde ele muda o custo de
 * verdade (maracuja 2,61 significa que metade do que se paga vai pro lixo).
 */

interface SementeInsumo {
  nome: string
  categoria: string
  qtd: number
  unidade: string
  /** placeholder, em centavos */
  precoCentavos: number
  fc?: number
}

const SEMENTES: SementeInsumo[] = [
  // ── secos ──
  { nome: 'Farinha de trigo', categoria: 'Secos', qtd: 1, unidade: 'kg', precoCentavos: 600 },
  { nome: 'Açúcar refinado', categoria: 'Secos', qtd: 1, unidade: 'kg', precoCentavos: 500 },
  { nome: 'Açúcar cristal', categoria: 'Secos', qtd: 1, unidade: 'kg', precoCentavos: 450 },
  { nome: 'Açúcar de confeiteiro', categoria: 'Secos', qtd: 500, unidade: 'g', precoCentavos: 700 },
  { nome: 'Açúcar mascavo', categoria: 'Secos', qtd: 500, unidade: 'g', precoCentavos: 900 },
  { nome: 'Amido de milho', categoria: 'Secos', qtd: 500, unidade: 'g', precoCentavos: 800 },
  { nome: 'Aveia em flocos', categoria: 'Secos', qtd: 200, unidade: 'g', precoCentavos: 600 },
  { nome: 'Sal refinado', categoria: 'Secos', qtd: 1, unidade: 'kg', precoCentavos: 300 },

  // ── fermentos e aditivos ──
  { nome: 'Fermento químico em pó', categoria: 'Fermentos', qtd: 100, unidade: 'g', precoCentavos: 400 },
  { nome: 'Fermento biológico seco', categoria: 'Fermentos', qtd: 10, unidade: 'g', precoCentavos: 200 },
  { nome: 'Bicarbonato de sódio', categoria: 'Fermentos', qtd: 100, unidade: 'g', precoCentavos: 350 },
  { nome: 'Gelatina incolor sem sabor', categoria: 'Fermentos', qtd: 12, unidade: 'g', precoCentavos: 350 },

  // ── laticinios ──
  { nome: 'Leite condensado', categoria: 'Laticínios', qtd: 395, unidade: 'g', precoCentavos: 700 },
  { nome: 'Creme de leite', categoria: 'Laticínios', qtd: 200, unidade: 'g', precoCentavos: 400 },
  { nome: 'Leite integral', categoria: 'Laticínios', qtd: 1, unidade: 'l', precoCentavos: 550 },
  { nome: 'Leite em pó integral', categoria: 'Laticínios', qtd: 400, unidade: 'g', precoCentavos: 1800 },
  { nome: 'Manteiga sem sal', categoria: 'Laticínios', qtd: 200, unidade: 'g', precoCentavos: 1200 },
  { nome: 'Manteiga com sal', categoria: 'Laticínios', qtd: 200, unidade: 'g', precoCentavos: 1150 },
  { nome: 'Margarina', categoria: 'Laticínios', qtd: 500, unidade: 'g', precoCentavos: 800 },
  { nome: 'Cream cheese', categoria: 'Laticínios', qtd: 150, unidade: 'g', precoCentavos: 900 },
  { nome: 'Requeijão cremoso', categoria: 'Laticínios', qtd: 200, unidade: 'g', precoCentavos: 700 },
  { nome: 'Chantilly líquido', categoria: 'Laticínios', qtd: 1, unidade: 'l', precoCentavos: 2200 },
  { nome: 'Doce de leite', categoria: 'Laticínios', qtd: 400, unidade: 'g', precoCentavos: 1200 },

  // ── chocolate ──
  { nome: 'Chocolate em pó 50%', categoria: 'Chocolate', qtd: 200, unidade: 'g', precoCentavos: 900 },
  { nome: 'Cacau em pó 100%', categoria: 'Chocolate', qtd: 200, unidade: 'g', precoCentavos: 1800 },
  { nome: 'Chocolate meio amargo', categoria: 'Chocolate', qtd: 1, unidade: 'kg', precoCentavos: 4500 },
  { nome: 'Chocolate ao leite', categoria: 'Chocolate', qtd: 1, unidade: 'kg', precoCentavos: 4300 },
  { nome: 'Chocolate branco', categoria: 'Chocolate', qtd: 1, unidade: 'kg', precoCentavos: 4800 },
  { nome: 'Granulado macio', categoria: 'Chocolate', qtd: 500, unidade: 'g', precoCentavos: 1500 },
  { nome: 'Creme de avelã', categoria: 'Chocolate', qtd: 140, unidade: 'g', precoCentavos: 1400 },

  // ── ovos e oleos ──
  // cartela de 30: resolve o caso "compro 30, uso 3"
  { nome: 'Ovo', categoria: 'Ovos', qtd: 30, unidade: 'un', precoCentavos: 1800 },
  { nome: 'Óleo de soja', categoria: 'Óleos', qtd: 900, unidade: 'ml', precoCentavos: 700 },

  // ── frutas (unicos com fator de correcao != 1) ──
  { nome: 'Maracujá azedo', categoria: 'Frutas', qtd: 1, unidade: 'kg', precoCentavos: 1200, fc: 2.61 },
  { nome: 'Abacaxi', categoria: 'Frutas', qtd: 1, unidade: 'kg', precoCentavos: 800, fc: 1.83 },
  { nome: 'Banana nanica', categoria: 'Frutas', qtd: 1, unidade: 'kg', precoCentavos: 700, fc: 1.66 },
  { nome: 'Laranja pera', categoria: 'Frutas', qtd: 1, unidade: 'kg', precoCentavos: 600, fc: 1.5 },
  { nome: 'Limão taiti', categoria: 'Frutas', qtd: 1, unidade: 'kg', precoCentavos: 800, fc: 1.3 },
  { nome: 'Morango', categoria: 'Frutas', qtd: 300, unidade: 'g', precoCentavos: 1200, fc: 1.12 },
  { nome: 'Coco maduro', categoria: 'Frutas', qtd: 1, unidade: 'kg', precoCentavos: 900, fc: 2.04 },

  // ── complementos ──
  { nome: 'Coco ralado', categoria: 'Complementos', qtd: 100, unidade: 'g', precoCentavos: 500 },
  { nome: 'Castanha de caju', categoria: 'Complementos', qtd: 100, unidade: 'g', precoCentavos: 1800 },
  { nome: 'Nozes', categoria: 'Complementos', qtd: 100, unidade: 'g', precoCentavos: 2500 },
  { nome: 'Amendoim torrado', categoria: 'Complementos', qtd: 500, unidade: 'g', precoCentavos: 1200 },
  { nome: 'Mel', categoria: 'Complementos', qtd: 500, unidade: 'g', precoCentavos: 2500 },
  { nome: 'Canela em pó', categoria: 'Complementos', qtd: 30, unidade: 'g', precoCentavos: 500 },
  { nome: 'Café solúvel', categoria: 'Complementos', qtd: 50, unidade: 'g', precoCentavos: 900 },
  { nome: 'Leite de coco', categoria: 'Complementos', qtd: 200, unidade: 'ml', precoCentavos: 500 },

  // ── confeitaria ──
  { nome: 'Essência de baunilha', categoria: 'Confeitaria', qtd: 30, unidade: 'ml', precoCentavos: 700 },
  { nome: 'Corante em gel', categoria: 'Confeitaria', qtd: 10, unidade: 'g', precoCentavos: 1000 },
  { nome: 'Pasta americana', categoria: 'Confeitaria', qtd: 1, unidade: 'kg', precoCentavos: 3500 },
  { nome: 'Glucose de milho', categoria: 'Confeitaria', qtd: 500, unidade: 'g', precoCentavos: 1500 },

  // ── embalagem: custo real e frequentemente esquecido ──
  { nome: 'Pote 250 ml com tampa', categoria: 'Embalagem', qtd: 20, unidade: 'un', precoCentavos: 1600 },
  { nome: 'Forminha de papel', categoria: 'Embalagem', qtd: 100, unidade: 'un', precoCentavos: 800 },
  { nome: 'Caixa para bolo', categoria: 'Embalagem', qtd: 10, unidade: 'un', precoCentavos: 2500 },
  { nome: 'Colher descartável', categoria: 'Embalagem', qtd: 50, unidade: 'un', precoCentavos: 600 },
  { nome: 'Fita de cetim', categoria: 'Embalagem', qtd: 10, unidade: 'un', precoCentavos: 1000 },
  { nome: 'Sacola kraft', categoria: 'Embalagem', qtd: 50, unidade: 'un', precoCentavos: 3000 },
]

export const CATEGORIAS_SEED = [...new Set(SEMENTES.map((s) => s.categoria))]

export function construirSeed(agora = Date.now()): InsumoLocal[] {
  return SEMENTES.map((s) => {
    const u = unidadePorCodigo(s.unidade)
    return {
      // UUID, nao "seed-0": a coluna no Postgres e uuid, entao id sintetico
      // quebraria na primeira sincronizacao. Cada usuaria tem o proprio
      // catalogo, entao nao ha necessidade de id estavel entre dispositivos.
      id: crypto.randomUUID(),
      nome: s.nome,
      nomeNormalizado: normalizar(s.nome),
      categoria: s.categoria,
      embalagemQuantidade: s.qtd,
      embalagemUnidade: s.unidade,
      precoEmbalagemCentavos: s.precoCentavos,
      quantidadeBase: s.qtd * u.fatorBase,
      dimensao: u.dimensao,
      fatorCorrecao: s.fc ?? 1,
      precoEstimado: true,
      origemSeed: true,
      atualizadoEm: agora,
      excluidoEm: null,
    }
  })
}

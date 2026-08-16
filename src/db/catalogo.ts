import type { Catalogo, ConfigProducao, Ficha, Unidade } from '../dominio/custo'
import {
  UNIDADES,
  custoPorUnidadeBase,
  type ConfigLocal,
  type FichaLocal,
  type InsumoLocal,
} from './local'

/**
 * Adaptador: store local (Dexie) -> entrada da funcao pura de custo.
 *
 * A funcao de custo nao conhece Dexie nem Postgres. Ela recebe mapas em
 * memoria, o que a mantem testavel sem I/O e reusavel nos dois lados.
 */
export function montarCatalogo(insumos: InsumoLocal[], fichas: FichaLocal[]): Catalogo {
  const unidades = new Map<string, Unidade>(
    UNIDADES.map((u) => [u.codigo, { codigo: u.codigo, dimensao: u.dimensao, fatorBase: u.fatorBase }]),
  )
  // rendimento pode ser contado em porcao/fatia/cento, que nao aparecem nos
  // chips de compra mas precisam existir para o calculo
  for (const [codigo, fator] of [
    ['porcao', 1],
    ['fatia', 1],
    ['cento', 100],
  ] as const) {
    unidades.set(codigo, { codigo, dimensao: 'contagem', fatorBase: fator })
  }

  return {
    unidades,
    insumos: new Map(
      insumos.map((i) => [
        i.id,
        {
          id: i.id,
          nome: i.nome,
          custoPorUnidadeBase: custoPorUnidadeBase(i),
          dimensao: i.dimensao,
        },
      ]),
    ),
    fichas: new Map(fichas.map((f) => [f.id, paraFichaDominio(f)])),
  }
}

function paraFichaDominio(f: FichaLocal): Ficha {
  return {
    id: f.id,
    nome: f.nome,
    rendimentoTeorico: f.rendimentoTeorico,
    rendimentoReal: f.rendimentoReal,
    unidadeRendimento: f.unidadeRendimento,
    tempoPreparoMin: f.tempoPreparoMin,
    itens: f.itens,
    perdas: f.perdas,
  }
}

export function paraConfigDominio(c: ConfigLocal | undefined): ConfigProducao {
  return {
    salarioDesejadoCentavos: c?.salarioDesejadoCentavos ?? 0,
    horasMes: c?.horasMes ?? 176,
    custoFixoMensalCentavos: c?.custoFixoMensalCentavos ?? 0,
    unidadesMes: c?.unidadesMes ?? 0,
  }
}

import { calcularCustoFicha, type Catalogo, type ConfigProducao } from '../dominio/custo'
import { arredondarCentavos } from '../dominio/dinheiro'
import { validarVenda, type MovimentoCaixa, type Venda } from '../dominio/venda'
import { db, type ProdutoLocal, type SessaoCaixaLocal } from './local'
import { pedirSync } from './sync'

/**
 * Escritas de caixa e venda.
 *
 * Tudo aqui grava primeiro no aparelho (a venda fecha mesmo sem rede) com
 * `pendente: 1`, e so entao pede a sincronizacao. Nenhuma tela escreve nessas
 * tabelas direto: a regra "fato nasce pendente" mora num lugar so.
 */

/** A sessao aberta mais recente, ou undefined se o caixa esta fechado. */
export async function sessaoAberta(): Promise<SessaoCaixaLocal | undefined> {
  const abertas = await db.caixaSessoes.filter((s) => !s.fechadaEm).toArray()
  return abertas.sort((a, b) => b.abertaEm - a.abertaEm)[0]
}

export async function abrirCaixa(fundoTrocoCentavos: number) {
  // abrir duas vezes (toque duplo, dois aparelhos) nao pode criar dois caixas
  if (await sessaoAberta()) return
  await db.caixaSessoes.put({
    id: crypto.randomUUID(),
    abertaEm: Date.now(),
    fundoTrocoCentavos,
    fechadaEm: null,
    contadoCentavos: null,
    observacao: null,
    pendente: 1,
  })
  pedirSync()
}

export async function fecharCaixa(sessaoId: string, contadoCentavos: number, observacao: string) {
  await db.caixaSessoes
    .where('id')
    .equals(sessaoId)
    .and((s) => !s.fechadaEm)
    .modify({
      fechadaEm: Date.now(),
      contadoCentavos,
      observacao: observacao.trim() || null,
      pendente: 1,
    })
  pedirSync()
}

export async function registrarMovimento(
  sessaoId: string,
  tipo: MovimentoCaixa['tipo'],
  valorCentavos: number,
  motivo: string,
) {
  await db.caixaMovimentos.put({
    id: crypto.randomUUID(),
    sessaoId,
    tipo,
    valorCentavos,
    motivo: motivo.trim(),
    criadoEm: Date.now(),
    pendente: 1,
  })
  pedirSync()
}

export async function registrarVenda(venda: Venda) {
  validarVenda(venda)
  await db.vendas.put({ ...venda, pendente: 1 })
  pedirSync()
}

export async function cancelarVenda(vendaId: string, motivo: string) {
  await db.vendas
    .where('id')
    .equals(vendaId)
    .and((v) => !v.canceladaEm)
    .modify({ canceladaEm: Date.now(), motivoCancelamento: motivo.trim(), pendente: 1 })
  pedirSync()
}

/**
 * Custo unitario do produto pela ficha vinculada, em centavos inteiros.
 * null = sem ficha (revenda) ou ficha que nao fecha — nunca zero, porque zero
 * viraria "lucro de 100%" no relatorio.
 */
export function custoDoProduto(
  produto: Pick<ProdutoLocal, 'fichaId'>,
  catalogo: Catalogo,
  config: ConfigProducao,
): number | null {
  if (!produto.fichaId || !catalogo.fichas.has(produto.fichaId)) return null
  try {
    return arredondarCentavos(calcularCustoFicha(produto.fichaId, catalogo, config).custoUnitario)
  } catch {
    return null
  }
}

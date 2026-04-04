import type { CategoriaProceso, ClaseProceso, TipoInstancia } from '@prisma/client'

const CLASE: Partial<Record<ClaseProceso, string>> = {
  TUTELA: 'acción de tutela',
  HABEAS_CORPUS: 'acción de hábeas corpus',
  HABEAS_DATA: 'acción de hábeas data',
  ACCION_POPULAR: 'acción popular',
  ACCION_DE_GRUPO: 'acción de grupo',
  ACCION_DE_CUMPLIMIENTO: 'acción de cumplimiento',
  ORDINARIO: 'proceso ordinario',
  VERBAL: 'proceso verbal',
  VERBAL_SUMARIO: 'proceso verbal sumario',
  EJECUTIVO_SINGULAR: 'proceso ejecutivo singular',
  EJECUTIVO_HIPOTECARIO: 'proceso ejecutivo hipotecario',
  EJECUTIVO_PRENDARIO: 'proceso ejecutivo prendario',
  POSESORIO: 'proceso posesorio',
  LIQUIDACION: 'proceso de liquidación',
  SUCESORIO: 'proceso sucesorio',
  DIVISORIO: 'proceso divisorio',
  RENDICION_CUENTAS: 'proceso de rendición de cuentas',
  TERCERIAS: 'proceso de tercerías',
  ACCION_DE_TUTELA_CONTRA_PROVIDENCIA: 'acción de tutela contra providencia',
}

export function textoTipoProcesoInforme(params: {
  categoriaProceso: CategoriaProceso
  claseProceso: ClaseProceso
  instancia: TipoInstancia
}): string {
  const { categoriaProceso, claseProceso, instancia } = params
  const inst = instancia === 'SEGUNDA_INSTANCIA' ? 'segunda instancia' : 'primera instancia'
  const base = CLASE[claseProceso] ?? claseProceso.replace(/_/g, ' ').toLowerCase()
  if (categoriaProceso === 'CONSTITUCIONAL') {
    return `${base} de ${inst} para admitir`
  }
  return `${base} de ${inst} para admitir`
}

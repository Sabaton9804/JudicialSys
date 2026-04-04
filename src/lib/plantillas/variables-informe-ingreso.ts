import { differenceInCalendarDays } from 'date-fns'
import type { Juzgado, Proceso, Usuario } from '@prisma/client'
import { fechaLargaCiudadColombia } from '@/lib/plantillas/fecha-palabras-es'
import { textoTipoProcesoInforme } from '@/lib/plantillas/texto-clase-proceso'

export type VariablesInformeIngreso = Record<string, string>

export function construirVariablesInformeIngreso(params: {
  proceso: Proceso
  juzgado: Juzgado
  secretario: Usuario | null
  /** Sobreescribe ciudad línea de fecha (ej. "Bogotá, D.C.") */
  ciudadFecha?: string
  medioIngreso?: string
  origenProceso?: string
}): VariablesInformeIngreso {
  const { proceso, juzgado, secretario } = params
  const ciudadLinea = (params.ciudadFecha ?? `${juzgado.ciudad || 'Bogotá'}, D.C.`).trim()
  const fechaRef = proceso.fechaRadicacion
  const fechaLarga = fechaLargaCiudadColombia(fechaRef, ciudadLinea)

  const textoTipoProceso = textoTipoProcesoInforme({
    categoriaProceso: proceso.categoriaProceso,
    claseProceso: proceso.claseProceso,
    instancia: proceso.instancia,
  })

  const medioIngreso = (params.medioIngreso ?? 'correo electrónico de hoy').trim()
  const origenProceso = (params.origenProceso ?? 'Radicación JudicialSys').trim()

  const radicado = proceso.radicado.replace(/\D/g, '')
  const anioRad = proceso.radicado.length >= 16 ? proceso.radicado.slice(12, 16) : String(fechaRef.getFullYear())

  const fechaIngresoRef = proceso.fechaEntradaDespacho ?? proceso.fechaRadicacion
  const diasTranscurridos = String(
    Math.max(0, differenceInCalendarDays(new Date(), fechaIngresoRef))
  )

  const observacionesSecretaria = (proceso.observaciones ?? '').trim()

  return {
    radicado: proceso.radicado,
    radicadoSoloDigitos: radicado,
    numeroProcesoCompleto: proceso.radicado,
    anioRadicacion: anioRad,
    demandante: proceso.demandante,
    demandado: proceso.demandado,
    claseProceso: proceso.claseProceso,
    categoriaProceso: proceso.categoriaProceso,
    instancia: proceso.instancia,
    etapaProcesal: proceso.etapaProcesal ?? '',
    textoTipoProceso,
    fechaLarga,
    fechaCorta: fechaRef.toISOString().slice(0, 10),
    fechaRadicacionIso: fechaRef.toISOString(),
    fechaIngresoDespacho: proceso.fechaEntradaDespacho
      ? proceso.fechaEntradaDespacho.toISOString()
      : '',
    diasTranscurridos,
    medioIngreso,
    origenProceso,
    observacionesSecretaria,
    tipoDecision: '',
    juzgadoNombre: juzgado.nombre,
    juzgadoDireccion: juzgado.direccion ?? '',
    juzgadoCiudad: juzgado.ciudad,
    juzgadoEmail: juzgado.email ?? '',
    juzgadoTelefono: juzgado.telefono ?? '',
    secretarioNombre: secretario?.nombre?.trim() || '___________________________',
    secretarioCargo: 'Secretario',
    fechaGeneracion: new Date().toISOString(),
  }
}

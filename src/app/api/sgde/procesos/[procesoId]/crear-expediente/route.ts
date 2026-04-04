import { NextRequest, NextResponse } from 'next/server'
import type { CategoriaProceso } from '@prisma/client'
import { db } from '@/lib/db'
import { getUserFromHeader, juzgadoWhere } from '@/lib/auth-utils'
import {
  aplicarMetadatosExpedienteOpcionalesDesdeEnv,
  asegurarEstructuraPrimeraInstanciaYPrincipal,
  buscarNodoExpedienteId,
  crearExpedienteAlfresco,
  login,
  normalizarRadicadoSgde,
  resolverContenedorExpedientesSgde,
  resolveSgdeCredentials,
} from '@/lib/sgde/client'
import {
  despachoSgdeDesdeProceso,
  nombreExpedienteTituloDesdeProceso,
  normalizarUbicacionDespachoSgde,
  serieSgdeDesdeCategoria,
  normalizarSubserieSgdeCatalogo,
  subserieSgdeDesdeClase,
} from '@/lib/sgde/mapeo-expediente-sgde'
import { esTextoNoIdentifica, type DemandaSgdeMetadataGuardada } from '@/lib/sgde/demanda-sgde-metadata'
import { leerDemandaSgdeMetadata } from '@/lib/sgde/persist-demanda-sgde-db'
import {
  guardarContenedorExpedientesJuzgado,
  leerContenedorExpedientesJuzgado,
} from '@/lib/sgde/persist-juzgado-sgde-db'
import {
  guardarSgdeExpedienteEnProceso,
  leerSgdeExpedienteAlmacenado,
} from '@/lib/sgde/persist-proceso-sgde-db'

function categoriaEfectivaSgde(
  categoriaProceso: CategoriaProceso,
  meta: DemandaSgdeMetadataGuardada | null
): CategoriaProceso {
  if (meta?.categoriaProceso === 'CONSTITUCIONAL' || meta?.categoriaProceso === 'CIVIL') return meta.categoriaProceso
  return categoriaProceso
}

export const runtime = 'nodejs'

/**
 * POST: crea el nodo expediente en Alfresco (SGDE) bajo la carpeta padre configurada,
 * o enlaza si ya existe un expediente con el mismo CUI. Guarda el UUID en el proceso local.
 *
 * Política JudicialSys: bajo todo expediente se asegura (idempotente) la jerarquía del portal:
 * expediente → «Primera instancia» (o «01PrimeraInstancia» si hace falta) → «Principal».
 *
 * Body JSON: sgdeUsuario, sgdePassword.
 * Opcional (si no vienen, se deducen del proceso): nombreSerie, nombreSubserie, codigoSubserie,
 * nomOficinaProductora, nombreExpedienteTitulo.
 * Opcional: subirArchivosLocales (boolean) — si true, tras crear/enlazar el expediente sube PDF/DOCX del repositorio
 * local clasificando tipo documental con IA (requiere OPENAI_API_KEY). subirRutaDestino, subirNivelAcceso opcionales.
 * Serie/subserie/despacho/nombre siguen el mismo criterio que el formulario SGDE (Civil/Constitucional, clase, juzgado).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ procesoId: string }> }
) {
  try {
    const user = await getUserFromHeader(request)
    const { procesoId } = await params
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const cred = resolveSgdeCredentials({
      sgdeUsuario: typeof body.sgdeUsuario === 'string' ? body.sgdeUsuario : undefined,
      sgdePassword: typeof body.sgdePassword === 'string' ? body.sgdePassword : undefined,
    })
    if (!cred) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Indique usuario y contraseña del SGDE o configure SGDE_USER y SGDE_PASSWORD en el servidor.',
        },
        { status: 400 }
      )
    }

    const jw = juzgadoWhere(user)
    const proceso = await db.proceso.findFirst({
      where: { id: procesoId, ...jw } as any,
      include: {
        juzgado: {
          select: {
            id: true,
            nombre: true,
            codigoRadicacion12: true,
          },
        },
      },
    })
    if (!proceso) {
      return NextResponse.json({ success: false, error: 'Proceso no encontrado' }, { status: 404 })
    }

    const juzgadoId = proceso.juzgado?.id ?? proceso.juzgadoId
    const contenedorSgdeGuardado = juzgadoId
      ? await leerContenedorExpedientesJuzgado(juzgadoId)
      : null

    const sgdeYa = await leerSgdeExpedienteAlmacenado(proceso.id)
    const radicadoPreview = normalizarRadicadoSgde(proceso.radicado)
    if (sgdeYa.alfrescoId) {
      let estructuraYa: { ok: true } | { ok: false; error: string } = { ok: true }
      let metadatosOpcionalesYa: { aplicado: boolean; detalle?: string } = { aplicado: false }
      try {
        const { alfTicket } = await login(cred.usuario, cred.password)
        estructuraYa = await asegurarEstructuraPrimeraInstanciaYPrincipal(alfTicket, sgdeYa.alfrescoId)
        metadatosOpcionalesYa = await aplicarMetadatosExpedienteOpcionalesDesdeEnv(alfTicket, sgdeYa.alfrescoId)
      } catch (e) {
        estructuraYa = { ok: false, error: e instanceof Error ? e.message : 'Error al conectar con SGDE' }
      }
      return NextResponse.json({
        success: true,
        yaRegistrado: true,
        nodeId: sgdeYa.alfrescoId,
        radicado: radicadoPreview.length === 23 ? radicadoPreview : undefined,
        message: 'Este proceso ya tiene un expediente SGDE vinculado en JudicialSys.',
        estructuraPrimeraInstancia: estructuraYa.ok
          ? { creadaOExistente: true as const }
          : { creadaOExistente: false as const, error: estructuraYa.error },
        metadatosExpedienteOpcionales: metadatosOpcionalesYa,
      })
    }

    const radicado = radicadoPreview
    if (radicado.length !== 23) {
      return NextResponse.json(
        {
          success: false,
          error:
            'El radicado del proceso debe tener 23 dígitos (CUI) para crear el expediente en SGDE. Revise el radicado en JudicialSys.',
        },
        { status: 422 }
      )
    }

    const { alfTicket } = await login(cred.usuario, cred.password)

    const codigo12Juzgado =
      (proceso.juzgado?.codigoRadicacion12 || '').replace(/\D/g, '').slice(0, 12) ||
      radicado.slice(0, 12)

    let parentNodeUuid =
      contenedorSgdeGuardado ||
      process.env.SGDE_PARENT_EXPEDIENTES_NODE_ID?.trim() ||
      ''

    let contenedorDescubierto = false
    if (!parentNodeUuid) {
      parentNodeUuid = (await resolverContenedorExpedientesSgde(alfTicket, codigo12Juzgado)) || ''
      contenedorDescubierto = Boolean(parentNodeUuid)
    }

    if (contenedorDescubierto && juzgadoId && !(contenedorSgdeGuardado || '').trim()) {
      try {
        await guardarContenedorExpedientesJuzgado(juzgadoId, parentNodeUuid)
      } catch {
        /* no bloquear creación del expediente */
      }
    }

    if (!parentNodeUuid) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No se localizó el despacho en SGDE para este juzgado. Compruebe el código de radicación de 12 dígitos del juzgado en JudicialSys y que exista al menos un expediente en ese despacho en SGDE, o configure una vez SGDE_PARENT_EXPEDIENTES_NODE_ID / el contenedor en el juzgado.',
        },
        { status: 400 }
      )
    }

    const metaDesdePrisma = (proceso as { demandaSgdeMetadata?: unknown }).demandaSgdeMetadata
    const metaIa: DemandaSgdeMetadataGuardada | null =
      metaDesdePrisma && typeof metaDesdePrisma === 'object'
        ? (metaDesdePrisma as DemandaSgdeMetadataGuardada)
        : (await leerDemandaSgdeMetadata(proceso.id))
    const catEff = categoriaEfectivaSgde(proceso.categoriaProceso, metaIa)

    const nombreSerie =
      typeof body.nombreSerie === 'string' && body.nombreSerie.trim()
        ? body.nombreSerie.trim()
        : metaIa?.serie?.trim() && !esTextoNoIdentifica(metaIa.serie)
          ? metaIa.serie.trim()
          : serieSgdeDesdeCategoria(catEff)

    const nombreSubserie = normalizarSubserieSgdeCatalogo(
      typeof body.nombreSubserie === 'string' && body.nombreSubserie.trim()
        ? body.nombreSubserie.trim()
        : metaIa?.subserie?.trim() && !esTextoNoIdentifica(metaIa.subserie)
          ? metaIa.subserie.trim()
          : subserieSgdeDesdeClase(proceso.claseProceso),
      proceso.claseProceso
    )

    const codigoSubserie =
      typeof body.codigoSubserie === 'string' && body.codigoSubserie.trim()
        ? body.codigoSubserie.trim()
        : metaIa?.codigoSubserie?.trim() && !esTextoNoIdentifica(metaIa.codigoSubserie)
          ? metaIa.codigoSubserie.trim()
          : undefined

    const nomOficinaRaw =
      typeof body.nomOficinaProductora === 'string' && body.nomOficinaProductora.trim()
        ? body.nomOficinaProductora.trim()
        : despachoSgdeDesdeProceso({
            consultaDespacho: proceso.consultaDespacho,
            juzgadoNombre: proceso.juzgado?.nombre,
          })
    const nomOficinaProductora = normalizarUbicacionDespachoSgde(nomOficinaRaw)

    const nombreExpedienteTitulo =
      typeof body.nombreExpedienteTitulo === 'string' && body.nombreExpedienteTitulo.trim()
        ? body.nombreExpedienteTitulo.trim()
        : metaIa?.nombreExpediente?.trim() && !esTextoNoIdentifica(metaIa.nombreExpediente)
          ? metaIa.nombreExpediente.trim()
          : nombreExpedienteTituloDesdeProceso({
              demandante: proceso.demandante,
              demandado: proceso.demandado,
              claseProceso: proceso.claseProceso,
              categoriaProceso: proceso.categoriaProceso,
              categoriaProcesoSgde:
                metaIa?.categoriaProceso === 'CIVIL' || metaIa?.categoriaProceso === 'CONSTITUCIONAL'
                  ? metaIa.categoriaProceso
                  : undefined,
            })

    let nodeId = await buscarNodoExpedienteId(alfTicket, radicado)
    let yaExiste = false
    if (!nodeId) {
      const creado = await crearExpedienteAlfresco({
        alfTicket,
        parentNodeUuid,
        radicado23: radicado,
        nombreSerie,
        nombreSubserie,
        codigoSubserie,
        nomOficinaProductora,
        nombreExpedienteTitulo,
      })
      if (!creado.ok) {
        return NextResponse.json(
          {
            success: false,
            error: creado.error,
            detalle: creado.detalle,
            statusAlfresco: creado.status,
          },
          { status: 502 }
        )
      }
      nodeId = creado.nodeId
      yaExiste = Boolean(creado.yaExiste)
    } else {
      yaExiste = true
    }

    const estructura = await asegurarEstructuraPrimeraInstanciaYPrincipal(alfTicket, nodeId)
    const metadatosExpedienteOpcionales = await aplicarMetadatosExpedienteOpcionalesDesdeEnv(alfTicket, nodeId)

    const uuidDesdeBusqueda = await buscarNodoExpedienteId(alfTicket, radicado)
    const busquedaCoincide = uuidDesdeBusqueda === nodeId

    const contenedorOrigen: 'juzgado_bd' | 'env' | 'resolver' = contenedorSgdeGuardado
      ? 'juzgado_bd'
      : process.env.SGDE_PARENT_EXPEDIENTES_NODE_ID?.trim()
        ? 'env'
        : 'resolver'

    const now = new Date()
    const creadoAtGuardado = sgdeYa.creadoAt ?? now
    await guardarSgdeExpedienteEnProceso(proceso.id, nodeId, creadoAtGuardado)

    let cargaArchivosSgde:
      | {
          subidosOk: number
          total: number
          aviso?: string
          resultados: Array<{
            archivoId: string
            nombreOriginal: string
            ok: boolean
            tipoDocumental?: string
            error?: string
          }>
        }
      | undefined

    const quiereSubir =
      body.subirArchivosLocales === true ||
      body.subirArchivosLocales === 'true' ||
      body.subirArchivosLocales === 1
    if (quiereSubir) {
      try {
        const { subirArchivosLocalesProcesoSgde } = await import('@/lib/sgde/subir-archivos-locales-sgde')
        const rutaSub =
          typeof body.subirRutaDestino === 'string' && body.subirRutaDestino.trim()
            ? body.subirRutaDestino.trim()
            : '01PrimeraInstancia/C01'
        let nivelSub = typeof body.subirNivelAcceso === 'string' ? body.subirNivelAcceso.trim() : 'Reservado'
        if (nivelSub === 'Publico') nivelSub = 'Público'
        if (!['Reservado', 'Público', 'Confidencial'].includes(nivelSub)) nivelSub = 'Reservado'

        cargaArchivosSgde = await subirArchivosLocalesProcesoSgde({
          procesoId: proceso.id,
          radicado: proceso.radicado,
          usuario: cred.usuario,
          password: cred.password,
          rutaDestino: rutaSub,
          nivelAcceso: nivelSub,
        })
      } catch (e) {
        cargaArchivosSgde = {
          subidosOk: 0,
          total: 0,
          aviso: e instanceof Error ? e.message : 'Error al subir archivos locales al SGDE',
          resultados: [],
        }
      }
    }

    return NextResponse.json({
      success: true,
      nodeId,
      yaExiste,
      radicado,
      estructuraPrimeraInstancia: estructura.ok
        ? { creadaOExistente: true as const }
        : { creadaOExistente: false as const, error: estructura.error },
      metadatosExpedienteOpcionales,
      mapeoSgde: {
        serie: nombreSerie,
        subserie: nombreSubserie,
        nombreExpediente: nombreExpedienteTitulo,
        despacho: nomOficinaProductora,
      },
      diagnostico: {
        contenedorOrigen,
        parentNodeUuid,
        busquedaPorCuiUuid: uuidDesdeBusqueda,
        busquedaCoincideConNodo: busquedaCoincide,
        notaCuiDistinto:
          'Cada proceso en JudicialSys tiene su propio CUI. Si en la lista busca otro número (p. ej. termina en 308 y el panel muestra 310), son expedientes distintos: filtre por el CUI exacto que aparece aquí.',
        advertenciaBusqueda:
          uuidDesdeBusqueda == null
            ? 'La búsqueda por CUI no devolvió UUID en esta misma petición (retraso del índice en SGDE o nombre de nodo distinto). Pruebe «Comprobar en SGDE» o espere unos minutos y busque de nuevo en el portal.'
            : !busquedaCoincide
              ? 'El UUID devuelto por la búsqueda no coincide con el nodo creado; conviene revisar permisos o escalar a soporte SGDE.'
              : undefined,
      },
      ...(cargaArchivosSgde ? { cargaArchivosSgde } : {}),
    })
  } catch (error) {
    console.error('crear-expediente SGDE:', error)
    const msg = error instanceof Error ? error.message : 'Error al crear expediente en SGDE'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

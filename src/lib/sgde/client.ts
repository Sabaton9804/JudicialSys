import { randomUUID } from 'crypto'

/**
 * Cliente SGDE (Sistema de Gestión Documental Electrónica) — Rama Judicial.
 * Flujo equivalente a subir_directo_sgde.py: login → SAS Azure → PUT blob → createNodeAzure.
 * Solo usar en servidor (credenciales y tokens).
 */

const BASE = 'https://siugj-sgde.ramajudicial.gov.co'

const LOGIN_URL = `${BASE}/alfresco/s/sgde/login`
const SAS_URL = `${BASE}/backendrama/azure/sas`
const GET_NODE_URL = `${BASE}/backendrama/getNode`
const CREATE_URL = `${BASE}/backendrama/nodos/createNodeAzure`
const SEARCH_URL = `${BASE}/alfresco/api/-default-/public/search/versions/1/search`
const NODES_URL = `${BASE}/alfresco/api/-default-/public/alfresco/versions/1/nodes`

const HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146.0.0.0',
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  Origin: BASE,
  Referer: `${BASE}/expedientes/`,
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return {}
    let payloadB64 = parts[1]
    payloadB64 += '='.repeat((4 - (payloadB64.length % 4)) % 4)
    const json = Buffer.from(payloadB64, 'base64url').toString('utf8')
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    try {
      const parts = token.split('.')
      if (parts.length < 2) return {}
      let payloadB64 = parts[1]
      payloadB64 += '='.repeat((4 - (payloadB64.length % 4)) % 4)
      const json = Buffer.from(payloadB64, 'base64').toString('utf8')
      return JSON.parse(json) as Record<string, unknown>
    } catch {
      return {}
    }
  }
}

function basicAuthAlfresco(alfTicket: string): string {
  const cred = `ROLE_TICKET:${alfTicket}`
  return `Basic ${Buffer.from(cred).toString('base64')}`
}

export type SgdeLoginResult = { token: string; alfTicket: string }

export async function login(usuario: string, password: string): Promise<SgdeLoginResult> {
  const body = {
    username: Buffer.from(usuario, 'utf8').toString('base64'),
    password: Buffer.from(password, 'utf8').toString('base64'),
  }
  const r = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`SGDE login: ${r.status} — ${t.slice(0, 200)}`)
  }
  const data = (await r.json()) as Record<string, unknown>
  const token = (data.access_token || data.token) as string | undefined
  if (!token) throw new Error('SGDE: respuesta sin access_token')
  const payload = decodeJwtPayload(token)
  const alfTicket = String(payload.alfTicket ?? '')
  return { token, alfTicket }
}

async function getSas(token: string): Promise<{
  sasToken?: string
  container?: string
  account?: string
}> {
  const h = { ...HEADERS, Authorization: `Bearer ${token}` }
  const r = await fetch(SAS_URL, { headers: h })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`SGDE SAS: ${r.status} — ${t.slice(0, 200)}`)
  }
  return (await r.json()) as { sasToken?: string; container?: string; account?: string }
}

export async function getNodeMetadata(token: string, nodeUuid: string): Promise<Record<string, string>> {
  const h = { ...HEADERS, Authorization: `Bearer ${token}` }
  const url = `${GET_NODE_URL}/${nodeUuid}?include=path,properties,permissions,allowableOperations`
  const r = await fetch(url, { headers: h })
  if (!r.ok) return {}
  const data = (await r.json()) as {
    entry?: { properties?: Record<string, string> }
  }
  const props = data.entry?.properties ?? {}
  return {
    nomExpediente: props['rama:nomExpediente'] ?? '',
    nombreSerie: props['rama:nombreSerie'] ?? '',
    nomOficinaProductora: props['rama:nomOficinaProductora'] ?? '',
    nomSubserie: props['rama:nomSubserie'] ?? '',
    codigoSubserie: props['rama:codigoSubserie'] ?? '',
  }
}

export async function getSiguienteOrden(alfTicket: string, nodeUuid: string): Promise<number> {
  if (!alfTicket) return 1
  const url = `${NODES_URL}/${nodeUuid}/children?maxItems=100&orderBy=rama%3AidDocumento%20desc&include=properties`
  const h = { ...HEADERS, Authorization: basicAuthAlfresco(alfTicket) }
  const r = await fetch(url, { headers: h })
  if (!r.ok) return 1
  const data = (await r.json()) as {
    list?: { entries?: Array<{ entry?: { properties?: Record<string, unknown> } }> }
  }
  const entries = data.list?.entries ?? []
  let maxId = 0
  for (const e of entries) {
    const idDoc = e.entry?.properties?.['rama:idDocumento']
    if (idDoc != null) {
      const n = typeof idDoc === 'number' ? idDoc : parseInt(String(idDoc), 10)
      if (!Number.isNaN(n)) maxId = Math.max(maxId, n)
    }
  }
  return maxId + 1
}

/**
 * Mayor `rama:paginaFinDoc` entre documentos hijos de la carpeta (índice acumulado del expediente).
 * Si no hay datos, devuelve 0 para que el siguiente documento empiece en página 1.
 */
export async function getMaxPaginaFinDoc(alfTicket: string, nodeUuid: string): Promise<number> {
  if (!alfTicket) return 0
  const url = `${NODES_URL}/${nodeUuid}/children?maxItems=1000&include=properties`
  const h = { ...HEADERS, Authorization: basicAuthAlfresco(alfTicket) }
  const r = await fetch(url, { headers: h })
  if (!r.ok) return 0
  const data = (await r.json()) as {
    list?: { entries?: Array<{ entry?: { properties?: Record<string, unknown> } }> }
  }
  const entries = data.list?.entries ?? []
  let maxFin = 0
  for (const e of entries) {
    const raw = e.entry?.properties?.['rama:paginaFinDoc']
    if (raw == null) continue
    const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
    if (!Number.isNaN(n) && n > maxFin) maxFin = n
  }
  return maxFin
}

type AlfEntry = { entry?: { isFolder?: boolean; name?: string; id?: string } }

/** Documento hijo directo de una carpeta del expediente (p. ej. Cuaderno principal). */
export type SgdeDocumentoListItem = {
  nodeId: string
  nombre: string
  tipoDocumental: string
  idDocumento: number | null
  formato: string
  tamano: number | null
  acceso: string
  fechaPublicacion: string
}

/** UUID del nodo expediente en Alfresco (búsqueda por radicado / nombre CUI). */
export async function buscarNodoExpedienteId(
  alfTicket: string,
  expedienteNumero: string
): Promise<string | null> {
  if (!alfTicket) return null
  const h = { ...HEADERS, Authorization: basicAuthAlfresco(alfTicket) }
  const searchBody = {
    query: { query: `cm:name:"${expedienteNumero}"`, language: 'afts' },
    paging: { maxItems: 1, skipCount: 0 },
    filterQueries: [{ query: "TYPE:'rama:expedientes'" }],
    include: ['properties', 'path'],
  }
  const r = await fetch(SEARCH_URL, { method: 'POST', headers: h, body: JSON.stringify(searchBody) })
  if (!r.ok) return null
  const data = (await r.json()) as {
    list?: { entries?: Array<{ entry?: { id?: string } }> }
  }
  return data.list?.entries?.[0]?.entry?.id ?? null
}

export type LeerNodoExpedienteResult =
  | {
      ok: true
      nodeId: string
      cmName: string
      nomExpediente: string
      nodeType?: string
      /** Solo si se pidió `incluirPropiedadesRama`: metadatos rama:* para diagnóstico (p. ej. estado en portal). */
      propiedadesRama?: Record<string, string>
    }
  | { ok: false; status: number; detalle?: string }

function resumirPropiedadesRamaParaDiagnostico(props: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(props)) {
    if (!k.startsWith('rama:')) continue
    const s = v == null ? '' : typeof v === 'string' ? v : String(v)
    out[k] = s.length > 160 ? `${s.slice(0, 160)}…` : s
  }
  return out
}

/**
 * Actualiza propiedades del nodo (Alfresco REST v1). Útil si el instructivo SGDE indica el nombre del metadato de estado.
 */
export async function actualizarPropiedadesNodoAlfresco(
  alfTicket: string,
  nodeId: string,
  properties: Record<string, string>
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  if (!alfTicket || !nodeId?.trim() || !Object.keys(properties).length) {
    return { ok: false, error: 'Faltan ticket, nodo o propiedades' }
  }
  const h = { ...HEADERS, Authorization: basicAuthAlfresco(alfTicket) }
  const url = `${NODES_URL}/${encodeURIComponent(nodeId.trim())}`
  const r = await fetch(url, { method: 'PUT', headers: h, body: JSON.stringify({ properties }) })
  if (r.status === 200) return { ok: true }
  const t = await r.text().catch(() => '')
  return { ok: false, error: t.slice(0, 500), status: r.status }
}

/**
 * Tras crear el expediente por API, opcionalmente escribe el metadato de «estado» si el entorno lo define.
 * El portal web suele rellenar columnas como «En trámite» con un flujo distinto; el nombre exacto del campo
 * depende del modelo CSJ: configurar SGDE_EXPEDIENTE_ESTADO_PROP y SGDE_EXPEDIENTE_ESTADO_VALOR según instructivo UTDI.
 */
export async function aplicarMetadatosExpedienteOpcionalesDesdeEnv(
  alfTicket: string,
  nodeId: string
): Promise<{ aplicado: boolean; detalle?: string }> {
  const prop = process.env.SGDE_EXPEDIENTE_ESTADO_PROP?.trim()
  const valor = process.env.SGDE_EXPEDIENTE_ESTADO_VALOR?.trim()
  if (!prop || !valor) return { aplicado: false }
  const r = await actualizarPropiedadesNodoAlfresco(alfTicket, nodeId, { [prop]: valor })
  if (r.ok) return { aplicado: true }
  return { aplicado: false, detalle: r.error }
}

/**
 * Lee un nodo por UUID (Alfresco) con el ticket del SGDE. Sirve para comprobar si el UUID
 * guardado en JudicialSys sigue existiendo y es accesible con las credenciales actuales.
 */
export async function leerNodoExpedientePorId(
  alfTicket: string,
  nodeUuid: string,
  options?: { incluirPropiedadesRama?: boolean }
): Promise<LeerNodoExpedienteResult> {
  if (!alfTicket || !nodeUuid?.trim()) return { ok: false, status: 0 }
  const h = { ...HEADERS, Authorization: basicAuthAlfresco(alfTicket) }
  const url = `${NODES_URL}/${encodeURIComponent(nodeUuid.trim())}?include=properties`
  const r = await fetch(url, { headers: h })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    return { ok: false, status: r.status, detalle: t.slice(0, 300) }
  }
  const data = (await r.json()) as {
    entry?: {
      id?: string
      name?: string
      nodeType?: string
      properties?: Record<string, unknown>
    }
  }
  const e = data.entry
  if (!e?.id) return { ok: false, status: 500, detalle: 'Respuesta sin nodo' }
  const props = e.properties ?? {}
  const base = {
    ok: true as const,
    nodeId: e.id,
    cmName: e.name ?? '',
    nomExpediente: String(props['rama:nomExpediente'] ?? ''),
    nodeType: e.nodeType,
  }
  if (options?.incluirPropiedadesRama) {
    return {
      ...base,
      propiedadesRama: resumirPropiedadesRamaParaDiagnostico(props),
    }
  }
  return base
}

async function obtenerParentNodeId(alfTicket: string, nodeId: string): Promise<string | null> {
  if (!alfTicket || !nodeId) return null
  const h = { ...HEADERS, Authorization: basicAuthAlfresco(alfTicket) }
  const url = `${NODES_URL}/${encodeURIComponent(nodeId)}?include=path`
  const r = await fetch(url, { headers: h })
  if (!r.ok) return null
  const data = (await r.json()) as { entry?: { parentId?: string } }
  return data.entry?.parentId ?? null
}

async function buscarPrimerNodoPorQuery(
  alfTicket: string,
  query: string
): Promise<string | null> {
  if (!alfTicket) return null
  const h = { ...HEADERS, Authorization: basicAuthAlfresco(alfTicket) }
  const searchBody = {
    query: { query, language: 'afts' as const },
    paging: { maxItems: 3, skipCount: 0 },
    include: ['properties', 'path'],
  }
  const r = await fetch(SEARCH_URL, { method: 'POST', headers: h, body: JSON.stringify(searchBody) })
  if (!r.ok) return null
  const data = (await r.json()) as {
    list?: { entries?: Array<{ entry?: { id?: string } }> }
  }
  return data.list?.entries?.[0]?.entry?.id ?? null
}

/**
 * Resuelve el UUID de la carpeta del despacho donde se crean expedientes (hermanos del mismo CUI).
 * Misma idea que subir actuaciones: se usa el código de radicación (12 dígitos) del juzgado.
 *
 * 1) Si ya existe algún expediente en SGDE con CUI que empiece por esos 12 dígitos, el padre es el contenedor.
 * 2) Si no, busca una carpeta cuyo nombre sea el código de 12 dígitos o los 3 del despacho (p. ej. 051).
 */
export async function resolverContenedorExpedientesSgde(
  alfTicket: string,
  codigoRadicacion12: string | null | undefined
): Promise<string | null> {
  const c12 = (codigoRadicacion12 || '').replace(/\D/g, '').slice(0, 12)
  if (!alfTicket || c12.length !== 12) return null

  const pref = c12
  const queriesExp = [
    `TYPE:"rama:expedientes" AND @rama\\:nomExpediente:${pref}*`,
    `TYPE:'rama:expedientes' AND cm:name:${pref}*`,
  ]
  for (const q of queriesExp) {
    const expId = await buscarPrimerNodoPorQuery(alfTicket, q)
    if (expId) {
      const parent = await obtenerParentNodeId(alfTicket, expId)
      if (parent) return parent
    }
  }

  const despacho3 = c12.slice(9, 12)
  const nombresCarpeta = [c12, despacho3]
  for (const nombre of nombresCarpeta) {
    const q = `TYPE:"cm:folder" AND cm:name:"${nombre}" AND -TYPE:"rama:expedientes"`
    const folderId = await buscarPrimerNodoPorQuery(alfTicket, q)
    if (folderId) return folderId
  }

  return null
}

export type CrearExpedienteAlfrescoParams = {
  alfTicket: string
  /** Carpeta padre en Alfresco (contenedor del despacho en SGDE). */
  parentNodeUuid: string
  /** Radicado normalizado (23 dígitos); también es el nombre del nodo y CUI en metadatos. */
  radicado23: string
  nombreSerie?: string
  nombreSubserie?: string
  nomOficinaProductora?: string
  codigoSubserie?: string
  /** Título legible («Nombre expediente» en el portal); el CUI sigue en name / rama:nomExpediente. */
  nombreExpedienteTitulo?: string
}

export type CrearExpedienteAlfrescoResult =
  | { ok: true; nodeId: string; yaExiste?: boolean }
  | { ok: false; error: string; detalle?: string; status?: number }

/**
 * Crea un nodo tipo expediente bajo la carpeta padre del despacho (API Alfresco estándar).
 * Requiere permisos de creación en el padre y el UUID correcto del contenedor (manual SGDE / UTDI).
 */
export async function crearExpedienteAlfresco(
  p: CrearExpedienteAlfrescoParams
): Promise<CrearExpedienteAlfrescoResult> {
  const { alfTicket, parentNodeUuid, radicado23 } = p
  const name = radicado23.replace(/\D/g, '').trim()
  if (!alfTicket || !parentNodeUuid || name.length !== 23) {
    return {
      ok: false,
      error:
        name.length !== 23
          ? 'El radicado debe tener 23 dígitos (CUI) para crear el expediente en SGDE.'
          : 'Faltan alfTicket, carpeta padre o radicado.',
    }
  }

  const h = { ...HEADERS, Authorization: basicAuthAlfresco(alfTicket) }
  const s = (x: string | undefined) => (x == null || x === '' ? undefined : String(x).trim())
  const properties: Record<string, string> = {
    'rama:nomExpediente': name,
  }
  const ns = s(p.nombreSerie)
  const nsub = s(p.nombreSubserie)
  const nof = s(p.nomOficinaProductora)
  const csub = s(p.codigoSubserie)
  if (ns) properties['rama:nombreSerie'] = ns
  if (nsub) properties['rama:nomSubserie'] = nsub
  if (nof) properties['rama:nomOficinaProductora'] = nof
  if (csub) properties['rama:codigoSubserie'] = csub
  const titulo = s(p.nombreExpedienteTitulo)
  if (titulo) properties['cm:title'] = sanitizarNombre(titulo)

  const body = {
    name,
    nodeType: 'rama:expedientes',
    properties,
  }
  const url = `${NODES_URL}/${encodeURIComponent(parentNodeUuid)}/children`
  const r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) })
  if (r.status === 201) {
    const data = (await r.json()) as { entry?: { id?: string } }
    const id = data.entry?.id
    if (id) return { ok: true, nodeId: id }
    return { ok: false, error: 'Alfresco devolvió 201 sin id de nodo' }
  }

  const text = await r.text()
  if (r.status === 409 || r.status === 422) {
    const existing = await buscarNodoExpedienteId(alfTicket, name)
    if (existing) return { ok: true, nodeId: existing, yaExiste: true }
  }
  return {
    ok: false,
    error: `No se pudo crear el expediente (HTTP ${r.status})`,
    detalle: text.slice(0, 800),
    status: r.status,
  }
}

export type EliminarNodoAlfrescoResult =
  | { ok: true }
  | { ok: false; error: string; status?: number }

/**
 * Elimina un nodo en Alfresco (SGDE).
 * Por defecto `permanent: false` (papelera): los usuarios normales suelen no tener permiso de borrado definitivo (403).
 * Use `permanent: true` solo si su cuenta es administrador/propietario con derecho a eliminación permanente.
 */
export async function eliminarNodoAlfresco(
  alfTicket: string,
  nodeId: string,
  options?: { permanent?: boolean }
): Promise<EliminarNodoAlfrescoResult> {
  const id = nodeId.trim()
  if (!alfTicket || !id) return { ok: false, error: 'Faltan ticket o id de nodo' }
  const h = { ...HEADERS, Authorization: basicAuthAlfresco(alfTicket) }
  const permanent = options?.permanent === true
  const url = `${NODES_URL}/${encodeURIComponent(id)}?permanent=${permanent}`
  const r = await fetch(url, { method: 'DELETE', headers: h })
  if (r.status === 204 || r.status === 200) return { ok: true }
  const text = await r.text()
  return { ok: false, error: text.slice(0, 500), status: r.status }
}

/** Elimina primero los hijos (profundidad) y luego el nodo; necesario para expedientes con carpetas/documentos. */
async function eliminarSubarbolAlfresco(
  alfTicket: string,
  nodeId: string,
  options?: { permanent?: boolean }
): Promise<EliminarNodoAlfrescoResult> {
  const h = { ...HEADERS, Authorization: basicAuthAlfresco(alfTicket) }
  const listUrl = `${NODES_URL}/${encodeURIComponent(nodeId)}/children?maxItems=200`
  const r = await fetch(listUrl, { headers: h })
  if (r.ok) {
    const data = (await r.json()) as {
      list?: { entries?: Array<{ entry?: { id?: string } }> }
    }
    const entries = data.list?.entries ?? []
    for (const e of entries) {
      const cid = e.entry?.id
      if (!cid) continue
      const sub = await eliminarSubarbolAlfresco(alfTicket, cid, options)
      if (!sub.ok) return sub
    }
  }
  return eliminarNodoAlfresco(alfTicket, nodeId, options)
}

export type EliminarExpedientePorRadicadoResult =
  | { ok: true; nodeId: string; radicado: string }
  | { ok: false; error: string; status?: number }

/**
 * Busca el nodo expediente por CUI (nombre de nodo) y lo elimina con todo su contenido.
 * Por defecto envía a la papelera (`permanent: false`). `permanent: true` solo si su usuario puede borrar definitivamente.
 */
export async function eliminarExpedientePorRadicadoSgde(
  alfTicket: string,
  radicado23: string,
  options?: { permanent?: boolean }
): Promise<EliminarExpedientePorRadicadoResult> {
  const radicado = normalizarRadicadoSgde(radicado23)
  if (radicado.length !== 23) {
    return { ok: false, error: 'El radicado debe tener 23 dígitos (CUI).' }
  }
  const nodeId = await buscarNodoExpedienteId(alfTicket, radicado)
  if (!nodeId) {
    return {
      ok: false,
      error:
        'No se encontró expediente con ese CUI en SGDE (búsqueda por nombre de nodo tipo rama:expedientes).',
    }
  }
  const del = await eliminarSubarbolAlfresco(alfTicket, nodeId, options)
  if (!del.ok) return { ok: false, error: del.error, status: del.status }
  return { ok: true, nodeId, radicado }
}

/**
 * «Primera instancia» bajo un nodo expediente ya conocido (sin búsqueda por CUI).
 * Necesario cuando el índice de búsqueda aún no devuelve el expediente recién creado.
 */
export async function resolverUuidPrimeraInstanciaDesdeExpedienteId(
  alfTicket: string,
  expedienteNodeUuid: string
): Promise<string | null> {
  if (!alfTicket || !expedienteNodeUuid?.trim()) return null
  const h = { ...HEADERS, Authorization: basicAuthAlfresco(alfTicket) }
  const url = `${NODES_URL}/${encodeURIComponent(expedienteNodeUuid.trim())}/children?maxItems=50&orderBy=isFolder%20desc&include=path,properties`
  const res = await fetch(url, { headers: h })
  if (!res.ok) return null
  const children = ((await res.json()) as { list?: { entries?: AlfEntry[] } }).list?.entries ?? []

  let carpetaInstancia: string | undefined
  for (const e of children) {
    const entry = e.entry
    if (!entry?.isFolder) continue
    const name = (entry.name ?? '').trim()
    if (name.toLowerCase().includes('primera')) {
      carpetaInstancia = entry.id
      break
    }
  }
  if (!carpetaInstancia && children.length) {
    carpetaInstancia = children[0]?.entry?.id
  }
  return carpetaInstancia ?? null
}

/**
 * Carpeta destino (p. ej. Principal) bajo el expediente, sin búsqueda por CUI.
 */
export async function resolverUuidCarpetaDesdeExpedienteId(
  alfTicket: string,
  expedienteNodeUuid: string
): Promise<string | null> {
  const carpetaInstancia = await resolverUuidPrimeraInstanciaDesdeExpedienteId(alfTicket, expedienteNodeUuid)
  if (!carpetaInstancia) return null
  const h = { ...HEADERS, Authorization: basicAuthAlfresco(alfTicket) }
  const url = `${NODES_URL}/${carpetaInstancia}/children?maxItems=50&orderBy=isFolder%20desc&include=path,properties`
  const res = await fetch(url, { headers: h })
  if (!res.ok) return null
  const children = ((await res.json()) as { list?: { entries?: AlfEntry[] } }).list?.entries ?? []

  for (const e of children) {
    const entry = e.entry
    if (!entry?.isFolder) continue
    const name = (entry.name ?? '').trim().toLowerCase()
    if (name.includes('principal') || name.includes('cuaderno') || name.includes('c01')) {
      return entry.id ?? null
    }
  }
  if (children.length) {
    return children[0]?.entry?.id ?? null
  }
  return null
}

/**
 * UUID de la carpeta "Primera instancia" (hijo directo del expediente).
 * Misma lógica que el portal SGDE: expediente → Primera instancia → …
 */
export async function resolverUuidPrimeraInstancia(
  alfTicket: string,
  expedienteNumero: string,
  rutaDestino = ''
): Promise<string | null> {
  if (!alfTicket) return null
  const expId = await buscarNodoExpedienteId(alfTicket, expedienteNumero)
  if (!expId) return null
  return resolverUuidPrimeraInstanciaDesdeExpedienteId(alfTicket, expId)
}

/** Subcarpetas de Primera instancia (Principal, Medidas cautelares, etc.). */
export async function listarSubcarpetasCuadernos(
  alfTicket: string,
  primeraInstanciaId: string
): Promise<Array<{ id: string; nombre: string }>> {
  if (!alfTicket) return []
  const h = { ...HEADERS, Authorization: basicAuthAlfresco(alfTicket) }
  const url = `${NODES_URL}/${primeraInstanciaId}/children?maxItems=50&orderBy=isFolder%20desc&include=path,properties`
  const res = await fetch(url, { headers: h })
  if (!res.ok) return []
  const children = ((await res.json()) as { list?: { entries?: AlfEntry[] } }).list?.entries ?? []
  const out: Array<{ id: string; nombre: string }> = []
  for (const e of children) {
    const entry = e.entry
    if (!entry?.isFolder || !entry.id) continue
    out.push({ id: entry.id, nombre: (entry.name ?? '').trim() || 'Carpeta' })
  }
  return out
}

export type SgdeCarpetaConDocumentos = {
  nombreCarpeta: string
  folderNodeId: string
  documentos: SgdeDocumentoListItem[]
}

/** Lista documentos agrupados como en el SGDE: Primera instancia → Principal | Medidas cautelares | … */
export async function listarDocumentosPorCuadernosSgde(
  alfTicket: string,
  expedienteNumero: string
): Promise<SgdeCarpetaConDocumentos[]> {
  const primeraId = await resolverUuidPrimeraInstancia(alfTicket, expedienteNumero, '')
  if (!primeraId) return []
  const subs = await listarSubcarpetasCuadernos(alfTicket, primeraId)
  const out: SgdeCarpetaConDocumentos[] = []
  for (const sub of subs) {
    const documentos = await listarDocumentosEnCarpeta(alfTicket, sub.id)
    out.push({
      nombreCarpeta: sub.nombre,
      folderNodeId: sub.id,
      documentos,
    })
  }
  return out
}

/**
 * Resuelve radicado (solo dígitos) → UUID de la carpeta destino (p. ej. Cuaderno principal).
 * Si el índice aún no indexa el expediente, use `resolverUuidCarpetaDesdeExpedienteId` con el UUID guardado en BD.
 */
export async function resolverUuidCarpeta(
  alfTicket: string,
  expedienteNumero: string,
  rutaDestino = ''
): Promise<string | null> {
  const expId = await buscarNodoExpedienteId(alfTicket, expedienteNumero)
  if (!expId) return null
  return resolverUuidCarpetaDesdeExpedienteId(alfTicket, expId)
}

function sanitizarNombre(nombre: string): string {
  if (!nombre?.trim()) return nombre
  let s = nombre.trim()
  s = s.replace(/[/\\:*?"<>|]/g, '')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

/**
 * Crea una carpeta cm:folder bajo un nodo padre (misma API que el botón «+ Carpeta» del SGDE).
 * Si ya existe (409), devuelve el id encontrado entre los hijos.
 */
export async function crearCarpetaCmFolder(
  alfTicket: string,
  parentNodeUuid: string,
  nombre: string
): Promise<{ ok: true; nodeId: string } | { ok: false; error: string }> {
  if (!alfTicket || !parentNodeUuid) return { ok: false, error: 'Faltan alfTicket o carpeta padre' }
  const name = sanitizarNombre(nombre)
  if (!name) return { ok: false, error: 'Nombre de carpeta vacío' }
  const h = { ...HEADERS, Authorization: basicAuthAlfresco(alfTicket) }
  const body = { name, nodeType: 'cm:folder' }
  const url = `${NODES_URL}/${encodeURIComponent(parentNodeUuid)}/children`
  const r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) })
  if (r.status === 201) {
    const data = (await r.json()) as { entry?: { id?: string } }
    const id = data.entry?.id
    if (id) return { ok: true, nodeId: id }
    return { ok: false, error: 'Alfresco devolvió 201 sin id de carpeta' }
  }
  if (r.status === 409 || r.status === 422) {
    const subs = await listarSubcarpetasCuadernos(alfTicket, parentNodeUuid)
    const want = name.toLowerCase()
    for (const s of subs) {
      if (s.nombre.toLowerCase() === want) return { ok: true, nodeId: s.id }
    }
  }
  const t = await r.text()
  return { ok: false, error: `No se pudo crear la carpeta «${name}» (HTTP ${r.status}): ${t.slice(0, 200)}` }
}

/**
 * JudicialSys crea en SGDE la misma jerarquía que el portal: bajo el nodo expediente,
 * carpeta «Primera instancia» (o «01PrimeraInstancia» si la primera falla) y dentro «Principal».
 * Idempotente: si ya existen carpetas compatibles, no duplica.
 */
export async function asegurarEstructuraPrimeraInstanciaYPrincipal(
  alfTicket: string,
  expedienteNodeUuid: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!alfTicket || !expedienteNodeUuid) return { ok: false, error: 'Faltan datos' }

  let primeraId = await (async () => {
    const subs = await listarSubcarpetasCuadernos(alfTicket, expedienteNodeUuid)
    for (const s of subs) {
      const n = s.nombre.toLowerCase()
      if (n.includes('primera')) return s.id
    }
    return null
  })()

  if (!primeraId) {
    let c = await crearCarpetaCmFolder(alfTicket, expedienteNodeUuid, 'Primera instancia')
    if (!c.ok) {
      c = await crearCarpetaCmFolder(alfTicket, expedienteNodeUuid, '01PrimeraInstancia')
    }
    if (!c.ok) return { ok: false, error: c.error }
    primeraId = c.nodeId
  }

  let tienePrincipal = false
  const subsPi = await listarSubcarpetasCuadernos(alfTicket, primeraId)
  for (const s of subsPi) {
    const n = s.nombre.toLowerCase()
    if (n.includes('principal') || n.includes('c01') || (n.includes('cuaderno') && n.includes('principal'))) {
      tienePrincipal = true
      break
    }
  }
  if (!tienePrincipal) {
    const c = await crearCarpetaCmFolder(alfTicket, primeraId, 'Principal')
    if (!c.ok) return { ok: false, error: c.error }
  }

  return { ok: true }
}

/**
 * Resuelve la carpeta Principal para subir documentos: prioriza el UUID del nodo expediente
 * guardado en JudicialSys (tras «Crear en SGDE»), porque la búsqueda por CUI puede devolver vacío
 * unos minutos hasta que indexe el expediente recién creado.
 */
export async function resolverUuidCarpetaPriorizandoExpedienteAlmacenado(
  alfTicket: string,
  radicadoNorm: string,
  sgdeExpedienteAlfrescoId: string | null | undefined
): Promise<string | null> {
  const desdeBd = (sgdeExpedienteAlfrescoId && String(sgdeExpedienteAlfrescoId).trim()) || null
  const expId = desdeBd || (await buscarNodoExpedienteId(alfTicket, radicadoNorm))
  if (!expId) return null
  let nodeUuid = await resolverUuidCarpetaDesdeExpedienteId(alfTicket, expId)
  if (!nodeUuid) {
    const aseg = await asegurarEstructuraPrimeraInstanciaYPrincipal(alfTicket, expId)
    if (aseg.ok) {
      nodeUuid = await resolverUuidCarpetaDesdeExpedienteId(alfTicket, expId)
    }
  }
  return nodeUuid
}

function tipoDocumentalLegible(camel: string): string {
  if (!camel?.trim()) return camel
  const s = camel.trim()
  let out = s[0]
  for (let i = 1; i < s.length; i++) {
    const c = s[i]
    if (c === c.toUpperCase() && c !== c.toLowerCase()) out += ` ${c.toLowerCase()}`
    else out += c
  }
  return sanitizarNombre(out)
}

/** Cuenta páginas de un PDF en memoria (metadatos SGDE y rango acumulativo en expediente). */
export async function contarPaginasPdfSgde(buffer: Buffer): Promise<number> {
  try {
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: buffer })
    const info = await parser.getInfo()
    await parser.destroy()
    const n = (info as { total?: number }).total
    return typeof n === 'number' && n > 0 ? n : 1
  } catch {
    return 1
  }
}

export type SubirSgdeParams = {
  token: string
  alfTicket: string
  buffer: Buffer
  nombreArchivoSgde: string
  nodeUuid: string
  tipoDocumental: string
  nivelAcceso: string
  metadata?: Record<string, string>
  orden?: number
  mimeType: string
  extension: string
  /**
   * CUI del expediente (23 dígitos). El `nodeUuid` de subida suele ser la carpeta «Principal»,
   * que no tiene `rama:nomExpediente`; sin CUI el SGDE registra el documento mal y el visor PDF falla.
   */
  nomExpedienteCui?: string
  /**
   * Rango de páginas dentro del índice del expediente (acumulativo). Si no se envían, se usa 1…paginas del archivo.
   */
  paginaInicioDoc?: number
  paginaFinDoc?: number
}

/** Metadatos HTTP de Azure solo admiten ASCII en la práctica; evita cabeceras inválidas. */
function valorMetaAzureAscii(val: string, maxLen = 400): string {
  let s = val.replace(/[^\x20-\x7e]/g, '_')
  if (s.length > maxLen) s = s.slice(0, maxLen)
  return s
}

export async function subirArchivoSgde(p: SubirSgdeParams): Promise<{ ok: boolean; detalle?: string }> {
  const { token, alfTicket, buffer, nombreArchivoSgde, nodeUuid, tipoDocumental, nivelAcceso } = p
  if (!alfTicket) return { ok: false, detalle: 'Sin alf_ticket en JWT' }

  const sas = await getSas(token)
  const sasToken = sas.sasToken ?? ''
  const container = sas.container ?? 'alfresco'
  const account = sas.account ?? 'stalfrescoprod'
  if (!sasToken) return { ok: false, detalle: 'Sin sasToken' }

  const metaBase = await getNodeMetadata(token, nodeUuid)
  const metaOverrides = p.metadata ?? {}
  const meta: Record<string, string> = { ...metaBase, ...metaOverrides }
  const nomExp = (meta.nomExpediente || p.nomExpedienteCui || '').replace(/\D/g, '').trim()
  if (!nomExp) {
    return {
      ok: false,
      detalle:
        'Falta el CUI en metadatos (rama:nomExpediente). El padre de subida es la carpeta Principal, que no incluye el expediente: indique el radicado de 23 dígitos (nomExpedienteCui).',
    }
  }
  meta.nomExpediente = nomExp
  const tipoLegible = tipoDocumentalLegible(tipoDocumental)
  const idDoc = p.orden ?? (await getSiguienteOrden(alfTicket, nodeUuid))
  const filesize = buffer.length
  const now = new Date()
  const hoy = now.toISOString().slice(0, 10)
  const blobUuid = randomUUID().replace(/-/g, '')
  const pathParts = [
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
  ]
  const blobPath = `${pathParts.join('/')}/${blobUuid}.bin`
  const pathData = `store://${blobPath}`

  let paginas = 1
  if (p.extension.toLowerCase() === '.pdf') {
    paginas = await contarPaginasPdfSgde(buffer)
  }
  const paginaInicio = p.paginaInicioDoc ?? 1
  const paginaFin = p.paginaFinDoc ?? paginas

  const formato = p.extension.toLowerCase() === '.pdf' ? 'PDF' : 'DOCX'
  const mimetype =
    p.mimeType ||
    (p.extension.toLowerCase() === '.pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')

  const payloadJwt = decodeJwtPayload(token)
  const username = String(payloadJwt.username ?? '')

  const fechaCarga = now.toISOString().replace(/:/g, '%3A')
  const azureUrl = `https://${account}.blob.core.windows.net/${container}/alf_data/contentstore/${blobPath}?${sasToken}`
  const azureHeaders: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'x-ms-blob-type': 'BlockBlob',
    'x-ms-meta-cui': valorMetaAzureAscii(meta.nomExpediente),
    'x-ms-meta-fecha_carga': fechaCarga,
    'x-ms-meta-originalname': valorMetaAzureAscii(nombreArchivoSgde),
    'x-ms-meta-username': valorMetaAzureAscii(username || 'usuario'),
    'x-ms-meta-uuid': 'temporal',
    'x-ms-version': '2025-05-05',
  }

  const ru = await fetch(azureUrl, {
    method: 'PUT',
    headers: azureHeaders,
    body: new Uint8Array(buffer),
  })
  if (!ru.ok) {
    const t = await ru.text()
    return { ok: false, detalle: `Azure PUT ${ru.status}: ${t.slice(0, 200)}` }
  }

  const s = (x: string | undefined) => (x == null ? '' : sanitizarNombre(String(x)))

  const nodeProps: Record<string, string | number> = {
    'rama:idDocumento': idDoc,
    'rama:nomExpediente': s(meta.nomExpediente),
    'rama:nombreSerie': s(meta.nombreSerie),
    'rama:nomOficinaProductora': s(meta.nomOficinaProductora),
    'rama:nomSubserie': s(meta.nomSubserie),
    'rama:codigoSubserie': s(meta.codigoSubserie),
    'rama:anexos': 'No',
    'rama:docPdfA': 'No',
    'rama:origen': 'Electronico',
    'rama:observacionesDoc': '',
    'rama:fechaDeclaracionArchivoD': hoy,
    'rama:fechaPublicacion': hoy,
    'rama:tipoDocumental': tipoLegible,
    'rama:palabrasClave': '',
    'rama:acceso': nivelAcceso,
    'cm:title': s(nombreArchivoSgde) || '-',
    'rama:paginaInicioDoc': paginaInicio,
    'rama:paginaFinDoc': paginaFin,
    'rama:tamano': filesize,
    'rama:formato': formato,
    'rama:paginas': paginas,
  }

  const body = {
    alf_token: alfTicket,
    node: {
      id: null,
      name: nombreArchivoSgde,
      nodeType: 'rama:documentos',
      properties: nodeProps,
      aspectNames: ['cm:titled'],
    },
    pathData,
    uuid: nodeUuid,
    mimetype,
    filesize,
    auditoria: {
      accion: 'Anadir archivo',
      despacho: '',
      nodoReferencia: '',
      path: '',
      usuario: username,
      descripcion: `Se ha anadido el archivo "${nombreArchivoSgde}"`,
      fechaRegistro: new Date().toLocaleString('sv-SE', { timeZone: 'America/Bogota' }).replace(' ', 'T') + '.000-05:00',
      registroId: null,
    },
  }

  const h = { ...HEADERS, Authorization: `Bearer ${token}` }
  const cr = await fetch(CREATE_URL, { method: 'POST', headers: h, body: JSON.stringify(body) })
  if (cr.ok) return { ok: true }
  const errText = await cr.text()
  return { ok: false, detalle: `createNodeAzure ${cr.status}: ${errText.slice(0, 400)}` }
}

export function normalizarRadicadoSgde(radicado: string): string {
  return radicado.replace(/\D/g, '')
}

/**
 * Credenciales SGDE: cuerpo de la petición (formulario) o variables de entorno SGDE_USER / SGDE_PASSWORD.
 * No persistimos contraseñas en el servidor.
 */
export function resolveSgdeCredentials(
  body?: Record<string, unknown> | null
): { usuario: string; password: string } | null {
  const rawU = body?.sgdeUsuario
  const rawP = body?.sgdePassword
  const bu = typeof rawU === 'string' ? rawU.trim() : ''
  const bp = typeof rawP === 'string' ? rawP : undefined
  const usuario = bu || process.env.SGDE_USER?.trim() || ''
  const password = bp !== undefined ? bp : process.env.SGDE_PASSWORD
  if (!usuario || password === undefined || password === null || String(password).length === 0) {
    return null
  }
  return { usuario, password: String(password) }
}

/** @deprecated Usar resolveSgdeCredentials(undefined) */
export function getSgdeCredentialsFromEnv(): { usuario: string; password: string } | null {
  return resolveSgdeCredentials(undefined)
}

/**
 * Lista archivos en una carpeta del SGDE (no carpetas).
 * Misma API Alfresco que usa getSiguienteOrden (children + properties).
 */
export async function listarDocumentosEnCarpeta(
  alfTicket: string,
  folderNodeUuid: string,
  maxItems = 500
): Promise<SgdeDocumentoListItem[]> {
  if (!alfTicket) return []
  const h = { ...HEADERS, Authorization: basicAuthAlfresco(alfTicket) }
  const url = `${NODES_URL}/${folderNodeUuid}/children?maxItems=${maxItems}&orderBy=rama%3AidDocumento%20asc&include=properties`
  const r = await fetch(url, { headers: h })
  if (!r.ok) return []
  const data = (await r.json()) as {
    list?: {
      entries?: Array<{
        entry?: {
          id?: string
          isFolder?: boolean
          name?: string
          properties?: Record<string, unknown>
        }
      }>
    }
  }
  const entries = data.list?.entries ?? []
  const out: SgdeDocumentoListItem[] = []
  for (const e of entries) {
    const entry = e.entry
    if (!entry?.id || entry.isFolder) continue
    const props = entry.properties ?? {}
    const idDoc = props['rama:idDocumento']
    const tam = props['rama:tamano']
    out.push({
      nodeId: entry.id,
      nombre: entry.name ?? '',
      tipoDocumental: String(props['rama:tipoDocumental'] ?? ''),
      idDocumento: idDoc != null && idDoc !== '' ? Number(idDoc) : null,
      formato: String(props['rama:formato'] ?? ''),
      tamano: tam != null && tam !== '' ? Number(tam) : null,
      acceso: String(props['rama:acceso'] ?? ''),
      fechaPublicacion: String(props['rama:fechaPublicacion'] ?? ''),
    })
  }
  return out
}

export type SgdeContentResult = {
  buffer: Buffer
  contentType: string
  fileName: string
}

/**
 * Descarga el binario del nodo (API Alfresco estándar).
 * @see https://api-explorer.alfresco.com/api-explorer/ — GET /nodes/{nodeId}/content
 */
export async function fetchNodeContentBinary(
  alfTicket: string,
  nodeId: string
): Promise<SgdeContentResult | null> {
  if (!alfTicket) return null
  const url = `${NODES_URL}/${nodeId}/content`
  const h = {
    ...HEADERS,
    Authorization: basicAuthAlfresco(alfTicket),
    Accept: 'application/octet-stream,*/*',
  }
  const r = await fetch(url, { headers: h })
  if (!r.ok) return null
  const contentType = r.headers.get('content-type') ?? 'application/octet-stream'
  let fileName = 'documento'
  const cd = r.headers.get('content-disposition')
  if (cd) {
    const m = /filename\*=UTF-8''([^;\s]+)|filename="([^"]+)"/i.exec(cd)
    const raw = m?.[1] || m?.[2]
    if (raw) {
      try {
        fileName = decodeURIComponent(raw.replace(/"/g, ''))
      } catch {
        fileName = raw
      }
    }
  }
  const buffer = Buffer.from(await r.arrayBuffer())
  return { buffer, contentType, fileName }
}

/** Comprueba que el nodo sea hijo directo de la carpeta del expediente (misma lista que en UI). */
export async function nodoEsHijoDeCarpeta(
  alfTicket: string,
  folderUuid: string,
  nodeId: string
): Promise<boolean> {
  const docs = await listarDocumentosEnCarpeta(alfTicket, folderUuid)
  return docs.some((d) => d.nodeId === nodeId)
}

/** El documento pertenece a algún cuaderno bajo Primera instancia (Principal, Medidas cautelares, etc.). */
export async function nodoEsHijoDeAlgunCuadernoPrimeraInstancia(
  alfTicket: string,
  expedienteNumero: string,
  nodeId: string
): Promise<boolean> {
  const primeraId = await resolverUuidPrimeraInstancia(alfTicket, expedienteNumero, '')
  if (!primeraId) return false
  const subs = await listarSubcarpetasCuadernos(alfTicket, primeraId)
  for (const sub of subs) {
    if (await nodoEsHijoDeCarpeta(alfTicket, sub.id, nodeId)) return true
  }
  return false
}

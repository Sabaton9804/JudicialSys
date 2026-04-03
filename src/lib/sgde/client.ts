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

/** UUID del nodo expediente en Alfresco (búsqueda por radicado). */
async function buscarNodoExpedienteId(
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
  const h = { ...HEADERS, Authorization: basicAuthAlfresco(alfTicket) }
  const url = `${NODES_URL}/${expId}/children?maxItems=50&orderBy=isFolder%20desc&include=path,properties`
  const res = await fetch(url, { headers: h })
  if (!res.ok) return null
  const children = ((await res.json()) as { list?: { entries?: AlfEntry[] } }).list?.entries ?? []

  let carpetaInstancia: string | undefined
  for (const e of children) {
    const entry = e.entry
    if (!entry?.isFolder) continue
    const name = (entry.name ?? '').trim()
    if (name.toLowerCase().includes('primera') || rutaDestino.toLowerCase().includes('c01') || !rutaDestino) {
      carpetaInstancia = entry.id
      if (name.toLowerCase().includes('primera')) break
    }
  }
  if (!carpetaInstancia && children.length) {
    carpetaInstancia = children[0]?.entry?.id
  }
  return carpetaInstancia ?? null
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
 */
export async function resolverUuidCarpeta(
  alfTicket: string,
  expedienteNumero: string,
  rutaDestino = ''
): Promise<string | null> {
  const carpetaInstancia = await resolverUuidPrimeraInstancia(alfTicket, expedienteNumero, rutaDestino)
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

function sanitizarNombre(nombre: string): string {
  if (!nombre?.trim()) return nombre
  let s = nombre.trim()
  s = s.replace(/[/\\:*?"<>|]/g, '')
  s = s.replace(/\s+/g, ' ').trim()
  return s
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

async function countPdfPages(buffer: Buffer): Promise<number> {
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
}

export async function subirArchivoSgde(p: SubirSgdeParams): Promise<{ ok: boolean; detalle?: string }> {
  const { token, alfTicket, buffer, nombreArchivoSgde, nodeUuid, tipoDocumental, nivelAcceso } = p
  if (!alfTicket) return { ok: false, detalle: 'Sin alf_ticket en JWT' }

  const sas = await getSas(token)
  const sasToken = sas.sasToken ?? ''
  const container = sas.container ?? 'alfresco'
  const account = sas.account ?? 'stalfrescoprod'
  if (!sasToken) return { ok: false, detalle: 'Sin sasToken' }

  const meta = p.metadata && Object.keys(p.metadata).length ? p.metadata : await getNodeMetadata(token, nodeUuid)
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
    paginas = await countPdfPages(buffer)
  }

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
    'x-ms-meta-cui': meta.nomExpediente ?? '',
    'x-ms-meta-fecha_carga': fechaCarga,
    'x-ms-meta-originalname': nombreArchivoSgde,
    'x-ms-meta-username': username,
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
    'cm:title': '-',
    'rama:paginaInicioDoc': 1,
    'rama:paginaFinDoc': paginas,
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

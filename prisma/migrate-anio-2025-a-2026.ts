/**
 * Migra radicados y rutas de archivos: año 2025 → 2026 en procesos existentes.
 * Ejecutar una vez: npx tsx prisma/migrate-anio-2025-a-2026.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function reemplazarAnioRadicado(radicado: string): string {
  return radicado.replace(/2025/g, '2026')
}

async function main() {
  const procesos = await prisma.proceso.findMany({
    select: { id: true, radicado: true },
  })

  let nProcesos = 0
  let nArchivos = 0

  for (const p of procesos) {
    if (!p.radicado.includes('2025')) continue
    const nuevoRadicado = reemplazarAnioRadicado(p.radicado)
    if (nuevoRadicado === p.radicado) continue

    const archivos = await prisma.archivoProceso.findMany({
      where: { procesoId: p.id },
      select: { id: true, nombreArchivo: true, bucketKey: true },
    })

    await prisma.$transaction(async (tx) => {
      for (const a of archivos) {
        const na = a.nombreArchivo.split(p.radicado).join(nuevoRadicado)
        const bk = a.bucketKey ? a.bucketKey.split(p.radicado).join(nuevoRadicado) : null
        if (na !== a.nombreArchivo || bk !== a.bucketKey) {
          await tx.archivoProceso.update({
            where: { id: a.id },
            data: { nombreArchivo: na, bucketKey: bk },
          })
          nArchivos += 1
        }
      }
      await tx.proceso.update({
        where: { id: p.id },
        data: { radicado: nuevoRadicado },
      })
      nProcesos += 1
    })
  }

  const ed = await prisma.edicionEstado.updateMany({
    where: { anio: 2025 },
    data: { anio: 2026 },
  })

  console.log(`✅ Procesos actualizados (radicado 2025→2026): ${nProcesos}`)
  console.log(`✅ Archivos ajustados (nombre/ruta): ${nArchivos}`)
  console.log(`✅ Ediciones de estado (año): ${ed.count}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

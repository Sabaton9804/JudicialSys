import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const count = await db.usuario.count()
    return NextResponse.json({ ok: true, usuarios: count })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

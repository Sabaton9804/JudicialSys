import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

type Row = { serverDate: Date }

export async function GET() {
  try {
    const r = await query<Row>('SELECT GETDATE() AS serverDate')
    const serverDate = r.recordset[0]?.serverDate
    return NextResponse.json({
      ok: true,
      serverDate: serverDate?.toISOString?.() ?? serverDate,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

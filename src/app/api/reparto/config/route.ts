import { NextResponse } from 'next/server'
import { tieneClaveOpenAI } from '@/lib/parse-reparto-ai'

export async function GET() {
  return NextResponse.json({
    usoIA: tieneClaveOpenAI(),
    tecnologia: tieneClaveOpenAI() ? 'OpenAI GPT-4o-mini' : 'Regex + pdf-parse + mammoth',
  })
}

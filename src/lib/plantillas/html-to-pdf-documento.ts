import puppeteer from 'puppeteer'

/**
 * HTML completo (con <html>) → PDF A4 (servidor Node).
 */
export async function htmlCompletoAPdfChromium(html: string): Promise<Buffer> {
  if (html.length > 12_000_000) {
    throw new Error('HTML demasiado grande para generar PDF')
  }
  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || process.env.CHROME_PATH?.trim() || undefined

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: executablePath || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    const buf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' },
    })
    return Buffer.from(buf)
  } finally {
    await browser.close()
  }
}

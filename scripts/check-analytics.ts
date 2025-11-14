import { chromium } from 'playwright'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  page.on('console', (msg) => {
    console.log(`[browser:${msg.type()}] ${msg.text()}`)
  })

  await page.goto('http://localhost:3000/analytics', { waitUntil: 'networkidle' })
  await page.waitForTimeout(5000)
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})


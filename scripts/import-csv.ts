import fs from 'fs'
import Papa from 'papaparse'

const companyId = '6cd16dd9-f693-47fa-957a-e224d244d4f2' // BudgetDog

async function importCSV() {
  try {
    // Check if CSV file exists
    const csvPath = './PCN_Test_Data__BudgetDog__-_PCN_Log__1_.csv'
    
    if (!fs.existsSync(csvPath)) {
      console.error(`❌ CSV file not found: ${csvPath}`)
      console.log('\n📝 Please place your CSV file in the root directory with this exact name:')
      console.log('   PCN_Test_Data__BudgetDog__-_PCN_Log__1_.csv')
      return
    }
    
    console.log('📊 Reading CSV file...')
    const csvFile = fs.readFileSync(csvPath, 'utf8')
    
    console.log('🔄 Parsing CSV...')
    const { data, errors, meta } = Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => {
        // Clean duplicate headers by keeping the first occurrence
        return header.trim()
      }
    })
    
    if (errors.length > 0) {
      console.log('⚠️  CSV parsing warnings:', errors.slice(0, 3))
    }
    
    console.log(`✅ Found ${data.length} rows to import`)
    console.log('\n📤 Uploading to API...')
    
    const response = await fetch('http://localhost:3000/api/appointments/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId,
        appointments: data
      })
    })
    
    const result = await response.json()
    
    console.log('\n📊 Import Results:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`✅ Imported: ${result.imported}`)
    console.log(`❌ Failed: ${result.failed}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━')
    
    if (result.results) {
      const failures = result.results.filter((r: any) => !r.success)
      if (failures.length > 0) {
        console.log('\n⚠️  Failed Imports:')
        failures.slice(0, 5).forEach((f: any) => {
          console.log(`   - ${f.appointment}: ${f.error}`)
        })
        if (failures.length > 5) {
          console.log(`   ... and ${failures.length - 5} more`)
        }
      }
    }
    
    console.log('\n✨ Import complete!')
    
  } catch (error: any) {
    console.error('❌ Import error:', error.message)
    process.exit(1)
  }
}

importCSV()


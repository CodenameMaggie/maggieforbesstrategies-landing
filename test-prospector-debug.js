/**
 * Debug Web Prospector
 * Tests the prospecting functionality and shows detailed logs
 */

const TEST_URL = process.env.TEST_URL || 'https://www.maggieforbesstrategies.com';

console.log('🔍 WEB PROSPECTOR DEBUG TEST');
console.log('====================================');
console.log(`Testing: ${TEST_URL}\n`);

async function testProspector() {
  try {
    console.log('📡 Calling web prospector API...\n');

    const response = await fetch(`${TEST_URL}/api/web-prospector`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'scan_web',
        data: {}
      })
    });

    console.log(`Response Status: ${response.status}\n`);

    const result = await response.json();

    console.log('=== RESPONSE ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('================\n');

    if (result.success) {
      const prospects = result.prospects || [];
      console.log(`✅ Scan completed`);
      console.log(`📊 Prospects found: ${prospects.length}\n`);

      if (prospects.length > 0) {
        console.log('🎯 PROSPECTS:\n');
        prospects.forEach((p, i) => {
          console.log(`${i + 1}. ${p.companyName}`);
          console.log(`   Contact: ${p.contactPerson}`);
          console.log(`   Signal: ${p.recentSignal}`);
          console.log(`   Industry: ${p.industry}`);
          console.log(`   Source: ${p.whereFound}`);
          console.log('');
        });
      } else {
        console.log('❌ NO PROSPECTS FOUND');
        console.log('\nPossible reasons:');
        console.log('1. Perplexity API returned no recent funding/hiring news');
        console.log('2. Validation filters are too strict');
        console.log('3. All found companies were duplicates');
        console.log('4. API rate limiting or errors\n');
      }
    } else {
      console.log(`❌ Error: ${result.error}\n`);
    }

    return result;

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return null;
  }
}

testProspector().then(() => {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Test complete - check logs above for details             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
});

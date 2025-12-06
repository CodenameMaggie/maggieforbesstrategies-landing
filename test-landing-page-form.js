/**
 * Landing Page Form Verification Test
 * Verifies the form exists on the landing page
 */

const TEST_URL = process.env.TEST_URL || 'https://www.maggieforbesstrategies.com';

console.log('🧪 LANDING PAGE FORM VERIFICATION');
console.log('====================================');
console.log(`Testing: ${TEST_URL}\n`);

async function testLandingPageForm() {
  try {
    console.log('📄 Fetching landing page...');
    const response = await fetch(TEST_URL);

    if (!response.ok) {
      throw new Error(`Failed to fetch landing page: ${response.status}`);
    }

    const html = await response.text();
    console.log('   ✅ Landing page loaded\n');

    // Check for form elements
    const checks = {
      'Form element': html.includes('id="inquiryForm"'),
      'Full name input': html.includes('id="fullName"'),
      'Email input': html.includes('id="email"'),
      'Phone input': html.includes('id="phone"'),
      'Company input': html.includes('id="company"'),
      'Notes textarea': html.includes('id="notes"'),
      'Submit button': html.includes('id="submitBtn"'),
      'Form submission script': html.includes('form.addEventListener(\'submit\''),
      'API endpoint': html.includes('/api/contacts'),
      'Success message': html.includes('form-message success'),
      'Error message': html.includes('form-message error'),
      'Lead source tracking': html.includes('website_landing_page')
    };

    console.log('🔍 Form Element Check:');
    let allPassed = true;
    for (const [check, passed] of Object.entries(checks)) {
      console.log(`   ${passed ? '✅' : '❌'} ${check}`);
      if (!passed) allPassed = false;
    }
    console.log('');

    // Check page structure
    console.log('📋 Page Structure:');
    console.log('   Form location: #inquiry section');
    console.log('   CTA buttons:', (html.match(/class="cta-button"/g) || []).length);
    console.log('   Calendly link: ' + (html.includes('calendly.com') ? 'Yes (as backup option)' : 'No'));
    console.log('');

    return allPassed;

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Run test
testLandingPageForm().then(success => {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  if (success) {
    console.log('║  ✅ LANDING PAGE FORM: VERIFIED                            ║');
    console.log('║                                                            ║');
    console.log('║  ✓ All form elements are present                          ║');
    console.log('║  ✓ Form submission logic implemented                      ║');
    console.log('║  ✓ API integration configured                             ║');
    console.log('║  ✓ Lead tracking enabled                                  ║');
    console.log('║                                                            ║');
    console.log('║  The landing page is now ready to capture leads!          ║');
  } else {
    console.log('║  ❌ LANDING PAGE FORM: ISSUES FOUND                        ║');
    console.log('║                                                            ║');
    console.log('║  Some form elements are missing or incorrect.             ║');
  }
  console.log('╚════════════════════════════════════════════════════════════╝');
  process.exit(success ? 0 : 1);
});

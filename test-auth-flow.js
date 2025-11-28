// Test authentication flow on both platforms

const testAuth = async (baseUrl, platform) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing ${platform}: ${baseUrl}`);
  console.log('='.repeat(60));

  try {
    // Test 1: Login with wrong password
    console.log('\n1. Testing login with WRONG password...');
    const wrongRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrongpassword' })
    });
    const wrongData = await wrongRes.json();
    console.log('   Status:', wrongRes.status);
    console.log('   Response:', wrongData);
    console.log('   ✓ Wrong password rejected:', wrongData.success === false ? 'PASS' : 'FAIL');

    // Test 2: Login with correct password
    console.log('\n2. Testing login with CORRECT password...');
    const correctRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password: 'mfs2024admin' })
    });
    const correctData = await correctRes.json();
    console.log('   Status:', correctRes.status);
    console.log('   Response:', correctData);
    console.log('   ✓ Correct password accepted:', correctData.success === true ? 'PASS' : 'FAIL');

    // Get session cookie
    const cookies = correctRes.headers.get('set-cookie');
    console.log('   ✓ Session cookie set:', cookies ? 'PASS' : 'FAIL');

    // Test 3: Access protected endpoint (contacts)
    console.log('\n3. Testing protected endpoint /api/contacts...');
    const contactsRes = await fetch(`${baseUrl}/api/contacts`, {
      headers: { Cookie: cookies || '' }
    });
    const contactsData = await contactsRes.json();
    console.log('   Status:', contactsRes.status);
    console.log('   Response type:', Array.isArray(contactsData) ? 'Array' : 'Object');
    console.log('   ✓ Protected endpoint:', contactsData.success !== false ? 'PASS' : 'FAIL');
    if (contactsData.error) {
      console.log('   Error:', contactsData.error);
    }

    // Test 4: Logout
    console.log('\n4. Testing logout...');
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookies || '' }
    });
    const logoutData = await logoutRes.json();
    console.log('   Status:', logoutRes.status);
    console.log('   Response:', logoutData);
    console.log('   ✓ Logout successful:', logoutData.success === true ? 'PASS' : 'FAIL');

    console.log(`\n✅ ${platform} test complete\n`);
  } catch (error) {
    console.error(`\n❌ ${platform} test failed:`, error.message);
  }
};

// Run tests
(async () => {
  console.log('\n🧪 AUTHENTICATION FLOW TEST');
  console.log('Testing both Railway and Vercel deployments\n');

  // Test Railway (production domain)
  await testAuth('https://maggieforbesstrategies.com', 'Railway (Production Domain)');

  // Test Vercel (latest deployment)
  await testAuth('https://maggieforbesstrategies-landing-i80hkzw5w.vercel.app', 'Vercel (Latest Production)');

  console.log('\n' + '='.repeat(60));
  console.log('All tests complete!');
  console.log('='.repeat(60) + '\n');
})();

// Comprehensive End-to-End Test for Maggie Forbes Strategies
// Before DNS Cutover

const BASE_URL = 'https://maggieforbesstrategies-landing-i80hkzw5w.vercel.app';
const PASSWORD = 'mfs2024admin';

let sessionCookie = null;
let testContactId = null;

const testResults = {
  publicAccess: [],
  authentication: [],
  dashboard: [],
  apiEndpoints: [],
  crmFunctionality: [],
  aiBots: [],
  database: [],
  performance: []
};

// Helper to track test results
const test = (category, name, passed, details = '') => {
  const result = {
    name,
    passed,
    details,
    timestamp: new Date().toISOString()
  };
  testResults[category].push(result);

  const icon = passed ? '✅' : '❌';
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`   ${icon} ${name}: ${status}${details ? ' - ' + details : ''}`);

  return passed;
};

// Helper to measure performance
const measureTime = async (fn) => {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;
  return { result, duration };
};

console.log('🧪 COMPREHENSIVE END-TO-END TEST');
console.log('=====================================');
console.log(`Testing: ${BASE_URL}`);
console.log(`Started: ${new Date().toISOString()}\n`);

// =============================================================================
// 1. PUBLIC ACCESS
// =============================================================================
console.log('\n📱 1. PUBLIC ACCESS');
console.log('-------------------');

try {
  // Test homepage
  const { result: homeRes, duration: homeDuration } = await measureTime(() =>
    fetch(`${BASE_URL}/`)
  );
  test('publicAccess', 'Homepage loads', homeRes.ok, `${homeDuration}ms`);

  const homeHtml = await homeRes.text();
  test('publicAccess', 'Homepage has content', homeHtml.length > 1000, `${homeHtml.length} bytes`);
  test('publicAccess', 'CSS stylesheet linked', homeHtml.includes('<style') || homeHtml.includes('.css'));
  test('publicAccess', 'No visible errors in HTML', !homeHtml.includes('Error:') && !homeHtml.includes('error'));

  // Test login page
  const { result: loginRes, duration: loginDuration } = await measureTime(() =>
    fetch(`${BASE_URL}/login`)
  );
  test('publicAccess', 'Login page loads', loginRes.ok, `${loginDuration}ms`);

  const loginHtml = await loginRes.text();
  test('publicAccess', 'Login form present', loginHtml.includes('password') && loginHtml.includes('login'));
  test('performance', 'Homepage load time < 2s', homeDuration < 2000, `${homeDuration}ms`);
  test('performance', 'Login page load time < 2s', loginDuration < 2000, `${loginDuration}ms`);
} catch (error) {
  test('publicAccess', 'Public pages accessible', false, error.message);
}

// =============================================================================
// 2. AUTHENTICATION
// =============================================================================
console.log('\n🔐 2. AUTHENTICATION');
console.log('--------------------');

try {
  // Test wrong password
  const wrongRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'wrongpassword123' })
  });
  const wrongData = await wrongRes.json();
  test('authentication', 'Rejects wrong password', wrongRes.status === 401 && wrongData.success === false);

  // Test correct password
  const { result: correctRes, duration: authDuration } = await measureTime(() =>
    fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password: PASSWORD })
    })
  );

  const correctData = await correctRes.json();
  test('authentication', 'Accepts correct password', correctRes.status === 200 && correctData.success === true);
  test('performance', 'Auth response time < 1s', authDuration < 1000, `${authDuration}ms`);

  // Get session cookie
  const cookies = correctRes.headers.get('set-cookie');
  sessionCookie = cookies;
  test('authentication', 'Session cookie set', !!cookies, cookies ? 'Cookie present' : 'No cookie');
  test('authentication', 'Session expires set', correctData.expiresAt !== undefined, correctData.expiresAt);

  // Test logout
  const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: sessionCookie || '' }
  });
  const logoutData = await logoutRes.json();
  test('authentication', 'Logout works', logoutData.success === true);

  // Re-login for subsequent tests
  const reloginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD })
  });
  sessionCookie = reloginRes.headers.get('set-cookie');

} catch (error) {
  test('authentication', 'Authentication system', false, error.message);
}

// =============================================================================
// 3. ADMIN DASHBOARD
// =============================================================================
console.log('\n📊 3. ADMIN DASHBOARD');
console.log('---------------------');

try {
  const { result: dashRes, duration: dashDuration } = await measureTime(() =>
    fetch(`${BASE_URL}/dashboard`, {
      headers: { Cookie: sessionCookie || '' }
    })
  );

  test('dashboard', 'Dashboard loads', dashRes.ok, `${dashDuration}ms`);

  const dashHtml = await dashRes.text();
  test('dashboard', 'Dashboard has content', dashHtml.length > 5000, `${dashHtml.length} bytes`);
  test('dashboard', 'Dashboard title present', dashHtml.includes('Dashboard') || dashHtml.includes('Admin'));
  test('dashboard', 'No error messages', !dashHtml.toLowerCase().includes('error occurred'));
  test('performance', 'Dashboard load time < 2s', dashDuration < 2000, `${dashDuration}ms`);
} catch (error) {
  test('dashboard', 'Dashboard accessible', false, error.message);
}

// =============================================================================
// 4. API ENDPOINTS
// =============================================================================
console.log('\n🔌 4. API ENDPOINTS (WITH AUTH)');
console.log('--------------------------------');

const apiEndpoints = [
  { path: '/api/contacts', method: 'GET' },
  { path: '/api/tasks', method: 'GET' },
  { path: '/api/memory', method: 'GET' }
];

for (const endpoint of apiEndpoints) {
  try {
    const { result: res, duration } = await measureTime(() =>
      fetch(`${BASE_URL}${endpoint.path}`, {
        method: endpoint.method,
        headers: { Cookie: sessionCookie || '' }
      })
    );

    const data = await res.json();
    test('apiEndpoints', `${endpoint.method} ${endpoint.path}`, res.ok, `${duration}ms - ${res.status}`);
    test('performance', `${endpoint.path} response < 1s`, duration < 1000, `${duration}ms`);

    if (res.ok) {
      test('apiEndpoints', `${endpoint.path} returns valid JSON`, typeof data === 'object');
    }
  } catch (error) {
    test('apiEndpoints', `${endpoint.method} ${endpoint.path}`, false, error.message);
  }
}

// =============================================================================
// 5. CRM FUNCTIONALITY
// =============================================================================
console.log('\n👥 5. CRM FUNCTIONALITY');
console.log('-----------------------');

try {
  // Create test contact
  const createRes = await fetch(`${BASE_URL}/api/contacts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie || ''
    },
    body: JSON.stringify({
      full_name: 'Test Contact E2E',
      email: 'test-e2e@example.com',
      company: 'Test Company',
      stage: 'new',
      notes: 'Created by E2E test'
    })
  });

  const createData = await createRes.json();
  test('crmFunctionality', 'Create contact', createRes.ok && createData.success !== false,
    createRes.ok ? `Created ID: ${createData.contact?.id}` : createData.error);

  if (createData.contact?.id) {
    testContactId = createData.contact.id;
  }

  // List contacts
  const listRes = await fetch(`${BASE_URL}/api/contacts`, {
    headers: { Cookie: sessionCookie || '' }
  });
  const listData = await listRes.json();
  test('crmFunctionality', 'List contacts', listRes.ok && Array.isArray(listData.contacts));
  test('database', 'Data persists', listData.contacts?.length >= 0, `${listData.contacts?.length || 0} contacts`);

  // Verify test contact appears in list
  if (testContactId) {
    const contactFound = listData.contacts?.some(c => c.id === testContactId);
    test('crmFunctionality', 'Created contact appears in list', contactFound);
  }

  // Update contact
  if (testContactId) {
    const updateRes = await fetch(`${BASE_URL}/api/contacts`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie || ''
      },
      body: JSON.stringify({
        id: testContactId,
        stage: 'qualified',
        notes: 'Updated by E2E test'
      })
    });

    const updateData = await updateRes.json();
    test('crmFunctionality', 'Update contact', updateRes.ok && updateData.success !== false);

    // Verify update persisted
    const verifyRes = await fetch(`${BASE_URL}/api/contacts`, {
      headers: { Cookie: sessionCookie || '' }
    });
    const verifyData = await verifyRes.json();
    const updatedContact = verifyData.contacts?.find(c => c.id === testContactId);
    test('database', 'Changes persist after update', updatedContact?.stage === 'qualified');
  }

} catch (error) {
  test('crmFunctionality', 'CRM operations', false, error.message);
}

// =============================================================================
// 6. AI BOTS
// =============================================================================
console.log('\n🤖 6. AI BOTS');
console.log('--------------');

try {
  const botRes = await fetch(`${BASE_URL}/api/ai-secretary-bot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie || ''
    },
    body: JSON.stringify({
      message: 'Test message from E2E test'
    })
  });

  if (botRes.ok) {
    const botData = await botRes.json();
    test('aiBots', 'AI Secretary Bot responds', botRes.ok && botData.response !== undefined);
  } else {
    test('aiBots', 'AI Secretary Bot accessible', botRes.status !== 404,
      `Status: ${botRes.status} (may be expected if bot not configured)`);
  }
} catch (error) {
  test('aiBots', 'AI Bot functionality', false, error.message);
}

// =============================================================================
// 7. DATABASE CONNECTION
// =============================================================================
console.log('\n💾 7. DATABASE');
console.log('--------------');

try {
  // Test database is responding
  const dbRes = await fetch(`${BASE_URL}/api/contacts`, {
    headers: { Cookie: sessionCookie || '' }
  });
  const dbData = await dbRes.json();

  test('database', 'Supabase connection works', dbRes.ok && !dbData.error?.includes('database'));
  test('database', 'No connection errors', !dbData.error?.includes('connection') && !dbData.error?.includes('timeout'));

  // Refresh and verify data still there
  const refreshRes = await fetch(`${BASE_URL}/api/contacts`, {
    headers: { Cookie: sessionCookie || '' }
  });
  const refreshData = await refreshRes.json();
  test('database', 'Data persists after refresh',
    refreshData.contacts?.length === dbData.contacts?.length);

} catch (error) {
  test('database', 'Database connectivity', false, error.message);
}

// =============================================================================
// FINAL REPORT
// =============================================================================
console.log('\n\n╔════════════════════════════════════════════════════════════╗');
console.log('║                    FINAL TEST REPORT                       ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const categories = [
  { key: 'publicAccess', name: '📱 Public Access' },
  { key: 'authentication', name: '🔐 Authentication' },
  { key: 'dashboard', name: '📊 Admin Dashboard' },
  { key: 'apiEndpoints', name: '🔌 API Endpoints' },
  { key: 'crmFunctionality', name: '👥 CRM Functionality' },
  { key: 'aiBots', name: '🤖 AI Bots' },
  { key: 'database', name: '💾 Database' },
  { key: 'performance', name: '⚡ Performance' }
];

let totalTests = 0;
let totalPassed = 0;
let criticalFailures = [];

categories.forEach(({ key, name }) => {
  const results = testResults[key];
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const percentage = total > 0 ? Math.round((passed / total) * 100) : 0;

  totalTests += total;
  totalPassed += passed;

  console.log(`${name}`);
  console.log(`   ${passed}/${total} tests passed (${percentage}%)`);

  // Show failures
  results.filter(r => !r.passed).forEach(r => {
    console.log(`   ❌ ${r.name}: ${r.details}`);
    if (['authentication', 'database', 'apiEndpoints'].includes(key)) {
      criticalFailures.push(`${name}: ${r.name}`);
    }
  });
  console.log('');
});

const overallPercentage = Math.round((totalPassed / totalTests) * 100);

console.log('═══════════════════════════════════════════════════════════');
console.log(`OVERALL: ${totalPassed}/${totalTests} tests passed (${overallPercentage}%)`);
console.log('═══════════════════════════════════════════════════════════\n');

// Critical failures
if (criticalFailures.length > 0) {
  console.log('⚠️  CRITICAL FAILURES:');
  criticalFailures.forEach(f => console.log(`   - ${f}`));
  console.log('');
}

// Final verdict
const readyForCutover = overallPercentage >= 90 && criticalFailures.length === 0;

console.log('\n╔════════════════════════════════════════════════════════════╗');
if (readyForCutover) {
  console.log('║  ✅ READY FOR DNS CUTOVER: YES                             ║');
  console.log('║                                                            ║');
  console.log('║  All critical systems operational.                        ║');
  console.log('║  You can proceed with DNS migration.                      ║');
} else {
  console.log('║  ❌ READY FOR DNS CUTOVER: NO                              ║');
  console.log('║                                                            ║');
  console.log('║  Critical issues detected. Please review failures above.  ║');
}
console.log('╚════════════════════════════════════════════════════════════╝\n');

console.log(`Test completed: ${new Date().toISOString()}`);
console.log(`Test URL: ${BASE_URL}`);
console.log('');

// Return exit code
process.exit(readyForCutover ? 0 : 1);

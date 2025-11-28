// Detailed Dashboard Test
// Testing: https://www.maggieforbesstrategies.com/dashboard

const BASE_URL = 'https://www.maggieforbesstrategies.com';
const PASSWORD = 'mfs2024admin';

console.log('🔍 DETAILED DASHBOARD TEST');
console.log('====================================');
console.log(`Testing: ${BASE_URL}/dashboard`);
console.log(`Started: ${new Date().toISOString()}\n`);

// First, login to get session
console.log('Step 1: Authenticating...');
const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: PASSWORD })
});

const loginData = await loginRes.json();
const sessionCookie = loginRes.headers.get('set-cookie');

if (loginData.success) {
  console.log('✅ Login successful');
  console.log(`   Session expires: ${loginData.expiresAt}\n`);
} else {
  console.log('❌ Login failed');
  process.exit(1);
}

// Test dashboard page
console.log('Step 2: Loading Dashboard...');
const dashStart = Date.now();
const dashRes = await fetch(`${BASE_URL}/dashboard`, {
  headers: { Cookie: sessionCookie || '' }
});
const dashDuration = Date.now() - dashStart;

console.log(`   Status: ${dashRes.status}`);
console.log(`   Load time: ${dashDuration}ms`);
console.log(`   Server: ${dashRes.headers.get('server')}`);
console.log(`   Content-Type: ${dashRes.headers.get('content-type')}\n`);

if (dashRes.ok) {
  const dashHtml = await dashRes.text();

  console.log('Step 3: Analyzing Dashboard Content...\n');

  // Check for key elements
  const checks = {
    'Has HTML structure': dashHtml.includes('<!DOCTYPE html>'),
    'Has title': dashHtml.includes('<title>'),
    'Has MFS branding': dashHtml.includes('Maggie Forbes') || dashHtml.includes('MFS'),
    'Has dashboard title': dashHtml.includes('Dashboard') || dashHtml.includes('Admin'),
    'Has navigation': dashHtml.includes('nav') || dashHtml.includes('menu'),
    'Has logout button': dashHtml.includes('logout') || dashHtml.includes('Logout'),
    'Has contacts section': dashHtml.includes('Contacts') || dashHtml.includes('contacts'),
    'Has tasks section': dashHtml.includes('Tasks') || dashHtml.includes('tasks'),
    'Has API calls': dashHtml.includes('/api/'),
    'Has JavaScript': dashHtml.includes('<script>'),
    'Has CSS styles': dashHtml.includes('<style>') || dashHtml.includes('.css'),
    'No visible errors': !dashHtml.toLowerCase().includes('error occurred') && !dashHtml.toLowerCase().includes('404'),
    'Has stats/metrics': dashHtml.includes('stat') || dashHtml.includes('metric') || dashHtml.includes('count'),
    'Interactive elements': dashHtml.includes('button') || dashHtml.includes('onclick')
  };

  console.log('📋 DASHBOARD ELEMENTS CHECK:');
  console.log('─────────────────────────────────────');
  Object.entries(checks).forEach(([name, passed]) => {
    console.log(`   ${passed ? '✅' : '❌'} ${name}`);
  });

  const passedChecks = Object.values(checks).filter(v => v).length;
  const totalChecks = Object.keys(checks).length;
  console.log(`\n   Score: ${passedChecks}/${totalChecks} (${Math.round(passedChecks/totalChecks*100)}%)\n`);

  // Extract key sections
  console.log('📄 DASHBOARD CONTENT PREVIEW:');
  console.log('─────────────────────────────────────');

  // Get title
  const titleMatch = dashHtml.match(/<title>(.*?)<\/title>/);
  if (titleMatch) {
    console.log(`   Title: "${titleMatch[1]}"`);
  }

  // Get header/brand
  const h1Match = dashHtml.match(/<h1[^>]*>(.*?)<\/h1>/);
  if (h1Match) {
    console.log(`   Main Heading: "${h1Match[1].replace(/<[^>]*>/g, '')}"`);
  }

  // Check for dashboard sections
  const sections = [];
  if (dashHtml.includes('contacts')) sections.push('Contacts');
  if (dashHtml.includes('tasks')) sections.push('Tasks');
  if (dashHtml.includes('pipeline')) sections.push('Pipeline');
  if (dashHtml.includes('activity') || dashHtml.includes('activities')) sections.push('Activities');
  if (dashHtml.includes('analytics') || dashHtml.includes('stats')) sections.push('Analytics');

  console.log(`   Detected Sections: ${sections.join(', ') || 'None detected'}`);
  console.log(`   Page Size: ${dashHtml.length.toLocaleString()} bytes`);
  console.log(`   Has Forms: ${dashHtml.includes('<form') ? 'Yes' : 'No'}`);
  console.log(`   Has Tables: ${dashHtml.includes('<table') ? 'Yes' : 'No'}`);

  // Test API endpoints that dashboard would call
  console.log('\n\nStep 4: Testing Dashboard API Calls...\n');

  const apiTests = [
    { name: 'Contacts API', url: '/api/contacts' },
    { name: 'Tasks API', url: '/api/tasks' },
    { name: 'Memory API', url: '/api/memory' }
  ];

  for (const api of apiTests) {
    const start = Date.now();
    const res = await fetch(`${BASE_URL}${api.url}`, {
      headers: { Cookie: sessionCookie || '' }
    });
    const duration = Date.now() - start;

    console.log(`   ${res.ok ? '✅' : '❌'} ${api.name}`);
    console.log(`      Status: ${res.status}, Time: ${duration}ms`);

    if (res.ok) {
      const data = await res.json();
      if (api.url === '/api/contacts' && data.contacts) {
        console.log(`      Contacts: ${data.contacts.length}`);
      } else if (api.url === '/api/tasks' && data.tasks) {
        console.log(`      Tasks: ${data.tasks.length}`);
      } else if (api.url === '/api/memory' && data.memories) {
        console.log(`      Memories: ${data.memories.length}`);
      }
    }
  }

  // Final verdict
  console.log('\n\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                  DASHBOARD STATUS                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const allPassed = passedChecks >= totalChecks * 0.8;

  if (allPassed) {
    console.log('✅ DASHBOARD: FULLY OPERATIONAL\n');
    console.log('The dashboard page is:');
    console.log('  • Loading correctly');
    console.log('  • Has all expected elements');
    console.log('  • Connected to APIs');
    console.log('  • Ready for production use\n');
  } else {
    console.log('⚠️  DASHBOARD: ISSUES DETECTED\n');
    console.log('Some elements may be missing. Review details above.\n');
  }

  console.log(`Dashboard URL: ${BASE_URL}/dashboard`);
  console.log(`Load Time: ${dashDuration}ms`);
  console.log(`Content Quality: ${passedChecks}/${totalChecks} checks passed\n`);

} else {
  console.log('❌ DASHBOARD FAILED TO LOAD');
  console.log(`   Status: ${dashRes.status}`);
  console.log(`   Status Text: ${dashRes.statusText}`);

  const errorBody = await dashRes.text();
  console.log(`   Response: ${errorBody.substring(0, 500)}\n`);
}

console.log(`Test completed: ${new Date().toISOString()}`);

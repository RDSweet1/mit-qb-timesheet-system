# PowerShell script to run Playwright test
Write-Host "Installing Playwright globally if not already installed..." -ForegroundColor Yellow
npm install -g playwright@latest 2>&1 | Out-Null

Write-Host "Installing Chromium browser..." -ForegroundColor Yellow
playwright install chromium 2>&1 | Out-Null

Write-Host "Running test script..." -ForegroundColor Green

# Create test script
$testScript = @'
const { chromium } = require('playwright');

(async () => {
  console.log('[1/8] Starting browser...');
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  // Capture console logs
  const logs = [];
  page.on('console', msg => {
    const text = `[${msg.type().toUpperCase()}] ${msg.text()}`;
    logs.push(text);
    console.log(text);
  });

  page.on('pageerror', error => {
    const text = `[ERROR] ${error.message}`;
    logs.push(text);
    console.log(text);
  });

  console.log('[2/8] Navigating to production site...');
  await page.goto('https://rdsweet1.github.io/mit-qb-frontend/');

  console.log('[3/8] Waiting for page to load...');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  console.log('[4/8] Taking screenshot of main page...');
  await page.screenshot({ path: 'test-results/01-main-page.png', fullPage: true });

  console.log('[5/8] Looking for login button...');
  const loginButton = await page.locator('button:has-text("Sign in with Microsoft")').first();
  const isVisible = await loginButton.isVisible().catch(() => false);

  if (!isVisible) {
    console.log('[ERROR] Login button not found!');
    await browser.close();
    return;
  }

  console.log('[SUCCESS] Login button found!');

  console.log('[6/8] Setting up popup handler...');
  const popupPromise = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);

  console.log('[7/8] Clicking login button...');
  await loginButton.click();

  console.log('[8/8] Waiting for Microsoft login popup...');
  await page.waitForTimeout(3000);

  const popup = await popupPromise;

  if (popup) {
    console.log('[SUCCESS] Login popup opened!');
    console.log(`Popup URL: ${popup.url()}`);
    await popup.screenshot({ path: 'test-results/02-popup.png' });

    // Wait a bit to see what happens
    await page.waitForTimeout(5000);
  } else {
    console.log('[FAILURE] No login popup detected!');
    console.log('Possible reasons:');
    console.log('1. Azure redirect URI not configured');
    console.log('2. Popup was blocked');
    console.log('3. JavaScript error preventing popup');
    await page.screenshot({ path: 'test-results/02-after-click.png', fullPage: true });
  }

  console.log('\n=== Console Logs Summary ===');
  logs.forEach(log => console.log(log));

  console.log('\nClosing browser in 5 seconds...');
  await page.waitForTimeout(5000);

  await browser.close();
  console.log('[DONE] Test complete!');
})().catch(error => {
  console.error('[FATAL ERROR]', error);
  process.exit(1);
});
'@

# Save test script
mkdir -p test-results 2>&1 | Out-Null
$testScript | Out-File -FilePath "test-results\test-login.js" -Encoding UTF8

# Run the test
Write-Host "Executing test..." -ForegroundColor Cyan
node "test-results\test-login.js"

Write-Host "`nTest complete! Check test-results folder for screenshots." -ForegroundColor Green

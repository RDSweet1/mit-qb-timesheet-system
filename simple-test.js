// Simple test using puppeteer
const puppeteer = require('puppeteer');

(async () => {
  console.log('[1/7] Launching browser...');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Capture console logs
  page.on('console', msg => console.log(`[PAGE ${msg.type()}]`, msg.text()));
  page.on('pageerror', error => console.log(`[PAGE ERROR]`, error.message));
  page.on('response', response => {
    if (!response.ok()) {
      console.log(`[HTTP ${response.status()}]`, response.url());
    }
  });

  console.log('[2/7] Navigating to site...');
  await page.goto('https://rdsweet1.github.io/mit-qb-frontend/', {
    waitUntil: 'networkidle2'
  });

  console.log('[3/7] Taking screenshot...');
  await page.screenshot({ path: 'screenshot-1-initial.png', fullPage: true });

  console.log('[4/7] Checking for login button...');
  const loginButtonSelector = 'button:has-text("Sign in with Microsoft")';

  try {
    await page.waitForSelector('button', { timeout: 5000 });
    console.log('[SUCCESS] Found button elements');

    const buttons = await page.$$('button');
    console.log(`[INFO] Found ${buttons.length} button(s) on page`);

    for (let i = 0; i < buttons.length; i++) {
      const text = await buttons[i].evaluate(el => el.textContent);
      console.log(`  Button ${i + 1}: "${text}"`);
    }
  } catch (e) {
    console.log('[ERROR] No buttons found:', e.message);
  }

  console.log('[5/7] Attempting to click login button...');

  try {
    const loginButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(btn => btn.textContent.includes('Sign in with Microsoft'));
    });

    if (loginButton) {
      console.log('[SUCCESS] Found login button via text search');

      // Set up listener for new pages/popups before clicking
      const newPagePromise = new Promise(resolve => {
        browser.once('targetcreated', target => {
          console.log('[POPUP] New target created:', target.url());
          resolve(target);
        });
        setTimeout(() => resolve(null), 5000);
      });

      await loginButton.asElement().click();
      console.log('[6/7] Clicked login button, waiting for popup...');

      const newTarget = await newPagePromise;

      if (newTarget) {
        console.log('[SUCCESS] Popup/redirect detected!');
        const newPage = await newTarget.page();
        console.log(`[POPUP URL] ${newPage.url()}`);
        await newPage.screenshot({ path: 'screenshot-2-popup.png' });
      } else {
        console.log('[FAILURE] No popup detected after 5 seconds');
        console.log('[INFO] Checking if anything changed on current page...');
        await page.screenshot({ path: 'screenshot-2-after-click.png', fullPage: true });
      }
    } else {
      console.log('[ERROR] Could not find login button');
    }
  } catch (error) {
    console.log('[ERROR] Failed to click button:', error.message);
  }

  console.log('[7/7] Waiting 10 seconds before closing...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  await browser.close();
  console.log('[DONE] Test complete!');
})().catch(error => {
  console.error('[FATAL]', error);
  process.exit(1);
});

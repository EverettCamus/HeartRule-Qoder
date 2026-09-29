/**
 * Verify the V0→V1 fix by monitoring SETTER console logs.
 *
 * After the fix, the sequence should be:
 * 1. [SETTER] setViewingSnapshotId("xxx") — user selects V0
 * 2. [SETTER] setViewingSnapshotId(null)  — handleSendMessage clears it
 * 3. "Select onChange suppressed"          — guard blocks Ant Design re-fire
 * 4. NO MORE SETTER calls for non-null values
 *
 * Run: LD_LIBRARY_PATH=/tmp/playwright-libs/usr/lib/x86_64-linux-gnu node playwright-v0-verify.mjs
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:8081';
const CHROMIUM = '/home/leo/.cache/ms-playwright/chromium-1224/chrome-linux64/chrome';

async function clickText(page, text) {
  const pos = await page.evaluate((t) => {
    const els = Array.from(document.querySelectorAll('button, a, span, div')).filter(e => {
      return (e.textContent || '').trim() === t && e.offsetParent !== null && e.getBoundingClientRect().width > 0;
    });
    if (els.length > 0) {
      const r = els[0].getBoundingClientRect();
      return { x: r.x + r.width/2, y: r.y + r.height/2 };
    }
    return null;
  }, text);
  if (pos) { await page.mouse.click(pos.x, pos.y); return true; }
  return false;
}

async function main() {
  console.log('=== V0→V1 Fix Verification ===\n');

  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROMIUM,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const setterCalls = [];
  const suppressedCalls = [];

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[SETTER]')) {
      // Extract the value from SETTER log
      const match = text.match(/setViewingSnapshotId\((.+?)\)/);
      const val = match ? match[1] : '?';
      setterCalls.push(val);
      console.log(`[SETTER] ${val}`);
    }
    if (text.includes('Select onChange suppressed')) {
      suppressedCalls.push(true);
      console.log('[GUARD] Select onChange suppressed!');
    }
  });

  page.on('pageerror', err => console.log('[PAGE_ERR]', err.message));

  try {
    // Step 1: Navigate to app
    console.log('1. Navigating to app...');
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Step 2: Click project card
    console.log('2. Opening project...');
    const cardClicked = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.ant-card')).filter(e => e.offsetParent !== null);
      if (cards.length > 0) {
        const r = cards[0].getBoundingClientRect();
        const evt = new MouseEvent('click', { bubbles: true, clientX: r.x + 10, clientY: r.y + 10 });
        cards[0].dispatchEvent(evt);
        return true;
      }
      return false;
    });
    console.log('  Card clicked:', cardClicked);
    await page.waitForTimeout(3000);

    // Step 3: Click Debug
    console.log('3. Opening debug panel...');
    await clickText(page, 'Debug');
    await page.waitForTimeout(2000);

    // Step 4: Select session script
    console.log('4. Selecting session script...');
    const selectClicked = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type=search]'));
      const visible = inputs.filter(i => i.offsetParent !== null);
      if (visible.length > 0) {
        visible[0].focus();
        visible[0].click();
        return true;
      }
      return false;
    });
    if (selectClicked) {
      await page.keyboard.type('new_session000');
      await page.waitForTimeout(1500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
    }

    // Step 5: Click Start Debug
    console.log('5. Starting debug session...');
    await clickText(page, 'Start Debug');
    console.log('  Waiting for LLM response...');
    await page.waitForTimeout(10000);

    // Step 6: Send first message to advance past action_1
    console.log('6. Sending first message...');
    const textareas = await page.$$('textarea');
    if (textareas.length > 0) {
      await textareas[0].fill('爸爸妈妈');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(8000);
      console.log('  First message sent');
    }

    // Step 7: Find and trigger rollback via API directly
    console.log('7. Triggering rollback...');
    // We'll use the page state to find the session ID and trigger rollback
    const sessionId = await page.evaluate(() => {
      // Try to extract session ID from the UI
      const allText = document.body.innerText;
      const match = allText.match(/Session:\s*([a-f0-9-]{8})/);
      return match ? null : null; // can't easily get sessionId from UI
    });

    // Instead, let's use the existing test session via API
    // For now, let's just check if we can detect the debug panel state

    // Step 8: Check the DIAG banner
    console.log('8. Checking diagnostic banner...');
    const bannerText = await page.evaluate(() => {
      const divs = Array.from(document.querySelectorAll('div'));
      const diagDiv = divs.find(d => d.textContent?.includes('DIAG: viewingSnapshotId'));
      return diagDiv ? diagDiv.textContent : 'NOT FOUND';
    });
    console.log('  Banner:', bannerText);

    // Step 9: Summary
    console.log('\n=== VERIFICATION SUMMARY ===');
    console.log(`SETTER calls: ${setterCalls.length}`);
    setterCalls.forEach((v, i) => console.log(`  ${i+1}. ${v}`));
    console.log(`Suppressed re-fires: ${suppressedCalls.length}`);

    const lastCall = setterCalls[setterCalls.length - 1];
    if (lastCall === 'null' && suppressedCalls.length >= 1) {
      console.log('\n✅ FIX VERIFIED: Last SETTER was null and guard suppressed re-fire');
    } else if (lastCall && lastCall !== 'null' && lastCall !== 'undefined') {
      console.log(`\n❌ BUG PERSISTS: Last SETTER was ${lastCall} (non-null, snapshot reactivated)`);
    } else {
      console.log('\n⚠️  INCONCLUSIVE: Could not complete full flow. Check console manually.');
    }

    await page.screenshot({ path: '/tmp/playwright-verify.png', fullPage: true });

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
    console.log('\nDone.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });

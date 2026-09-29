/**
 * Playwright reproduction of V0→V1 switch bug.
 * Run with: LD_LIBRARY_PATH=/tmp/playwright-libs/usr/lib/x86_64-linux-gnu node playwright-v0-test.mjs
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:8081';
const API = 'http://localhost:3000/api';
const CHROMIUM = '/home/leo/.cache/ms-playwright/chromium-1224/chrome-linux64/chrome';

const LOG_PREFIXES = ['[DebugChat]', '[DIAGNOSTIC]', '[SETTER]', '[TRACE]', 'Snapshot'];

async function main() {
  console.log('=== Playwright V0→V1 Bug Test ===\n');

  // Collect diagnostic logs
  const diagnosticLogs = [];

  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROMIUM,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (LOG_PREFIXES.some(p => text.includes(p))) {
      diagnosticLogs.push(text);
      console.log('  [LOG]', text.substring(0, 200));
    }
  });

  try {
    // Step 1: Navigate to editor
    console.log('\nStep 1: Navigating to editor...');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Step 2: Click "Debug" or start debugging
    console.log('Step 2: Starting debug session...');
    // Look for the debug button/form
    const debugBtn = await page.$('button:has-text("调试")') || await page.$('button:has-text("Debug")');
    if (debugBtn) {
      console.log('  Found debug button');
    } else {
      // Try to find the submit button in DebugConfig
      const submitBtn = await page.$('button:has-text("开始")') || await page.$('button[type="submit"]');
      if (submitBtn) {
        console.log('  Found submit button, clicking...');
        await submitBtn.click();
        await page.waitForTimeout(3000);
      }
    }

    // Wait for session to load
    await page.waitForTimeout(3000);

    // Take a screenshot
    await page.screenshot({ path: '/tmp/playwright-01-loaded.png' });

    // Step 3: Get all visible buttons and text
    console.log('\nStep 3: Analyzing UI state...');
    const buttons = await page.$$eval('button', els =>
      els.filter(e => e.offsetParent !== null).map(e => e.textContent?.trim().substring(0, 40))
    );
    console.log('  Visible buttons:', buttons);

    // Find the chat input
    const textareas = await page.$$('textarea');
    console.log(`  Textareas found: ${textareas.length}`);

    // Step 4: Send a message to advance past action_1
    if (textareas.length > 0) {
      console.log('\nStep 4: Sending first message...');
      await textareas[0].fill('妈妈爸爸');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(5000); // Wait for LLM response
      await page.screenshot({ path: '/tmp/playwright-02-first-msg.png' });
      console.log('  First message sent');
    }

    // Step 5: Find and click rollback to action_1
    console.log('\nStep 5: Looking for rollback button...');
    const rollbackBtns = await page.$$eval('*', els =>
      els.filter(e => {
        const t = e.textContent || '';
        return (t.includes('回退') || t.includes('rollback') || t.includes('Rollback')) &&
               e.offsetParent !== null;
      }).map(e => ({ tag: e.tagName, text: e.textContent?.substring(0, 60) }))
    );
    console.log('  Rollback elements:', JSON.stringify(rollbackBtns));

    // Look for action_1 in the navigation tree
    const actionElements = await page.$$eval('*', els =>
      els.filter(e => {
        const t = e.textContent || '';
        return t.includes('action_1') && e.offsetParent !== null;
      }).map(e => ({ tag: e.tagName, class: e.className?.substring(0, 40), text: e.textContent?.substring(0, 60) }))
    );
    console.log('  action_1 elements:', JSON.stringify(actionElements));

    // Step 6: Check for timeline selector
    console.log('\nStep 6: Checking timeline selector...');
    const selectEls = await page.$$eval('[class*="select"], [class*="Select"], .ant-select', els =>
      els.filter(e => e.offsetParent !== null).map(e => ({
        text: e.textContent?.substring(0, 80),
        class: e.className?.substring(0, 40),
      }))
    );
    console.log('  Select elements:', JSON.stringify(selectEls));

    // Step 7: Try clicking on action_1 in navigation tree to trigger rollback
    console.log('\nStep 7: Attempting rollback interaction...');
    // Look for context menu or right-click area
    const navTreeItems = await page.$$('.ant-tree-node-content-wrapper, [class*="tree-node"]');
    if (navTreeItems.length > 0) {
      console.log(`  Found ${navTreeItems.length} tree nodes`);
      for (const item of navTreeItems) {
        const text = await item.textContent();
        if (text?.includes('action_1')) {
          console.log('  Found action_1 tree node, right-clicking...');
          await item.click({ button: 'right' });
          await page.waitForTimeout(1000);
          await page.screenshot({ path: '/tmp/playwright-03-rightclick.png' });

          // Look for rollback option in context menu
          const menuItems = await page.$$eval('[class*="menu"], [class*="dropdown"], [class*="popup"]', els =>
            els.filter(e => e.offsetParent !== null).map(e => e.textContent?.substring(0, 80))
          );
          console.log('  Menu items:', JSON.stringify(menuItems));
          break;
        }
      }
    }

    // Dump ALL diagnostic logs at the end
    console.log('\n=== ALL DIAGNOSTIC LOGS ===');
    diagnosticLogs.forEach(l => console.log(l));

    await page.screenshot({ path: '/tmp/playwright-04-final.png', fullPage: true });

  } catch (err) {
    console.error('Error:', err.message);
    await page.screenshot({ path: '/tmp/playwright-error.png', fullPage: true });
  } finally {
    await browser.close();
    console.log('\nDone.');
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});

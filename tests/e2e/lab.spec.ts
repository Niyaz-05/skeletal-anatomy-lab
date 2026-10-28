import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'docs/screenshots';
fs.mkdirSync(SHOTS, { recursive: true });
/** Screenshots come from the GPU run only, so they show the real look. */
const shot = async (page: Page, name: string) => { if (test.info().project.name === 'gpu') await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

async function open(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`/${query}`);
  return errors;
}
async function ready(page: Page) {
  await expect(page.locator('.viewer[data-ready="true"]')).toBeVisible({ timeout: 180_000 });
  await settle(page);
}
/** Waits until the canvas has rendered two more frames. */
async function settle(page: Page, ms = 600) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(ms);
}
const detailTitle = (page: Page) => page.locator('#detail-title');
/** A structure-list button by its label; a hidden structure's button adds "hidden" after it. */
const listButton = (page: Page, name: RegExp) => {
  const exact = name.source.endsWith('$') ? new RegExp(`${name.source.slice(0, -1)}\\s*(hidden)?$`) : name;
  return page.locator('.structure-panel .struct-list button', { hasText: exact });
};
const radio = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });
const mode = (page: Page, name: string) => page.locator('nav[aria-label="Mode"] button', { hasText: new RegExp(`^${name}$`) }).click();
const cameraButton = (page: Page, name: string) => page.locator('[aria-label="Camera views"] button', { hasText: new RegExp(`^${name}$`) });
const slider = (page: Page, name: RegExp) => page.getByRole('slider', { name });
const attr = async (page: Page, sel: string, a: string) => (await page.locator(sel).first().getAttribute(a)) ?? '';
const canvasShot = (page: Page) => page.locator('.viewer canvas').screenshot();

test('loads without console errors and with a clean main screen @smoke', async ({ page }) => {
  const errors = await open(page);
  await ready(page);
  await expect(page.getByRole('heading', { name: 'Skeletal System', level: 1 })).toBeVisible();
  await expect(page.locator('aside.right')).toHaveCount(0);
  await expect(radio(page, 'Real')).toHaveAttribute('aria-checked', 'true');
  await shot(page, '01-skeleton');
  expect(errors).toEqual([]);
});

test('clicking the model selects the bone under the pointer', async ({ page }) => {
  await open(page);
  await ready(page);
  const box = (await page.locator('.viewer canvas').boundingBox())!;
  const x = box.x + 318 + (box.width - 318) / 2;
  for (const f of [0.5, 0.45, 0.55, 0.62, 0.4, 0.7, 0.3]) {
    await page.mouse.click(x, box.y + box.height * f);
    if (await detailTitle(page).count()) break;
  }
  await expect(detailTitle(page)).toHaveText(/./);
  await expect(page.locator('aside.right')).toBeVisible();
});

test('search finds bones by everyday names and abbreviations', async ({ page }) => {
  await open(page);
  await ready(page);
  const search = page.getByLabel('Search structures');
  await search.fill('collarbone');
  await search.press('Enter');
  await expect(detailTitle(page)).toHaveText(/^Clavicle/);
  for (const [q, hit] of [['kneecap', 'Patella'], ['ACL', 'Anterior cruciate ligament'], ['C7', 'Seventh cervical vertebra (C7)'], ['breastbone', 'Sternum']] as const) {
    await search.fill(q);
    await expect(page.locator('.search-results')).toContainText(hit);
  }
  await search.fill('zzzz');
  await expect(page.getByText('No structure matches')).toBeVisible();
  await search.press('Escape');
  await expect(page.locator('fieldset.layers')).toBeVisible();
});

test('a group lists its parts, a part links back, and HRA parts say where they came from', async ({ page }) => {
  await open(page);
  await ready(page);
  await listButton(page, /^Skull$/).click();
  await expect(detailTitle(page)).toHaveText('Skull');
  await expect(page.locator('aside.right')).toContainText('20 parts');
  await page.locator('aside.right').getByRole('button', { name: 'Sphenoid bone', exact: true }).click();
  await expect(detailTitle(page)).toHaveText('Sphenoid bone');
  await expect(page.locator('aside.right [data-bone-class="pneumatic"]')).toBeVisible();
  await listButton(page, /^Coccyx$/).click();
  await page.locator('aside.right summary').click();
  await expect(page.locator('aside.right .model-note')).toContainText('HuBMAP female body');
  await shot(page, '02-detail');
});

test('colour by regions and X-ray repaint the model; X-ray darkens the field', async ({ page }) => {
  await open(page);
  await ready(page);
  const real = await canvasShot(page);
  await radio(page, 'Regions').click();
  await settle(page);
  const regions = await canvasShot(page);
  expect(Buffer.compare(real, regions)).not.toBe(0);
  await radio(page, 'X-ray').click();
  await expect(page.locator('.viewer')).toHaveAttribute('data-colour', 'xray');
  await settle(page);
  expect(Buffer.compare(regions, await canvasShot(page))).not.toBe(0);
  await shot(page, '03-xray');
});

test('layers hide and show structures, including the female pelvis', async ({ page }) => {
  await open(page);
  await ready(page);
  await page.getByLabel('Ribs and sternum', { exact: true }).uncheck();
  await expect(listButton(page, /^Sternum$/)).toContainText('hidden');
  await expect(listButton(page, /^Female pelvis \(HuBMAP\)$/)).toContainText('hidden');
  await page.getByLabel('Female pelvis (for comparison)', { exact: true }).check();
  await expect(listButton(page, /^Female pelvis \(HuBMAP\)$/)).not.toContainText('hidden');
});

test('isolate, zoom and reset', async ({ page }) => {
  await open(page);
  await ready(page);
  await listButton(page, /^Femur \(left\)$/).click();
  await page.getByLabel('Isolate').check();
  await expect(listButton(page, /^Skull$/)).toContainText('hidden');
  await page.getByRole('button', { name: 'Zoom to' }).click();
  await settle(page);
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.locator('aside.right')).toHaveCount(0);
  await expect(listButton(page, /^Skull$/)).not.toContainText('hidden');
});

test('camera presets and region buttons change the view', async ({ page }) => {
  await open(page);
  await ready(page);
  const before = await canvasShot(page);
  await cameraButton(page, 'Back').click();
  await expect(cameraButton(page, 'Back')).toHaveAttribute('aria-pressed', 'true');
  await settle(page, 1200);
  const back = await canvasShot(page);
  expect(Buffer.compare(before, back)).not.toBe(0);
  await page.locator('[aria-label="Fly to a region"] button', { hasText: /^Hand$/ }).click();
  await settle(page, 1200);
  expect(Buffer.compare(back, await canvasShot(page))).not.toBe(0);
});

test('labels mode shows non-overlapping labels', async ({ page }) => {
  await open(page);
  await ready(page);
  await page.getByLabel('Labels').check();
  await settle(page, 1200);
  const shown = page.locator('.scene-label[data-state="shown"]');
  expect(await shown.count()).toBeGreaterThanOrEqual(5);
  const boxes = await shown.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.left, r.top, r.right, r.bottom]));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, b] = [boxes[i]!, boxes[j]!];
    expect(!(a[2]! <= b[0]! || b[2]! <= a[0]! || a[3]! <= b[1]! || b[3]! <= a[1]!), `labels ${i} and ${j} overlap`).toBe(false);
  }
  await shot(page, '04-labels');
});

test('the cut faces the camera, flips and turns off', async ({ page }) => {
  const errors = await open(page);
  await ready(page);
  await radio(page, 'Side').click();
  await expect(cameraButton(page, 'Left side')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.slice-hint')).toHaveText('Showing the right side of the body');
  await settle(page, 1200);
  await shot(page, '05-cut');
  await page.getByRole('button', { name: 'Flip' }).click();
  await expect(page.locator('.slice-hint')).toHaveText('Showing the left side of the body');
  await radio(page, 'Off').click();
  await expect(page.getByLabel('Cut position')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Joints: poses move the skeleton, sliders keep to the normal range @smoke', async ({ page }) => {
  const errors = await open(page);
  await ready(page);
  await mode(page, 'Joints');
  const panel = page.locator('.joints-panel');
  const rest = await canvasShot(page);
  await radio(page, 'Walking stride').click();
  await expect(panel).toHaveAttribute('data-pose', 'walking');
  await settle(page, 1200);
  expect(Buffer.compare(rest, await canvasShot(page))).not.toBe(0);
  await shot(page, '06-walking');
  await page.getByLabel('Joint', { exact: true }).selectOption('knee');
  await expect(panel).toContainText('Modified hinge (bicondylar)');
  const knee = slider(page, /Flexion/);
  await knee.fill('135');
  await expect(panel.locator('[data-movement="knee-flex"]')).toHaveAttribute('data-value', '135');
  await expect(panel).toHaveAttribute('data-pose', 'custom');
  await radio(page, 'Both').click();
  await knee.fill('60');
  await page.getByLabel('Joint', { exact: true }).selectOption('jaw');
  await slider(page, /Mouth opening/).fill('40');
  await expect(panel.locator('[data-movement="jaw-open"]')).toHaveAttribute('data-value', '40');
  await radio(page, 'Deep squat').click();
  await settle(page, 1200);
  await shot(page, '07-squat');
  await page.getByRole('button', { name: 'Back to the anatomical position' }).click();
  await expect(panel).toHaveAttribute('data-pose', 'anatomical');
  expect(errors).toEqual([]);
});

test('Bone tissue: bone mass with age and its factors, the close-ups', async ({ page }) => {
  const errors = await open(page);
  await ready(page);
  await mode(page, 'Bone tissue');
  const panel = page.locator('.tissue-panel');
  await expect(panel).toHaveAttribute('data-category', 'normal');
  await slider(page, /^Age/).fill('80');
  await expect(panel).toHaveAttribute('data-category', 'osteopenia');
  await page.getByLabel('Smoking').check();
  await page.getByLabel('Long-term glucocorticoids from 50').check();
  await expect(panel).toHaveAttribute('data-category', 'osteoporosis');
  await page.getByRole('button', { name: /X-ray view/ }).click();
  await expect(page.locator('.viewer')).toHaveAttribute('data-colour', 'xray');
  await settle(page, 800);
  await shot(page, '08-bone-mass');
  for (const [button, id] of [['compact bone (osteons)', 'osteon'], ['spongy bone and marrow', 'spongy'], ['a remodelling unit', 'remodelling'], ['a growth plate', 'growth-plate']] as const) {
    await page.getByRole('button', { name: `Close-up: ${button}` }).click();
    await expect(page.locator('.viewer')).toHaveAttribute('data-close-up', id);
    await settle(page, 600);
    if (id === 'osteon') await shot(page, '09-osteon');
    await page.getByRole('button', { name: 'Back to the body' }).click();
  }
  expect(errors).toEqual([]);
});

test('Fractures: sites, patterns, healing over the weeks, X-ray and the callus @smoke', async ({ page }) => {
  const errors = await open(page);
  await ready(page);
  await mode(page, 'Fractures');
  const panel = page.locator('.fractures-panel');
  await expect(panel).toHaveAttribute('data-stage', 'haematoma');
  await settle(page, 1200);
  await shot(page, '10-colles');
  await page.getByLabel('Fracture', { exact: true }).selectOption('tibial-shaft');
  await expect(panel).toHaveAttribute('data-site', 'tibial-shaft');
  await radio(page, 'Comminuted').click();
  await expect(panel).toHaveAttribute('data-pattern', 'comminuted');
  const union = Number(await attr(page, '.fractures-panel', 'data-union'));
  await page.getByLabel('Smoker').check();
  expect(Number(await attr(page, '.fractures-panel', 'data-union'))).toBeGreaterThan(union);
  // A smoker's comminuted tibia takes about 33 weeks to unite: soft callus at 6 weeks, hard callus at 20.
  await slider(page, /Time since the injury/).fill('6');
  await expect(panel).toHaveAttribute('data-stage', 'soft-callus');
  await slider(page, /Time since the injury/).fill('20');
  await expect(panel).toHaveAttribute('data-stage', 'hard-callus');
  await settle(page, 800);
  await shot(page, '11-callus');
  await page.getByRole('button', { name: 'X-ray view', exact: true }).click();
  await expect(page.locator('.viewer')).toHaveAttribute('data-colour', 'xray');
  await page.getByLabel('Fracture', { exact: true }).selectOption('vertebral-compression');
  await expect(panel).toHaveAttribute('data-pattern', 'compression');
  await page.getByRole('button', { name: 'Close-up: fracture healing' }).click();
  await expect(page.locator('.viewer')).toHaveAttribute('data-close-up', 'callus');
  expect(errors).toEqual([]);
});

test('Through life: growth plates close, teeth erupt, the pelvises compared', async ({ page }) => {
  const errors = await open(page);
  await ready(page);
  await mode(page, 'Through life');
  const panel = page.locator('.life-panel');
  const age = slider(page, /^Age/);
  await age.fill('4');
  await expect(panel).toHaveAttribute('data-open-physes', '13');
  expect(Number(await attr(page, '.life-panel', 'data-teeth'))).toBe(0);
  await expect(panel).toContainText('Still cartilage');
  await age.fill('12');
  expect(Number(await attr(page, '.life-panel', 'data-teeth'))).toBeGreaterThan(15);
  await settle(page, 800);
  await shot(page, '12-age-12');
  await age.fill('26');
  await expect(panel).toHaveAttribute('data-open-physes', '1');
  await radio(page, 'Male').click();
  await age.fill('30');
  await expect(panel).toHaveAttribute('data-open-physes', '0');
  await expect(panel).toHaveAttribute('data-bone-count', '206');
  await page.getByLabel('Compare the pelvises side by side').check();
  await expect(panel).toHaveAttribute('data-compare', 'true');
  await expect(panel.locator('.compare-table').first()).toContainText('Subpubic angle');
  await expect(listButton(page, /^Femur \(left\)$/)).toContainText('hidden');
  await settle(page, 1200);
  await shot(page, '13-pelvises');
  expect(errors).toEqual([]);
});

test('every close-up opens from a structure or panel', async ({ page }) => {
  const errors = await open(page);
  await ready(page);
  // Inside a one-sided group the list drops the side from each part's name.
  await listButton(page, /^Menisci$/).first().click();
  await page.getByRole('button', { name: 'Close-up: a synovial joint' }).click();
  await expect(page.locator('.viewer')).toHaveAttribute('data-close-up', 'synovial');
  await settle(page, 800);
  await shot(page, '14-synovial');
  await expect(page.locator('.closeup-panel')).toContainText('Articular cartilage');
  await page.getByRole('button', { name: 'Back to the body' }).click();
  await expect(page.locator('.viewer')).toHaveAttribute('data-close-up', 'none');
  expect(errors).toEqual([]);
});

test('the guided tour steps through, jumps and finishes', async ({ page }) => {
  test.slow();
  const errors = await open(page);
  await ready(page);
  await mode(page, 'Guided tour');
  const panel = page.locator('.tour-panel');
  const n = await panel.locator('.tour-index li').count();
  await expect(panel).toContainText(`step 1 of ${n}`);
  // Every step once, in order.
  for (let i = 2; i <= n; i++) {
    await page.getByRole('button', { name: 'Next →' }).click();
    await expect(panel).toContainText(`step ${i} of ${n}`);
    await settle(page, 300);
  }
  await page.getByRole('button', { name: '← Back' }).click();
  await expect(panel).toContainText(`step ${n - 1} of ${n}`);
  await panel.getByRole('button', { name: /^Joints in walking/ }).click();
  await settle(page, 1200);
  await shot(page, '15-tour-walk');
  await panel.getByRole('button', { name: /^Female and male pelvis/ }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.locator('nav[aria-label="Mode"] button', { hasText: /^Anatomy$/ })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('phone layout: structures open from the dock and details follow a pick @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await ready(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('aside.left')).toBeHidden();
  await page.getByRole('button', { name: 'Structures' }).click();
  await listButton(page, /^Femur \(left\)$/).click();
  await expect(page.locator('aside.left')).toBeHidden();
  await expect(detailTitle(page)).toHaveText('Femur (left)');
  await shot(page, '16-phone');
});

test('the About sheet holds the BodyParts3D and HuBMAP credits', async ({ page }) => {
  await open(page);
  await ready(page);
  await page.getByRole('button', { name: /About this lab/ }).click();
  const dialog = page.getByRole('dialog', { name: 'About this lab' });
  for (const t of ['BodyParts3D', 'HuBMAP', 'Kristen Browne', 'CC BY 4.0', 'Norkin', 'Looker', 'Scheuer', 'ossicles']) await expect(dialog).toContainText(t);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('without WebGL the learning content still works @smoke', async ({ page }) => {
  await open(page, '?nowebgl');
  await expect(page.getByRole('heading', { name: '3D view unavailable' })).toBeVisible();
  await listButton(page, /^Femur \(left\)$/).click();
  await expect(detailTitle(page)).toHaveText('Femur (left)');
  await mode(page, 'Bone tissue');
  await slider(page, /^Age/).fill('80');
  await expect(page.locator('.tissue-panel')).toHaveAttribute('data-category', 'osteopenia');
  await mode(page, 'Fractures');
  await expect(page.locator('.fractures-panel')).toHaveAttribute('data-site', 'distal-radius');
});

test('a missing model shows an error with a working retry', async ({ page }) => {
  let fail = true;
  await page.route('**/models/skeleton.glb', (route) => (fail ? route.fulfill({ status: 404, body: 'not found' }) : route.continue()));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('The 3D model could not be loaded');
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await ready(page);
});

test('reduced motion: every view and an animated close-up work without errors', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1366, height: 820 } });
  const page = await context.newPage();
  const errors = await open(page);
  await ready(page);
  for (const m of ['Joints', 'Bone tissue', 'Fractures', 'Through life']) { await mode(page, m); await settle(page, 400); }
  await mode(page, 'Bone tissue');
  await page.getByRole('button', { name: 'Close-up: a remodelling unit' }).click();
  await settle(page, 600);
  expect(errors).toEqual([]);
  await context.close();
});

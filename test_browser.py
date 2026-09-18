"""Mode/gradient consistency and display-temperature regression checks.

Run: python3 test_browser.py [https://model1.enrica.ai]
Requires Playwright and a local Chrome installation.
"""
import math
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright


def run(base):
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base + '/#playground', wait_until='networkidle')

        def value(id):
            return float(page.locator('#' + id).inner_text())

        def assert_mode(mode):
            assert page.locator('input[name="objective"]:checked').input_value() == mode
            assert page.locator('#playground').get_attribute('data-objective') == mode
            task, penalty, total = [value(id) for id in ['task-loss', 'distill-loss', 'total-loss']]
            assert abs(total - ((0 if mode == 'kl' else task) + penalty)) <= .00011
            if mode == 'kl':
                assert value('task-force') == 0
                assert 'task excluded' in page.locator('#loss-arithmetic').inner_text()
                assert 'TASK LOSS DISABLED' in page.locator('#objective-heading').inner_text()
            if mode == 'sft':
                assert penalty == 0 and value('kl-force') == 0

        assert_mode('kl')
        assert page.locator('#scenario').count() == 0
        starting_chart = page.locator('#distribution-chart').get_attribute('aria-label')
        for mode in ['kl', 'sft', 'combined']:
            page.locator(f'input[name="objective"][value="{mode}"]').check()
            assert_mode(mode)
            assert page.locator('#distribution-chart').get_attribute('aria-label') == starting_chart
            before = value('raw-kl')
            page.locator('#step').click()
            assert_mode(mode)
            if mode == 'kl':
                assert value('raw-kl') < before
            if mode == 'combined':
                assert value('raw-kl') > before
        print('PASS all modes use one shared initialization, with consistent totals and updates')

        page.locator('#reset').click()
        assert page.locator('#probability-view').input_value() == 'prediction'
        assert page.locator('#chart-temp').inner_text() == '1.00'
        assert 'Greece: teacher 20.3%' in page.locator('#distribution-chart').get_attribute('aria-label')
        chart = page.locator('.bar-group').nth(1).get_attribute('aria-label')
        shown = float(re.search(r'student ([0-9.]+)%', chart).group(1)) / 100
        assert abs(shown - math.exp(-value('task-loss'))) < .0006
        before = [page.locator('#' + id).inner_text() for id in ['total-loss', 'raw-kl', 'step-badge']]
        logits = page.locator('#logit-inputs input').evaluate_all('(els)=>els.map(el=>el.value)')
        page.locator('#probability-view').select_option('distillation')
        assert page.locator('#chart-temp').inner_text() == '0.50'
        assert 'Greece: teacher 14.4%' in page.locator('#distribution-chart').get_attribute('aria-label')
        assert before == [page.locator('#' + id).inner_text() for id in ['total-loss', 'raw-kl', 'step-badge']]
        assert logits == page.locator('#logit-inputs input').evaluate_all('(els)=>els.map(el=>el.value)')
        page.locator('#probability-view').select_option('prediction')
        print('PASS ordinary chart matches exp(-CE); KL view changes only the visualization')

        # Simulate browser form restoration disagreeing with the running state.
        page.evaluate('''() => {
            document.querySelector('input[name="objective"][value="kl"]').checked = true;
            window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true}));
        }''')
        assert_mode('combined')
        page.reload(wait_until='networkidle')
        assert_mode('kl')
        page.locator('summary').click()
        page.locator('#match-teacher').click()
        assert value('gradient-norm') < 1e-12
        chart = page.locator('#distribution-chart').get_attribute('aria-label')
        page.locator('#step').click()
        assert chart == page.locator('#distribution-chart').get_attribute('aria-label')
        assert value('total-loss') == 0
        assert value('task-loss') > 0
        print('PASS restored form-state synchronization and stationary KL-only teacher match')
        page.locator('input[value="combined"]').check()
        assert value('raw-kl') == 0
        assert value('gradient-norm') > .01
        page.locator('#student-1').fill('2')
        page.locator('#student-1').press('Tab')
        custom_chart = page.locator('#distribution-chart').get_attribute('aria-label')
        page.locator('#step').click()
        page.locator('input[value="kl"]').check()
        assert page.locator('#distribution-chart').get_attribute('aria-label') == custom_chart
        page.locator('#step').click()
        page.locator('#reset').click()
        assert page.locator('#distribution-chart').get_attribute('aria-label') == custom_chart
        page.locator('#restore-example').click()
        assert page.locator('#distribution-chart').get_attribute('aria-label') == starting_chart
        with page.expect_download() as exported:
            page.locator('#download').click()
        assert exported.value.suggested_filename == 'distill-kl.csv'
        print('PASS custom starting logits shared across modes, reset, restore, and CSV export')


        for width in [390, 768, 1440]:
            page.set_viewport_size({'width': width, 'height': 900})
            for view in ['prediction', 'distillation']:
                page.locator('#probability-view').select_option(view)
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.locator('#cartoons-tab').click()
        assert page.locator('#paper-cartoons').is_visible()
        assert page.locator('.cartoon-card').count() == 4
        assert not errors, errors
        page.goto(Path(__file__).with_name('tests.html').resolve().as_uri())
        assert page.locator('body').get_attribute('data-failed') == '0'
        print('PASS responsive views, cartoon tab, and all numerical regression checks')
        browser.close()


if __name__ == '__main__':
    run(sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8083')

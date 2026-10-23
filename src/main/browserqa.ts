import { BrowserWindow } from 'electron'
import type { BrowserQaResult } from '../shared/types'

/**
 * Browser QA: opens the built app in a hidden window, collects console/page errors, clicks the main
 * buttons and links, fills and submits the first form, takes a screenshot. No external tools.
 * (Idea borrowed from agent browsers like ego-lite; implemented with Electron's own webContents.)
 */
const PROBE = `(() => {
  if (!window.__sc) { window.__sc = { errors: [] }; window.addEventListener('error', (e) => window.__sc.errors.push(String(e.message || e))); window.addEventListener('unhandledrejection', (e) => window.__sc.errors.push('unhandled: ' + String(e.reason && e.reason.message || e.reason))) }
  return true })()`
const LIST = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none' }
  const out = []
  document.querySelectorAll('button, [role=button], a[href]').forEach((el, i) => {
    if (!vis(el) || out.length >= 40) return
    if (el.closest('form') && (el.getAttribute('type') || 'submit').toLowerCase() === 'submit') return
    const href = el.getAttribute('href') || ''
    if (el.tagName === 'A' && href && !href.startsWith('/') && !href.startsWith('#') && !href.startsWith(location.origin)) return
    const text = (el.innerText || el.getAttribute('aria-label') || el.value || '').trim().slice(0, 40)
    if (/delete|remove|삭제|logout|로그아웃|sign out|pay|결제|purchase|구매/i.test(text)) return
    el.setAttribute('data-sc-i', String(i)); out.push({ i, text: text || el.tagName.toLowerCase(), tag: el.tagName.toLowerCase() })
  })
  return out })()`
const CLICK = (i: number) => `(() => { const el = document.querySelector('[data-sc-i="${i}"]'); if (!el) return 'gone'; el.scrollIntoView({ block: 'center' }); el.click(); return 'ok' })()`
const FORM = `(() => {
  const f = document.querySelector('form'); if (!f) return 'no form'
  let n = 0
  f.querySelectorAll('input, textarea').forEach((el) => { const t = (el.getAttribute('type') || 'text').toLowerCase(); if (['hidden','submit','button','checkbox','radio','file'].includes(t)) return
    const v = t === 'email' ? 'qa@example.com' : t === 'number' ? '3' : t === 'password' ? 'Password123!' : t === 'date' ? '2026-01-01' : 'QA 테스트 입력'
    const setter = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set
    setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); n++ })
  const btn = f.querySelector('button[type=submit], input[type=submit], button:not([type=button])')
  if (btn) btn.click(); else f.requestSubmit && f.requestSubmit()
  return 'filled ' + n + ' fields, submitted' })()`
const ERRORS = `(window.__sc && window.__sc.errors.splice(0)) || []`

export async function browserQa(url: string, opts: { maxClicks?: number; timeoutMs?: number } = {}): Promise<BrowserQaResult> {
  const res: BrowserQaResult = { ok: true, url, consoleErrors: [], pageErrors: [], actions: [] }
  const win = new BrowserWindow({ show: false, width: 1280, height: 860, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
  const wc = win.webContents
  wc.on('console-message', (_e, level, message) => { if (level >= 2 && res.consoleErrors.length < 50 && !/Electron Security Warning/.test(message)) res.consoleErrors.push(message.slice(0, 400)) })
  wc.on('render-process-gone', (_e, d) => res.pageErrors.push(`renderer gone: ${d.reason}`))
  wc.on('did-fail-load', (_e, code, desc) => { if (code !== -3) res.pageErrors.push(`load failed: ${desc} (${code})`) })
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const run = async <T,>(js: string): Promise<T | undefined> => { try { return (await wc.executeJavaScript(js, true)) as T } catch (e) { res.pageErrors.push(`script: ${e instanceof Error ? e.message : String(e)}`); return undefined } }
  try {
    await Promise.race([win.loadURL(url), sleep(opts.timeoutMs ?? 20_000).then(() => { throw new Error('load timeout') })])
    await sleep(1500)
    res.title = wc.getTitle()
    await run(PROBE)
    const items = (await run<{ i: number; text: string; tag: string }[]>(LIST)) ?? []
    for (const it of items.slice(0, opts.maxClicks ?? 8)) {
      const r = await run<string>(CLICK(it.i)); await sleep(600)
      const errs = (await run<string[]>(ERRORS)) ?? []
      res.actions.push({ action: 'click', target: `${it.tag}: ${it.text}`, ok: r === 'ok' && errs.length === 0, error: errs[0] ?? (r !== 'ok' ? `element ${r}` : undefined) })
      if (errs.length) res.pageErrors.push(...errs.map((e) => `after clicking "${it.text}": ${e}`))
      const same = (a: string, b: string) => { try { const x = new URL(a), y = new URL(b); return x.origin === y.origin && x.pathname.replace(/\/$/, '') === y.pathname.replace(/\/$/, '') } catch { return a === b } }
      if (!same(wc.getURL(), url)) { await wc.loadURL(url); await sleep(800); await run(PROBE); await run(LIST) }
    }
    const f = await run<string>(FORM); await sleep(800)
    const ferr = (await run<string[]>(ERRORS)) ?? []
    if (f) res.actions.push({ action: 'form', target: f, ok: ferr.length === 0, error: ferr[0] })
    res.pageErrors.push(...ferr)
    try { const img = await wc.capturePage(); res.screenshot = img.resize({ width: 800 }).toDataURL() } catch { /* ignore */ }
  } catch (e) { res.pageErrors.push(e instanceof Error ? e.message : String(e)) }
  finally { try { win.destroy() } catch { /* ignore */ } }
  res.ok = res.pageErrors.length === 0 && res.consoleErrors.filter((m) => !/favicon|DevTools|React DevTools|Download the React/i.test(m)).length === 0
  return res
}
export function describe(r: BrowserQaResult, ko: boolean): string {
  const clicks = r.actions.filter((a) => a.action === 'click'); const bad = clicks.filter((a) => !a.ok).length
  const form = r.actions.find((a) => a.action === 'form')
  const parts = [ko ? `버튼 ${clicks.length}개 클릭 (문제 ${bad})` : `${clicks.length} clicks (${bad} problems)`, form ? (ko ? `폼 제출 ${form.ok ? '정상' : '오류'}` : `form ${form.ok ? 'ok' : 'error'}`) : '', r.consoleErrors.length ? (ko ? `콘솔 오류 ${r.consoleErrors.length}` : `${r.consoleErrors.length} console errors`) : '', r.pageErrors.length ? (ko ? `페이지 오류 ${r.pageErrors.length}` : `${r.pageErrors.length} page errors`) : ''].filter(Boolean)
  return parts.join(' · ')
}

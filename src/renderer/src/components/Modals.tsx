import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { t } from '../lib/i18n'
import { plans } from '../lib/pricing'
import type { Settings, StoreProduct, LicenseState } from '../../../shared/types'

export function SettingsModal() {
  const { settings, setSettings, setModal, llama } = useStore()
  const [s, setS] = useState<Settings | null>(settings)
  const [models, setModels] = useState<{ name: string; path: string; sizeGb: number }[]>([])
  const [info, setInfo] = useState<{ modelsDir: string; llamaBin: string | null } | null>(null)
  useEffect(() => { void window.sc.llama.models().then(setModels); void window.sc.appInfo().then(setInfo) }, [])
  if (!s) return null
  const lang = s.language
  const u = (p: Partial<Settings>) => setS({ ...s, ...p })
  const save = async () => { await setSettings(s); setModal(null); if (llama.state === 'running') { await window.sc.llama.stop(); void window.sc.llama.start() } }
  return (
    <div className="overlay" onClick={() => setModal(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t(lang, 'settings')}</h2>
        <h3>Local (Flint)</h3>
        <div className="form">
          <label>Model</label>
          <select value={s.localModelPath} onChange={(e) => u({ localModelPath: e.target.value })}>
            {!models.some((m) => m.path === s.localModelPath) && <option value={s.localModelPath}>{s.localModelPath.split(/[\\/]/).pop()} (missing)</option>}
            {models.map((m) => <option key={m.path} value={m.path}>{m.name} · {m.sizeGb} GB</option>)}
          </select>
          <div className="help">{info?.modelsDir} · llama-server: {info?.llamaBin ?? 'not found (brew install llama.cpp)'}</div>
          <label>Context size</label><input type="number" value={s.contextSize} onChange={(e) => u({ contextSize: +e.target.value })} />
          <div className="help">24GB Mac: 16384 권장 / 48GB+: 65536</div>
          <label>GPU layers</label><input type="number" value={s.gpuLayers} onChange={(e) => u({ gpuLayers: +e.target.value })} />
          <label>Port</label><input type="number" value={s.localPort} onChange={(e) => u({ localPort: +e.target.value })} />
          <label>Reasoning budget</label><input type="number" value={s.reasoningBudget} onChange={(e) => u({ reasoningBudget: +e.target.value })} />
          <div className="help">Flint가 답 전에 "생각"에 쓸 토큰. 1024 권장 (24GB Mac ≈ 30초). -1 무제한, 0 끔</div>
        </div>
        <h3>BYOK — 내 API 키 연결 (선택)</h3>
        <div className="form">
          <label>클라우드 사용</label><input type="checkbox" checked={s.byokEnabled} onChange={(e) => u({ byokEnabled: e.target.checked, routeMode: e.target.checked ? 'auto' : 'local' })} />
          <div className="help">기본은 100% 로컬. 켜면 내 Anthropic/OpenAI 호환 키로 직접 호출하며 SwitchCoder은 한 푼도 받지 않습니다.</div>
        </div>
        {s.byokEnabled && (<>
        <h3>Switch Router</h3>
        <div className="form">
          <label>Auto → cloud threshold</label><input type="range" min={10} max={100} value={s.autoRouteThreshold} onChange={(e) => u({ autoRouteThreshold: +e.target.value })} />
          <div className="help">{s.autoRouteThreshold}/100 · 낮을수록 클라우드를 더 자주 사용</div>
        </div>
        <h3>Cloud (BYOK)</h3>
        <div className="form">
          <label>Provider</label>
          <select value={s.cloudModelId} onChange={(e) => u({ cloudModelId: e.target.value })}><option value="anthropic">Anthropic (Claude)</option><option value="openai-compatible">OpenAI-compatible (Ollama / LM Studio / vLLM / any)</option></select>
          {s.cloudModelId === 'anthropic' ? (<>
            <label>Anthropic API key</label><input type="password" value={s.anthropicApiKey} onChange={(e) => u({ anthropicApiKey: e.target.value })} placeholder="sk-ant-…" />
            <label>Model</label><select value={s.anthropicModel} onChange={(e) => u({ anthropicModel: e.target.value })}><option value="claude-sonnet-5-5">claude-sonnet-5-5</option><option value="claude-opus-5-5">claude-opus-5-5</option><option value="claude-haiku-5-5">claude-haiku-5-5</option><option value="claude-fable-5-1">claude-fable-5-1</option></select>
          </>) : (<>
            <label>Base URL</label><input value={s.openaiCompatBaseUrl} onChange={(e) => u({ openaiCompatBaseUrl: e.target.value })} />
            <label>API key</label><input type="password" value={s.openaiCompatApiKey} onChange={(e) => u({ openaiCompatApiKey: e.target.value })} />
            <label>Model</label><input value={s.openaiCompatModel} onChange={(e) => u({ openaiCompatModel: e.target.value })} placeholder="e.g. qwen3-coder" />
          </>)}
        </div>
        </>)}
        <h3>Deploy (Vercel)</h3>
        <div className="form">
          <label>Vercel token</label><input type="password" value={s.vercelToken} onChange={(e) => u({ vercelToken: e.target.value })} placeholder="(선택) vercel.com/account/tokens" />
          <div className="help">비워두면 "배포" 탭의 브라우저 로그인을 사용합니다. 토큰은 이 맥에만 저장.</div>
        </div>
        <h3>General</h3>
        <div className="form"><label>Language</label><select value={s.language} onChange={(e) => u({ language: e.target.value as 'ko' | 'en' })}><option value="ko">한국어</option><option value="en">English</option></select></div>
        <div className="foot"><button onClick={() => setModal(null)}>Cancel</button><button className="primary" onClick={() => void save()}>Save</button></div>
      </div>
    </div>
  )
}

export function PlansModal() {
  const { settings, setSettings, setModal } = useStore()
  const lang = settings?.language ?? 'ko'
  const [yearly, setYearly] = useState(false)
  const [storeKind, setStoreKind] = useState<'mas' | 'windows-store' | 'none'>('none')
  const [products, setProducts] = useState<StoreProduct[]>([])
  const [license, setLicense] = useState<LicenseState | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => { void window.sc.store.kind().then(setStoreKind); void window.sc.store.products().then(setProducts); void window.sc.store.license().then(setLicense); return window.sc.store.onLicense((l) => { setLicense(l); setBusy(null) }) }, [])
  const ko = lang === 'ko'
  const buy = async (planId: 'pro' | 'max') => {
    const kind = yearly ? 'yearly' : 'monthly'
    const prod = products.find((p) => p.plan === planId && p.kind === kind)
    if (!prod) return
    setBusy(prod.id); try { await window.sc.store.purchase(prod.id) } catch { setBusy(null) }
  }
  const buyLifetime = async (planId: 'pro' | 'max') => { const prod = products.find((p) => p.plan === planId && p.kind === 'lifetime'); if (!prod) return; setBusy(prod.id); try { await window.sc.store.purchase(prod.id) } catch { setBusy(null) } }
  const priceOf = (planId: string, kind: string) => products.find((p) => p.plan === planId && p.kind === kind)?.price
  return (
    <div className="overlay" onClick={() => setModal(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><h2 style={{ margin: 0, flex: 1 }}>{t(lang, 'plans')}</h2><div className="seg"><button className={!yearly ? 'on' : ''} onClick={() => setYearly(false)}>Monthly</button><button className={yearly ? 'on' : ''} onClick={() => setYearly(true)}>Yearly −22%</button></div></div>
        <p className="muted" style={{ margin: '8px 0 14px' }}>{lang === 'ko' ? '모든 추론은 내 기기에서. 우리는 GPU 비용이 없으니 Cursor의 1/4 가격이 가능합니다. 클라우드는 원하면 내 키로(BYOK).' : 'All inference on your machine. No GPU bill on our side, so a quarter of Cursor\'s price. Cloud only if you bring your own key.'}</p>
        <div className="plans">
          {plans.map((p) => (
            <div key={p.id} className={'plan' + (settings?.plan === p.id ? ' current' : '')}>
              <div className="name">{p.name}</div>
              <div className="price">${yearly && p.priceYr ? Math.round(p.priceYr / 12) : p.priceMo}<small> /{lang === 'ko' ? '월' : 'mo'}{p.perSeat ? (lang === 'ko' ? ' /인' : ' /seat') : ''}</small></div>
              {p.lifetime && <div className="muted" style={{ fontSize: 11 }}>{lang === 'ko' ? `또는 평생 $${p.lifetime} 1회` : `or $${p.lifetime} once, lifetime`}</div>}
              <div className="tag">{p.tagline[lang]}</div>
              <ul>{p.features[lang].map((f) => <li key={f}>{f}</li>)}</ul>
              <div className="vs">vs {p.cursorEquivalent}</div>
              {p.id === 'free' || p.id === 'team' ? (
                <button className={settings?.plan === p.id ? '' : 'primary'} disabled={p.id === 'team'} onClick={() => p.id === 'free' && void setSettings({ plan: 'free' })}>{settings?.plan === p.id ? (ko ? '현재 플랜' : 'Current') : p.id === 'team' ? (ko ? '문의' : 'Contact') : (ko ? '선택' : 'Choose')}</button>
              ) : storeKind === 'mas' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button className={license?.plan === p.id ? '' : 'primary'} disabled={!!busy || license?.plan === p.id || !products.length} onClick={() => void buy(p.id as 'pro' | 'max')}>{license?.plan === p.id ? (ko ? '구독 중' : 'Subscribed') : busy ? '…' : `${ko ? '구독' : 'Subscribe'} ${priceOf(p.id, yearly ? 'yearly' : 'monthly') ?? ''}`}</button>
                  <button className="sm" disabled={!!busy || license?.kind === 'lifetime' || !products.length} onClick={() => void buyLifetime(p.id as 'pro' | 'max')}>{ko ? '평생' : 'Lifetime'} {priceOf(p.id, 'lifetime') ?? ''}</button>
                </div>
              ) : storeKind === 'windows-store' ? (
                <button className="primary" onClick={() => void window.sc.openExternal('ms-windows-store://pdp/?productid=REPLACE_STORE_ID')}>{ko ? 'Microsoft Store에서 구매' : 'Buy in Microsoft Store'}</button>
              ) : (
                <button disabled title={ko ? '스토어 버전에서 구매할 수 있습니다' : 'Available in the store build'}>{ko ? '스토어 버전에서 구매' : 'Buy in store build'}</button>
              )}
            </div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 11, marginTop: 14 }}>{storeKind === 'mas' ? (<>{ko ? '결제는 Apple App Store를 통해 처리됩니다. ' : 'Billing is handled by the Apple App Store. '}<a href="#" onClick={(e) => { e.preventDefault(); void window.sc.store.restore() }}>{ko ? '구매 복원' : 'Restore purchases'}</a></>) : storeKind === 'windows-store' ? (ko ? '결제는 Microsoft Store를 통해 처리됩니다.' : 'Billing is handled by the Microsoft Store.') : (ko ? '이 빌드는 스토어 외 배포용입니다. 결제는 App Store / Microsoft Store 버전에서 가능합니다.' : 'This build is distributed outside the stores; purchases are available in the store builds.')}</p>
      </div>
    </div>
  )
}

export function LedgerModal() {
  const { ledger, refreshLedger, setModal, settings } = useStore()
  const lang = settings?.language ?? 'ko'
  useEffect(() => { void refreshLedger() }, [refreshLedger])
  const cloud = ledger.filter((e) => e.kind !== 'local')
  const cost = cloud.reduce((n, e) => n + e.estCostUsd, 0)
  return (
    <div className="overlay" onClick={() => setModal(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t(lang, 'ledger')}</h2>
        <p className="muted">{lang === 'ko' ? `클라우드로 나간 요청 ${cloud.length}건 · 추정 비용 $${cost.toFixed(3)} · 로컬 ${ledger.length - cloud.length}건 ($0)` : `${cloud.length} cloud requests · est. $${cost.toFixed(3)} · ${ledger.length - cloud.length} local ($0)`}</p>
        <table className="ledger"><thead><tr><th>Time</th><th>Model</th><th>Files sent</th><th>Tokens</th><th>Cost</th><th>Why</th></tr></thead>
          <tbody>{ledger.slice(0, 100).map((e) => <tr key={e.id}><td>{new Date(e.at).toLocaleTimeString()}</td><td><span className={'pill ' + (e.kind === 'local' ? 'local' : 'cloud')}>{e.targetId}</span></td><td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{e.files.map((f) => f.split(/[\\/]/).pop()).join(', ') || '—'}</td><td>{e.inputTokens}→{e.outputTokens}</td><td>{e.kind === 'local' ? '$0' : '$' + e.estCostUsd.toFixed(4)}</td><td className="muted">{e.reason}</td></tr>)}</tbody></table>
      </div>
    </div>
  )
}

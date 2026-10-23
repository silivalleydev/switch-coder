import { useEffect, useState } from 'react'
import { Rocket, LogIn, Link2, Database, RefreshCw, ExternalLink, CheckCircle2, Circle } from 'lucide-react'
import { useStore } from '../store'
import type { VercelStatus, DbProvider } from '../../../shared/types'

export default function DeployPanel() {
  const { projectRoot, settings, liveUrl, setLiveUrl, setView } = useStore()
  const lang = settings?.language ?? 'ko'
  const ko = lang === 'ko'
  const [st, setSt] = useState<VercelStatus | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [db, setDb] = useState<DbProvider>('supabase')
  const [manual, setManual] = useState<string | null>(null)
  const name = projectRoot?.split(/[\\/]/).pop() ?? 'app'
  const refresh = async () => { setSt(await window.sc.vercel.status(projectRoot)) }
  useEffect(() => { void refresh() }, [projectRoot]) // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (key: string, fn: () => Promise<unknown>) => { setBusy(key); setView('deploy'); try { await fn() } finally { setBusy(null); await refresh() } }

  const Step = ({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) => (
    <div className={'dstep' + (done ? ' done' : '')}><div className="n">{done ? <CheckCircle2 size={16} /> : <Circle size={16} />}</div><div className="body"><div className="t">{n}. {title}</div>{children}</div></div>
  )
  if (!st) return <div className="deploy"><div className="muted">…</div></div>
  return (
    <div className="deploy">
      <div className="dhead"><Rocket size={16} /> <strong>{ko ? 'Vercel로 웹 배포' : 'Deploy to Vercel'}</strong><span className="muted" style={{ fontSize: 11 }}>{ko ? '무료 Hobby 플랜으로 충분. 비용은 전부 내 Vercel 계정.' : 'Free Hobby plan is enough. All costs on your own Vercel account.'}</span><span className="spacer" /><button className="ghost sm" onClick={() => void refresh()}><RefreshCw size={12} /></button></div>
      {!st.cliAvailable && <div className="err">Vercel CLI not found in the app bundle.</div>}
      <Step n={1} done={st.loggedIn} title={ko ? 'Vercel 계정 연결' : 'Connect Vercel account'}>
        {st.loggedIn ? <div className="muted">{st.user ? `${ko ? '로그인됨' : 'Signed in'}: ${st.user}` : (ko ? '로그인됨' : 'Signed in')}</div>
          : <div className="row"><button className="primary sm" disabled={!!busy} onClick={() => void run('login', () => window.sc.vercel.login())}><LogIn size={12} /> {busy === 'login' ? (ko ? '브라우저에서 승인하세요…' : 'Approve in browser…') : (ko ? '브라우저로 로그인' : 'Log in via browser')}</button><span className="muted" style={{ fontSize: 11 }}>{ko ? '또는 설정에서 토큰 입력' : 'or paste a token in Settings'}</span></div>}
      </Step>
      <Step n={2} done={!!st.project} title={ko ? '프로젝트 링크' : 'Link project'}>
        {st.project ? <div className="muted">{st.project.name ?? st.project.id}</div>
          : <button className="sm" disabled={!st.loggedIn || !!busy || !projectRoot} onClick={() => projectRoot && void run('link', () => window.sc.vercel.link(projectRoot, name))}><Link2 size={12} /> {busy === 'link' ? '…' : `${ko ? '링크' : 'Link'} "${name}"`}</button>}
      </Step>
      <Step n={3} done={!!st.db} title={ko ? '데이터베이스 (선택)' : 'Database (optional)'}>
        {st.db ? <div className="muted">{st.db} · {st.envKeys.filter((k) => /SUPABASE|DATABASE|POSTGRES|NEON/.test(k)).join(', ')}</div> : (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <div className="seg"><button className={db === 'supabase' ? 'on' : ''} onClick={() => setDb('supabase')}>Supabase</button><button className={db === 'neon' ? 'on' : ''} onClick={() => setDb('neon')}>Neon</button></div>
            <button className="sm" disabled={!st.project || !!busy} onClick={() => projectRoot && void run('db', async () => { const r = await window.sc.vercel.addDb(projectRoot, db); setManual(r.ok ? null : r.manual ?? null) })}><Database size={12} /> {busy === 'db' ? '…' : (ko ? '추가' : 'Add')}</button>
            <button className="ghost sm" disabled={!st.project || !!busy} onClick={() => projectRoot && void run('env', () => window.sc.vercel.envPull(projectRoot))}>{ko ? '환경변수 가져오기' : 'Pull env'}</button>
            <span className="muted" style={{ fontSize: 11, width: '100%' }}>{db === 'supabase' ? (ko ? 'Postgres + Auth + Storage. 무료 2 프로젝트, 1주 미사용 시 일시정지' : 'Postgres + Auth + Storage. Free: 2 projects, pauses after a week idle') : (ko ? 'Postgres만. 무료 0.5GB, 유휴 시 슬립' : 'Postgres only. Free 0.5GB, sleeps when idle')}</span>
            {manual && <div className="muted" style={{ fontSize: 11, width: '100%' }}>{ko ? '브라우저에서 설치를 마친 뒤 "환경변수 가져오기"를 누르세요: ' : 'Finish the install in the browser, then click "Pull env": '}<a href="#" onClick={(e) => { e.preventDefault(); void window.sc.openExternal(manual) }}>{manual}</a></div>}
          </div>)}
      </Step>
      <Step n={4} done={!!liveUrl} title={ko ? '배포' : 'Deploy'}>
        <div className="row">
          <button className="primary sm" disabled={!st.project || !!busy} onClick={() => projectRoot && void run('deploy', async () => { const r = await window.sc.vercel.deploy(projectRoot, true); if (r.url) setLiveUrl(r.url) })}><Rocket size={12} /> {busy === 'deploy' ? (ko ? '배포 중…' : 'Deploying…') : (ko ? '프로덕션 배포' : 'Deploy to production')}</button>
          <button className="sm" disabled={!st.project || !!busy} onClick={() => projectRoot && void run('preview', async () => { const r = await window.sc.vercel.deploy(projectRoot, false); if (r.url) setLiveUrl(r.url) })}>{ko ? '프리뷰 배포' : 'Preview deploy'}</button>
          {liveUrl && <a className="pill cloud" href="#" onClick={(e) => { e.preventDefault(); void window.sc.openExternal(liveUrl) }}><ExternalLink size={11} /> {liveUrl}</a>}
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>{ko ? '에이전트에게 "배포해줘"라고 해도 됩니다. 출력은 터미널 탭에.' : 'You can also tell the agent "deploy it". Output goes to the Terminal tab.'}</div>
      </Step>
    </div>
  )
}

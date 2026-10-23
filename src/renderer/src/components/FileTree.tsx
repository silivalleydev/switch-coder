import { useState } from 'react'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, FolderPlus, RefreshCw } from 'lucide-react'
import { useStore } from '../store'
import { t } from '../lib/i18n'
import type { FileNode } from '../../../shared/types'

function Node({ node, depth }: { node: FileNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1)
  const { active, openFile } = useStore()
  const pad = { paddingLeft: 6 + depth * 12 }
  if (node.isDir) return (
    <>
      <div className="node" style={pad} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{open ? <FolderOpen size={13} /> : <Folder size={13} />}<span>{node.name}</span>
      </div>
      {open && node.children?.map((c) => <Node key={c.path} node={c} depth={depth + 1} />)}
    </>
  )
  return <div className={'node' + (active === node.path ? ' active' : '')} style={{ ...pad, paddingLeft: pad.paddingLeft + 16 }} onClick={() => void openFile(node.path)}><File size={13} /><span>{node.name}</span></div>
}

export default function FileTree() {
  const { tree, projectRoot, openFolder, refreshTree, settings } = useStore()
  const lang = settings?.language ?? 'ko'
  return (
    <div className="sidebar">
      <div className="head"><span>{t(lang, 'explorer')}</span><span style={{ display: 'flex', gap: 2 }}><button className="ghost sm" title={t(lang, 'openFolder')} onClick={() => void openFolder()}><FolderPlus size={13} /></button><button className="ghost sm" onClick={() => void refreshTree()}><RefreshCw size={13} /></button></span></div>
      <div className="tree">
        {tree ? <Node node={tree} depth={0} /> : <div style={{ padding: 16, color: 'var(--fg3)', textAlign: 'center' }}><div style={{ marginBottom: 8 }}>{t(lang, 'noFolder')}</div><button onClick={() => void openFolder()}>{t(lang, 'openFolder')}</button></div>}
      </div>
      {projectRoot && <div style={{ padding: '6px 10px', fontSize: 10, color: 'var(--fg3)', borderTop: '1px solid var(--border)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectRoot}</div>}
    </div>
  )
}

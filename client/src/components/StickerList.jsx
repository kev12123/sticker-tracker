import { useState, useEffect } from 'react'
import api from '../api/client'
import { useToast } from './Toast'
import { SkeletonRow } from './Skeleton'

function StickerBadge({ sticker }) {
  const isFoil = sticker.sticker_type === 'FOIL'
  return (
    <span className={`text-xs font-black px-2.5 py-1 rounded-full tracking-wider ${isFoil ? 'foil-badge' : 'bg-gray-900 text-white'}`}>
      {sticker.sticker_code}
    </span>
  )
}

function TypeBadge({ type }) {
  const styles = {
    Player:      'bg-blue-100 text-blue-700',
    FOIL:        'foil-badge text-amber-900',
    'Team Photo': 'bg-emerald-100 text-emerald-700',
    Special:     'bg-purple-100 text-purple-700',
  }
  return (
    <span className={`hidden sm:inline text-xs px-2 py-0.5 rounded-full font-semibold ${styles[type] || 'bg-gray-100 text-gray-600'}`}>
      {type}
    </span>
  )
}

function StickerCard({ entry, onUpdate, onRemove }) {
  const { sticker, quantity } = entry

  async function changeQty(delta) {
    const newQty = quantity + delta
    if (newQty < 1) { onRemove(entry.id); return }
    await api.patch(`/stickers/list/${entry.id}`, { quantity: newQty })
    onUpdate(entry.id, newQty)
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors">
      <div className="w-18 text-center shrink-0">
        <StickerBadge sticker={sticker} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-800 text-sm truncate">
          {sticker.player_name || sticker.sticker_code}
        </p>
        <p className="text-xs text-gray-400 truncate">{sticker.team_name}{sticker.club ? ` · ${sticker.club}` : ''}</p>
      </div>
      <TypeBadge type={sticker.sticker_type} />
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => changeQty(-1)}
          className="w-7 h-7 rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-600 text-gray-500 text-sm font-bold transition-colors flex items-center justify-center"
        >−</button>
        <span className="w-6 text-center font-bold text-sm text-gray-700">{quantity}</span>
        <button
          onClick={() => changeQty(1)}
          className="w-7 h-7 rounded-full bg-gray-100 hover:bg-emerald-100 hover:text-emerald-600 text-gray-500 text-sm font-bold transition-colors flex items-center justify-center"
        >+</button>
      </div>
    </div>
  )
}

const normalize = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function EmptyState({ hasStickers }) {
  return (
    <div className="text-center py-14 text-gray-300">
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-20 h-20 mx-auto mb-4">
        <rect x="18" y="28" width="58" height="52" rx="8" stroke="currentColor" strokeWidth="3"/>
        <rect x="30" y="14" width="34" height="22" rx="5" fill="currentColor" opacity="0.35"/>
        <line x1="30" y1="50" x2="70" y2="50" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
        <line x1="30" y1="62" x2="54" y2="62" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      </svg>
      <p className="font-semibold text-gray-400 text-base">
        {hasStickers ? 'No stickers match' : 'No duplicates yet'}
      </p>
      <p className="text-sm text-gray-300 mt-1">
        {hasStickers ? 'Try a different search or filter' : 'Scan a sticker or search below to add your first'}
      </p>
    </div>
  )
}

export default function StickerList({ refreshToken = 0 }) {
  const [list, setList] = useState([])
  const [allStickers, setAllStickers] = useState([])
  const [search, setSearch] = useState('')
  const [filterTeam, setFilterTeam] = useState('')
  const [addSearch, setAddSearch] = useState('')
  const [addResults, setAddResults] = useState([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  useEffect(() => {
    api.get('/stickers').then(res => setAllStickers(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    api.get('/stickers/list')
      .then(res => { setList(res.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [refreshToken])

  useEffect(() => {
    if (!addSearch.trim()) { setAddResults([]); return }
    const q = normalize(addSearch)
    setAddResults(
      allStickers
        .filter(s =>
          normalize(s.sticker_code).includes(q) ||
          normalize(s.player_name || '').includes(q) ||
          normalize(s.team_name).includes(q)
        )
        .slice(0, 8)
    )
  }, [addSearch, allStickers])

  async function addSticker(stickerId) {
    try {
      const { data } = await api.post('/stickers/list', { sticker_id: stickerId })
      setList(prev => {
        const existing = prev.find(e => e.sticker.id === stickerId)
        if (existing) return prev.map(e => e.sticker.id === stickerId ? { ...e, quantity: e.quantity + 1 } : e)
        return [...prev, data]
      })
      setAddSearch('')
      setAddResults([])
      toast('Sticker added to duplicates ✓')
    } catch {
      toast('Failed to add sticker', 'error')
    }
  }

  function updateQty(entryId, newQty) {
    setList(prev => prev.map(e => e.id === entryId ? { ...e, quantity: newQty } : e))
  }

  async function removeEntry(entryId) {
    await api.delete(`/stickers/list/${entryId}`)
    setList(prev => prev.filter(e => e.id !== entryId))
    toast('Sticker removed', 'info')
  }

  const teams = [...new Set(list.map(e => e.sticker.team_name))].sort()
  const filtered = list.filter(e => {
    const matchTeam = !filterTeam || e.sticker.team_name === filterTeam
    const q = normalize(search)
    const matchSearch = !q ||
      normalize(e.sticker.sticker_code).includes(q) ||
      normalize(e.sticker.player_name || '').includes(q) ||
      normalize(e.sticker.team_name).includes(q)
    return matchTeam && matchSearch
  })

  const total = allStickers.length || 670
  const pct = Math.min(100, Math.round((list.length / total) * 100))
  const totalDups = list.reduce((sum, e) => sum + e.quantity, 0)

  return (
    <div className="p-4 sm:p-6">
      {/* Stats */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-end gap-1 mb-2">
            <span className="text-2xl font-black text-gray-900">{list.length}</span>
            <span className="text-sm text-gray-400 mb-0.5">/ {total}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #3b82f6, #6366f1)' }}
            />
          </div>
          <p className="text-xs text-gray-400 font-medium">{pct}% collected</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center min-w-24">
          <p className="text-2xl font-black text-emerald-600">{totalDups}</p>
          <p className="text-xs text-gray-400 font-medium mt-1">Duplicates</p>
        </div>
      </div>

      {/* Add sticker */}
      <div className="mb-5">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Add a duplicate</p>
        <div className="flex flex-col sm:flex-row gap-2 mb-2">
          <input
            type="text"
            placeholder="Search by name or team…"
            value={addSearch}
            onChange={e => setAddSearch(e.target.value)}
            className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          />
        </div>
        {addResults.length > 0 && (
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
            {addResults.map(s => (
              <button
                key={s.id}
                onClick={() => addSticker(s.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 transition-colors text-left border-b border-gray-100 last:border-0"
              >
                <StickerBadge sticker={s} />
                <span className="flex-1 text-sm text-gray-700 truncate">{s.player_name || s.sticker_code}</span>
                <span className="text-xs text-gray-400">{s.team_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Filter list…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-36 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
        />
        <select
          value={filterTeam}
          onChange={e => setFilterTeam(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
        >
          <option value="">All teams</option>
          {teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState hasStickers={list.length > 0} />
      ) : (
        <div className="space-y-2">
          {filtered.map(entry => (
            <StickerCard key={entry.id} entry={entry} onUpdate={updateQty} onRemove={removeEntry} />
          ))}
        </div>
      )}
    </div>
  )
}

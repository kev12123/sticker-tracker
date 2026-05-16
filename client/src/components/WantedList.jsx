import { useState, useEffect } from 'react'
import api from '../api/client'
import { useToast } from './Toast'
import { SkeletonRow } from './Skeleton'

const normalize = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function StickerBadge({ sticker }) {
  const isFoil = sticker.sticker_type === 'FOIL'
  return (
    <span className={`text-xs font-black px-2.5 py-1 rounded-full tracking-wider ${isFoil ? 'foil-badge' : 'bg-gray-900 text-white'}`}>
      {sticker.sticker_code}
    </span>
  )
}

function WantedCard({ entry, onRemove }) {
  const { sticker } = entry
  const typeStyles = {
    Player: 'bg-blue-100 text-blue-700',
    FOIL: 'foil-badge text-amber-900',
    'Team Photo': 'bg-emerald-100 text-emerald-700',
    Special: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-red-200 hover:bg-red-50/20 transition-colors">
      <div className="shrink-0">
        <StickerBadge sticker={sticker} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-800 text-sm truncate">
          {sticker.player_name || sticker.sticker_code}
        </p>
        <p className="text-xs text-gray-400">{sticker.team_name}</p>
      </div>
      <span className={`hidden sm:inline text-xs px-2 py-0.5 rounded-full font-semibold ${typeStyles[sticker.sticker_type] || 'bg-gray-100 text-gray-600'}`}>
        {sticker.sticker_type}
      </span>
      <button
        onClick={() => onRemove(entry.id)}
        className="w-7 h-7 rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-500 text-gray-400 text-sm font-bold transition-colors flex items-center justify-center shrink-0"
      >×</button>
    </div>
  )
}

function EmptyState({ hasItems }) {
  return (
    <div className="text-center py-14 text-gray-300">
      <svg viewBox="0 0 100 100" fill="none" className="w-20 h-20 mx-auto mb-4">
        <circle cx="50" cy="50" r="34" stroke="currentColor" strokeWidth="3"/>
        <circle cx="50" cy="50" r="21" stroke="currentColor" strokeWidth="3"/>
        <circle cx="50" cy="50" r="8" fill="currentColor" opacity="0.4"/>
      </svg>
      <p className="font-semibold text-gray-400 text-base">
        {hasItems ? 'No stickers match' : 'Your wanted list is empty'}
      </p>
      <p className="text-sm text-gray-300 mt-1">
        {hasItems ? 'Try a different search' : 'Search above to add stickers you need'}
      </p>
    </div>
  )
}

export default function WantedList() {
  const [wanted, setWanted] = useState([])
  const [allStickers, setAllStickers] = useState([])
  const [search, setSearch] = useState('')
  const [addSearch, setAddSearch] = useState('')
  const [addResults, setAddResults] = useState([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  useEffect(() => {
    api.get('/stickers').then(res => setAllStickers(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    api.get('/stickers/wanted')
      .then(res => { setWanted(res.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!addSearch.trim()) { setAddResults([]); return }
    const q = normalize(addSearch)
    const wantedIds = new Set(wanted.map(e => e.sticker.id))
    setAddResults(
      allStickers
        .filter(s => !wantedIds.has(s.id) && (
          normalize(s.sticker_code).includes(q) ||
          normalize(s.player_name || '').includes(q) ||
          normalize(s.team_name).includes(q)
        ))
        .slice(0, 8)
    )
  }, [addSearch, allStickers, wanted])

  async function addWanted(stickerId) {
    try {
      const { data } = await api.post('/stickers/wanted', { sticker_id: stickerId })
      setWanted(prev => [...prev, data])
      setAddSearch('')
      setAddResults([])
      toast('Added to wanted list ✓')
    } catch {
      toast('Failed to add sticker', 'error')
    }
  }

  async function removeWanted(entryId) {
    await api.delete(`/stickers/wanted/${entryId}`)
    setWanted(prev => prev.filter(e => e.id !== entryId))
    toast('Removed from wanted list', 'info')
  }

  const filtered = wanted.filter(e => {
    const q = normalize(search)
    return !q ||
      normalize(e.sticker.sticker_code).includes(q) ||
      normalize(e.sticker.player_name || '').includes(q) ||
      normalize(e.sticker.team_name).includes(q)
  })

  return (
    <div className="p-4 sm:p-6">
      {/* Stats */}
      <div className="bg-white rounded-2xl px-4 py-3 border border-gray-100 shadow-sm text-center mb-6">
        <p className="text-3xl font-black text-rose-500">{wanted.length}</p>
        <p className="text-xs text-gray-400 font-medium mt-0.5">Stickers on your wanted list</p>
      </div>

      {/* Add */}
      <div className="mb-5">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Add a sticker you want</p>
        <input
          type="text"
          placeholder="Search by name, team or code…"
          value={addSearch}
          onChange={e => setAddSearch(e.target.value)}
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400 bg-white"
        />
        {addResults.length > 0 && (
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm mt-2 bg-white">
            {addResults.map(s => (
              <button
                key={s.id}
                onClick={() => addWanted(s.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-rose-50 transition-colors text-left border-b border-gray-100 last:border-0"
              >
                <StickerBadge sticker={s} />
                <span className="flex-1 text-sm text-gray-700 truncate">{s.player_name || s.sticker_code}</span>
                <span className="text-xs text-gray-400">{s.team_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filter */}
      {wanted.length > 5 && (
        <input
          type="text"
          placeholder="Filter wanted list…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400 mb-4 bg-white"
        />
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState hasItems={wanted.length > 0} />
      ) : (
        <div className="space-y-2">
          {filtered.map(entry => (
            <WantedCard key={entry.id} entry={entry} onRemove={removeWanted} />
          ))}
        </div>
      )}
    </div>
  )
}

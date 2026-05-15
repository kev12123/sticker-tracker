import { useState, useEffect } from 'react'
import api from '../api/client'

const normalize = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function WantedCard({ entry, onRemove }) {
  const { sticker } = entry
  const typeColor = {
    Player: 'bg-blue-100 text-blue-700',
    FOIL: 'bg-yellow-100 text-yellow-700',
    'Team Photo': 'bg-green-100 text-green-700',
    Special: 'bg-purple-100 text-purple-700',
  }[sticker.sticker_type] || 'bg-gray-100 text-gray-600'

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-red-200 hover:bg-red-50/20 transition-colors group">
      <div className="w-16 text-center">
        <span className="text-xs font-bold bg-red-500 text-white px-2 py-1 rounded-lg">
          {sticker.sticker_code}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-800 text-sm truncate">
          {sticker.player_name || sticker.sticker_code}
        </p>
        <p className="text-xs text-gray-400">{sticker.team_name}</p>
      </div>
      <span className={`hidden sm:inline text-xs px-2 py-0.5 rounded-full font-medium ${typeColor}`}>
        {sticker.sticker_type}
      </span>
      <button
        onClick={() => onRemove(entry.id)}
        className="w-7 h-7 rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-600 text-gray-400 text-sm font-bold transition-colors flex items-center justify-center"
        title="Remove from wanted"
      >×</button>
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
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/stickers').then(res => setAllStickers(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    api.get('/stickers/wanted')
      .then(res => { setWanted(res.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Search catalogue to add
  useEffect(() => {
    if (!addSearch.trim()) { setAddResults([]); return }
    const q = normalize(addSearch)
    const wantedIds = new Set(wanted.map(e => e.sticker.id))
    const results = allStickers
      .filter(s => !wantedIds.has(s.id) && (
        normalize(s.sticker_code).includes(q) ||
        normalize(s.player_name || '').includes(q) ||
        normalize(s.team_name).includes(q)
      ))
      .slice(0, 8)
    setAddResults(results)
  }, [addSearch, allStickers, wanted])

  async function addWanted(stickerId) {
    try {
      const { data } = await api.post('/stickers/wanted', { sticker_id: stickerId })
      setWanted(prev => [...prev, data])
      setAddSearch('')
      setAddResults([])
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add sticker')
    }
  }

  async function removeWanted(entryId) {
    await api.delete(`/stickers/wanted/${entryId}`)
    setWanted(prev => prev.filter(e => e.id !== entryId))
  }

  const filtered = wanted.filter(e => {
    const q = normalize(search)
    return !q ||
      normalize(e.sticker.sticker_code).includes(q) ||
      normalize(e.sticker.player_name || '').includes(q) ||
      normalize(e.sticker.team_name).includes(q)
  })

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>

  return (
    <div className="p-4 sm:p-6">
      {/* Stats */}
      <div className="bg-red-50 rounded-xl px-4 py-3 text-center mb-6">
        <p className="text-2xl font-bold text-red-500">{wanted.length}</p>
        <p className="text-xs text-red-400 mt-0.5">Stickers you want</p>
      </div>

      {/* Add wanted sticker */}
      <div className="mb-5">
        <p className="text-sm font-semibold text-gray-600 mb-2">Add a sticker you want</p>
        <input
          type="text"
          placeholder="Search by name, team or code…"
          value={addSearch}
          onChange={e => setAddSearch(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400"
        />
        {addResults.length > 0 && (
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm mt-2">
            {addResults.map(s => (
              <button
                key={s.id}
                onClick={() => addWanted(s.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-red-50 transition-colors text-left border-b border-gray-100 last:border-0"
              >
                <span className="text-xs font-bold bg-red-500 text-white px-2 py-0.5 rounded">{s.sticker_code}</span>
                <span className="flex-1 text-sm text-gray-700 truncate">{s.player_name || s.sticker_code}</span>
                <span className="text-xs text-gray-400">{s.team_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

      {/* Filter */}
      {wanted.length > 5 && (
        <input
          type="text"
          placeholder="Filter your wanted list…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400 mb-4"
        />
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🎯</p>
          <p className="font-medium">{wanted.length === 0 ? 'No wanted stickers yet' : 'No stickers match your filter'}</p>
          <p className="text-sm mt-1">{wanted.length === 0 ? 'Search above to add stickers you need' : ''}</p>
        </div>
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

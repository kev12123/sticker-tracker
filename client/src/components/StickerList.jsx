import { useState, useEffect } from 'react'
import api from '../api/client'

function StickerCard({ entry, onUpdate, onRemove }) {
  const { sticker, quantity } = entry

  async function changeQty(delta) {
    const newQty = quantity + delta
    if (newQty < 1) { onRemove(entry.id); return }
    await api.patch(`/stickers/list/${entry.id}`, { quantity: newQty })
    onUpdate(entry.id, newQty)
  }

  const typeColor = {
    Player: 'bg-blue-100 text-blue-700',
    FOIL: 'bg-yellow-100 text-yellow-700',
    'Team Photo': 'bg-green-100 text-green-700',
    Special: 'bg-purple-100 text-purple-700',
  }[sticker.sticker_type] || 'bg-gray-100 text-gray-600'

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors group">
      {/* Sticker code badge */}
      <div className="w-16 text-center">
        <span className="text-xs font-bold bg-blue-600 text-white px-2 py-1 rounded-lg">
          {sticker.sticker_code}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-800 text-sm truncate">
          {sticker.player_name || sticker.sticker_code}
        </p>
        <p className="text-xs text-gray-400">{sticker.team_name}</p>
        {sticker.club && (
          <p className="text-xs text-gray-400 truncate">{sticker.club}</p>
        )}
      </div>

      {/* Type badge */}
      <span className={`hidden sm:inline text-xs px-2 py-0.5 rounded-full font-medium ${typeColor}`}>
        {sticker.sticker_type}
      </span>

      {/* Quantity controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => changeQty(-1)}
          className="w-7 h-7 rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-600 text-gray-600 text-sm font-bold transition-colors flex items-center justify-center"
        >−</button>
        <span className="w-6 text-center font-bold text-sm text-gray-700">{quantity}</span>
        <button
          onClick={() => changeQty(1)}
          className="w-7 h-7 rounded-full bg-gray-100 hover:bg-green-100 hover:text-green-600 text-gray-600 text-sm font-bold transition-colors flex items-center justify-center"
        >+</button>
      </div>
    </div>
  )
}

const normalize = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function StickerList({ refreshToken = 0 }) {
  const [list, setList] = useState([])
  const [allStickers, setAllStickers] = useState([])
  const [search, setSearch] = useState('')
  const [filterTeam, setFilterTeam] = useState('')
  const [addCode, setAddCode] = useState('')
  const [addSearch, setAddSearch] = useState('')
  const [addResults, setAddResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Load sticker catalogue once
  useEffect(() => {
    api.get('/stickers').then(res => setAllStickers(res.data)).catch(() => {})
  }, [])

  // Re-fetch user's list whenever refreshToken changes (e.g. after scanner adds a sticker)
  useEffect(() => {
    setLoading(true)
    api.get('/stickers/list')
      .then(res => { setList(res.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [refreshToken])

  // Search stickers to add
  useEffect(() => {
    if (!addSearch.trim() && !addCode.trim()) { setAddResults([]); return }
    const q = normalize(addSearch || addCode)
    const results = allStickers
      .filter(s =>
        normalize(s.sticker_code).includes(q) ||
        normalize(s.player_name || '').includes(q) ||
        normalize(s.team_name).includes(q)
      )
      .slice(0, 8)
    setAddResults(results)
  }, [addSearch, addCode, allStickers])

  async function addSticker(stickerId) {
    try {
      const { data } = await api.post('/stickers/list', { sticker_id: stickerId })
      setList(prev => {
        const existing = prev.find(e => e.sticker.id === stickerId)
        if (existing) return prev.map(e => e.sticker.id === stickerId ? { ...e, quantity: e.quantity + 1 } : e)
        return [...prev, data]
      })
      setAddSearch('')
      setAddCode('')
      setAddResults([])
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add sticker')
    }
  }

  function updateQty(entryId, newQty) {
    setList(prev => prev.map(e => e.id === entryId ? { ...e, quantity: newQty } : e))
  }

  async function removeEntry(entryId) {
    await api.delete(`/stickers/list/${entryId}`)
    setList(prev => prev.filter(e => e.id !== entryId))
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

  const totalDups = list.reduce((sum, e) => sum + e.quantity, 0)

  if (loading) return <div className="p-8 text-center text-gray-400">Loading your stickers…</div>

  return (
    <div className="p-4 sm:p-6">
      {/* Stats bar */}
      <div className="flex gap-4 mb-6">
        <div className="bg-blue-50 rounded-xl px-4 py-3 text-center flex-1">
          <p className="text-2xl font-bold text-blue-600">{list.length}</p>
          <p className="text-xs text-blue-400 mt-0.5">Unique stickers</p>
        </div>
        <div className="bg-emerald-50 rounded-xl px-4 py-3 text-center flex-1">
          <p className="text-2xl font-bold text-emerald-600">{totalDups}</p>
          <p className="text-xs text-emerald-400 mt-0.5">Total duplicates</p>
        </div>
      </div>

      {/* Add sticker */}
      <div className="mb-5">
        <p className="text-sm font-semibold text-gray-600 mb-2">Add a duplicate sticker</p>
        <div className="flex flex-col sm:flex-row gap-2 mb-2">
          <input
            type="text"
            placeholder="Search by name or team…"
            value={addSearch}
            onChange={e => setAddSearch(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <input
            type="text"
            placeholder="Code (e.g. ARG 17)"
            value={addCode}
            onChange={e => setAddCode(e.target.value)}
            className="sm:w-36 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 uppercase"
          />
        </div>
        {addResults.length > 0 && (
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            {addResults.map(s => (
              <button
                key={s.id}
                onClick={() => addSticker(s.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 transition-colors text-left border-b border-gray-100 last:border-0"
              >
                <span className="text-xs font-bold bg-blue-600 text-white px-2 py-0.5 rounded">{s.sticker_code}</span>
                <span className="flex-1 text-sm text-gray-700 truncate">{s.player_name || s.sticker_code}</span>
                <span className="text-xs text-gray-400">{s.team_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Filter your list…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-40 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
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
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🃏</p>
          <p className="font-medium">{list.length === 0 ? 'No duplicates added yet' : 'No stickers match your filter'}</p>
          <p className="text-sm mt-1">{list.length === 0 ? 'Search above to add your first sticker' : ''}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(entry => (
            <StickerCard
              key={entry.id}
              entry={entry}
              onUpdate={updateQty}
              onRemove={removeEntry}
            />
          ))}
        </div>
      )}
    </div>
  )
}

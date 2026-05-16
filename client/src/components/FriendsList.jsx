import { useState, useEffect } from 'react'
import api from '../api/client'
import { Avatar } from '../utils/avatar'
import { useToast } from './Toast'
import { SkeletonFriendRow } from './Skeleton'

const normalize = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// ── Swap Proposal Modal ───────────────────────────────────────────────────────

function SwapProposalModal({ friend, matches, onClose, onSent }) {
  const [myDupes, setMyDupes] = useState([])
  const [pairs, setPairs] = useState(matches.map(m => ({ wanted: m, offeredId: null })))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/stickers/list').then(res => setMyDupes(res.data)).catch(() => {})
  }, [])

  function toggleWanted(entry) {
    setPairs(prev => {
      const exists = prev.find(p => p.wanted.sticker.id === entry.sticker.id)
      if (exists) return prev.filter(p => p.wanted.sticker.id !== entry.sticker.id)
      return [...prev, { wanted: entry, offeredId: null }]
    })
  }

  function setOffer(idx, offeredId) {
    setPairs(prev => prev.map((p, i) => i === idx ? { ...p, offeredId } : p))
  }

  const readyPairs = pairs.filter(p => p.offeredId !== null)

  async function submit() {
    if (readyPairs.length === 0) { setError('Pick at least one pair to swap'); return }
    setSubmitting(true)
    setError('')
    try {
      await api.post('/swaps', {
        receiver_id: friend.id,
        items: readyPairs.map(p => ({
          offered_sticker_id: p.offeredId,
          wanted_sticker_id: p.wanted.sticker.id,
        })),
      })
      onSent()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to send swap request')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[60] sm:p-4"
         onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-800">Propose Swap with {friend.username}</h3>
            <p className="text-xs text-gray-400 mt-0.5">Select what you want and what you'll offer</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {matches.map((entry) => {
            const pair = pairs.find(p => p.wanted.sticker.id === entry.sticker.id)
            const isSelected = !!pair
            const pairIdx = pairs.indexOf(pair)
            return (
              <div key={entry.sticker.id} className={`rounded-xl border-2 transition-colors ${isSelected ? 'border-blue-400 bg-blue-50/40' : 'border-gray-100'}`}>
                <button onClick={() => toggleWanted(entry)} className="w-full flex items-center gap-3 p-3 text-left">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                    {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                  <span className="text-xs font-black bg-gray-900 text-white px-2.5 py-0.5 rounded-full tracking-wider">{entry.sticker.sticker_code}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{entry.sticker.player_name || entry.sticker.sticker_code}</p>
                    <p className="text-xs text-gray-400">{entry.sticker.team_name}</p>
                  </div>
                </button>
                {isSelected && (
                  <div className="px-3 pb-3">
                    <p className="text-xs text-gray-500 mb-1.5 font-medium">You offer in return:</p>
                    <select
                      value={pair.offeredId ?? ''}
                      onChange={e => setOffer(pairIdx, e.target.value ? Number(e.target.value) : null)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <option value="">— pick one of your duplicates —</option>
                      {myDupes.map(d => (
                        <option key={d.sticker.id} value={d.sticker.id}>
                          {d.sticker.sticker_code} · {d.sticker.player_name || d.sticker.team_name} (×{d.quantity})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {error && <p className="text-red-500 text-sm px-5 pb-2">{error}</p>}

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-medium text-sm">Cancel</button>
          <button
            onClick={submit}
            disabled={submitting || readyPairs.length === 0}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl font-semibold text-sm transition-colors"
          >
            {submitting ? 'Sending…' : `Send Request (${readyPairs.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Friend Sticker Modal ──────────────────────────────────────────────────────

function FriendStickerModal({ friend, onClose }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showSwap, setShowSwap] = useState(false)
  const [swapSent, setSwapSent] = useState(false)
  const toast = useToast()

  useEffect(() => {
    api.get(`/friends/${friend.id}/stickers`)
      .then(res => { setEntries(res.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [friend.id])

  const matches = entries.filter(e => e.i_want)
  const filtered = entries.filter(e => {
    const q = normalize(search)
    return !q ||
      normalize(e.sticker.sticker_code).includes(q) ||
      normalize(e.sticker.player_name || '').includes(q) ||
      normalize(e.sticker.team_name).includes(q)
  })

  function handleSwapSent() {
    setShowSwap(false)
    setSwapSent(true)
    toast(`Swap request sent to ${friend.username} ✓`)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4"
         onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl flex flex-col shadow-2xl max-h-[85vh]">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar username={friend.username} size="md" />
            <div className="min-w-0">
              <h3 className="font-bold text-gray-800 truncate">{friend.username}'s Duplicates</h3>
              <p className="text-xs text-gray-400 mt-0.5">{entries.length} available · {matches.length} match your wanted list</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold shrink-0 ml-3">✕</button>
        </div>

        {!loading && matches.length > 0 && !swapSent && (
          <div className="mx-4 mt-3 p-3 rounded-xl flex items-center justify-between gap-3" style={{ background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)', border: '1px solid #6ee7b7' }}>
            <div>
              <p className="text-sm font-bold text-emerald-800">🎯 {matches.length} sticker{matches.length !== 1 ? 's' : ''} you want!</p>
              <p className="text-xs text-emerald-600 mt-0.5">From your wanted list</p>
            </div>
            <button
              onClick={() => setShowSwap(true)}
              className="shrink-0 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
            >
              Propose Swap
            </button>
          </div>
        )}

        {swapSent && (
          <div className="mx-4 mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-center">
            <p className="text-sm font-semibold text-blue-700">✅ Swap request sent!</p>
          </div>
        )}

        <div className="px-4 py-3">
          <input
            type="text"
            placeholder="Search stickers…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-100 animate-pulse">
                <div className="w-14 h-5 bg-gray-200 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-gray-200 rounded-full w-2/3" />
                  <div className="h-2.5 bg-gray-100 rounded-full w-1/2" />
                </div>
                <div className="w-8 h-5 bg-gray-200 rounded-full" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-8">No stickers match</p>
          ) : (
            filtered.map(entry => (
              <div key={entry.id} className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${entry.i_want ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-100'}`}>
                <span className="text-xs font-black bg-gray-900 text-white px-2.5 py-0.5 rounded-full tracking-wider shrink-0">
                  {entry.sticker.sticker_code}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{entry.sticker.player_name || entry.sticker.sticker_code}</p>
                  <p className="text-xs text-gray-400">{entry.sticker.team_name}</p>
                </div>
                {entry.i_want && <span className="text-xs font-bold text-emerald-600 shrink-0">🎯</span>}
                <span className="text-xs text-gray-500 font-bold shrink-0">×{entry.quantity}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {showSwap && (
        <SwapProposalModal friend={friend} matches={matches} onClose={() => setShowSwap(false)} onSent={handleSwapSent} />
      )}
    </div>
  )
}

// ── Friend Card ───────────────────────────────────────────────────────────────

function FriendCard({ friend, onViewStickers }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 bg-white hover:border-blue-200 hover:shadow-sm transition-all">
      <Avatar username={friend.username} size="md" />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-gray-800 text-sm">{friend.username}</p>
        {friend.country && <p className="text-xs text-gray-400">📍 {friend.country}</p>}
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-blue-500 font-medium">{friend.duplicate_count ?? '?'} dupes</span>
          {friend.match_count > 0 && (
            <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">
              🎯 {friend.match_count} match{friend.match_count !== 1 ? 'es' : ''}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => onViewStickers(friend)}
        className="text-xs bg-gray-900 hover:bg-gray-700 text-white px-3 py-1.5 rounded-xl transition-colors font-semibold shrink-0"
      >
        View List
      </button>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FriendsList() {
  const [friends, setFriends] = useState([])
  const [pending, setPending] = useState([])
  const [searchUser, setSearchUser] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searchError, setSearchError] = useState('')
  const [viewFriend, setViewFriend] = useState(null)
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  useEffect(() => {
    Promise.all([api.get('/friends'), api.get('/friends/requests')])
      .then(([fr, rr]) => { setFriends(fr.data); setPending(rr.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function findUser() {
    setSearchError('')
    setSearchResult(null)
    try {
      const { data } = await api.get(`/users/search?username=${encodeURIComponent(searchUser)}`)
      setSearchResult(data)
    } catch {
      setSearchError('User not found')
    }
  }

  async function sendRequest(userId) {
    await api.post('/friends/request', { user_id: userId })
    setSearchResult(null)
    setSearchUser('')
    toast('Friend request sent ✓')
  }

  async function respondRequest(friendshipId, accept) {
    await api.patch(`/friends/request/${friendshipId}`, { accept })
    setPending(prev => prev.filter(p => p.id !== friendshipId))
    if (accept) {
      const { data } = await api.get('/friends')
      setFriends(data)
      toast('Friend added ✓')
    }
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Pending requests */}
      {pending.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
            Pending Requests
            <span className="bg-red-100 text-red-600 rounded-full px-2 py-0.5 text-xs ml-2">{pending.length}</span>
          </p>
          <div className="space-y-2">
            {pending.map(req => (
              <div key={req.id} className="flex items-center gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50">
                <Avatar username={req.requester.username} size="sm" />
                <p className="flex-1 text-sm text-gray-700 truncate min-w-0">
                  <span className="font-bold">{req.requester.username}</span> wants to be friends
                </p>
                <button onClick={() => respondRequest(req.id, true)}
                  className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-semibold shrink-0">Accept</button>
                <button onClick={() => respondRequest(req.id, false)}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg font-semibold shrink-0">Decline</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add friend */}
      <div className="mb-6">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Add a friend</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search by username…"
            value={searchUser}
            onChange={e => setSearchUser(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && findUser()}
            className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          />
          <button onClick={findUser}
            className="px-4 py-2 bg-gray-900 hover:bg-gray-700 text-white text-sm rounded-xl font-semibold transition-colors shrink-0">Search</button>
        </div>
        {searchError && <p className="text-red-500 text-sm mt-2">{searchError}</p>}
        {searchResult && (
          <div className="mt-2 p-3 border border-gray-200 rounded-xl bg-white flex items-center gap-3">
            <Avatar username={searchResult.username} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800 truncate">{searchResult.username}</p>
              {searchResult.country && <p className="text-xs text-gray-400">{searchResult.country}</p>}
            </div>
            <button onClick={() => sendRequest(searchResult.id)}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl font-semibold shrink-0">Send Request</button>
          </div>
        )}
      </div>

      {/* Friends list */}
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
        My Friends <span className="text-gray-300 font-normal">({friends.length})</span>
      </p>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonFriendRow key={i} />)}
        </div>
      ) : friends.length === 0 ? (
        <div className="text-center py-14 text-gray-300">
          <svg viewBox="0 0 100 100" fill="none" className="w-20 h-20 mx-auto mb-4">
            <circle cx="37" cy="35" r="14" stroke="currentColor" strokeWidth="3"/>
            <path d="M9 80 Q9 58 37 58 Q65 58 65 80" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
            <circle cx="67" cy="32" r="11" stroke="currentColor" strokeWidth="3"/>
            <path d="M45 76 Q45 58 67 58 Q89 58 89 76" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
          </svg>
          <p className="font-semibold text-gray-400 text-base">No friends yet</p>
          <p className="text-sm text-gray-300 mt-1">Search for users to send a friend request</p>
        </div>
      ) : (
        <div className="space-y-2">
          {friends.map(f => (
            <FriendCard key={f.id} friend={f} onViewStickers={setViewFriend} />
          ))}
        </div>
      )}

      {viewFriend && (
        <FriendStickerModal friend={viewFriend} onClose={() => setViewFriend(null)} />
      )}
    </div>
  )
}

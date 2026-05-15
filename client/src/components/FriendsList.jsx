import { useState, useEffect } from 'react'
import api from '../api/client'

const normalize = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// ── Swap Proposal Modal ───────────────────────────────────────────────────────
// Shows stickers from friend's list that you want, lets you pick which of your
// duplicates to offer for each, then submits as one bundle swap request.

function SwapProposalModal({ friend, matches, onClose, onSent }) {
  const [myDupes, setMyDupes] = useState([])
  // pairs: { wantedEntry (friend's), offeredId (my sticker id) }
  const [pairs, setPairs] = useState(
    matches.map(m => ({ wanted: m, offeredId: null }))
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/stickers/list').then(res => setMyDupes(res.data)).catch(() => {})
  }, [])

  function setOffer(idx, offeredId) {
    setPairs(prev => prev.map((p, i) => i === idx ? { ...p, offeredId } : p))
  }

  function toggleWanted(entry) {
    setPairs(prev => {
      const exists = prev.find(p => p.wanted.sticker.id === entry.sticker.id)
      if (exists) return prev.filter(p => p.wanted.sticker.id !== entry.sticker.id)
      return [...prev, { wanted: entry, offeredId: null }]
    })
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
          {matches.map((entry, idx) => {
            const pair = pairs.find(p => p.wanted.sticker.id === entry.sticker.id)
            const isSelected = !!pair
            return (
              <div key={entry.sticker.id} className={`rounded-xl border-2 transition-colors ${isSelected ? 'border-blue-400 bg-blue-50/40' : 'border-gray-100'}`}>
                {/* Header row — toggle selection */}
                <button
                  onClick={() => toggleWanted(entry)}
                  className="w-full flex items-center gap-3 p-3 text-left"
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                    {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                  <span className="text-xs font-bold bg-blue-600 text-white px-2 py-0.5 rounded">{entry.sticker.sticker_code}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{entry.sticker.player_name || entry.sticker.sticker_code}</p>
                    <p className="text-xs text-gray-400">{entry.sticker.team_name}</p>
                  </div>
                </button>

                {/* Offer picker — shown when selected */}
                {isSelected && (
                  <div className="px-3 pb-3">
                    <p className="text-xs text-gray-500 mb-1.5 font-medium">You offer in return:</p>
                    <select
                      value={pair.offeredId ?? ''}
                      onChange={e => setOffer(pairs.indexOf(pair), e.target.value ? Number(e.target.value) : null)}
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
            {submitting ? 'Sending…' : `Send Request (${readyPairs.length} sticker${readyPairs.length !== 1 ? 's' : ''})`}
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4"
         onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl flex flex-col shadow-2xl max-h-[85vh]">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-800">{friend.username}'s Duplicates</h3>
            <p className="text-xs text-gray-400 mt-0.5">{entries.length} available · {matches.length} match your wanted list</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
        </div>

        {/* Matches banner */}
        {!loading && matches.length > 0 && !swapSent && (
          <div className="mx-4 mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-emerald-700">🎯 {matches.length} sticker{matches.length !== 1 ? 's' : ''} you want!</p>
              <p className="text-xs text-emerald-600 mt-0.5">They have stickers from your wanted list</p>
            </div>
            <button
              onClick={() => setShowSwap(true)}
              className="shrink-0 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
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

        {/* Search */}
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
            <p className="text-center text-gray-400 py-8">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-8">No stickers match</p>
          ) : (
            filtered.map(entry => (
              <div key={entry.id} className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${entry.i_want ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-100'}`}>
                <span className="text-xs font-bold bg-blue-600 text-white px-2 py-0.5 rounded">
                  {entry.sticker.sticker_code}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{entry.sticker.player_name || entry.sticker.sticker_code}</p>
                  <p className="text-xs text-gray-400">{entry.sticker.team_name}</p>
                </div>
                {entry.i_want && <span className="text-xs font-medium text-emerald-600 shrink-0">🎯 You want</span>}
                <span className="text-xs text-gray-500 font-medium shrink-0">×{entry.quantity}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {showSwap && (
        <SwapProposalModal
          friend={friend}
          matches={matches}
          onClose={() => setShowSwap(false)}
          onSent={() => { setShowSwap(false); setSwapSent(true) }}
        />
      )}
    </div>
  )
}

// ── Friend Card ───────────────────────────────────────────────────────────────

function FriendCard({ friend, onViewStickers }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors">
      <div className="w-10 h-10 rounded-full bg-emerald-400 flex items-center justify-center text-white font-bold shrink-0">
        {friend.username[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-800 text-sm">{friend.username}</p>
        {friend.country && <p className="text-xs text-gray-400">📍 {friend.country}</p>}
        <p className="text-xs text-blue-500 mt-0.5">{friend.duplicate_count ?? '?'} duplicates</p>
      </div>
      <button
        onClick={() => onViewStickers(friend)}
        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors font-medium shrink-0"
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

  useEffect(() => {
    Promise.all([
      api.get('/friends'),
      api.get('/friends/requests'),
    ]).then(([friendsRes, requestsRes]) => {
      setFriends(friendsRes.data)
      setPending(requestsRes.data)
      setLoading(false)
    }).catch(() => setLoading(false))
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
  }

  async function respondRequest(friendshipId, accept) {
    await api.patch(`/friends/request/${friendshipId}`, { accept })
    setPending(prev => prev.filter(p => p.id !== friendshipId))
    if (accept) {
      const { data } = await api.get('/friends')
      setFriends(data)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading friends…</div>

  return (
    <div className="p-4 sm:p-6">
      {/* Pending requests */}
      {pending.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-600 mb-3">
            Pending Requests <span className="bg-red-100 text-red-600 rounded-full px-2 py-0.5 text-xs ml-1">{pending.length}</span>
          </h3>
          <div className="space-y-2">
            {pending.map(req => (
              <div key={req.id} className="flex items-center gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50">
                <div className="w-9 h-9 rounded-full bg-amber-400 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {req.requester.username[0].toUpperCase()}
                </div>
                <p className="flex-1 text-sm font-medium text-gray-700 truncate">
                  <span className="font-semibold">{req.requester.username}</span> wants to be friends
                </p>
                <button onClick={() => respondRequest(req.id, true)}
                  className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-medium shrink-0">Accept</button>
                <button onClick={() => respondRequest(req.id, false)}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg font-medium shrink-0">Decline</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add friend */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-600 mb-2">Add a friend</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search by username…"
            value={searchUser}
            onChange={e => setSearchUser(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && findUser()}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button onClick={findUser}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-xl font-medium transition-colors shrink-0">Search</button>
        </div>
        {searchError && <p className="text-red-500 text-sm mt-2">{searchError}</p>}
        {searchResult && (
          <div className="mt-2 p-3 border border-gray-200 rounded-xl flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-400 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {searchResult.username[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{searchResult.username}</p>
              {searchResult.country && <p className="text-xs text-gray-400">{searchResult.country}</p>}
            </div>
            <button onClick={() => sendRequest(searchResult.id)}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium shrink-0">Send Request</button>
          </div>
        )}
      </div>

      {/* Friends list */}
      <h3 className="text-sm font-semibold text-gray-600 mb-3">
        My Friends <span className="text-gray-400">({friends.length})</span>
      </h3>
      {friends.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">👥</p>
          <p className="font-medium">No friends yet</p>
          <p className="text-sm mt-1">Search for users to send a friend request</p>
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

import { useState, useEffect } from 'react'
import api from '../api/client'

function FriendCard({ friend, onViewStickers }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors">
      <div className="w-10 h-10 rounded-full bg-emerald-400 flex items-center justify-center text-white font-bold">
        {friend.username[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-800 text-sm">{friend.username}</p>
        {friend.country && <p className="text-xs text-gray-400">📍 {friend.country}</p>}
        <p className="text-xs text-blue-500 mt-0.5">{friend.duplicate_count ?? '?'} duplicates available</p>
      </div>
      <button
        onClick={() => onViewStickers(friend)}
        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
      >
        View List
      </button>
    </div>
  )
}

function FriendStickerModal({ friend, onClose }) {
  const [stickers, setStickers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/friends/${friend.id}/stickers`)
      .then(res => { setStickers(res.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [friend.id])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl flex flex-col shadow-2xl max-h-[85vh]">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-800">{friend.username}'s Duplicates</h3>
            <p className="text-xs text-gray-400 mt-0.5">{stickers.length} stickers available to swap</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {loading ? (
            <p className="text-center text-gray-400 py-8">Loading…</p>
          ) : stickers.length === 0 ? (
            <p className="text-center text-gray-400 py-8">No duplicates listed yet</p>
          ) : (
            stickers.map(entry => (
              <div key={entry.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100">
                <span className="text-xs font-bold bg-blue-600 text-white px-2 py-0.5 rounded">
                  {entry.sticker.sticker_code}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{entry.sticker.player_name || entry.sticker.sticker_code}</p>
                  <p className="text-xs text-gray-400">{entry.sticker.team_name}</p>
                </div>
                <span className="text-xs text-gray-500 font-medium">×{entry.quantity}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

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
                <div className="w-9 h-9 rounded-full bg-amber-400 flex items-center justify-center text-white font-bold text-sm">
                  {req.requester.username[0].toUpperCase()}
                </div>
                <p className="flex-1 text-sm font-medium text-gray-700">
                  <span className="font-semibold">{req.requester.username}</span> wants to be friends
                </p>
                <button
                  onClick={() => respondRequest(req.id, true)}
                  className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
                >Accept</button>
                <button
                  onClick={() => respondRequest(req.id, false)}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors font-medium"
                >Decline</button>
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
          <button
            onClick={findUser}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-xl font-medium transition-colors"
          >Search</button>
        </div>
        {searchError && <p className="text-red-500 text-sm mt-2">{searchError}</p>}
        {searchResult && (
          <div className="mt-2 p-3 border border-gray-200 rounded-xl flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-400 flex items-center justify-center text-white font-bold text-sm">
              {searchResult.username[0].toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">{searchResult.username}</p>
              {searchResult.country && <p className="text-xs text-gray-400">{searchResult.country}</p>}
            </div>
            <button
              onClick={() => sendRequest(searchResult.id)}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
            >Send Request</button>
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

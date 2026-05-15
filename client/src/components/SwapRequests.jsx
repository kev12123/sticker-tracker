import { useState, useEffect } from 'react'
import api from '../api/client'

const STATUS_STYLES = {
  pending:   'bg-amber-100 text-amber-700',
  accepted:  'bg-emerald-100 text-emerald-700',
  rejected:  'bg-red-100 text-red-600',
  cancelled: 'bg-gray-100 text-gray-500',
}

function SwapCard({ swap, currentUserId, onRespond }) {
  const isReceiver = swap.receiver_id === currentUserId
  const other = isReceiver ? swap.offerer : swap.receiver

  return (
    <div className="p-4 rounded-xl border border-gray-100 hover:border-blue-100 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-blue-400 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {other.username[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{other.username}</p>
            <p className="text-xs text-gray-400">{isReceiver ? 'wants to swap with you' : 'swap request sent'}</p>
          </div>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${STATUS_STYLES[swap.status]}`}>
          {swap.status}
        </span>
      </div>

      {/* Items */}
      <div className="space-y-2 mb-3">
        {swap.items.map(item => (
          <div key={item.id} className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
            <div className="flex-1 min-w-0 text-center">
              <p className="text-xs text-gray-400 mb-0.5">They give</p>
              <span className="text-xs font-bold bg-blue-600 text-white px-2 py-0.5 rounded">
                {item.offered_sticker.sticker_code}
              </span>
              <p className="text-xs text-gray-600 mt-0.5 truncate">{item.offered_sticker.player_name || item.offered_sticker.team_name}</p>
            </div>
            <span className="text-gray-300 font-bold shrink-0">⇄</span>
            <div className="flex-1 min-w-0 text-center">
              <p className="text-xs text-gray-400 mb-0.5">They want</p>
              <span className="text-xs font-bold bg-emerald-600 text-white px-2 py-0.5 rounded">
                {item.wanted_sticker.sticker_code}
              </span>
              <p className="text-xs text-gray-600 mt-0.5 truncate">{item.wanted_sticker.player_name || item.wanted_sticker.team_name}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      {swap.status === 'pending' && isReceiver && (
        <div className="flex gap-2">
          <button onClick={() => onRespond(swap.id, 'accepted')}
            className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition-colors">Accept</button>
          <button onClick={() => onRespond(swap.id, 'rejected')}
            className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold rounded-lg transition-colors">Decline</button>
        </div>
      )}
      {swap.status === 'pending' && !isReceiver && (
        <button onClick={() => onRespond(swap.id, 'cancelled')}
          className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-500 text-xs font-semibold rounded-lg transition-colors">Cancel Request</button>
      )}
    </div>
  )
}

export default function SwapRequests() {
  const [swaps, setSwaps] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState(null)

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    setCurrentUserId(user.id)
    api.get('/swaps')
      .then(res => { setSwaps(res.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleRespond(swapId, status) {
    await api.patch(`/swaps/${swapId}`, { status })
    setSwaps(prev => prev.map(s => s.id === swapId ? { ...s, status } : s))
  }

  const pending = swaps.filter(s => s.status === 'pending')
  const past = swaps.filter(s => s.status !== 'pending')

  if (loading) return <div className="p-8 text-center text-gray-400">Loading swaps…</div>

  return (
    <div className="p-4 sm:p-6">
      {swaps.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🔄</p>
          <p className="font-medium">No swap requests yet</p>
          <p className="text-sm mt-1">Add stickers to your Wanted list, then view a friend's duplicates to propose a swap</p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-600 mb-3">
                Active <span className="bg-amber-100 text-amber-600 rounded-full px-2 py-0.5 text-xs ml-1">{pending.length}</span>
              </h3>
              <div className="space-y-3">
                {pending.map(s => (
                  <SwapCard key={s.id} swap={s} currentUserId={currentUserId} onRespond={handleRespond} />
                ))}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 mb-3">Past Requests</h3>
              <div className="space-y-3 opacity-75">
                {past.map(s => (
                  <SwapCard key={s.id} swap={s} currentUserId={currentUserId} onRespond={handleRespond} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import api from '../api/client'
import { Avatar } from '../utils/avatar'
import { useToast } from './Toast'
import { SkeletonSwapCard } from './Skeleton'

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
    <div className="p-4 rounded-xl border border-gray-100 bg-white hover:border-blue-100 transition-colors shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar username={other.username} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-800 truncate">{other.username}</p>
            <p className="text-xs text-gray-400">{isReceiver ? 'wants to trade with you' : 'trade request sent'}</p>
          </div>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${STATUS_STYLES[swap.status]}`}>
          {swap.status}
        </span>
      </div>

      <div className="space-y-2 mb-3">
        {swap.items.map(item => (
          <div key={item.id} className="flex items-center gap-2 text-sm bg-gray-50 rounded-xl px-3 py-2.5">
            <div className="flex-1 min-w-0 text-center">
              <p className="text-xs text-gray-400 mb-1">They give</p>
              <span className="text-xs font-black bg-gray-900 text-white px-2.5 py-0.5 rounded-full tracking-wider">
                {item.offered_sticker.sticker_code}
              </span>
              <p className="text-xs text-gray-500 mt-1 truncate">{item.offered_sticker.player_name || item.offered_sticker.team_name}</p>
            </div>
            <span className="text-gray-300 font-bold shrink-0 text-lg">⇄</span>
            <div className="flex-1 min-w-0 text-center">
              <p className="text-xs text-gray-400 mb-1">They want</p>
              <span className="text-xs font-black bg-blue-600 text-white px-2.5 py-0.5 rounded-full tracking-wider">
                {item.wanted_sticker.sticker_code}
              </span>
              <p className="text-xs text-gray-500 mt-1 truncate">{item.wanted_sticker.player_name || item.wanted_sticker.team_name}</p>
            </div>
          </div>
        ))}
      </div>

      {swap.status === 'pending' && isReceiver && (
        <div className="flex gap-2">
          <button onClick={() => onRespond(swap.id, 'accepted')}
            className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-colors">Accept</button>
          <button onClick={() => onRespond(swap.id, 'rejected')}
            className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-colors">Decline</button>
        </div>
      )}
      {swap.status === 'pending' && !isReceiver && (
        <button onClick={() => onRespond(swap.id, 'cancelled')}
          className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-500 text-xs font-bold rounded-xl transition-colors">Cancel Request</button>
      )}
    </div>
  )
}

export default function SwapRequests() {
  const [swaps, setSwaps] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState(null)
  const toast = useToast()

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
    const msgs = { accepted: 'Trade accepted ✓', rejected: 'Trade declined', cancelled: 'Trade cancelled' }
    toast(msgs[status] || 'Updated', status === 'accepted' ? 'success' : 'info')
  }

  const pending = swaps.filter(s => s.status === 'pending')
  const past = swaps.filter(s => s.status !== 'pending')

  return (
    <div className="p-4 sm:p-6">
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => <SkeletonSwapCard key={i} />)}
        </div>
      ) : swaps.length === 0 ? (
        <div className="text-center py-14 text-gray-300">
          <svg viewBox="0 0 100 100" fill="none" className="w-20 h-20 mx-auto mb-4">
            <path d="M18 38 H78 L62 22" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M82 62 H22 L38 78" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p className="font-semibold text-gray-400 text-base">No trade requests yet</p>
          <p className="text-sm text-gray-300 mt-1">Add stickers to your Wanted list, then view a friend's duplicates</p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                Active
                <span className="bg-amber-100 text-amber-600 rounded-full px-2 py-0.5 text-xs ml-2">{pending.length}</span>
              </p>
              <div className="space-y-3">
                {pending.map(s => (
                  <SwapCard key={s.id} swap={s} currentUserId={currentUserId} onRespond={handleRespond} />
                ))}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Past Requests</p>
              <div className="space-y-3 opacity-60">
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

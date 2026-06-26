import { useState, useEffect, useRef } from 'react'
import api from '../api/client'
import { SkeletonRow } from './Skeleton'

function StickerBadge({ sticker }) {
  const isFoil = sticker.sticker_type === 'FOIL'
  return (
    <span className={`text-xs font-black px-2.5 py-1 rounded-full tracking-wider ${isFoil ? 'foil-badge' : 'bg-gray-900 text-white'}`}>
      {sticker.sticker_code}
    </span>
  )
}

export default function WantedQuickList({ onLeave }) {
  const [wanted, setWanted] = useState([])
  const [loading, setLoading] = useState(true)
  const [got, setGot] = useState(new Set())
  const gotRef = useRef(got)

  useEffect(() => { gotRef.current = got }, [got])

  useEffect(() => {
    api.get('/stickers/wanted')
      .then(res => { setWanted(res.data); setLoading(false) })
      .catch(() => setLoading(false))

    return () => {
      const toggled = gotRef.current
      toggled.forEach(entryId => {
        api.delete(`/stickers/wanted/${entryId}`).catch(() => {})
      })
      if (toggled.size > 0) onLeave?.()
    }
  }, [])

  function toggle(entryId) {
    setGot(prev => {
      const next = new Set(prev)
      if (next.has(entryId)) next.delete(entryId)
      else next.add(entryId)
      return next
    })
  }

  if (loading) return (
    <div className="p-4 sm:p-6 space-y-2">
      {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
    </div>
  )

  if (wanted.length === 0) return (
    <div className="text-center py-14 text-gray-300 p-4">
      <svg viewBox="0 0 100 100" fill="none" className="w-20 h-20 mx-auto mb-4">
        <circle cx="50" cy="50" r="34" stroke="currentColor" strokeWidth="3"/>
        <circle cx="50" cy="50" r="21" stroke="currentColor" strokeWidth="3"/>
        <circle cx="50" cy="50" r="8" fill="currentColor" opacity="0.4"/>
      </svg>
      <p className="font-semibold text-gray-400 text-base">Your wanted list is empty</p>
      <p className="text-sm text-gray-300 mt-1">Add stickers you need in the Wanted tab</p>
    </div>
  )

  const gotCount = got.size

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Tap to mark as received
        </p>
        {gotCount > 0 && (
          <span className="text-xs font-semibold text-rose-500 bg-rose-50 px-2.5 py-1 rounded-full">
            {gotCount} received
          </span>
        )}
      </div>
      <div className="space-y-2">
        {wanted.map(entry => {
          const isGot = got.has(entry.id)
          return (
            <div
              key={entry.id}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                isGot
                  ? 'border-gray-100 bg-gray-50/80 opacity-50'
                  : 'border-gray-100 hover:border-rose-200 hover:bg-rose-50/30'
              }`}
            >
              <div className="shrink-0">
                <StickerBadge sticker={entry.sticker} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm truncate transition-colors ${isGot ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                  {entry.sticker.player_name || entry.sticker.sticker_code}
                </p>
                <p className="text-xs text-gray-400 truncate">{entry.sticker.team_name}</p>
              </div>
              <button
                onClick={() => toggle(entry.id)}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all active:scale-90 ${
                  isGot
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-rose-500 text-white shadow-sm hover:bg-rose-600'
                }`}
              >
                {isGot ? '✓' : '★'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

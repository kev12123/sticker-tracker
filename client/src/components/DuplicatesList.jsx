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

export default function DuplicatesList({ onLeave }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [given, setGiven] = useState(new Set())
  const givenRef = useRef(given)
  const listRef = useRef(list)

  useEffect(() => { givenRef.current = given }, [given])
  useEffect(() => { listRef.current = list }, [list])

  useEffect(() => {
    api.get('/stickers/list')
      .then(res => {
        setList(res.data.filter(e => e.quantity > 1))
        setLoading(false)
      })
      .catch(() => setLoading(false))

    return () => {
      const toggled = givenRef.current
      toggled.forEach(entryId => {
        api.patch(`/stickers/list/${entryId}`, { quantity: 1 }).catch(() => {})
      })
      if (toggled.size > 0) onLeave?.()
    }
  }, [])

  function toggle(entryId) {
    setGiven(prev => {
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

  if (list.length === 0) return (
    <div className="text-center py-14 text-gray-300 p-4">
      <svg viewBox="0 0 100 100" fill="none" className="w-20 h-20 mx-auto mb-4">
        <rect x="18" y="28" width="58" height="52" rx="8" stroke="currentColor" strokeWidth="3"/>
        <rect x="30" y="14" width="34" height="22" rx="5" fill="currentColor" opacity="0.35"/>
        <line x1="30" y1="50" x2="70" y2="50" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
        <line x1="30" y1="62" x2="54" y2="62" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      </svg>
      <p className="font-semibold text-gray-400 text-base">No duplicates yet</p>
      <p className="text-sm text-gray-300 mt-1">Scan stickers to start building your collection</p>
    </div>
  )

  const givenCount = given.size

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Tap the count to mark as given away
        </p>
        {givenCount > 0 && (
          <span className="text-xs font-semibold text-blue-500 bg-blue-50 px-2.5 py-1 rounded-full">
            {givenCount} to give
          </span>
        )}
      </div>
      <div className="space-y-2">
        {list.map(entry => {
          const isGiven = given.has(entry.id)
          const dupCount = entry.quantity - 1
          return (
            <div
              key={entry.id}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                isGiven
                  ? 'border-gray-100 bg-gray-50/80 opacity-50'
                  : 'border-gray-100 hover:border-blue-200 hover:bg-blue-50/30'
              }`}
            >
              <div className="shrink-0">
                <StickerBadge sticker={entry.sticker} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm truncate transition-colors ${isGiven ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                  {entry.sticker.player_name || entry.sticker.sticker_code}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {entry.sticker.team_name}{entry.sticker.club ? ` · ${entry.sticker.club}` : ''}
                </p>
              </div>
              <button
                onClick={() => toggle(entry.id)}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all active:scale-90 ${
                  isGiven
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
                }`}
              >
                {isGiven ? '✓' : dupCount}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

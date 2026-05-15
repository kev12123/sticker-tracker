import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import StickerList from '../components/StickerList'
import FriendsList from '../components/FriendsList'
import SwapRequests from '../components/SwapRequests'
import StickerScanner from '../components/StickerScanner'

const TABS = [
  { id: 'stickers', icon: '🃏', label: 'Duplicates' },
  { id: 'friends',  icon: '👥', label: 'Friends' },
  { id: 'swaps',    icon: '🔄', label: 'Swaps' },
]

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState('stickers')
  const [scanOpen, setScanOpen] = useState(false)
  const [scanKey, setScanKey] = useState(0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-gradient-to-r from-blue-900 to-blue-700 shadow sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-bold text-base">
            <span>⚽</span>
            <span>Panini Tracker</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-400 flex items-center justify-center text-white font-bold text-sm shrink-0">
                {user.username[0].toUpperCase()}
              </div>
              <span className="text-white font-medium text-sm hidden xs:block">{user.username}</span>
            </div>
            <button
              onClick={logout}
              className="text-blue-200 hover:text-white text-sm transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* Profile Hero — compact on mobile */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-700 pb-5 pt-2">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-emerald-400 flex items-center justify-center text-white font-bold text-2xl sm:text-3xl shadow-lg shrink-0">
              {user.username[0].toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg sm:text-2xl font-bold text-white leading-tight">{user.username}</h2>
              {user.country && (
                <p className="text-blue-200 text-xs sm:text-sm mt-0.5">📍 {user.country}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-5xl mx-auto px-2 sm:px-4">
        <div className="flex border-b border-gray-200 bg-white rounded-t-xl mt-4 shadow-sm">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-white shadow-sm rounded-b-xl min-h-96">
          {tab === 'stickers' && <StickerList refreshToken={scanKey} />}
          {tab === 'friends'  && <FriendsList />}
          {tab === 'swaps'    && <SwapRequests />}
        </div>
      </div>

      {/* Spacer for floating button + safe area */}
      <div className="h-28" />

      {/* Floating scan button — above safe area */}
      <button
        onClick={() => setScanOpen(true)}
        style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
        className="fixed right-5 w-16 h-16 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-full shadow-2xl flex items-center justify-center text-2xl transition-all active:scale-95 z-40"
        title="Scan a sticker"
      >
        📷
      </button>

      {/* Scanner modal — bottom sheet on mobile, centered on desktop */}
      {scanOpen && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setScanOpen(false) }}
        >
          <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col"
               style={{ maxHeight: 'calc(95vh - env(safe-area-inset-top, 0px))' }}>
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
              <h3 className="font-bold text-gray-800 text-lg">Scan Sticker</h3>
              <button
                onClick={() => setScanOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-bold transition-colors"
              >✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              <StickerScanner
                key={scanKey}
                onAdded={() => {
                  setScanKey(k => k + 1)
                  setScanOpen(false)
                  setTab('stickers')
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

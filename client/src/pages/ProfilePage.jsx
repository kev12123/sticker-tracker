import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import StickerList from '../components/StickerList'
import FriendsList from '../components/FriendsList'
import SwapRequests from '../components/SwapRequests'
import StickerScanner from '../components/StickerScanner'

const TABS = [
  { id: 'stickers', label: '🃏 My Duplicates' },
  { id: 'friends',  label: '👥 Friends' },
  { id: 'swaps',    label: '🔄 Swap Requests' },
]

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState('stickers')
  const [scanOpen, setScanOpen] = useState(false)
  const [scanKey, setScanKey] = useState(0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-gradient-to-r from-blue-900 to-blue-700 shadow">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-bold text-lg">
            <span>⚽</span>
            <span>Panini Tracker</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-blue-200 text-sm hidden sm:block">{user.country}</span>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-400 flex items-center justify-center text-white font-bold text-sm">
                {user.username[0].toUpperCase()}
              </div>
              <span className="text-white font-medium text-sm">{user.username}</span>
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

      {/* Profile Hero */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-700 pb-8 pt-2">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-full bg-emerald-400 flex items-center justify-center text-white font-bold text-3xl shadow-lg">
              {user.username[0].toUpperCase()}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">{user.username}</h2>
              {user.country && (
                <p className="text-blue-200 text-sm mt-0.5">📍 {user.country}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex border-b border-gray-200 bg-white rounded-t-xl mt-6 shadow-sm">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 sm:flex-none px-6 py-4 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
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

      <div className="h-24" />

      {/* Floating scan button */}
      <button
        onClick={() => setScanOpen(true)}
        className="fixed bottom-6 right-6 w-16 h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center text-2xl transition-all hover:scale-110 z-40"
        title="Scan a sticker"
      >
        📷
      </button>

      {/* Scanner modal */}
      {scanOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl overflow-hidden shadow-2xl max-h-screen sm:max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
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
                  if (tab !== 'stickers') setTab('stickers')
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

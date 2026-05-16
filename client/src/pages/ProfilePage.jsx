import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Avatar } from '../utils/avatar'
import { Logo } from '../components/Logo'
import StickerList from '../components/StickerList'
import FriendsList from '../components/FriendsList'
import SwapRequests from '../components/SwapRequests'
import StickerScanner from '../components/StickerScanner'
import WantedList from '../components/WantedList'

const TABS = [
  { id: 'stickers', icon: '🎴', label: 'Dupes' },
  { id: 'wanted',   icon: '🎯', label: 'Wanted' },
  { id: 'friends',  icon: '👥', label: 'Friends' },
  { id: 'swaps',    icon: '🔄', label: 'Swaps' },
]

function MobileNavItem({ tab, active, onClick }) {
  const isActive = active === tab.id
  return (
    <button
      onClick={() => onClick(tab.id)}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors ${isActive ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
    >
      <span className="text-xl leading-none">{tab.icon}</span>
      <span className="text-[10px] font-semibold tracking-wide">{tab.label}</span>
    </button>
  )
}

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState('stickers')
  const [scanOpen, setScanOpen] = useState(false)
  const [scanKey, setScanKey] = useState(0)

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Navbar */}
      <header className="sticky top-0 z-30 shadow-md" style={{ background: 'linear-gradient(135deg, #0f0c29, #302b63)' }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-black text-base tracking-tight">
            <Logo size={28} />
            <span>Sticker Trader</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Avatar username={user.username} size="sm" />
              <span className="text-white font-medium text-sm hidden xs:block">{user.username}</span>
            </div>
            <button onClick={logout} className="text-indigo-300 hover:text-white text-sm transition-colors font-medium">
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* Profile Hero */}
      <div className="pb-6 pt-3" style={{ background: 'linear-gradient(135deg, #0f0c29, #302b63)' }}>
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-4">
            <Avatar username={user.username} size="xl" className="shadow-xl ring-4 ring-white/20" />
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">{user.username}</h2>
              {user.country && (
                <p className="text-indigo-300 text-xs sm:text-sm mt-1">📍 {user.country}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop tabs — hidden on mobile */}
      <div className="max-w-5xl mx-auto px-2 sm:px-4 hidden sm:block">
        <div className="flex border-b border-gray-200 bg-white rounded-t-xl mt-4 shadow-sm">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 sm:px-6 py-4 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                tab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-400 hover:text-gray-700'
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <div className="bg-white shadow-sm rounded-b-xl min-h-96">
          {tab === 'stickers' && <StickerList refreshToken={scanKey} />}
          {tab === 'wanted'   && <WantedList />}
          {tab === 'friends'  && <FriendsList />}
          {tab === 'swaps'    && <SwapRequests />}
        </div>
        <div className="h-8" />
      </div>

      {/* Mobile content — shown without top tabs */}
      <div className="sm:hidden max-w-5xl mx-auto px-0">
        <div className="bg-white shadow-sm min-h-96">
          {tab === 'stickers' && <StickerList refreshToken={scanKey} />}
          {tab === 'wanted'   && <WantedList />}
          {tab === 'friends'  && <FriendsList />}
          {tab === 'swaps'    && <SwapRequests />}
        </div>
        <div className="h-24" />
      </div>

      {/* Desktop floating scan button — hidden on Wanted tab */}
      <button
        onClick={() => setScanOpen(true)}
        style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
        className={`fixed right-5 w-16 h-16 items-center justify-center bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-full shadow-2xl text-2xl transition-all active:scale-95 z-40 ${tab === 'wanted' ? 'hidden' : 'hidden sm:flex'}`}
        title="Scan a sticker"
      >
        📷
      </button>

      {/* Mobile bottom nav with scan button in center */}
      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 shadow-2xl z-40"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-end">
          <MobileNavItem tab={TABS[0]} active={tab} onClick={setTab} />
          <MobileNavItem tab={TABS[1]} active={tab} onClick={setTab} />
          {/* Scan button */}
          <button
            onClick={() => tab !== 'wanted' && setScanOpen(true)}
            className="flex-1 flex flex-col items-center pb-2 -mt-1"
          >
            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl shadow-lg ring-4 ring-white -mt-5 transition-all active:scale-95 ${tab === 'wanted' ? 'bg-gray-300' : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'}`}>
              📷
            </div>
            <span className="text-[10px] font-semibold text-gray-400 mt-1">Scan</span>
          </button>
          <MobileNavItem tab={TABS[2]} active={tab} onClick={setTab} />
          <MobileNavItem tab={TABS[3]} active={tab} onClick={setTab} />
        </div>
      </nav>

      {/* Scanner modal */}
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
                onAdded={() => setScanKey(k => k + 1)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

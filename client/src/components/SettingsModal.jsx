import { useState } from 'react'
import { Avatar } from '../utils/avatar'
import api from '../api/client'

export default function SettingsModal({ user, onClose, onCleared }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function clearDuplicates() {
    setError('')
    setLoading(true)
    try {
      await api.delete('/stickers/list')
      onCleared?.()
      setConfirming(false)
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl"
           style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-800 text-lg">Settings</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-bold transition-colors"
          >✕</button>
        </div>

        {/* User info */}
        <div className="px-5 py-4 flex items-center gap-3 border-b border-gray-100">
          <Avatar username={user.username} size="lg" />
          <div>
            <p className="font-bold text-gray-800">{user.username}</p>
            {user.country && <p className="text-sm text-gray-500">📍 {user.country}</p>}
            <p className="text-xs text-gray-400 mt-0.5">{user.email}</p>
          </div>
        </div>

        {/* Duplicate list */}
        <div className="px-5 py-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Duplicate List</p>

          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="w-full py-3 rounded-2xl border-2 border-red-200 text-red-500 font-semibold hover:bg-red-50 transition-colors"
            >
              Clear duplicate list
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 text-center px-2">
                This will remove <strong>all stickers</strong> from your duplicate list. This cannot be undone.
              </p>
              {error && <p className="text-sm text-red-500 text-center">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setConfirming(false); setError('') }}
                  className="flex-1 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={clearDuplicates}
                  disabled={loading}
                  className="flex-1 py-3 rounded-2xl bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white font-semibold transition-colors"
                >
                  {loading ? 'Clearing…' : 'Yes, clear all'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

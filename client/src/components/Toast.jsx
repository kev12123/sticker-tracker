import { createContext, useContext, useState, useCallback } from 'react'

const ToastCtx = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((msg, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }, [])

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div
        className="fixed left-1/2 z-[200] flex flex-col-reverse gap-2 pointer-events-none"
        style={{
          bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
          transform: 'translateX(-50%)',
          width: 'max-content',
          maxWidth: 'min(90vw, 360px)',
        }}
      >
        {toasts.map(t => (
          <div
            key={t.id}
            className={`text-white text-sm font-semibold px-5 py-2.5 rounded-2xl shadow-xl toast-enter ${
              t.type === 'error' ? 'bg-red-500' : t.type === 'info' ? 'bg-blue-600' : 'bg-emerald-500'
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

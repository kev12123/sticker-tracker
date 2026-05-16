const GRADIENTS = [
  ['#3b82f6', '#6366f1'],
  ['#10b981', '#0d9488'],
  ['#8b5cf6', '#a855f7'],
  ['#f43f5e', '#ec4899'],
  ['#f59e0b', '#f97316'],
  ['#06b6d4', '#3b82f6'],
  ['#84cc16', '#10b981'],
]

function avatarGradient(username) {
  let hash = 0
  for (const c of username) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]
}

const SIZE = {
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-2xl',
  xl: 'w-16 h-16 text-3xl',
}

export function Avatar({ username, size = 'md', className = '' }) {
  const [from, to] = avatarGradient(username)
  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-bold shrink-0 ${SIZE[size]} ${className}`}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {username[0].toUpperCase()}
    </div>
  )
}

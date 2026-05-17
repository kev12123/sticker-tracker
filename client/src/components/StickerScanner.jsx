import { useRef, useState, useEffect, useCallback } from 'react'
import api from '../api/client'

const STATES = {
  IDLE: 'idle',
  CAMERA: 'camera',
  PROCESSING: 'processing',
  MATCH: 'match',
  CANDIDATES: 'candidates',
  NO_MATCH: 'no_match',
  MANUAL: 'manual',
  ADDED: 'added',
  ERROR: 'error',
}

function StickerResult({ sticker, quantity }) {
  const typeColor = {
    Player: 'bg-blue-100 text-blue-700',
    FOIL: 'bg-yellow-100 text-yellow-700',
    'Team Photo': 'bg-green-100 text-green-700',
    Special: 'bg-purple-100 text-purple-700',
  }[sticker.sticker_type] || 'bg-gray-100 text-gray-600'

  return (
    <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 w-full max-w-sm mx-auto">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <span className="text-lg font-bold bg-blue-600 text-white px-3 py-1.5 rounded-xl block text-center">
            {sticker.sticker_code}
          </span>
          {quantity > 0 && (
            <p className="text-xs text-center text-amber-500 mt-1 font-medium">
              Already have ×{quantity}
            </p>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-800 text-lg leading-tight truncate">
            {sticker.player_name || sticker.sticker_code}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">{sticker.team_name}</p>
          {sticker.club && (
            <p className="text-xs text-gray-400 mt-1">{sticker.club}</p>
          )}
          <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full font-medium ${typeColor}`}>
            {sticker.sticker_type}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function StickerScanner({ onAdded, mode = 'duplicates' }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  const [state, setState] = useState(STATES.IDLE)
  const [result, setResult] = useState(null)       // scan result from API
  const [selected, setSelected] = useState(null)   // chosen sticker when multiple candidates
  const [existingQty, setExistingQty] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [facingMode, setFacingMode] = useState('environment') // rear camera default
  const [manualCode, setManualCode] = useState('')
  const [manualError, setManualError] = useState('')

  // Start camera — attach stream directly so video element never needs remounting
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(console.error)
      }
      setState(STATES.CAMERA)
    } catch (err) {
      setErrorMsg(
        err.name === 'NotAllowedError'
          ? 'Camera access denied. Please allow camera permissions and try again.'
          : `Camera error: ${err.message}`
      )
      setState(STATES.ERROR)
    }
  }, [facingMode])

  // Stop camera stream
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  // Capture frame from video, send to API
  const capture = useCallback(async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    // Resize to max 1200px wide before upload — enough for Claude to read the badge
    const MAX_W = 1200
    const vw = video.videoWidth, vh = video.videoHeight
    const scale = vw > MAX_W ? MAX_W / vw : 1
    canvas.width = Math.round(vw * scale)
    canvas.height = Math.round(vh * scale)
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)

    setState(STATES.PROCESSING)

    canvas.toBlob(async (blob) => {
      const form = new FormData()
      form.append('image', blob, 'sticker.jpg')
      try {
        const { data } = await api.post('/scan', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        setResult(data)

        if (data.status === 'match') {
          await checkExisting(data.match.id)
          setSelected(data.match)
          setState(STATES.MATCH)
        } else if (data.status === 'candidates') {
          setState(STATES.CANDIDATES)
        } else {
          setState(STATES.NO_MATCH)
        }
      } catch (err) {
        setErrorMsg(err.response?.data?.detail || 'Scan failed. Please try again.')
        setState(STATES.ERROR)
      }
    }, 'image/jpeg', 0.92)
  }, [stopCamera])

  async function checkExisting(stickerId) {
    try {
      const { data } = await api.get('/stickers/list')
      const entry = data.find(e => e.sticker.id === stickerId)
      setExistingQty(entry?.quantity ?? 0)
    } catch { /* non-critical */ }
  }

  async function selectCandidate(sticker) {
    setSelected(sticker)
    await checkExisting(sticker.id)
    setState(STATES.MATCH)
  }

  async function addToList() {
    if (!selected) return
    try {
      if (mode === 'wanted') {
        await api.post('/stickers/wanted', { sticker_id: selected.id })
      } else {
        await api.post('/stickers/list', { sticker_id: selected.id })
      }
      onAdded?.()
      setResult(null)
      setSelected(null)
      setExistingQty(0)
      setState(STATES.CAMERA)
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to add sticker')
      setState(STATES.ERROR)
    }
  }

  async function lookupManual() {
    const code = manualCode.trim().toUpperCase()
    if (!code) return
    setManualError('')
    try {
      const { data } = await api.get('/stickers/lookup', { params: { code } })
      await checkExisting(data.id)
      setSelected(data)
      setState(STATES.MATCH)
    } catch {
      setManualError('Code not found — check the format, e.g. ARG 17')
    }
  }

  function reset() {
    setResult(null)
    setSelected(null)
    setExistingQty(0)
    setErrorMsg('')
    setManualCode('')
    setManualError('')
    setState(STATES.IDLE)
  }

  function flipCamera() {
    setFacingMode(f => (f === 'environment' ? 'user' : 'environment'))
    if (state === STATES.CAMERA) {
      stopCamera()
      setState(STATES.IDLE)
    }
  }

  return (
    <div className="flex flex-col items-center">
      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* ── IDLE ── */}
      {state === STATES.IDLE && (
        <div className="text-center py-8 px-4">
          <div className="text-6xl mb-4">📷</div>
          <p className="text-gray-600 font-medium mb-2">Scan the back of the sticker</p>
          <p className="text-gray-400 text-sm mb-6">
            Flip the sticker over — the code is printed on the back (e.g. <span className="font-mono bg-gray-100 px-1 rounded">ARG 17</span>). Make sure it's well-lit and in focus.
          </p>
          <button
            onClick={startCamera}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-2xl transition-colors shadow-md"
          >
            Open Camera
          </button>
          <p className="mt-4 text-sm text-gray-400">
            or{' '}
            <button onClick={() => setState(STATES.MANUAL)} className="text-blue-500 hover:underline">
              type the code manually
            </button>
          </p>
        </div>
      )}

      {/* ── CAMERA ── always in DOM so iOS Safari never loses the stream */}
      <div className={`w-full relative ${state === STATES.CAMERA ? '' : 'hidden'}`}>
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full rounded-2xl object-cover max-h-80"
        />
        {/* Viewfinder overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="border-2 border-white/70 rounded-xl w-80 h-48 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
        </div>
        <p className="absolute top-3 left-0 right-0 text-center text-white/80 text-xs">
          Align the sticker code inside the frame
        </p>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 mt-4">
          <button
            onClick={flipCamera}
            className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-xl transition-colors"
            title="Flip camera"
          >🔄</button>
          <button
            onClick={capture}
            className="w-20 h-20 rounded-full bg-white border-4 border-blue-500 hover:bg-blue-50 flex items-center justify-center shadow-lg transition-colors"
          >
            <div className="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700" />
          </button>
          <button
            onClick={() => { stopCamera(); reset() }}
            className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-xl transition-colors"
            title="Cancel"
          >✕</button>
        </div>
      </div>

      {/* ── PROCESSING ── */}
      {state === STATES.PROCESSING && (
        <div className="text-center py-12">
          <div className="inline-block w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-500 font-medium">Scanning sticker…</p>
        </div>
      )}

      {/* ── MATCH ── */}
      {state === STATES.MATCH && selected && (
        <div className="w-full px-2 py-4 space-y-4">
          <div className="text-center">
            <span className="text-2xl">✅</span>
            <p className="font-semibold text-gray-700 mt-1">Sticker identified!</p>
          </div>
          <StickerResult sticker={selected} quantity={existingQty} />
          <div className="flex gap-3 max-w-sm mx-auto">
            <button
              onClick={addToList}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-2xl transition-colors"
            >
              {mode === 'wanted' ? 'Add to Wanted' : 'Add to Duplicates'}
            </button>
            <button
              onClick={() => setState(STATES.CAMERA)}
              className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium rounded-2xl transition-colors"
            >
              Cancel
            </button>
          </div>
          {existingQty > 0 && (
            <p className="text-center text-xs text-amber-500">
              You already have {existingQty} of this sticker — adding another duplicate
            </p>
          )}
        </div>
      )}

      {/* ── CANDIDATES (multiple codes detected) ── */}
      {state === STATES.CANDIDATES && result && (
        <div className="w-full px-2 py-4">
          <div className="text-center mb-4">
            <span className="text-2xl">🤔</span>
            <p className="font-semibold text-gray-700 mt-1">Multiple codes detected</p>
            <p className="text-sm text-gray-400">Which sticker did you scan?</p>
          </div>
          <div className="space-y-2 max-w-sm mx-auto">
            {result.candidates.map(s => (
              <button
                key={s.id}
                onClick={() => selectCandidate(s)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors text-left"
              >
                <span className="text-sm font-bold bg-blue-600 text-white px-2 py-1 rounded-lg">
                  {s.sticker_code}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{s.player_name || s.sticker_code}</p>
                  <p className="text-xs text-gray-400">{s.team_name}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="text-center mt-4">
            <button onClick={reset} className="text-sm text-gray-400 hover:text-gray-600">
              Try again
            </button>
          </div>
        </div>
      )}

      {/* ── NO MATCH ── */}
      {state === STATES.NO_MATCH && (
        <div className="text-center py-8 px-4">
          <div className="text-5xl mb-3">🔍</div>
          <p className="font-semibold text-gray-700">No sticker code found</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">
            Make sure the code on the sticker back is clearly visible and well-lit
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => { setResult(null); setState(STATES.CAMERA) }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-2xl transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => setState(STATES.MANUAL)}
              className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium rounded-2xl transition-colors"
            >
              Type Code
            </button>
          </div>
        </div>
      )}

      {/* ── MANUAL ── */}
      {state === STATES.MANUAL && (
        <div className="py-8 px-4">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">⌨️</div>
            <p className="font-semibold text-gray-700">Enter sticker code</p>
            <p className="text-sm text-gray-400 mt-1">Type the code from the back of the sticker</p>
          </div>
          <div className="max-w-xs mx-auto space-y-3">
            <input
              type="text"
              value={manualCode}
              onChange={e => { setManualCode(e.target.value.toUpperCase()); setManualError('') }}
              onKeyDown={e => e.key === 'Enter' && lookupManual()}
              placeholder="e.g. ARG 17"
              className="w-full text-center text-xl font-mono border-2 border-gray-200 focus:border-blue-500 rounded-2xl px-4 py-3 outline-none tracking-widest uppercase"
              autoFocus
            />
            {manualError && <p className="text-center text-sm text-red-500">{manualError}</p>}
            <button
              onClick={lookupManual}
              disabled={!manualCode.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold py-3 rounded-2xl transition-colors"
            >
              Find Sticker
            </button>
            <button onClick={reset} className="w-full py-2.5 bg-gray-100 text-gray-600 rounded-2xl text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}


      {/* ── ERROR ── */}
      {state === STATES.ERROR && (
        <div className="text-center py-8 px-4">
          <div className="text-5xl mb-3">⚠️</div>
          <p className="font-semibold text-gray-700">Something went wrong</p>
          <p className="text-sm text-red-500 mt-1 mb-6">{errorMsg}</p>
          <button
            onClick={() => { setErrorMsg(''); setState(STATES.CAMERA) }}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-2xl transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  )
}

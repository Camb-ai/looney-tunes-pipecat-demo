import { useState, useCallback, useRef, useEffect } from 'react'
import Daily, { DailyCall } from '@daily-co/daily-js'
import { Mic, MicOff, Phone, PhoneOff, Loader2 } from 'lucide-react'

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error'
type AgentState = 'listening' | 'thinking' | 'speaking' | 'idle'

type Character = {
  id: string
  name: string
  avatar: string
}

const CHARACTERS: Character[] = [
  { id: 'bugs', name: 'Bugs Bunny', avatar: 'https://cambai-not-ai.conbersa.ai/bugs-bunny.png' },
  { id: 'lola', name: 'Lola Bunny', avatar: 'https://cambai-not-ai.conbersa.ai/lola-bunny.png' },
  { id: 'daffy', name: 'Daffy Duck', avatar: 'https://cambai-not-ai.conbersa.ai/daffy-duck.png' },
]

function App() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle')
  const [agentState, setAgentState] = useState<AgentState>('idle')
  const [isMuted, setIsMuted] = useState(false)
  const [transcript, setTranscript] = useState<string>('')
  const [selectedCharacter, setSelectedCharacter] = useState<string>('bugs')
  const callRef = useRef<DailyCall | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const connect = useCallback(async () => {
    // Prevent double-clicks
    if (connectionState !== 'idle' && connectionState !== 'error') return

    setConnectionState('connecting')

    try {
      const response = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character: selectedCharacter }),
      })

      if (!response.ok) {
        throw new Error('Failed to create room')
      }

      const { room_url, token } = await response.json()
      console.log('[Daily] Got room URL:', room_url)

      // Create Daily call object
      const callObject = Daily.createCallObject({
        audioSource: true,
        videoSource: false,
      })
      callRef.current = callObject

      // Set up event handlers
      callObject.on('joined-meeting', () => {
        console.log('[Daily] Joined meeting')
        setConnectionState('connected')
        setAgentState('idle')
      })

      callObject.on('left-meeting', () => {
        console.log('[Daily] Left meeting')
        setConnectionState('idle')
        setAgentState('idle')
        setTranscript('')
      })

      callObject.on('error', (error) => {
        console.error('[Daily] Error:', error)
        setConnectionState('error')
      })

      // Handle remote audio
      callObject.on('track-started', (event) => {
        if (event.track?.kind === 'audio' && event.participant && !event.participant.local) {
          console.log('[Daily] Remote audio track started')
          // Clean up previous audio element if any
          if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current.srcObject = null
          }
          const audio = new Audio()
          audio.srcObject = new MediaStream([event.track])
          audio.autoplay = true
          audioRef.current = audio
          audio.play().catch(console.error)
        }
      })

      // Handle app messages from the bot
      callObject.on('app-message', (event) => {
        if (event.data) {
          const data = event.data as { type: string; status?: string; text?: string; role?: string }
          console.log('[Daily] App message:', data)

          if (data.type === 'status') {
            switch (data.status) {
              case 'listening':
              case 'stt':
                setAgentState('listening')
                break
              case 'llm':
                setAgentState('thinking')
                break
              case 'tts':
                setAgentState('speaking')
                break
              default:
                setAgentState('idle')
            }
          }

          if (data.type === 'transcript' && data.text) {
            setTranscript(data.text)
          }
        }
      })

      // Join the room
      await callObject.join({ url: room_url, token })

    } catch (error) {
      console.error('Connection error:', error)
      setConnectionState('error')
    }
  }, [connectionState, selectedCharacter])

  const disconnect = useCallback(async () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.srcObject = null
      audioRef.current = null
    }
    if (callRef.current) {
      await callRef.current.leave()
      await callRef.current.destroy()
      callRef.current = null
    }
    setConnectionState('idle')
    setAgentState('idle')
    setTranscript('')
  }, [])

  const toggleMute = useCallback(() => {
    if (callRef.current) {
      const currentMuteState = callRef.current.localAudio() === false
      callRef.current.setLocalAudio(currentMuteState)
      setIsMuted(!currentMuteState)
      console.log('[Daily] Microphone muted:', !currentMuteState)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.srcObject = null
      }
      if (callRef.current) {
        callRef.current.leave()
        callRef.current.destroy()
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-camb-bg flex flex-col items-center justify-center p-4">
      {/* Character Selection */}
      <div className="mb-8">
        <p className="text-gray-500 text-sm text-center mb-3">Choose your character</p>
        <div className="flex gap-3">
          {CHARACTERS.map((char) => {
            const isSelected = selectedCharacter === char.id
            const isDisabled = connectionState === 'connecting' || connectionState === 'connected'
            return (
              <button
                key={char.id}
                onClick={() => !isDisabled && setSelectedCharacter(char.id)}
                disabled={isDisabled}
                className={`
                  flex flex-col items-center p-3 rounded-xl transition-all duration-200
                  ${isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                  ${isSelected
                    ? 'bg-camb-orange/20 border-2 border-camb-orange'
                    : 'bg-camb-card border-2 border-transparent hover:border-camb-border'
                  }
                `}
              >
                <img
                  src={char.avatar}
                  alt={char.name}
                  className="w-16 h-20 object-contain mb-1"
                />
                <span className={`text-xs ${isSelected ? 'text-camb-orange' : 'text-gray-400'}`}>
                  {char.name}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Main Control */}
      <div className="flex flex-col items-center">
        {/* Button with pulse rings */}
        <div className="relative">
          {/* Pulse rings when speaking */}
          {connectionState === 'connected' && agentState === 'speaking' && (
            <>
              <div className="absolute inset-0 rounded-full bg-camb-orange/30 pulse-ring" />
              <div className="absolute inset-0 rounded-full bg-camb-orange/20 pulse-ring" style={{ animationDelay: '0.5s' }} />
            </>
          )}

          {/* Main Button */}
          <button
          onClick={connectionState === 'idle' || connectionState === 'error' ? connect : disconnect}
          disabled={connectionState === 'connecting'}
          className={`
            relative z-10 w-40 h-40 rounded-full flex items-center justify-center
            transition-all duration-300 ease-out
            ${connectionState === 'connecting'
              ? 'bg-camb-card cursor-wait'
              : connectionState === 'connected'
                ? 'bg-red-500 hover:bg-red-600 hover:scale-105'
                : 'bg-camb-orange hover:bg-camb-orange/90 hover:scale-105'
            }
            shadow-lg shadow-black/30
          `}
        >
          {connectionState === 'connecting' ? (
            <Loader2 className="w-12 h-12 text-white animate-spin" />
          ) : connectionState === 'connected' ? (
            <PhoneOff className="w-12 h-12 text-white" />
          ) : (
            <Phone className="w-12 h-12 text-white" />
          )}
          </button>
        </div>

        {/* Status Text */}
        <div className="mt-8 text-center">
          {connectionState === 'connecting' && (
            <p className="text-gray-400 text-lg">Connecting...</p>
          )}
          {connectionState === 'connected' && (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                {agentState === 'listening' && (
                  <>
                    <div className="flex gap-1 items-end h-5">
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={i}
                          className="w-1 bg-camb-orange rounded-full wave-bar"
                          style={{ height: '100%' }}
                        />
                      ))}
                    </div>
                    <span className="text-gray-400">Listening...</span>
                  </>
                )}
                {agentState === 'thinking' && (
                  <span className="text-gray-400">Thinking...</span>
                )}
                {agentState === 'speaking' && (
                  <span className="text-camb-orange font-medium">Speaking...</span>
                )}
                {agentState === 'idle' && (
                  <span className="text-gray-500">Ready</span>
                )}
              </div>
              {transcript && (
                <p className="text-gray-300 text-sm max-w-md mt-2 px-4">{transcript}</p>
              )}
            </div>
          )}
          {connectionState === 'error' && (
            <p className="text-red-400 text-lg">Connection failed. Tap to retry.</p>
          )}
          {connectionState === 'idle' && (
            <p className="text-gray-500 text-lg">Tap to start</p>
          )}
        </div>

        {/* Mute Button - only show when connected */}
        {connectionState === 'connected' && (
          <button
            onClick={toggleMute}
            className={`
              mt-8 p-4 rounded-full transition-all duration-200
              ${isMuted
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-camb-card text-gray-400 hover:bg-camb-border hover:text-white'
              }
            `}
          >
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
        )}
      </div>

    </div>
  )
}

export default App

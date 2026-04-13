'use client'

import { useEffect, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

interface Notificacion {
  tipo: string
  titulo: string
  mensaje: string
  procesoId?: string
  timestamp: string
}

interface UseWebSocketOptions {
  juzgadoId?: string
  usuarioId?: string
  onNotificacion?: (data: Notificacion) => void
  onAlertaTermino?: (data: unknown) => void
  onAlertaAudiencia?: (data: unknown) => void
  onDashboardUpdate?: (data: unknown) => void
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false)
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const host = window.location.hostname
    const socketNoSoportadoEnHost =
      host.endsWith('.workers.dev') ||
      host.endsWith('.pages.dev') ||
      process.env.NEXT_PUBLIC_DISABLE_WEBSOCKET === '1'
    if (socketNoSoportadoEnHost) {
      return
    }

    // Crear conexión con el servidor WebSocket (servidor Node local / mismo origen con WS)
    const socketInstance: Socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    socketInstance.on('connect', () => {
      console.log('✅ WebSocket conectado')
      setIsConnected(true)

      // Unirse a salas
      if (options.juzgadoId) {
        socketInstance.emit('join:juzgado', options.juzgadoId)
      }
      if (options.usuarioId) {
        socketInstance.emit('join:usuario', options.usuarioId)
      }
    })

    socketInstance.on('disconnect', () => {
      console.log('❌ WebSocket desconectado')
      setIsConnected(false)
    })

    socketInstance.on('notificacion:nueva', (data: Notificacion) => {
      console.log('📢 Nueva notificación:', data)
      setNotificaciones(prev => [data, ...prev])
      options.onNotificacion?.(data)
    })

    socketInstance.on('alerta:termino', (data: unknown) => {
      console.log('⏰ Alerta de término:', data)
      options.onAlertaTermino?.(data)
    })

    socketInstance.on('alerta:audiencia', (data: unknown) => {
      console.log('📅 Alerta de audiencia:', data)
      options.onAlertaAudiencia?.(data)
    })

    socketInstance.on('dashboard:update', (data: unknown) => {
      console.log('📊 Dashboard actualizado:', data)
      options.onDashboardUpdate?.(data)
    })

    return () => {
      socketInstance.disconnect()
    }
  }, [options.juzgadoId, options.usuarioId])

  const clearNotificacion = useCallback((index: number) => {
    setNotificaciones(prev => prev.filter((_, i) => i !== index))
  }, [])

  const clearAllNotificaciones = useCallback(() => {
    setNotificaciones([])
  }, [])

  return {
    isConnected,
    notificaciones,
    clearNotificacion,
    clearAllNotificaciones,
  }
}

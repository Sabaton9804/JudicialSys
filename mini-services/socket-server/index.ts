import { Server } from 'socket.io'

const PORT = 3003

const io = new Server(PORT, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
})

console.log(`🔔 Socket Server running on port ${PORT}`)

// Tipos de eventos
interface NotificacionData {
  tipo: string
  titulo: string
  mensaje: string
  procesoId?: string
  datos?: any
}

// Almacenar conexiones por usuario/juzgado
const conexiones = new Map<string, Set<string>>()

io.on('connection', (socket) => {
  console.log(`✅ Cliente conectado: ${socket.id}`)

  // Unirse a sala de juzgado
  socket.on('join:juzgado', (juzgadoId: string) => {
    socket.join(`juzgado:${juzgadoId}`)
    console.log(`📍 Cliente ${socket.id} unido a juzgado ${juzgadoId}`)
    
    if (!conexiones.has(juzgadoId)) {
      conexiones.set(juzgadoId, new Set())
    }
    conexiones.get(juzgadoId)!.add(socket.id)
  })

  // Unirse a sala de usuario
  socket.on('join:usuario', (usuarioId: string) => {
    socket.join(`usuario:${usuarioId}`)
    console.log(`👤 Cliente ${socket.id} unido como usuario ${usuarioId}`)
  })

  // Solicitar estadísticas
  socket.on('get:stats', async () => {
    // Enviar stats por defecto (se actualizarán desde la app principal)
    socket.emit('stats:update', {
      timestamp: new Date().toISOString()
    })
  })

  // Desconexión
  socket.on('disconnect', () => {
    console.log(`❌ Cliente desconectado: ${socket.id}`)
    
    // Limpiar conexiones
    conexiones.forEach((sockets, juzgadoId) => {
      sockets.delete(socket.id)
      if (sockets.size === 0) {
        conexiones.delete(juzgadoId)
      }
    })
  })
})

// Funciones para emitir notificaciones (usadas por la API)
export function emitirNotificacion(juzgadoId: string, data: NotificacionData) {
  io.to(`juzgado:${juzgadoId}`).emit('notificacion:nueva', {
    ...data,
    timestamp: new Date().toISOString()
  })
  console.log(`📢 Notificación emitida a juzgado ${juzgadoId}:`, data.titulo)
}

export function emitirNotificacionUsuario(usuarioId: string, data: NotificacionData) {
  io.to(`usuario:${usuarioId}`).emit('notificacion:nueva', {
    ...data,
    timestamp: new Date().toISOString()
  })
}

export function emitirAlertaTermino(juzgadoId: string, data: any) {
  io.to(`juzgado:${juzgadoId}`).emit('alerta:termino', {
    ...data,
    timestamp: new Date().toISOString()
  })
}

export function emitirAlertaAudiencia(juzgadoId: string, data: any) {
  io.to(`juzgado:${juzgadoId}`).emit('alerta:audiencia', {
    ...data,
    timestamp: new Date().toISOString()
  })
}

export function emitirActualizacionDashboard(juzgadoId: string, stats: any) {
  io.to(`juzgado:${juzgadoId}`).emit('dashboard:update', {
    stats,
    timestamp: new Date().toISOString()
  })
}

// Exportar io para uso externo
export { io }

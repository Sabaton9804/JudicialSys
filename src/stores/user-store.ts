import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface SimulatedUser {
  id: string
  nombre: string
  email: string
  rol: string
  area: string
  juzgadoId: string | null
}

interface UserStore {
  user: SimulatedUser | null
  setUser: (user: SimulatedUser | null) => void
}

export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
    }),
    { name: 'judicialsys-simulated-user' }
  )
)

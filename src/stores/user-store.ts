import { create } from 'zustand'

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

export const useUserStore = create<UserStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}))

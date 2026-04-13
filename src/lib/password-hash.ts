import bcrypt from 'bcryptjs'

export function hashPassword(plain: string, rounds = 10): Promise<string> {
  return new Promise((resolve, reject) => {
    bcrypt.hash(plain, rounds, (err, hash) => {
      if (err) reject(err)
      else resolve(hash)
    })
  })
}

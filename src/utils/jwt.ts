
import { jwtVerify, type JWTPayload } from 'jose'

const secretKey = process.env.JWT_SECRET
if (!secretKey) {
    throw new Error('JWT_SECRET not defined in environment variables')
}


const secret = new TextEncoder().encode(secretKey)


export async function verifyJwt<T = JWTPayload>(token: string): Promise<T> {
    try {
        const { payload } = await jwtVerify(token, secret)
        return payload as T
    } catch (error) {
        throw new Error('Token non valido')
    }
}
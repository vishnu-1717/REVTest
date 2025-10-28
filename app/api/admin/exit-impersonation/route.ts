import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
  try {
    const cookieStore = await cookies()
    
    // Clear impersonation cookies
    cookieStore.set('impersonated_user_id', '', { path: '/', maxAge: 0 })
    cookieStore.set('original_user_id', '', { path: '/', maxAge: 0 })
    
    return NextResponse.json({ success: true })
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}


import { useState, type FormEvent } from 'react'
import { Captcha } from '../components/Captcha'
import { Alert, Field, useTitle } from '../components/ui'
import { useAuth } from '../context/auth'
import { SHOP_URL } from '../lib/shop'
import { appUrl, supabase } from '../lib/supabase'
import { Logo } from './AdminLayout'

export default function Login() {
  useTitle('Sign in')
  const { session, signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string>()
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password, options: { captchaToken } })
    if (error) setError(error.status === 429 ? 'Too many attempts. Please wait a minute and try again.' : 'That email and password don’t match. Please try again.')
    setBusy(false)
    setAttempt((n) => n + 1) // a captcha token works once
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="card w-full max-w-md p-8">
        <Logo className="mx-auto h-20" />
        <h1 className="mt-4 mb-6 text-center text-2xl">Shop admin</h1>
        {session ? (
          <div className="space-y-4">
            <Alert>{session.user.email} is not an admin account.</Alert>
            <button type="button" onClick={signOut} className="btn-primary w-full">Sign in with another account</button>
          </div>
        ) : (
          <>
            <form onSubmit={submit} className="space-y-4">
              <Field label="Email"><input className="input" type="email" required maxLength={254} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <Field label="Password"><input className="input" type="password" required maxLength={72} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
              <Captcha attempt={attempt} onToken={setCaptchaToken} />
              {error && <Alert>{error}</Alert>}
              <button className="btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : 'Sign in'}</button>
            </form>
            <button type="button" className="btn-ghost mt-3 w-full" onClick={() => void supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl() } })}>Continue with Google</button>
            <p className="mt-5 text-center text-sm"><a href={`${SHOP_URL}#/login`} className="text-olive underline">Forgot password? Reset it on the shop</a></p>
          </>
        )}
      </div>
    </main>
  )
}

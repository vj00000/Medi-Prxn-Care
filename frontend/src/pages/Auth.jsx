import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BellRing,
  FlaskConical,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { doctorLogin, doctorSignup, patientLogin, patientSignup } from '../lib/api'
import Button from '../components/Button'

const TRUST_POINTS = [
  {
    icon: ShieldCheck,
    title: 'Doctor-confirmed prescriptions',
    detail: 'Every prescription is reviewed and safety-checked.',
  },
  {
    icon: Users,
    title: 'One record for the whole family',
    detail: 'Share medicines, allergies and history with everyone.',
  },
  {
    icon: BellRing,
    title: 'Reminders that keep up',
    detail: 'Dose alarms and reorder alerts, so nothing is missed.',
  },
  {
    icon: FlaskConical,
    title: 'Built-in safety checks',
    detail: 'Drug-interaction screening on every prescription.',
  },
]

export default function Auth({ mode }) {
  const { session, loading, signInDoctor, signInPatient } = useApp()
  const navigate = useNavigate()
  const isSignup = mode === 'signup'

  const [role, setRole] = useState('doctor')
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Already signed in? Go straight to the matching portal.
  useEffect(() => {
    if (!loading && session) {
      navigate(session.role === 'patient' ? '/patient' : '/', { replace: true })
    }
  }, [loading, session, navigate])

  function set(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (isSignup) {
        if (role === 'doctor') {
          const auth = await doctorSignup({
            name: form.name,
            email: form.email,
            password: form.password,
            specialization: form.specialization,
            contact_number: form.contact,
            gender: form.gender,
          })
          signInDoctor(auth)
          navigate('/', { replace: true })
        } else {
          const auth = await patientSignup({
            name: form.name,
            email: form.email,
            password: form.password,
            phone: form.phone,
            age: form.age ? Number(form.age) : null,
            gender: form.gender,
            allergies: form.allergies,
            family_code: form.family_code,
          })
          signInPatient(auth)
          navigate('/patient', { replace: true })
        }
      } else if (role === 'doctor') {
        const auth = await doctorLogin({ email: form.email, password: form.password })
        signInDoctor(auth)
        navigate('/', { replace: true })
      } else {
        const auth = await patientLogin({ email: form.email, password: form.password })
        signInPatient(auth)
        navigate('/patient', { replace: true })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const tabClass = (active) =>
    `flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
    }`

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand side — full teal panel. */}
      <section className="flex flex-col justify-center bg-gradient-to-br from-brand-600 via-brand-700 to-brand-800 px-6 py-12 text-white lg:px-14 lg:py-16">
        <div className="mx-auto w-full max-w-md lg:mx-0">
          <div className="flex items-center gap-3.5">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white">
              <img src="/logo.png" alt="Medi-Prxn-Care logo" className="h-11 w-auto" />
            </span>
            <span className="text-3xl font-bold tracking-tight">Medi-Prxn-Care</span>
          </div>

          <h1 className="mt-6 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            Every Prescription, for the whole family, in one place.
          </h1>

          <p className="mt-4 text-base text-brand-100">
            Your family's medicines, doses and appointments — organised, shared and
            safety-checked.
          </p>

          <ul className="mt-8 space-y-5">
            {TRUST_POINTS.map(({ icon: Icon, title, detail }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/20">
                  <Icon size={19} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-0.5 text-xs text-brand-100">{detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Form side — light, focused. */}
      <section className="flex items-center justify-center bg-slate-50 px-5 py-12">
        <div className="w-full max-w-md">
          <div className="card p-6">
            <div className="mb-5 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1.5">
              <button
                type="button"
                onClick={() => setRole('doctor')}
                className={tabClass(role === 'doctor')}
              >
                <Stethoscope size={15} /> Doctor
              </button>
              <button
                type="button"
                onClick={() => setRole('patient')}
                className={tabClass(role === 'patient')}
              >
                <UserRound size={15} /> Patient
              </button>
            </div>

            <form onSubmit={submit} className="space-y-3">
              {isSignup && (
                <input
                  className="field"
                  placeholder="Full name"
                  value={form.name ?? ''}
                  onChange={(e) => set('name', e.target.value)}
                  required
                />
              )}

              <input
                className="field"
                type="email"
                placeholder="Email"
                value={form.email ?? ''}
                onChange={(e) => set('email', e.target.value)}
                required
              />

              <input
                className="field"
                type="password"
                placeholder="Password (min 6 characters)"
                value={form.password ?? ''}
                onChange={(e) => set('password', e.target.value)}
                required
              />

              {isSignup && role === 'doctor' && (
                <>
                  <input
                    className="field"
                    placeholder="Specialization (optional)"
                    value={form.specialization ?? ''}
                    onChange={(e) => set('specialization', e.target.value)}
                  />
                  <input
                    className="field"
                    placeholder="Contact number (optional)"
                    value={form.contact ?? ''}
                    onChange={(e) => set('contact', e.target.value)}
                  />
                  <input
                    className="field"
                    placeholder="Gender (optional)"
                    value={form.gender ?? ''}
                    onChange={(e) => set('gender', e.target.value)}
                  />
                </>
              )}

              {isSignup && role === 'patient' && (
                <>
                  <input
                    className="field"
                    placeholder="Phone"
                    value={form.phone ?? ''}
                    onChange={(e) => set('phone', e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="field"
                      type="number"
                      placeholder="Age"
                      value={form.age ?? ''}
                      onChange={(e) => set('age', e.target.value)}
                    />
                    <input
                      className="field"
                      placeholder="Gender"
                      value={form.gender ?? ''}
                      onChange={(e) => set('gender', e.target.value)}
                    />
                  </div>
                  <input
                    className="field"
                    placeholder="Allergies (optional)"
                    value={form.allergies ?? ''}
                    onChange={(e) => set('allergies', e.target.value)}
                  />
                  <div>
                    <input
                      className="field"
                      placeholder="Family code (optional)"
                      value={form.family_code ?? ''}
                      onChange={(e) => set('family_code', e.target.value)}
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      Enter your family code to join an existing household, or leave blank to
                      create a new one.
                    </p>
                  </div>
                </>
              )}

              {error && <p className="text-sm text-rose-600">{error}</p>}

              <Button type="submit" loading={busy} disabled={busy} className="w-full">
                {isSignup ? 'Create account' : 'Sign in'}
              </Button>
            </form>
          </div>

          <p className="mt-4 text-center text-sm text-slate-500">
            {isSignup ? (
              <>
                Already have an account?{' '}
                <Link className="font-medium text-brand-700 hover:underline" to="/login">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New here?{' '}
                <Link className="font-medium text-brand-700 hover:underline" to="/signup">
                  Create an account
                </Link>
              </>
            )}
          </p>
        </div>
      </section>
    </div>
  )
}

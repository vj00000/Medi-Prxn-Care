import { useState } from 'react'
import { UserPlus, X } from 'lucide-react'
import Button from '../../components/Button'

const RELATIONS = [
  { value: 'father', label: 'Father' },
  { value: 'mother', label: 'Mother' },
  { value: 'other', label: 'Other' },
]

const EMPTY = { name: '', relation: 'father', age: '', gender: 'male', phone: '' }

export default function AddFamilyMember({ familyId, onAdd, onClose }) {
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  async function submit(event) {
    event.preventDefault()
    if (!form.name.trim()) {
      setError('Please enter a name.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await onAdd({
        family_id: familyId,
        name: form.name.trim(),
        relation: form.relation,
        age: form.age ? Number(form.age) : null,
        gender: form.gender,
        phone: form.phone.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4 sm:items-center">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900">Add a family member</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Name</span>
            <input
              className="field"
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              placeholder="e.g. Suresh Rao"
              autoFocus
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Relation</span>
              <select
                className="field"
                value={form.relation}
                onChange={(event) => update('relation', event.target.value)}
              >
                {RELATIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Age</span>
              <input
                className="field"
                type="number"
                min="0"
                max="120"
                value={form.age}
                onChange={(event) => update('age', event.target.value)}
                placeholder="68"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Gender</span>
              <select
                className="field"
                value={form.gender}
                onChange={(event) => update('gender', event.target.value)}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Phone</span>
              <input
                className="field"
                value={form.phone}
                onChange={(event) => update('phone', event.target.value)}
                placeholder="+91-90000-00000"
              />
            </label>
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}

        <Button type="submit" loading={saving} className="mt-5 w-full">
          <UserPlus size={15} /> Add member
        </Button>
      </form>
    </div>
  )
}

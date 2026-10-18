import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronRight,
  Pill,
  Plus,
  ShoppingCart,
  User,
} from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { useDoses } from '../doseContext'
import { useCart } from '../cartContext'
import SectionCard from '../../components/SectionCard'
import Badge from '../../components/Badge'
import Button from '../../components/Button'
import AddFamilyMember from '../components/AddFamilyMember'
import BookAppointment from '../components/BookAppointment'
import { formatCheckup } from '../patientData'
import { getLowStock } from '../../lib/api'

const RELATION_LABEL = {
  self: 'You',
  father: 'Father',
  mother: 'Mother',
  other: 'Family',
}

function initials(name) {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export default function Home() {
  const { family, loading, doctor, prescriptions, addMember, setCheckupDate, patientId } =
    useApp()
  const { taken, busy, markTaken, untake } = useDoses()
  const { add: addToCart, count } = useCart()

  const [selectedId, setSelectedId] = useState(patientId)
  const [adding, setAdding] = useState(false)
  const [booking, setBooking] = useState(false)
  const [lowStock, setLowStock] = useState([])

  // Refetched whenever the family reloads, so taking a dose — which draws stock
  // down — also refreshes what is running out.
  useEffect(() => {
    let cancelled = false
    getLowStock(patientId)
      .then((rows) => {
        if (!cancelled) setLowStock(rows)
      })
      .catch(() => {
        if (!cancelled) setLowStock([])
      })
    return () => {
      cancelled = true
    }
  }, [family, patientId])

  if (loading) {
    return <p className="px-1 text-sm text-slate-400">Loading your family…</p>
  }
  if (family.length === 0) {
    return <p className="px-1 text-sm text-slate-400">No family set up yet.</p>
  }

  const selected = family.find((m) => m.patient_id === selectedId) ?? family[0]
  const isSelf = selected.patient_id === patientId

  const mine = prescriptions.filter((rx) => rx.patient_id === patientId)
  const nextCheckup = mine
    .filter((rx) => rx.next_checkup_date)
    .sort((a, b) => a.next_checkup_date.localeCompare(b.next_checkup_date))[0]

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-slate-500">{today}</p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900">Family</h1>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {family.map((member) => {
          const active = member.patient_id === selected.patient_id
          return (
            <button
              key={member.patient_id}
              type="button"
              onClick={() => setSelectedId(member.patient_id)}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'border-brand-200 bg-brand-50 text-brand-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">
                {initials(member.name)}
              </span>
              {RELATION_LABEL[member.relation] ?? member.name.split(' ')[0]}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-white"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      <div className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-base font-semibold text-brand-700">
              {initials(selected.name)}
            </span>
            <div>
              <p className="text-base font-semibold text-slate-900">{selected.name}</p>
              <p className="text-xs text-slate-500">
                {[
                  selected.age && `${selected.age} years`,
                  selected.gender,
                  RELATION_LABEL[selected.relation] ?? selected.relation,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>
          {selected.relation && (
            <Badge tone="brand">{RELATION_LABEL[selected.relation] ?? selected.relation}</Badge>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {selected.family_code && (
            <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-[11px] font-medium tracking-wide text-slate-600">
              {selected.family_code}
            </span>
          )}
          {selected.phone && (
            <span className="text-xs text-slate-500">{selected.phone}</span>
          )}
        </div>

        {selected.allergies.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-600" />
            <div>
              <p className="text-xs font-semibold text-rose-800">Allergy alert</p>
              <p className="text-xs text-rose-700">{selected.allergies.join(', ')}</p>
            </div>
          </div>
        )}

        {selected.diseases.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {selected.diseases.map((disease) => (
              <Badge key={disease.id} tone="neutral">
                {disease.name}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {lowStock.length > 0 && (
        <SectionCard title="Running low">
          <ul className="divide-y divide-slate-100">
            {lowStock.map((row) => {
              // Reuse the schedule's cart key so restocking merges with the
              // entry the medicine row would create, instead of duplicating it.
              const schedule = selected.schedules.find(
                (item) => item.medicine_name === row.medicine_name,
              )
              return (
                <li key={row.medicine_name} className="flex items-center gap-2 py-2.5">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      row.out_of_stock
                        ? 'bg-rose-50 text-rose-600'
                        : 'bg-amber-50 text-amber-600'
                    }`}
                  >
                    <AlertTriangle size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {row.medicine_name}
                    </p>
                    <p
                      className={`text-[11px] font-semibold ${
                        row.out_of_stock ? 'text-rose-600' : 'text-amber-600'
                      }`}
                    >
                      {row.out_of_stock
                        ? 'Out of stock — reorder now'
                        : `Only ${row.units_remaining} left`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      addToCart({
                        key: schedule
                          ? `${selected.patient_id}:${schedule.id}`
                          : `${selected.patient_id}:name:${row.medicine_name}`,
                        scheduleId: schedule?.id ?? null,
                        member: selected.name,
                        medicine_name: row.medicine_name,
                        dosage: schedule?.dosage ?? null,
                        timing_slot: schedule?.timing_slot ?? null,
                      })
                    }
                    className="shrink-0 rounded-lg p-2 text-brand-700 transition-colors hover:bg-brand-50"
                    aria-label={`Add ${row.medicine_name} to cart`}
                  >
                    <ShoppingCart size={16} />
                  </button>
                </li>
              )
            })}
          </ul>
        </SectionCard>
      )}

      <SectionCard title="Medicines">
        {selected.schedules.length === 0 ? (
          <p className="text-sm text-slate-400">
            {isSelf ? 'No medicines on record.' : 'No medicines shared with the family.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {selected.schedules.map((schedule) => {
              const isTaken = isSelf && !!taken[schedule.id]
              const units = schedule.units_remaining
              return (
                <li key={schedule.id} className="flex items-center gap-2 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <Pill size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm font-medium ${
                        isTaken ? 'text-slate-400 line-through' : 'text-slate-900'
                      }`}
                    >
                      {schedule.medicine_name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {[schedule.dosage, schedule.timing_slot].filter(Boolean).join(' · ')}
                      {units != null && (
                        <span
                          className={
                            schedule.low_stock ? 'font-semibold text-amber-600' : ''
                          }
                        >
                          {units === 0 ? ' · out of stock' : ` · ${units} left`}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      addToCart({
                        key: `${selected.patient_id}:${schedule.id}`,
                        scheduleId: schedule.id,
                        member: selected.name,
                        medicine_name: schedule.medicine_name,
                        dosage: schedule.dosage,
                        timing_slot: schedule.timing_slot,
                      })
                    }
                    className="shrink-0 rounded-lg p-2 text-brand-700 transition-colors hover:bg-brand-50"
                    aria-label={`Add ${schedule.medicine_name} to cart`}
                  >
                    <ShoppingCart size={16} />
                  </button>
                  {isSelf && (
                    <button
                      type="button"
                      disabled={!!busy[schedule.id]}
                      onClick={() => (isTaken ? untake(schedule.id) : markTaken(schedule.id))}
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-40 ${
                        isTaken
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-slate-300 text-transparent hover:border-emerald-400'
                      }`}
                      aria-label={isTaken ? 'Mark not taken' : 'Mark taken'}
                    >
                      <Check size={14} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>

      {isSelf && (
        <SectionCard
          title="Follow-up"
          action={
            nextCheckup ? (
              <Badge tone="review">
                {formatCheckup(nextCheckup.next_checkup_date, nextCheckup.next_checkup_time)}
              </Badge>
            ) : null
          }
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-slate-700">
                {nextCheckup
                  ? 'Your next checkup is scheduled.'
                  : 'No follow-up scheduled yet.'}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Book with {doctor?.name ?? 'your doctor'} — pick any open slot.
              </p>
            </div>
            <Button size="sm" onClick={() => setBooking(true)}>
              <CalendarDays size={15} /> {nextCheckup ? 'Change' : 'Book'}
            </Button>
          </div>
        </SectionCard>
      )}

      <SectionCard>
        <ul className="divide-y divide-slate-100">
          <li>
            <Link to="/patient/cart" className="flex items-center justify-between py-3">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
                <ShoppingCart size={16} className="text-slate-400" /> Reorder cart
              </span>
              <span className="inline-flex items-center gap-2 text-xs text-slate-400">
                {count > 0 && <Badge tone="brand">{count}</Badge>}
                <ChevronRight size={16} className="text-slate-300" />
              </span>
            </Link>
          </li>
          <li>
            <Link to="/patient/profile" className="flex items-center justify-between py-3">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
                <User size={16} className="text-slate-400" /> Health profile &amp; QR
              </span>
              <ChevronRight size={16} className="text-slate-300" />
            </Link>
          </li>
        </ul>
      </SectionCard>

      {adding && (
        <AddFamilyMember
          familyId={family[0]?.family_id}
          onAdd={addMember}
          onClose={() => setAdding(false)}
        />
      )}

      {booking && (
        <BookAppointment
          doctor={nextCheckup?.doctor ?? mine[0]?.doctor ?? doctor}
          prescriptionId={nextCheckup?.prescription_id ?? mine[0]?.prescription_id}
          currentIso={nextCheckup?.next_checkup_date ?? null}
          currentTime={nextCheckup?.next_checkup_time ?? null}
          onBooked={async (iso, slot) => {
            const target = nextCheckup ?? mine[0]
            if (target) await setCheckupDate(target.prescription_id, iso, slot)
            setBooking(false)
          }}
          onClose={() => setBooking(false)}
        />
      )}
    </div>
  )
}

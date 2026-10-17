"""SQLAlchemy ORM models for the Smart Clinical Prescription ecosystem.

Table and column names intentionally mirror the agreed schema exactly. The
Python attributes use snake_case, while the two camelCase columns
(``isTransmittable`` / ``isInheritable``) keep their original DB names via an
explicit first argument to ``mapped_column``.
"""

import enum
from datetime import date, datetime, time
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PrescriptionStatus(str, enum.Enum):
    """Lifecycle status of a prescription."""

    review = "review"
    approved = "approved"


# --------------------------------------------------------------------------- #
# 1. doctors
# --------------------------------------------------------------------------- #
class Doctor(Base):
    __tablename__ = "doctors"

    doctor_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    specialization: Mapped[Optional[str]] = mapped_column(String(100))
    contact_number: Mapped[Optional[str]] = mapped_column(String(20))
    gender: Mapped[Optional[str]] = mapped_column(String(20))
    # Consulting-slot length used when generating bookable times.
    slot_minutes: Mapped[int] = mapped_column(Integer, default=30, nullable=False)

    visits: Mapped[List["PatientDoctorVisit"]] = relationship(
        back_populates="doctor", cascade="all, delete-orphan"
    )
    availability: Mapped[List["DoctorAvailability"]] = relationship(
        back_populates="doctor", cascade="all, delete-orphan"
    )


class DoctorAvailability(Base):
    """A doctor's weekly consulting window. Several may share a weekday."""

    __tablename__ = "doctor_availability"

    availability_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    doctor_id: Mapped[int] = mapped_column(
        ForeignKey("doctors.doctor_id", ondelete="CASCADE"), nullable=False
    )
    # 0 = Monday ... 6 = Sunday, matching date.weekday().
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)

    doctor: Mapped["Doctor"] = relationship(back_populates="availability")


# --------------------------------------------------------------------------- #
# families — households whose members share the patient portal
# --------------------------------------------------------------------------- #
class Family(Base):
    __tablename__ = "families"

    family_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    members: Mapped[List["Patient"]] = relationship(back_populates="family")


# --------------------------------------------------------------------------- #
# 2. patients
# --------------------------------------------------------------------------- #
class Patient(Base):
    __tablename__ = "patients"

    patient_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    age: Mapped[Optional[int]] = mapped_column(Integer)
    gender: Mapped[Optional[str]] = mapped_column(String(20))
    allergies: Mapped[Optional[str]] = mapped_column(Text)
    qr_token: Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    family_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("families.family_id", ondelete="SET NULL")
    )
    # Role within the family: self / father / mother / other.
    relation: Mapped[Optional[str]] = mapped_column(String(20))

    family: Mapped[Optional["Family"]] = relationship(back_populates="members")

    disease_links: Mapped[List["PatientDisease"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    family_history: Mapped[List["FamilyMedicalHistory"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    visits: Mapped[List["PatientDoctorVisit"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    medication_schedules: Mapped[List["MedicationSchedule"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    diseases: Mapped[List["Disease"]] = relationship(
        secondary="patient_diseases",
        viewonly=True,
        overlaps="disease_links,patient_links",
    )


# --------------------------------------------------------------------------- #
# 3. diseases
# --------------------------------------------------------------------------- #
class Disease(Base):
    __tablename__ = "diseases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    is_transmittable: Mapped[bool] = mapped_column(
        "isTransmittable", Boolean, default=False, nullable=False
    )
    is_inheritable: Mapped[bool] = mapped_column(
        "isInheritable", Boolean, default=False, nullable=False
    )

    patient_links: Mapped[List["PatientDisease"]] = relationship(
        back_populates="disease", cascade="all, delete-orphan"
    )
    patients: Mapped[List["Patient"]] = relationship(
        secondary="patient_diseases",
        viewonly=True,
        overlaps="disease_links,patient_links",
    )


# --------------------------------------------------------------------------- #
# 4. patient_diseases (association object: many-to-many + its own PK)
# --------------------------------------------------------------------------- #
class PatientDisease(Base):
    __tablename__ = "patient_diseases"
    __table_args__ = (
        UniqueConstraint("patient_id", "disease_id", name="uq_patient_disease"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.patient_id", ondelete="CASCADE"), nullable=False
    )
    disease_id: Mapped[int] = mapped_column(
        ForeignKey("diseases.id", ondelete="CASCADE"), nullable=False
    )

    patient: Mapped["Patient"] = relationship(back_populates="disease_links")
    disease: Mapped["Disease"] = relationship(back_populates="patient_links")


# --------------------------------------------------------------------------- #
# 5. family_medical_history
# --------------------------------------------------------------------------- #
class FamilyMedicalHistory(Base):
    __tablename__ = "family_medical_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.patient_id", ondelete="CASCADE"), nullable=False
    )
    relation: Mapped[Optional[str]] = mapped_column(String(50))
    condition_name: Mapped[Optional[str]] = mapped_column(String(150))
    additional_notes: Mapped[Optional[str]] = mapped_column(Text)

    patient: Mapped["Patient"] = relationship(back_populates="family_history")


# --------------------------------------------------------------------------- #
# 6. patient_doctor_visit
# --------------------------------------------------------------------------- #
class PatientDoctorVisit(Base):
    __tablename__ = "patient_doctor_visit"

    visit_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.patient_id", ondelete="CASCADE"), nullable=False
    )
    doctor_id: Mapped[int] = mapped_column(
        ForeignKey("doctors.doctor_id", ondelete="CASCADE"), nullable=False
    )
    # unique => one prescription maps to at most one visit (one-to-one).
    prescription_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("prescriptions.prescription_id", ondelete="SET NULL"), unique=True
    )
    # When the appointment happened; a patient's "last visit" is the newest one.
    visit_date: Mapped[Optional[date]] = mapped_column(Date)

    patient: Mapped["Patient"] = relationship(back_populates="visits")
    doctor: Mapped["Doctor"] = relationship(back_populates="visits")
    prescription: Mapped[Optional["Prescription"]] = relationship(
        back_populates="visit"
    )


# --------------------------------------------------------------------------- #
# 7. prescriptions
# --------------------------------------------------------------------------- #
class Prescription(Base):
    __tablename__ = "prescriptions"

    prescription_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    # When the prescription was written — the table's only timestamp.
    created_on: Mapped[Optional[date]] = mapped_column(Date)
    # Whether family members other than the patient can see this prescription.
    is_private: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Follow-up appointment the patient should attend.
    next_checkup_date: Mapped[Optional[date]] = mapped_column(Date)
    # Wall-clock slot on that date. Null means the patient picked a day only.
    next_checkup_time: Mapped[Optional[time]] = mapped_column(Time)
    transcript: Mapped[Optional[str]] = mapped_column(Text)
    case_paper_url: Mapped[Optional[str]] = mapped_column(String(500))
    status: Mapped[PrescriptionStatus] = mapped_column(
        Enum(
            PrescriptionStatus,
            native_enum=False,
            length=20,
            validate_strings=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        default=PrescriptionStatus.review,
        nullable=False,
    )
    lab_test_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("lab_tests.test_id", ondelete="SET NULL")
    )

    visit: Mapped[Optional["PatientDoctorVisit"]] = relationship(
        back_populates="prescription"
    )
    lab_test: Mapped[Optional["LabTest"]] = relationship(back_populates="prescriptions")
    medicines: Mapped[List["PrescriptionMedicine"]] = relationship(
        back_populates="prescription", cascade="all, delete-orphan"
    )
    medication_schedules: Mapped[List["MedicationSchedule"]] = relationship(
        back_populates="prescription", cascade="all, delete-orphan"
    )


# --------------------------------------------------------------------------- #
# 8. medicines
# --------------------------------------------------------------------------- #
class Medicine(Base):
    __tablename__ = "medicines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    brand: Mapped[Optional[str]] = mapped_column(String(150))

    prescription_links: Mapped[List["PrescriptionMedicine"]] = relationship(
        back_populates="medicine", cascade="all, delete-orphan"
    )


# --------------------------------------------------------------------------- #
# 9. prescription_medicines
# --------------------------------------------------------------------------- #
class PrescriptionMedicine(Base):
    __tablename__ = "prescription_medicines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    prescription_id: Mapped[int] = mapped_column(
        ForeignKey("prescriptions.prescription_id", ondelete="CASCADE"), nullable=False
    )
    medicine_id: Mapped[int] = mapped_column(
        ForeignKey("medicines.id", ondelete="CASCADE"), nullable=False
    )
    medicine_dosage: Mapped[Optional[str]] = mapped_column(String(100))
    timings: Mapped[Optional[str]] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    prescription: Mapped["Prescription"] = relationship(back_populates="medicines")
    medicine: Mapped["Medicine"] = relationship(back_populates="prescription_links")


# --------------------------------------------------------------------------- #
# 10. medication_schedules
# --------------------------------------------------------------------------- #
class MedicationSchedule(Base):
    __tablename__ = "medication_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.patient_id", ondelete="CASCADE"), nullable=False
    )
    prescription_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("prescriptions.prescription_id", ondelete="SET NULL")
    )
    medicine_name: Mapped[str] = mapped_column(String(150), nullable=False)
    dosage: Mapped[Optional[str]] = mapped_column(String(100))
    timing_slot: Mapped[Optional[str]] = mapped_column(String(50))
    start_date: Mapped[Optional[date]] = mapped_column(Date)
    end_date: Mapped[Optional[date]] = mapped_column(Date)
    is_expired: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    patient: Mapped["Patient"] = relationship(back_populates="medication_schedules")
    prescription: Mapped[Optional["Prescription"]] = relationship(
        back_populates="medication_schedules"
    )
    doses: Mapped[List["DoseLog"]] = relationship(
        back_populates="schedule", cascade="all, delete-orphan"
    )


# --------------------------------------------------------------------------- #
# 10b. dose_logs — one row per dose actually swallowed
# --------------------------------------------------------------------------- #
class DoseLog(Base):
    """A recorded dose.

    The unique ``(schedule_id, dose_date)`` pair is the guarantee behind "mark
    taken only once for that time": a second tap cannot record the same dose,
    so stock is never decremented twice. Because the key includes the date, a
    new dose becomes recordable again tomorrow — which is also what lets the
    next reminder fire.
    """

    __tablename__ = "dose_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    schedule_id: Mapped[int] = mapped_column(
        ForeignKey("medication_schedules.id", ondelete="CASCADE"), nullable=False
    )
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.patient_id", ondelete="CASCADE"), nullable=False
    )
    dose_date: Mapped[date] = mapped_column(Date, nullable=False)
    taken_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    __table_args__ = (
        UniqueConstraint("schedule_id", "dose_date", name="uq_dose_log_per_slot"),
    )

    schedule: Mapped["MedicationSchedule"] = relationship(back_populates="doses")


# --------------------------------------------------------------------------- #
# 10c. medicine_stock — units left, per patient and medicine
# --------------------------------------------------------------------------- #
class MedicineStock(Base):
    """How much of one medicine a patient has left.

    Stock is keyed on patient and medicine name rather than on a schedule:
    morning and night schedules for the same drug draw down the same pack, so
    counting per slot would double the apparent supply.
    """

    __tablename__ = "medicine_stock"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.patient_id", ondelete="CASCADE"), nullable=False
    )
    medicine_name: Mapped[str] = mapped_column(String(150), nullable=False)
    units_remaining: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Warn at or below this many units.
    low_stock_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=7)

    __table_args__ = (
        UniqueConstraint("patient_id", "medicine_name", name="uq_stock_per_medicine"),
    )


# --------------------------------------------------------------------------- #
# 11. lab_tests
# --------------------------------------------------------------------------- #
class LabTest(Base):
    __tablename__ = "lab_tests"

    test_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    test_name: Mapped[str] = mapped_column(String(150), nullable=False)
    report_url: Mapped[Optional[str]] = mapped_column(String(500))

    prescriptions: Mapped[List["Prescription"]] = relationship(
        back_populates="lab_test"
    )

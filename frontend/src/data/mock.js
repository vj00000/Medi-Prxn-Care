/**
 * The only demo data still bundled with the frontend.
 *
 * Everything else — doctor, patients, medicines, diseases, prescriptions — is
 * read from the database through `lib/api.js`. `timingSlots` stays here because
 * it is a controlled vocabulary of allowed slot labels rather than data;
 * deriving it from `medication_schedules` would give an empty dropdown on a
 * database with no schedules yet.
 */
export const timingSlots = ['Morning', 'Afternoon', 'Evening', 'Night', 'As needed']

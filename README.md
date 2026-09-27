# Covenant Crest Academy — School Management System MVP

A plain HTML/CSS/JavaScript MVP for Covenant Crest Academy.

## MVP modules

- Public school landing page
- Supabase authentication
- Role-based dashboards: Admin, Teacher, Parent
- Student registration
- Classes and subjects
- End-of-term result entry
- Parent view of published results
- Supabase Row Level Security (RLS)
- School logo and two hero images included

## Stack

- HTML5
- CSS3
- Vanilla JavaScript (ES modules)
- Supabase Auth + PostgreSQL
- Supabase CDN
- No TypeScript
- No framework/build step

## Setup

1. Create a Supabase project.
2. Open `supabase/schema.sql` in the Supabase SQL Editor and run it.
3. Open `supabase/migration_mvp.sql` and run it to enable class-scoped teacher access.
4. Open `supabase/results_mvp.sql` and run it to add result summaries, ranking, publishing, and result-specific RLS.
5. In `src/js/config.js`, replace the placeholder Supabase URL and anon key.
4. Serve the folder with a local web server. Do not open `index.html` directly with `file://`.

Example:

```bash
python -m http.server 5500
```

Then open:

`http://localhost:5500/`

## Creating users

Create users from Supabase Authentication > Users.

Then insert a matching row in `profiles` with:

- the Auth user's UUID
- full name
- role: `admin`, `teacher`, or `parent`

For a production application, replace manual profile setup with an admin-controlled user invitation/onboarding flow.

## End-of-term results workflow

```text
Teacher selects session + term + class + student
        ↓
Enter CA (40) + Exam (60) per subject
        ↓
Total + Grade + Subject Remark calculated
        ↓
Save Result Sheet as draft
        ↓
Result Summary calculates Average + Position
        ↓
Admin reviews and publishes
        ↓
Parent sees the published result
```

The dedicated result interface is `results.html`. Teachers can only enter results for classes assigned to them. Parents can only read published results belonging to their linked children.

## MVP data model

```text
profiles
  ├── teachers
  └── parents

students
  ├── parent_students
  └── result_records

classes
subjects
academic_sessions
terms
```

## Important

The browser must only use the Supabase anon key. Never put a service-role key in frontend JavaScript.

This is an MVP academic foundation. Before production use, add stronger audit controls and operational safeguards.

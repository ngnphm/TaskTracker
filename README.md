# Group Assignment Tracker

A collaborative assignment tracker for group projects. It runs as a static site, works with GitHub Pages, and syncs projects, milestones, meetings, comments, and tasks across devices with Supabase.

## Files

- `index.html`
- `styles.css`
- `app.js`
- `config.js`
- `supabase-schema.sql`

## Run locally

Open `index.html` directly in a browser, or run:

```bash
cd /Users/brendanpham/Desktop/Capstone/assignment-tracker
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Supabase setup for collaboration

1. Create a Supabase project.
2. In Supabase, open `SQL Editor`.
3. Run the SQL in `supabase-schema.sql`.
4. In Supabase, open `Authentication` -> `Providers` and make sure `Email` is enabled.
5. Open `Project Settings` -> `API`.
6. Copy your project URL and anon key into `config.js`.

Example:

```js
window.SUPABASE_CONFIG = {
  url: "https://your-project-ref.supabase.co",
  anonKey: "your-supabase-anon-key"
};
```

## Publish to GitHub Pages

1. Create a new GitHub repository in your account.
2. Upload all files from this folder, including `config.js` and `.github/workflows/pages.yml`.
3. Push to the `main` branch.
4. In GitHub, open `Settings` -> `Pages`.
5. Under `Build and deployment`, make sure `Source` is set to `GitHub Actions`.
6. Wait for the `Deploy static content to Pages` workflow to finish.
7. Your site will be available at:

```text
https://YOUR_GITHUB_USERNAME.github.io/REPOSITORY_NAME/
```

## Notes

- The tracker keeps a local browser copy for resilience, but the main source of truth is Supabase after sign-in.
- You can create multiple projects, invite collaborators, assign tasks, group work by milestones, and add meetings and comments.
- Use the same email and password on another device to load the same projects and tasks.
- Use the Export button to save a JSON backup of your tasks.
# TaskTracker

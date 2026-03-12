# Group Assignment Tracker

A simple checklist-style task tracker for group assignments. It runs as a static site, so it works well with GitHub Pages.

## Files

- `index.html`
- `styles.css`
- `app.js`

## Run locally

Open `index.html` directly in a browser, or run:

```bash
cd /Users/brendanpham/Desktop/Capstone/assignment-tracker
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Publish to GitHub Pages

1. Create a new GitHub repository in your account.
2. Upload all files from this folder, including the `.github/workflows/pages.yml` file.
3. Push to the `main` branch.
4. In GitHub, open `Settings` -> `Pages`.
5. Under `Build and deployment`, make sure `Source` is set to `GitHub Actions`.
6. Wait for the `Deploy static content to Pages` workflow to finish.
7. Your site will be available at:

```text
https://YOUR_GITHUB_USERNAME.github.io/REPOSITORY_NAME/
```

## Notes

- The tracker saves data in the browser using `localStorage`.
- If you open the site in a different browser or device, it will start with empty data.
- Use the Export button to save a JSON backup of your tasks.
# TaskTracker

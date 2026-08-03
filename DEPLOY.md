# Deploy in 5 Minutes

## Step 1: Set Your Password (2 min)

Open `.env.local` in the app folder and change this line:
```
APP_PASSWORD=your_secure_password_here
```

To something like:
```
APP_PASSWORD=MySecurePassword123!
```

Save the file.

---

## Step 2: Test It Locally (1 min)

Open PowerShell and run:

```powershell
cd "C:\Users\abhis\OneDrive\Claude Productivity\receipt-tracker-app"
npm install
npm run dev
```

Wait for it to say "ready - started server on..."

Then open: http://localhost:3000

Login with your password. See the dashboard? Perfect.

Press Ctrl+C to stop.

---

## Step 3: Push to GitHub (1 min)

First, create a GitHub repo:
- Go to https://github.com/new
- Name it: `receipt-tracker-app`
- Click "Create repository"
- Copy the URL (looks like `https://github.com/YOUR_USERNAME/receipt-tracker-app.git`)

Then in PowerShell:

```powershell
cd "C:\Users\abhis\OneDrive\Claude Productivity\receipt-tracker-app"
git init
git add .
git commit -m "Initial receipt tracker app"
git remote add origin PASTE_YOUR_GITHUB_URL_HERE
git push -u origin main
```

Wait for it to finish.

---

## Step 4: Deploy to Vercel (1 min)

1. Go to https://vercel.com/new
2. Click "Import GitHub Repository"
3. Search for `receipt-tracker-app` and select it
4. Click "Import"
5. You'll see "Environment Variables" section
6. Add these 3 (they're already in your `.env.local`):

**Name:** `NEXT_PUBLIC_SHEET_ID`  
**Value:** `1yLB8xR8Qvjn5QNxfTetmmBKPLR3KLX7wh-cB0w4OT7I`

**Name:** `APP_PASSWORD`  
**Value:** (whatever you set in Step 1)

**Name:** `GOOGLE_SERVICE_ACCOUNT_JSON`  
**Value:** Paste the entire contents of the "GOOGLE_SERVICE_ACCOUNT_JSON" line from `.env.local` (the long JSON string starting with `{"type":"service_account"...`)

7. Click "Deploy"
8. Wait ~2 min for deployment to finish
9. Click the URL it gives you
10. Login with your password

Done!

---

## Troubleshooting

**"npm: command not found"**
- Node.js not installed. Download from nodejs.org and install.

**"git: command not found"**
- Git not installed. Download from git-scm.com and install.

**Vercel says "GOOGLE_SERVICE_ACCOUNT_JSON is missing"**
- Make sure you pasted the entire JSON string (it's very long, starts with `{` and ends with `}`)

**Vercel deployment fails**
- Check the build logs on Vercel (it shows the error)
- Most common: missing or malformed `GOOGLE_SERVICE_ACCOUNT_JSON`

---

That's it. You now have:
- A receipt dashboard at `https://YOUR_VERCEL_URL`
- It reads/writes to your Google Sheet
- Password protected
- Only you can access it

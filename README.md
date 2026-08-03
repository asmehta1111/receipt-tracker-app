# Receipt Tracker App

Interactive expense dashboard synced with your Google Sheet. View, edit, filter, and analyze receipts in real-time.

## Features

- 📊 **Live Dashboard**: KPIs, category pie charts, account breakdown, monthly trends
- 📋 **Receipts Table**: Search, filter, sort your expenses
- 🏷️ **Bulk Categorization**: Select multiple receipts and change their category at once
- 🔄 **Sheet Sync**: All data reads/writes directly to your Google Sheet (no database needed)
- 🔐 **Password Protected**: Simple password auth, only you can access
- 📈 **Analytics**: Spend totals, transaction counts, subscription tracking

## Quick Start

### 1. Setup Environment Variables

Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_SHEET_ID=1yLB8xR8Qvjn5QNxfTetmmBKPLR3KLX7wh-cB0w4OT7I
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"receipt-scraper-501104",...}
APP_PASSWORD=your_secure_password_here
NEXT_PUBLIC_FX_API_KEY=your_fx_api_key
```

**For GOOGLE_SERVICE_ACCOUNT_JSON:** Paste the entire JSON object from the service account key file you created (the one with `private_key`, `client_email`, etc.). Make sure it's valid JSON.

**For APP_PASSWORD:** Set a strong password. You'll use this to login to the app.

**For FX API key (optional):** Get a free key from [exchangerate-api.com](https://exchangerate-api.com) to show current FX rates. If not provided, it falls back to showing original amounts only.

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Locally

```bash
npm run dev
```

Visit `http://localhost:3000`

## Deployment to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/receipt-tracker-app.git
git push -u origin main
```

### 2. Deploy to Vercel

1. Go to [Vercel](https://vercel.com)
2. Click "New Project" → Import your GitHub repo
3. In **Environment Variables**, add:
   - `NEXT_PUBLIC_SHEET_ID` = `1yLB8xR8Qvjn5QNxfTetmmBKPLR3KLX7wh-cB0w4OT7I`
   - `GOOGLE_SERVICE_ACCOUNT_JSON` = (paste the full JSON)
   - `APP_PASSWORD` = (your password)
   - `NEXT_PUBLIC_FX_API_KEY` = (optional)
4. Click "Deploy"
5. After deployment, visit your app URL (e.g., `https://receipt-tracker-abc.vercel.app`)

## Usage

### Dashboard Tab
- View total spend, transaction count, active subscriptions
- See spend breakdown by category and account
- Track monthly spend trends
- Review upcoming subscription renewals

### Receipts Tab
- **Filter by Category**: Use the dropdown to show only one category
- **Bulk Select**: Check boxes to select multiple receipts
- **Bulk Update Category**: With rows selected, pick a new category and click "Update Category"
- **Search**: (Future feature) Filter by vendor name or date range

## How It Works

### Data Flow

```
Google Sheet (Source of Truth)
       ↓
   API Routes (Next.js)
       ↓
  Dashboard (React)
       ↓
    User Edits
       ↓
   Sheet Updated
```

- App fetches receipts from Google Sheet on page load
- All edits (category changes, deletes) write back to Sheet immediately
- Dashboard is read-only by design (edits only happen through receipts table)
- Sheet sync is one-way: app reads from Sheet, not the other way

### Authentication

- Simple password-based auth (stored in `APP_PASSWORD` env var)
- Session cookie lasts 30 days
- Logout clears the cookie

### Sheet Integration

- Uses Google Sheets API with service account authentication
- No credentials stored in the browser (all API calls from Vercel backend)
- Reads all 12 columns: Date, Vendor, Currency, Amount, Category, Is Subscription, Renewal Date, Payment Method, Email Account, Subject, USD Estimate, Month

## Troubleshooting

### "Invalid password"
- Check that `APP_PASSWORD` env var is set correctly in Vercel
- Make sure there are no extra spaces

### "Failed to fetch receipts"
- Verify the service account email has been shared with your Sheet
- Check that `GOOGLE_SERVICE_ACCOUNT_JSON` is valid JSON (paste it into jsonlint.com to verify)
- Ensure `NEXT_PUBLIC_SHEET_ID` is correct

### Charts not showing
- Receipts table shows a clear view of raw data regardless
- Charts depend on analytics data being calculated correctly
- Try refreshing the page

### Bulk category update not working
- Make sure at least one receipt is selected
- Select a category from the dropdown before clicking "Update Category"
- Check browser console for errors

## Future Features

- [ ] Add new receipt form (instead of just scraper)
- [ ] Bulk delete receipts
- [ ] Export to CSV
- [ ] Date range filtering
- [ ] Vendor search
- [ ] Edit individual receipt details
- [ ] Duplicate detection / flagging
- [ ] Receipt image upload (OCR parsing)

## Tech Stack

- **Next.js 14** (React + API routes)
- **TailwindCSS** (styling)
- **Recharts** (dashboards & charts)
- **Google Sheets API** (data storage & sync)
- **Vercel** (hosting)

## Support

For issues or questions, check the app logs in Vercel's deployment view.

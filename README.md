# SwiftStack Attendance Dashboard
## Complete Setup Guide — Click-by-Click

---

## WHAT THIS SYSTEM DOES

- **Employees** log in and check in/out with one tap. Their check-in time, check-out time, and total hours are logged automatically.
- **Admin** manages schedules (who works when), views the full attendance log with OT/undertime calculations, exports Excel sheets, manages employees, holidays, and views analytics.
- Everything persists in **Firebase** — no server needed.

---

## PART 1: FIREBASE SETUP (Do this first — ~15 minutes)

### Step 1 — Create a Firebase Project

1. Go to **https://console.firebase.google.com**
2. Click **"Add project"**
3. Name it (e.g. `swiftstack-attendance`) → Click **Continue**
4. Disable Google Analytics (optional) → Click **Create project**
5. Wait for it to create → Click **Continue**

---

### Step 2 — Enable Authentication

1. In the left sidebar, click **"Build"** → **"Authentication"**
2. Click **"Get started"**
3. Click **"Email/Password"**
4. Toggle **"Email/Password"** to **Enabled**
5. Click **"Save"**

---

### Step 3 — Create Firestore Database

1. In the left sidebar, click **"Build"** → **"Firestore Database"**
2. Click **"Create database"**
3. Select **"Start in production mode"** → Click **Next**
4. Choose your region (e.g. `europe-west1` for Lebanon/Middle East) → Click **Enable**
5. Wait for it to create

---

### Step 4 — Enable Firebase Storage (for company logo uploads)

1. In the left sidebar, click **"Build"** → **"Storage"**
2. Click **"Get started"**
3. Select **"Start in production mode"** → Click **Next**
4. Choose same region as Firestore → Click **Done**

---

### Step 5 — Get your Firebase Config

1. Click the **gear icon ⚙️** (top left, next to "Project Overview")
2. Click **"Project settings"**
3. Scroll down to **"Your apps"** section
4. Click the **"</>"** (Web) icon to add a web app
5. Give it a nickname (e.g. `attendance-web`) — **do NOT enable Firebase Hosting yet**
6. Click **"Register app"**
7. You'll see a config object like this — **copy it**:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

---

### Step 6 — Paste config into the app

1. Open the file: `src/firebase/config.js`
2. Replace the placeholder values with your actual values from Step 5:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_API_KEY",          // ← paste here
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

3. Save the file.

---

## PART 2: INSTALL & RUN LOCALLY

### Step 7 — Install Node.js (if you don't have it)

1. Go to **https://nodejs.org**
2. Download and install **LTS version** (the left button)
3. After install, open **Terminal** (Mac) or **Command Prompt** (Windows)
4. Type `node --version` — you should see something like `v20.x.x`

---

### Step 8 — Install project dependencies

1. Open Terminal/Command Prompt
2. Navigate to the project folder:
   ```bash
   cd path/to/attendance-dashboard
   ```
   *(On Windows, right-click the folder → "Open in Terminal")*

3. Run:
   ```bash
   npm install
   ```
4. Wait for it to finish (1-2 minutes)

---

### Step 9 — Run locally

```bash
npm run dev
```

Open your browser to **http://localhost:5173**

You should see the login page. ✅

---

## PART 3: CREATE YOUR ADMIN ACCOUNT

### Step 10 — Create admin user manually in Firebase

You need to create yourself as admin directly in Firebase (the app doesn't have a "first-time setup" screen).

**Step 10a — Create the Auth account:**
1. Go to Firebase Console → **Authentication** → **Users** tab
2. Click **"Add user"**
3. Enter your email and a password → Click **"Add user"**
4. **Copy the UID** shown in the users list (looks like: `abc123XYZdef456`)

**Step 10b — Create the Firestore document:**
1. Go to Firebase Console → **Firestore Database**
2. Click **"Start collection"** → Collection ID: `users` → Click **Next**
3. Document ID: **paste your UID from Step 10a**
4. Add these fields:
   - `name` (string) → `Your Full Name`
   - `email` (string) → `your@email.com`
   - `role` (string) → `admin`
   - `department` (string) → `Management` (or anything)
5. Click **Save**

Now go to **http://localhost:5173**, log in with your email and password → you'll land on the **Admin Dashboard**.

---

## PART 4: DEPLOY FIRESTORE SECURITY RULES

### Step 11 — Install Firebase CLI

```bash
npm install -g firebase-tools
```

### Step 12 — Log in to Firebase

```bash
firebase login
```
A browser window will open — log in with your Google account.

### Step 13 — Update .firebaserc

Open `.firebaserc` and replace `YOUR_PROJECT_ID` with your actual Firebase project ID (visible in the Firebase Console URL or Project Settings).

```json
{
  "projects": {
    "default": "your-actual-project-id"
  }
}
```

### Step 14 — Deploy Firestore rules

```bash
firebase deploy --only firestore
```

This deploys the security rules so only logged-in users can access their own data.

---

## PART 5: ADD EMPLOYEES

### Step 15 — Add employees from the Admin panel

1. Log in as admin → go to **"Employees"** in the sidebar
2. Click **"Add Employee"**
3. Fill in:
   - **Full Name**: Employee's name
   - **Email**: Their login email
   - **Password**: Their initial password (they'll use this to log in)
   - **Department**: Optional
   - **Role**: Employee (keep as is)
4. Click **"Create Account"**
5. The employee can now log in at your app URL with that email/password

---

## PART 6: SET UP SCHEDULE

### Step 16 — Create a schedule for employees

1. Go to **"Schedule"** in the sidebar
2. Select the month/year
3. Click **"Bulk Schedule"** to quickly set a whole month:
   - Select employee (or "All Employees")
   - Set type to "Work"
   - Set start/end times (e.g. 07:00 – 16:30)
   - Select working days (Mon–Fri)
   - Click "Apply to All Days"
4. For individual days, click any cell in the grid to set it manually
5. For off days, holidays, annual leave — click the cell and select the type

---

## PART 7: DEPLOY TO FIREBASE HOSTING (make it public)

### Step 17 — Build the app

```bash
npm run build
```

### Step 18 — Deploy to Firebase Hosting

```bash
firebase deploy --only hosting
```

Your app will be live at:
**https://YOUR_PROJECT_ID.web.app**

Share this URL with your employees. They log in once and the browser remembers them permanently (unless they sign out).

---

## HOW TO USE DAY-TO-DAY

### As an Employee:
1. Open the app URL on phone or computer
2. **First visit**: Log in with email/password (browser remembers you after)
3. When you arrive at work → tap **"Check In"**
4. When you leave → tap **"Check Out"**
5. Forgot to tap? → Click **"Forgot to check in/out? Enter manually"**
6. View your history under **"My Attendance"**

### As an Admin:
- **Overview**: See who's present, late, or absent right now
- **Attendance Log**: Full history — filter by employee/month — add remarks — export Excel
- **Schedule**: Set work hours for each employee per day
- **Employees**: Add/edit employees
- **Holidays**: Add company holidays
- **Analytics**: Charts, OT summary, per-employee breakdown
- **Settings**: Upload company logo, set company name (shows on login page)

---

## EXPORTING EXCEL

1. Go to **Attendance Log**
2. Select the month and employee (or "All Employees")
3. Click **"Export Excel"**
4. An `.xlsx` file downloads with:
   - One sheet per employee
   - A combined "All Employees" sheet
   - Columns: Employee, Date, In, Out, Net Hours, Scheduled, OT/Short, Remarks
   - Monthly totals row at the bottom

---

## OVERTIME CALCULATION

- OT/Undertime is calculated **relative to their scheduled shift**
- If scheduled `07:00–16:30` (9h 30m) and they worked `10:00`:
  - OT = **+30 minutes**
- If they worked `9:00`:
  - Undertime = **-30 minutes**
- Monthly balance = sum of all daily OT/undertime
- Change the standard shift hours in **Settings**

---

## FIRESTORE DATA STRUCTURE (for reference)

```
users/          {uid}    → name, email, role, department
attendance/     {docId}  → userId, userName, date, checkIn, checkOut, isManual, remarks
schedules/      {docId}  → userId, userName, date, type, startTime, endTime, name
holidays/       {docId}  → date, name
settings/general         → companyName, logoUrl, overtimeThresholdMinutes
```

---

## COMMON ISSUES

**"Permission denied" error** → Deploy Firestore rules (Step 14)

**Can't create employees** → Make sure you're logged in as `role: admin` in Firestore

**Logo upload fails** → Make sure Firebase Storage is enabled (Step 4) and rules are deployed

**App shows blank page** → Check the Firebase config in `src/firebase/config.js` — make sure all values are filled in correctly

**Employee gets "Account not set up"** → The Firestore `users` document wasn't created. The "Add Employee" button in the admin panel creates it automatically.

---

## QUICK COMMAND REFERENCE

```bash
npm install          # Install dependencies
npm run dev          # Run locally on localhost:5173
npm run build        # Build for production
firebase login       # Log in to Firebase CLI
firebase deploy --only firestore   # Deploy security rules
firebase deploy --only hosting     # Deploy to web
firebase deploy                    # Deploy everything
```

---

*Built for SwiftStack by Claude — Anthropic*

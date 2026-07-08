// Tiesverse Admin — built-in Help Center content.
// Authored documentation for every feature. Searched client-side (title + keywords + body).
// Body markdown-lite: blank line = new paragraph, "## " = subheading, "- " = bullet, "1. " = step.

export const CATEGORIES = [
  'Getting started', 'My Work', 'HR Portal', 'Career Portal',
  'Webinar Portal', 'Certificates & Email', 'Advisory', 'Technical', 'Policies',
];

export const ARTICLES = [
  // ── Getting started ───────────────────────────────────────────────────────
  {
    id: 'gs-login', category: 'Getting started', title: 'Logging in & signing out',
    keywords: 'login sign in password logout session portal',
    body: `Open the portal and enter your **username (your email)** and password, then press **Log in**.

- Your login is created for you when HR approves your account; the password is emailed to you.
- After 10 minutes of inactivity you are signed out automatically (for security). Just log in again.
- To sign out manually, use the **log-out icon** at the top-right of the top bar.

If you forget your password, use **Forgot password?** on the login screen, or change it from your profile (see "Change your password").`,
  },
  {
    id: 'gs-nav', category: 'Getting started', title: 'Finding your way around (portals & sidebar)',
    keywords: 'navigation sidebar menu portal sections layout',
    body: `The left **sidebar** groups everything into portals. Click a portal header to expand its pages.

- **My Work** — your own attendance, leave, tasks, assets, profile and policies.
- **HR Portal** — team management (HR / leads only).
- **Career, Webinar, Certificates & Email** — the operational areas.
- You only see the portals and pages your role gives you access to, so your sidebar may be shorter than a colleague's.

The **top bar** shows the current section, a Search button, settings (theme, profile), and log-out.`,
  },
  {
    id: 'gs-palette', category: 'Getting started', title: 'Command palette — jump anywhere with ⌘K / Ctrl+K',
    keywords: 'command palette search cmd k ctrl k shortcut jump navigate quick',
    body: `Press **Ctrl + K** (or **⌘ K** on Mac), or click **Search** in the top bar, to open the command palette.

1. Start typing the name of any page (e.g. "attendance", "policies", "revenue").
2. Use the **↑ / ↓** arrows to move and **Enter** to open it. **Esc** closes.

The palette only lists pages you can actually open, so it's the fastest way to get anywhere without hunting through the sidebar.`,
  },
  {
    id: 'gs-photo', category: 'Getting started', title: 'Your profile photo',
    keywords: 'profile photo picture avatar onboarding image',
    body: `Your avatar (top-right) shows the **photo you uploaded during onboarding / signup**. It appears automatically once HR approves your account — there is nothing to upload again inside the app.

If your photo is missing, contact HR to check your onboarding record.`,
  },
  {
    id: 'gs-password', category: 'Getting started', title: 'Change your password (with email code)',
    keywords: 'change password security profile settings otp code email verify',
    body: `Go to **Profile settings** (the ⚙ gear in the top bar) → **Change Password**.

1. Click **Send code to my email** — a 6-digit code is emailed to you.
2. Enter the **code**, your **new password** (min 8 characters) and confirm it.
3. Click **Change password**.

The code expires in 10 minutes and is limited to a few attempts — this verifies it's really you before the password changes.`,
  },
  {
    id: 'gs-theme', category: 'Getting started', title: 'Theme & appearance',
    keywords: 'theme dark light appearance colour accent settings',
    body: `Use the **moon / sun icon** in the top bar to switch between light and dark mode, or open **Profile settings** for more appearance options. Your choice is remembered on your account.`,
  },

  // ── My Work ───────────────────────────────────────────────────────────────
  {
    id: 'mw-attendance', category: 'My Work', title: 'Marking attendance (check-in, check-out & work report)',
    keywords: 'attendance check in out work report daily present my work',
    body: `**My Work → My Attendance** is where you record your day.

1. **Check in** when you start — this stamps your start time.
2. At the end of the day, **Check out**. You'll be asked for a short **work report** (what you did today) — this is required so your lead knows what was accomplished.

Your record then shows as **Pending** until your team lead / HR approves it. Your attendance **history** is listed below with status and approval.`,
  },
  {
    id: 'mw-leave', category: 'My Work', title: 'Applying for leave',
    keywords: 'leave time off holiday apply request vacation sick',
    body: `**My Work → My Leave** → **Apply for leave**.

1. Pick the **from** and **to** dates and the **type** (e.g. casual, sick).
2. Add a **reason** and submit.

The request goes to HR, who approve or reject it. You'll see the status update in your leave list.`,
  },
  {
    id: 'mw-offboarding', category: 'My Work', title: 'Requesting to leave (offboarding)',
    keywords: 'offboarding resign leave company exit notice period request',
    body: `**My Work → Offboarding** lets you formally request to leave.

- Submit your request with a reason and intended date. HR reviews it, sets a **notice period**, and revokes access after your last working day.
- Your records are always kept for the organisation's history.`,
  },
  {
    id: 'mw-tasks', category: 'My Work', title: 'Your tasks',
    keywords: 'tasks assigned to do complete work my tasks',
    body: `**My Work → My Tasks** lists tasks assigned to you. Open a task to see the details, and mark it **done** with a short completion note when finished. Completed tasks are visible to Advisory for oversight.`,
  },
  {
    id: 'mw-assets', category: 'My Work', title: 'Your assets',
    keywords: 'assets equipment laptop assigned hardware my assets',
    body: `**My Work → My Assets** shows company assets (laptop, devices, etc.) assigned to you. If something is missing or wrong, tell HR — they manage asset assignments in the HR Portal.`,
  },
  {
    id: 'mw-policies', category: 'My Work', title: 'Reading company policies',
    keywords: 'policies rules company read my work hr guidelines',
    body: `**My Work → Policies** lists all company policies published by HR. Click any policy to expand and read the full text, and use the **search box** to find one quickly. Everyone sees the same shared policy library.`,
  },

  // ── HR Portal ─────────────────────────────────────────────────────────────
  {
    id: 'hr-scope', category: 'HR Portal', title: 'What HR & team leads can see',
    keywords: 'hr portal access scope team lead permissions advisory org-wide',
    body: `Access to HR data depends on your role:

- **HR / Admin / Advisory** — org-wide: everyone's data.
- **Team leads** — only their own department's members.
- **Members** — only their own records (via My Work).

So the HR Portal shows more or less depending on who you are.`,
  },
  {
    id: 'hr-directories', category: 'HR Portal', title: 'Team Directory & Master Directory',
    keywords: 'team directory master directory people search members list',
    body: `**Team Directory** lists the members you manage. **Master Directory** (org-wide roles only) is a unified people search across members, webinar registrations and certificates — type a name or email to find anyone and see their linked records.`,
  },
  {
    id: 'hr-departments', category: 'HR Portal', title: 'HR Departments (and leads)',
    keywords: 'hr departments teams lead co-lead structure create',
    body: `**HR Portal → HR Departments** is where you create departments and set each one's **lead** and **co-lead**. Departments are used everywhere else — when you assign a member to a department, their attendance/leave/tasks roll up to that team's lead.`,
  },
  {
    id: 'hr-attendance', category: 'HR Portal', title: 'Approving attendance',
    keywords: 'attendance approve review work report hr lead pending',
    body: `**HR Portal → Attendance** shows every pending checked-out record for your scope. Each row with a submitted work report has a **Review** button → read the report → **Approve** or **Reject**.

Note: your *own* attendance is approved here too (not in My Work), since My Work is your personal view.`,
  },
  {
    id: 'hr-leave', category: 'HR Portal', title: 'Approving leave',
    keywords: 'leave approve reject review hr requests',
    body: `**HR Portal → Leave** lists leave requests. Open one and **approve** or **reject** it (HR only). The member sees the decision on their side.`,
  },
  {
    id: 'hr-offboarding', category: 'HR Portal', title: 'Reviewing offboarding',
    keywords: 'offboarding review revoke reactivate notice period last working day',
    body: `**HR Portal → Offboarding** is where HR handles exit requests: set the **last working day**, **revoke** access when the time comes, or **reactivate** if needed. Records are always retained.`,
  },
  {
    id: 'hr-assets-tasks', category: 'HR Portal', title: 'Assigning assets & tasks',
    keywords: 'assets tasks assign hr create equipment to do',
    body: `**HR Portal → Assets** — register equipment and assign it to members. **HR Portal → Tasks** — create tasks and assign them to members; they appear in the member's My Work → Tasks.`,
  },
  {
    id: 'hr-signups', category: 'HR Portal', title: 'New Signups — approve members & send logins',
    keywords: 'new signups approve create account credentials login password resend self signup otp',
    body: `**HR Portal → New Signups** manages people who self-registered via the shared signup link.

## Approving someone
1. A signup shows once they've verified their email (OTP). Pick their **role** and **department(s)**.
2. Click **Approve & create account** — this creates their login and **emails them their username + a temporary password**.

## Re-sending login details
- **Send login details to all** — reissues a fresh password to every member and emails it.
- **Send login details to one member** — pick a person and reissue just theirs.

Passwords are stored encrypted and can't be read back, so re-sending always issues a **new** password.

## The signup link
The orange bar at the top shows the **shared signup URL** — copy it and send it to new interns/members so they can self-register.`,
  },
  {
    id: 'hr-policies', category: 'HR Portal', title: 'Publishing policies',
    keywords: 'policies publish create edit hr rules library company',
    body: `**HR Portal → Policies** is where HR writes company policies for everyone.

1. Click **New policy**. Give it a **title**, a **category** (e.g. HR, Conduct, Leave), a one-line **summary**, and the full **details**.
2. Set **Order** to control where it appears, and leave **Published** ticked so members can see it.
3. Save. It instantly appears for every member under My Work → Policies.

Edit or delete any policy with the pencil / trash icons. Untick **Published** to keep a draft hidden from members.`,
  },

  // ── Career Portal ─────────────────────────────────────────────────────────
  {
    id: 'cr-overview', category: 'Career Portal', title: 'Career Portal overview',
    keywords: 'career hiring recruitment positions applications offers onboarding',
    body: `The Career Portal is the hiring pipeline:

- **Position Tracker** — open roles you're hiring for.
- **Application Tracker** — candidates who applied (from the public career form).
- **Offer Letters** — issue and track offers.
- **Form Gates** — control which onboarding form steps are open.
- **Onboarding** — turn an accepted candidate into a member.`,
  },
  {
    id: 'cr-onboarding', category: 'Career Portal', title: 'Onboarding a new member',
    keywords: 'onboarding initiate document upload member create account career',
    body: `From **Career Portal → Onboarding** you initiate onboarding for a candidate: they receive a secure link to upload their documents (ID, photo, etc.). Once verified, HR can provision their portal account (username + password emailed). Members who came through **self-signup** are handled in HR → New Signups instead.`,
  },

  // ── Webinar Portal ────────────────────────────────────────────────────────
  {
    id: 'wb-overview', category: 'Webinar Portal', title: 'Webinar Portal overview',
    keywords: 'webinar workshop events speakers registrations coupons revenue',
    body: `Manage online events end-to-end:

- **Events / Webinars & Workshops** — create and publish events shown on the public site.
- **Speakers** — the people presenting.
- **Registrations** — who signed up (paid & free).
- **Coupons** — discount codes.
- **Dashboard** — attendance, registrations and (for org-wide roles) revenue.`,
  },
  {
    id: 'wb-payments', category: 'Webinar Portal', title: 'Paid webinars & payments (Razorpay)',
    keywords: 'payment razorpay paid webinar coupon price revenue order abandoned reminder',
    body: `Paid events collect payment via **Razorpay** on the public event page.

- The price is read from the event's registration record, and a **coupon** field lets attendees apply a discount code.
- If someone starts but doesn't finish paying, they can be sent a **reminder email** to complete the payment.
- **Revenue** (total paid, by event) is shown on the Webinar dashboard for HR / Advisory only.`,
  },

  // ── Certificates & Email ──────────────────────────────────────────────────
  {
    id: 'ce-certificates', category: 'Certificates & Email', title: 'Generating certificates',
    keywords: 'certificate generate single batch pdf template variables data source connector csv',
    body: `**Certificates → a template → Generate** produces PDF certificates.

## Ways to generate
- **Single** — fill in one person's fields and generate one certificate.
- **Batch (CSV)** — upload a CSV; each row becomes a certificate in a ZIP.
- **Connect a data source** — pick a **system table** (webinar registrations, candidates, members…) *or* a CSV, then **map each variable to a column** and generate in bulk.

Every declared template variable is filled with its value or its **default**, so a certificate never prints a blank/placeholder token.`,
  },
  {
    id: 'ce-email-templates', category: 'Certificates & Email', title: 'Email templates & variables (no-conflict)',
    keywords: 'email template variables tokens default no conflict designer editor rename placeholder',
    body: `**Certificates & Email → Email Templates** is the visual email designer.

## Variables
- Each template has **variables** (e.g. {{name}}, {{role}}). Click a variable to insert its {{token}} into the text.
- Give a variable a **default value** so it's never blank, **rename** a variable (the pencil — it updates every token automatically), or **add** new ones.
- A live **warning** flags any {{token}} you've used but not defined, so nothing ships as raw {{token}}.

This works on **every** template, built-in or custom.`,
  },
  {
    id: 'ce-mail-automation', category: 'Certificates & Email', title: 'Mail Automation (bulk personalised email)',
    keywords: 'mail automation campaign bulk csv table manual data source mapping send personalize',
    body: `**Certificates & Email → Mail Automation** sends a template to many people, personalised per recipient.

1. **Choose a template** and sender.
2. **Pick recipients** — **Upload CSV**, **From a table** (Team Members, a webinar's registrations, candidates, signups…), or **Manual entry**.
3. **Map each variable** to a column/field (auto-matched by name; unmapped ones fall back to the variable's default).
4. Preview per recipient, then **Send**. A warning lists any token that would be blank so you can fix it first.`,
  },

  // ── Advisory ──────────────────────────────────────────────────────────────
  {
    id: 'ad-oversight', category: 'Advisory', title: 'Advisory oversight & updates',
    keywords: 'advisory oversight completed tasks daily updates weekly team lead',
    body: `The **Advisory** portal gives senior members oversight:

- **Completed tasks** across teams (who finished what).
- **Daily updates** — members' work reports.
- **Weekly updates** — team leads submit a weekly summary (wins, blockers); advisory sees them all.`,
  },

  // ── Technical ─────────────────────────────────────────────────────────────
  {
    id: 'tech-infra', category: 'Technical', title: 'Technical / Infrastructure dashboard',
    keywords: 'technical infrastructure developer ses cloudinary r2 turso d1 ram storage cost free tier',
    body: `**Technical → Infrastructure** (developer account only) shows live usage and free-tier limits for every service the system runs on:

- **Server** RAM / disk / CPU, **AWS SES** email quota, **Cloudinary** photos/storage, **Cloudflare R2** files, **Turso** & **D1** databases.
- Each card shows current usage, the free-tier limit, and the **cost after the free tier (in INR)**.

Use **Refresh** to pull the latest numbers.`,
  },

  // ── Policies (meta) ───────────────────────────────────────────────────────
  {
    id: 'pol-what', category: 'Policies', title: 'How policies work',
    keywords: 'policies shared library everyone read publish hr search',
    body: `Policies are a **shared library for everyone**: HR publishes them once (HR Portal → Policies) and every member reads the same set (My Work → Policies). There's no per-team targeting — it's a single, consistent rulebook. Use the search box on either page to find a policy fast.`,
  },
];

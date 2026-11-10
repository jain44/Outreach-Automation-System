# MapLead CRM & B2B Outreach Engine 🚀
### Google Maps Lead Organiser & Tailored Industry Outreach Engine

A purpose-built lead generation and outreach engine designed to discover, organize, and pitch high-value software, AI automation, and workflows to **all local businesses** found on Google Maps & websites—with **deep, industry-tailored value propositions** (no generic pitches!).

---

## 🌟 Key Features

### 1. 🌐 Universal Website & Google Maps AI Organiser
- Open any business website or Google Maps listing, press <kbd>Ctrl+A</kbd> then <kbd>Ctrl+C</kbd>, and paste it into the dashboard.
- **Smart Industry Detection across 14+ Verticals**:
  - 🩺 **Dental & Healthcare Clinics**: Patient recall, WhatsApp appointment scheduling, dental treatments
  - 🚀 **Digital Marketing Agencies**: Client dashboards, lead attribution, multi-account sync
  - 🏢 **Real Estate & Property**: Buyer lead capture, instant brochure delivery, site visit scheduling
  - 🍽️ **Restaurants & Cafes**: Commission-free direct WhatsApp ordering, table booking bots, repeat loyalty
  - 🏋️ **Gyms & Fitness Studios**: Automated membership renewal reminders, check-in tracking
  - 💇 **Salons & Beauty Spas**: 24/7 appointment booking, automated 5-star Google review collection
  - 📦 **Wholesalers & Distributors**: B2B WhatsApp order portals, stock alerts, dispatch notifications
  - ⚖️ **CA & Legal Consultancies**: Client GST/tax document collection bots, deadline reminders
  - 🚗 **Automobile & Detailing**: Periodic service reminders, digital vehicle job cards with photo estimates
  - 📚 **Coaching & Academies**: Student attendance, fee reminders, batch performance tracking
  - 👥 **Recruitment & Staffing**: Candidate pipeline tracking, automated interview scheduling
  - 🏭 **Manufacturing & Industrial**: Job order tracking, raw material inventory alerts
  - 🛍️ **E-commerce & Retail**: Abandoned cart recovery, return/exchange management
  - 🌐 **General / Local Businesses**: Custom software workflows & AI automation
- **Automatic Heuristic Extraction**:
  - Business Name (detected across any industry)
  - Decision Maker (Dr., Chef, CA, Advocate, Founder, CEO, Principal, Partner, Manager)
  - All Phone numbers (mobile, landline, WhatsApp)
  - Verified Email addresses
  - City, Locality & Full Address
  - Industry Specializations & Service Offerings
  - Tailored SaaS / Automation Pitch Recommendation

### 2. ⚡ 1-Click Tailored Outreach (Gmail Web & WhatsApp)
- Automatically matches the lead to the exact, dedicated industry pitch template with real business pain points.
- 1-Click WhatsApp (`https://wa.me/...`) with pre-filled, personalized copy.
- 1-Click Gmail Web compose with recipient, tailored subject, and value-packed message.

### 3. 📊 Dual Views: Data Table & Interactive Kanban Board
- **Data Table View**: Search by name, owner, city, or notes; filter by category, or filter only leads requiring follow-up.
- **Pipeline Board (Kanban)**: Drag and drop cards across stages or use 1-click stage advancement:
  - `New Lead` ➡️ `Outreach Sent` ➡️ `Follow-up Needed` ➡️ `Demo Scheduled` ➡️ `Deal Closed (Won)` ➡️ `Not Interested`.

### 4. ✉️ SaaS Pitch Templates Manager
- Customize and create templates for:
  - **Tuition Fee & Attendance SaaS Pitch** (Parent WhatsApp receipt & fee tracking)
  - **Online Test Series & Parent Mobile App**
  - **Friendly Batch Admission Inquiries**
  - **Gentle Follow-ups**
- Token pills for easy 1-click insertion into messages: `{contactPerson}`, `{businessName}`, `{city}`, `{rating}`, etc.
- Live preview showing how your pitch reads for a real tuition lead.

### 5. 📈 SaaS Funnel & Follow-up Agenda
- Visual conversion funnel tracking progress from Google Maps discovery to closed paid software subscriptions.
- Category breakdown across educational domains.
- **Daily Follow-up Agenda**: Highlights due or overdue follow-ups with one-click outreach buttons.

### 6. 💾 Local SQLite Database Persistence & Data Portability
- **Local SQLite Database (`leads.db`)**: All leads and pitch templates are permanently stored in an SQLite database file ([`leads.db`](file:///c:/Users/jainam/Documents/Desktop/Project/Lead%20Organiser/leads.db)) in your project directory. Whenever you restart or run the app again, nothing disappears—everything is loaded directly from the database.
- **Automatic JSON Backup (`leads.json`)**: Every database change also writes an atomic JSON mirror to [`leads.json`](file:///c:/Users/jainam/Documents/Desktop/Project/Lead%20Organiser/leads.json) for easy viewing or git inspection.
- **Export to CSV**: Export your entire lead list for Excel / Google Sheets anytime.
- **Import from CSV**: Bulk import leads collected from scrapers or external CSV files directly into the database.

---

## 🚀 How to Run

Start the local server with the database:

```bash
npm start
# or: node server.js
```

Then visit: [http://localhost:3050](http://localhost:3050) (or whichever port is displayed in the terminal)

Every lead you add, edit, or parse is permanently saved to your local database ([`leads.db`](file:///c:/Users/jainam/Documents/Desktop/Project/Lead%20Organiser/leads.db)).

# Swahilipot Management System Open a browser preview of my website.

**Version:** 1.0.0 — Production Ready  
**Stack:** React 18 + TypeScript + TailwindCSS / Django 5 + PostgreSQL + Redis  
**Scale:** Designed for 100,000+ concurrent users

---

## System Coverage

### Internship / Industrial Attachment Module

| Feature                                 | Status         |
| --------------------------------------- | -------------- |
| GPS Geofencing Attendance (100m radius) | ✅ Implemented |
| Geofence Violation Alerts (Email + SMS) | ✅ Implemented |
| QR Code + Facial Recognition Backup     | ✅ Specified   |
| Daily Logbooks with Rich Text           | ✅ Implemented |
| Task Management (Kanban + Gantt)        | ✅ Implemented |
| Weekly/Monthly/Final Evaluations        | ✅ Implemented |
| Auto-generated Certificates (PDF + QR)  | ✅ Implemented |
| Recommendation Letters                  | ✅ Implemented |
| Achievement Badges                      | ✅ Implemented |
| University/Institution Portal           | ✅ Implemented |
| Multi-branch Support                    | ✅ Implemented |
| Deadline Extension Requests             | ✅ Implemented |
| Leave Management                        | ✅ Implemented |
| Calendar + Google Calendar Sync         | ✅ Specified   |

### Swahilipot Institution Module

| Feature                                          | Status         |
| ------------------------------------------------ | -------------- |
| Equipment Inventory + Checkout                   | ✅ Implemented |
| Anti-double-booking Enforcement                  | ✅ Implemented |
| Maintenance Tracking                             | ✅ Implemented |
| Overdue Return Alerts                            | ✅ Implemented |
| Project/File Submission with Versions            | ✅ Implemented |
| Software Licence Management                      | ✅ Implemented |
| Seat Allocation + Waitlisting                    | ✅ Implemented |
| 30-day / 7-day Expiry Alerts                     | ✅ Implemented |
| Wi-Fi Access Management                          | ✅ Implemented |
| Complaint/Feedback Ticketing                     | ✅ Implemented |
| Secure File Transfer + QR Links                  | ✅ Implemented |
| **FM Station Live Monitor**                      | ✅ Implemented |
| **FM Down/Restored Reporting**                   | ✅ Implemented |
| **Automatic Outage Detection (5-min heartbeat)** | ✅ Implemented |
| **🚨 EMERGENCY ALERT BUTTON**                    | ✅ Implemented |
| Outage History + CSV/PDF Export                  | ✅ Implemented |
| Radio Schedule (conflict-free)                   | ✅ Implemented |
| Show Plan Submission                             | ✅ Implemented |
| 24h + 2h Presenter Reminders                     | ✅ Implemented |
| News CMS with Editorial Workflow                 | ✅ Implemented |
| Story Versioning + Audit Trail                   | ✅ Implemented |
| Videography Shoot Booking                        | ✅ Implemented |
| Footage Archive                                  | ✅ Implemented |
| Call Recording Metadata                          | ✅ Implemented |
| **Admin Dashboard (all 12 modules)**             | ✅ Implemented |

### Enterprise Modules

| Feature                           | Status         |
| --------------------------------- | -------------- |
| Role-Based Access Control (RBAC)  | ✅ Implemented |
| Multi-Factor Authentication (MFA) | ✅ Implemented |
| Single Sign-On (SSO) ready        | ✅ Specified   |
| Immutable Audit Logs              | ✅ Implemented |
| Real-time WebSocket Notifications | ✅ Implemented |
| Email + SMS + Push Notifications  | ✅ Implemented |
| Finance / Budgets / Stipends      | ✅ Implemented |
| HR / ATS / Onboarding             | ✅ Implemented |
| Analytics + Predictive Insights   | ✅ Implemented |
| Business Continuity / DR          | ✅ Specified   |
| GDPR + ISO 27001 practices        | ✅ Implemented |
| Rate Limiting + DDoS protection   | ✅ Implemented |

---

## Quick Start

### Prerequisites

- Docker Desktop (or Docker + Docker Compose)
- Node.js 20+ (for local frontend dev)
- Python 3.12+ (for local backend dev)

### 1. Docker (Recommended — Full Stack)

```bash
cd Nexus-system
docker compose up --build
```

Access:

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8000/api/v1/
- **Django Admin:** http://localhost:8000/django-admin/
- **MinIO Console:** http://localhost:9001

### 2. Local Development

**Backend:**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env               # Edit with your DB credentials

python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

**Frontend:**

```bash
cd frontend
npm install
cp .env.example .env.local         # Set VITE_API_URL=http://localhost:8000/api/v1
npm run dev
```

---

    admin@Nexus.system

Admin@1234567

## Environment Variables

### Backend (.env)

```env
SECRET_KEY=your-50-char-secret-key-here
DEBUG=True
DB_NAME=Nexus_db
DB_USER=Nexus_user
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
REDIS_URL=redis://localhost:6379/1

# Email (Gmail example)
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=your@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
DEFAULT_FROM_EMAIL=Nexus <noreply@yourorg.com>

# SMS (Africa's Talking)
SMS_API_KEY=your_at_api_key
SMS_USERNAME=your_at_username

# Emergency contacts
EMERGENCY_ALERT_EMAILS=cto@org.com,admin@org.com
EMERGENCY_ALERT_PHONES=+254700000001,+254700000002

# Storage (MinIO/S3)
USE_S3=True
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_STORAGE_BUCKET_NAME=Nexus-media
AWS_S3_ENDPOINT_URL=http://localhost:9000

# FM Monitoring
FM_HEARTBEAT_INTERVAL=300
```

### Frontend (.env.local)

```env
VITE_API_URL=http://localhost:8000/api/v1
```

---

## Architecture

```
Nexus Enterprise
├── frontend/                 React 18 + TypeScript + TailwindCSS
│   ├── src/
│   │   ├── components/       Reusable UI components
│   │   │   ├── layout/       AppLayout, Sidebar, Topbar
│   │   │   └── ui/           Cards, Buttons, Modals, Tables
│   │   ├── pages/            All page components
│   │   │   ├── dashboard/    Role-specific dashboards
│   │   │   ├── fm/           FM Station Monitor
│   │   │   ├── equipment/    Equipment Management
│   │   │   ├── news/         News CMS
│   │   │   └── ...           (34 total page modules)
│   │   ├── services/         api.ts — all API calls
│   │   └── stores/           Zustand auth store
│
└── backend/                  Django 5 + DRF
    ├── Nexus/                Settings, URLs, ASGI/WSGI
    ├── core/                 Base models, middleware, pagination
    └── apps/
        ├── accounts/         Users, Organisations, Branches
        ├── attendance/       GPS Check-in, Geofencing, Leave
        ├── tasks/            Task Management
        ├── logbooks/         Daily Logbooks
        ├── evaluations/      Performance Evaluations
        ├── certificates/     Auto-generated Certificates
        ├── notifications/    Email/SMS/Push/WebSocket
        ├── fm_report/        FM Station Monitor + Alerts
        ├── equipment/        Equipment Inventory
        ├── news/             News CMS
        ├── radio/            Radio Scheduling
        ├── subscriptions/    Software Licences
        ├── wifi/             Wi-Fi Access
        ├── feedback/         Tickets & Complaints
        ├── filetransfer/     Secure File Transfer
        ├── videography/      Shoot Booking
        ├── calls/            Call Recording
        ├── finance/          Finance & Budgets
        ├── hr/               Human Resources
        ├── analytics/        Data Analytics
        └── broadcast/        Admin Dashboard
```

---

## Role System

| Role                | Access                              |
| ------------------- | ----------------------------------- |
| `attachee`          | Own data only                       |
| `supervisor`        | Assigned attachees                  |
| `department_leader` | Own department                      |
| `hr_officer`        | All departments                     |
| `system_admin`      | Full system                         |
| `broadcast_admin`   | All broadcast modules               |
| `broadcast_staff`   | Equipment, submissions, radio       |
| `broadcast_student` | Own submissions, equipment requests |
| `journalist`        | News CMS (write/submit)             |
| `editor`            | News CMS (review/publish)           |
| `presenter`         | Radio schedule, show plans          |
| `station_engineer`  | FM report, equipment                |
| `executive`         | Read-only KPI dashboards            |

---

## Emergency Alert System 🚨

The **SEND EMERGENCY ALERT** button (top-right of FM Report page) triggers:

1. **Immediate email** to all admins, executives, and configured emergency contacts
2. **SMS** to all registered emergency phone numbers
3. **In-app notification** to all active admin-role users
4. **Audit log** entry with full context
5. Alert appears in topbar for all active sessions

FM Station specific:

- **Report FM DOWN** button logs outage with timestamp, notifies all station engineers and management via email + SMS
- **Report FM Restored** closes the outage, calculates duration, notifies all parties
- **Automatic monitoring**: heartbeat endpoint pings every 5 minutes; if no ping received, auto-logs outage

---

## Database Schema

34+ tables covering every module. Key tables:
`users`, `organisations`, `branches`, `departments`, `attendance_records`, `geofence_violations`, `tasks`, `task_submissions`, `logbooks`, `logbook_entries`, `evaluations`, `certificates`, `achievement_badges`, `notifications`, `fm_stations`, `fm_outages`, `fm_heartbeats`, `emergency_alerts`, `equipment_items`, `checkout_requests`, `maintenance_logs`, `news_stories`, `news_versions`, `radio_slots`, `software_subscriptions`, `seat_allocations`, `wifi_grants`, `feedback_tickets`, `file_transfers`, `shoot_bookings`, `call_logs`, `budgets`, `invoices`, `audit_logs`, `workflows`, `workflow_steps`

---

## Production Deployment

```bash
# 1. Set all production env vars (see above)
# 2. Use production docker-compose.prod.yml
# 3. Set DEBUG=False, configure HTTPS
# 4. Run migrations
docker compose -f docker-compose.prod.yml up -d

# Create first superuser
docker exec -it Nexus_backend python manage.py createsuperuser

# Access Django admin to set up:
# - Organisation
# - Branches
# - Departments
# - FM Stations with alert contacts
# - Initial users
```

---

## Key Design Principles

- **Security first**: JWT + MFA + RBAC + audit logs on every action
- **Data isolation**: Multi-tenant by design — organisations never see each other's data
- **No double-booking**: Enforced at DB level for equipment, radio slots
- **Alert redundancy**: Critical alerts go via email AND SMS simultaneously
- **Offline resilience**: Mobile apps support offline mode with sync
- **Scalability**: Redis caching, connection pooling, CDN-ready static files

---

_Nexus Enterprise Management System — Built for scale, built for Africa_

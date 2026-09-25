# Samadhan — User Flow Documentation

## 1. Overview

Samadhan is a two-role civic issue reporting and resolution platform.

The platform provides two distinct experiences:

* **Citizen** — reports civic issues and tracks their progress.
* **City Administrator** — manages, routes and resolves reported issues.

The user flow is designed around the complete lifecycle of a civic issue, from initial citizen reporting through departmental resolution and verification.

---

## 2. High-Level Platform Flow

```text
                         SAMADHAN
                            │
                 ┌──────────┴──────────┐
                 │                     │
              CITIZEN             ADMINISTRATOR
                 │                     │
                 ▼                     ▼
              Login                  Login
                 │                     │
                 ▼                     ▼
         Citizen Dashboard      Admin Dashboard
                 │                     │
                 ▼                     ▼
           Report Issue          Manage Issues
                 │                     │
                 ▼                     ▼
        Location + Category      Department Queue
        + Description + Photo          │
                 │                     │
                 ▼                     ▼
        Duplicate Detection       Update Status
                 │                     │
                 ▼                     ▼
        Department Routing        Resolution Notes
                 │                     │
                 └──────────┬──────────┘
                            ▼
                     Issue Resolution
                            │
                            ▼
                    Citizen Tracking
                            │
                            ▼
                     Admin Analytics
```

---

# 3. Citizen User Flow

## Step 1 — Authentication

The citizen starts by creating an account or logging into an existing account.

```text
Citizen
   ↓
Sign Up / Login
   ↓
Authentication
   ↓
Citizen Dashboard
```

The system identifies the user as a **Citizen** and provides access only to citizen-specific functionality.

---

## Step 2 — Citizen Dashboard

After authentication, the citizen can access functions such as:

* Report a civic issue
* View previously reported issues
* Track issue status
* View issues on the city map

---

## Step 3 — Report an Issue

The citizen selects the option to report a new civic issue.

The reporting flow requires:

```text
Select Location
      ↓
Select Category
      ↓
Add Description
      ↓
Upload Photo Evidence
      ↓
Submit Report
```

The location is selected using a map-based interface.

Possible categories include:

* Roads
* Sanitation
* Electricity
* Water
* Public Property

---

## Step 4 — Duplicate Detection

Before the report is treated as a new issue, Samadhan checks whether a similar issue may already exist nearby.

The system can evaluate:

```text
Category
   +
Geographic Proximity
   +
Recent Timeframe
   ↓
Potential Duplicate
```

If a likely duplicate is identified, the system can flag the report or associate it with an existing issue.

---

## Step 5 — Department Routing

Once the report is accepted, it is automatically routed to the appropriate department according to its category.

```text
Issue Category
      ↓
Routing System
      ↓
Responsible Department
```

For example:

```text
Roads
  ↓
Roads Department

Sanitation
  ↓
Sanitation Department

Water
  ↓
Water Department
```

---

## Step 6 — Track Issue

After submission, the citizen can view the issue and monitor its status.

The issue follows a defined lifecycle:

```text
Reported
   ↓
Acknowledged
   ↓
In Progress
   ↓
Resolved
   ↓
Verified / Closed
```

Citizens can see status changes as the issue progresses through the workflow.

---

# 4. Administrator User Flow

## Step 1 — Administrator Authentication

The administrator logs into the platform using an administrator account.

```text
Administrator
      ↓
Login
      ↓
Authentication + Role Verification
      ↓
Admin Dashboard
```

Administrator access is separate from the citizen experience.

Administrative permissions must be enforced on the backend.

---

## Step 2 — Admin Dashboard

The administrator can access:

* Reported issues
* Department queues
* Issue details
* Status management
* Resolution information
* City-wide analytics

---

## Step 3 — Review Issues

Administrators can view reported issues and organize them according to their department assignments.

```text
All Issues
    ↓
Department
    ↓
Category / Status
    ↓
Issue Details
```

---

## Step 4 — Manage Issue

The administrator reviews the issue details, including:

* Category
* Description
* Location
* Citizen-submitted photo
* Current status
* Department assignment

The administrator can then update the issue according to its resolution progress.

---

## Step 5 — Update Status

The administrator moves the issue through the resolution workflow:

```text
Reported
    ↓
Acknowledged
    ↓
In Progress
    ↓
Resolved
    ↓
Verified / Closed
```

Administrators can also add resolution notes and upload proof-of-resolution photographs.

---

## Step 6 — Resolution

Once the civic issue has been addressed, the administrator records the resolution.

```text
Issue Fixed
    ↓
Resolution Notes
    +
Proof-of-Resolution Photo
    ↓
Resolved
```

The updated information becomes available to the citizen.

---

# 5. Issue Verification & Closure

After an issue reaches the resolved stage, it can progress toward verification and closure.

```text
Resolved
    ↓
Verification
    ↓
Closed
```

The platform is designed to allow citizens to confirm or reopen an issue if it has not actually been resolved.

---

# 6. Analytics Flow

Issue data collected throughout the lifecycle feeds the administrator analytics dashboard.

```text
Citizen Reports
      ↓
Issue Database
      ↓
Status + Category + Department + Location
      ↓
Analytics Processing
      ↓
Administrator Dashboard
```

The dashboard can provide information such as:

* Number of issues by category
* Number of issues by status
* Number of issues by department
* Average resolution time
* Department performance comparison
* Recurring issue locations
* Problem hotspots

The analytics are intended to be generated from real database data.

---

# 7. City Map Flow

Reported issues can also be represented geographically.

```text
Issue
  ↓
Stored Location
  ↓
City Map
  ↓
Issue Marker
```

The map can allow users to understand where civic issues are occurring across the city.

Markers can be differentiated according to properties such as issue category or status.

---

# 8. Complete End-to-End Flow

The complete Samadhan workflow is:

```text
┌───────────────────────┐
│       CITIZEN         │
└───────────┬───────────┘
            │
            ▼
       Sign Up / Login
            │
            ▼
      Report Civic Issue
            │
            ├── Location
            ├── Category
            ├── Description
            └── Photo
            │
            ▼
    Duplicate Detection
            │
            ▼
    Department Routing
            │
            ▼
┌───────────────────────┐
│   CITY ADMINISTRATOR  │
└───────────┬───────────┘
            │
            ▼
      Department Queue
            │
            ▼
         Review
            │
            ▼
       Acknowledged
            │
            ▼
       In Progress
            │
            ▼
         Resolved
            │
            ├── Resolution Notes
            └── Resolution Photo
            │
            ▼
     Verified / Closed
            │
            ▼
    Citizen Sees Update
            │
            ▼
    City Analytics Updated
```

---

# 9. Role & Permission Summary

| Function                   | Citizen | Administrator |
| -------------------------- | :-----: | :-----------: |
| Sign up / Login            |    ✓    |       ✓       |
| Report issue               |    ✓    |       —       |
| Select issue location      |    ✓    |       —       |
| Upload issue evidence      |    ✓    |       —       |
| Track own issues           |    ✓    |       —       |
| View/manage all issues     |    —    |       ✓       |
| Department management      |    —    |       ✓       |
| Update issue status        |    —    |       ✓       |
| Add resolution notes       |    —    |       ✓       |
| Upload resolution evidence |    —    |       ✓       |
| Access analytics           |    —    |       ✓       |
| View city issue data       |    ✓    |       ✓       |

---

# 10. Error & Exception Flows

The platform should provide appropriate feedback when normal operations fail.

### Location Permission Denied

```text
Location Request
      ↓
Permission Denied
      ↓
Show Appropriate Feedback
      ↓
Allow Alternative Location Selection
```

### Image Upload Failure

```text
Upload Photo
      ↓
Upload Failed
      ↓
Show Error
      ↓
Allow Retry
```

### Map API Failure

```text
Map Request
      ↓
API Failure
      ↓
Display Error / Fallback
      ↓
Prevent Broken Interface
```

### Invalid Role Access

```text
Unauthorized Request
      ↓
Backend Role Verification
      ↓
Access Denied
```

---

# 11. Hackathon Demo Flow

The recommended demonstration follows the complete issue lifecycle required for the project:

```text
1. Citizen logs in
        ↓
2. Citizen reports an issue on the map
        ↓
3. Adds category, description and photo
        ↓
4. System checks for potential duplicates
        ↓
5. Issue is routed to the appropriate department
        ↓
6. Administrator receives the issue
        ↓
7. Administrator updates its status
        ↓
8. Administrator adds resolution information
        ↓
9. Citizen sees the updated status
        ↓
10. Analytics dashboard reflects the issue
```

This demonstrates the complete journey from **citizen reporting to administrative resolution and city-level insight**.

---

## 12. Flow Summary

Samadhan connects citizens and city administrators through a structured workflow:

**Report → Detect → Route → Manage → Resolve → Verify → Analyze**

The objective is to provide not just a complaint submission system, but a transparent process through which civic issues can be tracked from the moment they are reported until their resolution is recorded.

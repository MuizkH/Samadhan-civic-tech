# Samadhan — API Documentation

> API reference and interface specification for the Samadhan Smart City Issue Reporting & Resolution Platform.

**Event:** HackInMotion 2026
**Theme:** Smart Cities & Civic Tech

---

## 1. Overview

The Samadhan API provides the backend interface connecting the citizen and administrator applications with the platform's data and business logic.

The API is designed to support:

* Authentication and role-based access
* Civic issue reporting
* Location-based issue data
* Duplicate issue detection
* Automated department routing
* Issue lifecycle management
* Resolution evidence
* Administrator issue management
* Analytics

The HackInMotion problem statement requires separate Citizen and City Administrator experiences, with backend-enforced role-based access control.

---

# 2. User Roles

## Citizen

Citizens can:

* Create an account
* Authenticate
* Report civic issues
* Provide issue location
* Select an issue category
* Submit descriptions and photographs
* Track issues they have reported
* View issue status

## City Administrator

Administrators can:

* Authenticate
* View reported issues
* Manage issues across departments
* Update issue status
* Add resolution notes
* Upload resolution evidence
* Access city-wide analytics

---

# 3. Authentication API

Authentication endpoints are responsible for identifying users and enforcing their roles.

### Register

```text
POST /[auth-register-endpoint]
```

**Purpose:** Create a new user account.

**Supported roles:**

```text
Citizen
Administrator
```

**Request data:**

```text
Name
Email
Password
Role
```

**Response:**

Returns authentication/account information according to the application's authentication implementation.

---

### Login

```text
POST /[auth-login-endpoint]
```

**Purpose:** Authenticate an existing user.

**Request data:**

```text
Email
Password
```

**Response:**

Returns authenticated user information and the authentication credential used by the application.

---

# 4. Issue Reporting API

## Create Issue

```text
POST /[create-issue-endpoint]
```

**Access:** Citizen

**Purpose:** Submit a new civic issue.

### Required information

```text
Category
Description
Location
Photo Evidence
```

The problem statement requires citizens to report an issue using a precise map location, category, description and photo evidence.

---

## Get Reported Issues

```text
GET /[issues-endpoint]
```

**Access:** Based on authenticated role.

**Purpose:** Retrieve relevant civic issues.

Citizens should be able to access issues they are permitted to view, while administrators can manage issues across departments.

---

## Get Issue Details

```text
GET /[issue-id-endpoint]
```

**Purpose:** Retrieve detailed information about a specific civic issue.

Possible information includes:

* Issue category
* Description
* Location
* Submitted evidence
* Department
* Current status
* Status history
* Resolution information

---

# 5. Duplicate Detection

## Check Potential Duplicate

```text
POST /[duplicate-check-endpoint]
```

**Purpose:** Determine whether a newly reported issue may already exist nearby.

The duplicate detection process should consider:

```text
Issue Category
+
Geographic Proximity
+
Recent Timeframe
```

The problem statement requires likely duplicates to be flagged or linked to an existing issue rather than unnecessarily creating another report.

**Possible result:**

```text
No likely duplicate
```

or

```text
Potential duplicate detected
```

The exact detection algorithm is an implementation decision.

---

# 6. Department Routing

## Route Issue

```text
POST /[department-routing-endpoint]
```

**Purpose:** Assign an issue to the appropriate department based on its category.

Example:

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

Electricity
   ↓
Electricity Department
```

The routing system should be extensible so additional categories and departments can be introduced without requiring an unscalable collection of hardcoded conditions.

---

# 7. Issue Status API

## Update Issue Status

```text
PATCH /[issue-status-endpoint]
```

**Access:** City Administrator

**Purpose:** Update the current status of an issue.

### Status Workflow

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

The administrator can also provide resolution notes and resolution evidence during the lifecycle.

---

## Get Issue Status History

```text
GET /[issue-status-history-endpoint]
```

**Purpose:** Retrieve the status changes associated with an issue.

Example:

```text
Reported
12 Aug 2026
    ↓
Acknowledged
12 Aug 2026
    ↓
In Progress
13 Aug 2026
    ↓
Resolved
15 Aug 2026
```

This allows the citizen-facing interface to display the progress of an issue.

---

# 8. Resolution Evidence API

## Add Resolution Evidence

```text
POST /[resolution-evidence-endpoint]
```

**Access:** City Administrator

**Purpose:** Attach evidence that an issue has been resolved.

Possible data:

```text
Issue ID
Resolution Notes
Proof-of-Resolution Photo
Timestamp
Administrator ID
```

The problem statement specifically requires administrators to be able to add resolution notes and upload proof-of-resolution photographs.

---

# 9. Map & Location API

The application requires map-based location selection and a city-wide map showing reported issues.

## Save Issue Location

```text
POST /[location-endpoint]
```

Possible location data:

```text
Latitude
Longitude
Address
```

## Retrieve Issues for Map

```text
GET /[map-issues-endpoint]
```

**Purpose:** Retrieve geographically located issues for display on the interactive city map.

The problem statement requires reported issues to be represented as map markers and differentiated by properties such as status and/or category.

---

# 10. Administrator API

Administrator functionality must be protected using backend role-based access control.

## Retrieve Department Issues

```text
GET /[department-issues-endpoint]
```

**Access:** City Administrator

**Purpose:** Retrieve issues belonging to a department queue.

Possible filters:

```text
Department
Category
Status
Location
Date
```

---

# 11. Analytics API

## Retrieve City Analytics

```text
GET /[analytics-endpoint]
```

**Access:** City Administrator

**Purpose:** Provide data for the administrator analytics dashboard.

The analytics system should support metrics including:

* Issues by category
* Issues by status
* Issues by department
* Average resolution time
* Department performance comparison
* Civic issue hotspots

The problem statement requires these analytics to be generated from real database data rather than static or fake numbers.

---

# 12. Error Handling

The API should return meaningful errors for invalid or failed operations.

Examples include:

```text
400 — Invalid request
401 — Authentication required
403 — Insufficient permissions
404 — Resource not found
409 — Potential duplicate/conflict
500 — Internal server error
```

The application should also gracefully handle cases such as:

* GPS/location permission denial
* Failed image uploads
* Map API failures
* Invalid role access attempts
* Invalid input

These cases are specifically identified in the problem statement.

---

# 13. Role-Based Access Summary

| API Function               | Citizen | Administrator |
| -------------------------- | :-----: | :-----------: |
| Register                   |    ✓    |       ✓       |
| Login                      |    ✓    |       ✓       |
| Report Issue               |    ✓    |       —       |
| Submit Location            |    ✓    |       —       |
| Upload Issue Evidence      |    ✓    |       —       |
| Track Own Issues           |    ✓    |       —       |
| View/Manage Issues         |    —    |       ✓       |
| Department Queues          |    —    |       ✓       |
| Update Status              |    —    |       ✓       |
| Add Resolution Notes       |    —    |       ✓       |
| Upload Resolution Evidence |    —    |       ✓       |
| View Analytics             |    —    |       ✓       |

---

# 14. Security Requirements

The API should enforce:

* Authentication for protected resources
* Backend role-based access control
* Secure password handling
* Input validation
* Authorization checks
* Protected administrative endpoints
* Secure handling of uploaded evidence

Role restrictions must be enforced on the backend rather than relying only on frontend visibility.

---

# 15. API Status

> **Documentation status:** Initial API contract / documentation.

The exact endpoint paths, request schemas, response schemas and authentication implementation should be synchronized with the final backend implementation.

The HackInMotion problem statement defines the required functionality but does not prescribe specific endpoint names or API response formats.

---

## 16. API Documentation Roadmap

* [ ] Finalize endpoint naming
* [ ] Document final request schemas
* [ ] Document final response schemas
* [ ] Add authentication examples
* [ ] Add error response examples
* [ ] Add API authentication requirements
* [ ] Synchronize documentation with backend implementation
* [ ] Add deployed API base URL

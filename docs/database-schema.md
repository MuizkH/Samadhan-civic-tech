# Samadhan — Database Schema Documentation

## 1. Overview

Samadhan requires persistent storage for the complete civic-issue lifecycle.

The database is responsible for storing:

* User accounts and roles
* Civic issues
* Issue locations
* Department assignments
* Issue status history
* Resolution evidence

The database should support both **Citizen** and **City Administrator** workflows while maintaining the relationship between an issue, its location, assigned department, status history and resolution evidence.

---

## 2. Core Entities

The proposed data model consists of the following core entities:

```text
User
 │
 ├──────────────┐
 │              │
 │              └── Role
 │                  ├── Citizen
 │                  └── Administrator
 │
 └── Reports
       │
       ▼
     Issue
       │
       ├── Location
       │
       ├── Department
       │
       ├── Status History
       │
       └── Resolution Evidence
```

---

## 3. User

Stores information about users of the platform.

### Purpose

The User entity supports authentication and role-based access control.

### Key Fields

| Field       | Description                               |
| ----------- | ----------------------------------------- |
| `id`        | Unique user identifier                    |
| `name`      | User's name                               |
| `email`     | User's login email                        |
| `password`  | Securely stored authentication credential |
| `role`      | Citizen or Administrator                  |
| `createdAt` | Account creation timestamp                |

### Roles

The system supports two primary roles:

* **Citizen** — can report and track civic issues.
* **Administrator** — can manage issues, departments and administrative analytics.

Role-based permissions must be enforced on the backend.

---

## 4. Issue

The Issue entity represents a civic problem reported through Samadhan.

### Purpose

It is the central entity connecting the citizen report with its location, department, status and resolution information.

### Key Fields

| Field           | Description                                  |
| --------------- | -------------------------------------------- |
| `id`            | Unique issue identifier                      |
| `reportedBy`    | Citizen who submitted the issue              |
| `category`      | Civic issue category                         |
| `description`   | Description of the reported problem          |
| `photoEvidence` | Uploaded evidence associated with the report |
| `locationId`    | Associated issue location                    |
| `departmentId`  | Assigned department                          |
| `status`        | Current issue status                         |
| `createdAt`     | Time the issue was reported                  |
| `updatedAt`     | Last update timestamp                        |

### Example Categories

* Roads
* Sanitation
* Electricity
* Water
* Public Property

---

## 5. Location

The Location entity stores geographical information associated with an issue.

### Purpose

Locations allow citizens to report issues using a map and allow the platform to display reported issues geographically.

### Key Fields

| Field       | Description                      |
| ----------- | -------------------------------- |
| `id`        | Unique location identifier       |
| `latitude`  | Geographic latitude              |
| `longitude` | Geographic longitude             |
| `address`   | Optional human-readable location |

Location information is also relevant to duplicate detection because the system must be able to determine whether similar reports exist within a nearby geographical area.

---

## 6. Department

The Department entity represents the civic authority responsible for resolving an issue.

### Purpose

Issues are routed to departments according to their category.

### Key Fields

| Field         | Description                   |
| ------------- | ----------------------------- |
| `id`          | Unique department identifier  |
| `name`        | Department name               |
| `description` | Department responsibility     |
| `createdAt`   | Department creation timestamp |

### Example Routing

```text
Road Issue
    ↓
Roads Department

Sanitation Issue
    ↓
Sanitation Department

Water Issue
    ↓
Water Department

Electricity Issue
    ↓
Electricity Department
```

The routing system should remain extensible as additional issue categories and departments are introduced.

---

## 7. Status History

The Status History entity records changes made to an issue throughout its lifecycle.

### Purpose

Instead of storing only the current status, the system should maintain a history of status changes to support transparency and tracking.

### Key Fields

| Field       | Description                              |
| ----------- | ---------------------------------------- |
| `id`        | Unique status-history identifier         |
| `issueId`   | Associated issue                         |
| `status`    | Status assigned to the issue             |
| `updatedBy` | Administrator responsible for the update |
| `notes`     | Optional status/update notes             |
| `createdAt` | Time of status change                    |

### Issue Lifecycle

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

Citizens should be able to see the progress of issues they have reported.

---

## 8. Resolution Evidence

Resolution Evidence stores information proving that an issue has been addressed.

### Purpose

Administrators can attach resolution notes and proof-of-resolution photographs when an issue is resolved.

### Key Fields

| Field        | Description                                    |
| ------------ | ---------------------------------------------- |
| `id`         | Unique evidence identifier                     |
| `issueId`    | Associated issue                               |
| `uploadedBy` | Administrator who uploaded the evidence        |
| `photoUrl`   | Location of the uploaded resolution photograph |
| `notes`      | Resolution notes                               |
| `createdAt`  | Upload timestamp                               |

---

## 9. Entity Relationships

The primary relationships are:

```text
User
 │
 │ reports
 ▼
Issue
 │
 ├──────────────► Location
 │
 ├──────────────► Department
 │
 ├──────────────► Status History
 │
 └──────────────► Resolution Evidence
```

### Relationship Summary

| Relationship                        | Description                                        |
| ----------------------------------- | -------------------------------------------------- |
| User → Issue                        | A citizen can report civic issues                  |
| Issue → Location                    | Each issue has an associated geographical location |
| Issue → Department                  | Each issue is routed to a responsible department   |
| Issue → Status History              | An issue can have multiple status updates          |
| Issue → Resolution Evidence         | An issue can have resolution evidence              |
| Administrator → Status History      | Administrators can update issue status             |
| Administrator → Resolution Evidence | Administrators can upload resolution proof         |

---

## 10. Duplicate Detection Data

The database must retain enough information to support duplicate detection.

The duplicate detection logic can evaluate:

```text
Issue Category
      +
Geographic Proximity
      +
Recent Reporting Timeframe
      ↓
Potential Duplicate
```

For example, if two reports:

* belong to the same category,
* are located close to each other, and
* were submitted within a relevant recent timeframe,

the system can flag the newer report as a potential duplicate or link it to the existing issue.

The exact duplicate-detection algorithm is an implementation decision and is not defined by the problem statement.

---

## 11. Analytics Data

The database should provide the underlying data required for the administrator analytics dashboard.

The dashboard can derive metrics such as:

* Issues by category
* Issues by status
* Issues by department
* Average resolution time
* Department performance
* Recurring issue locations
* Civic issue hotspots

Analytics must be generated from actual database data rather than static or hard-coded values.

---

## 12. Data Flow

```text
Citizen
   │
   │ submits report
   ▼
Issue
   │
   ├── Location
   ├── Category
   └── Photo Evidence
   │
   ▼
Duplicate Detection
   │
   ▼
Department Assignment
   │
   ▼
Administrator
   │
   ├── Status Updates
   ├── Resolution Notes
   └── Resolution Evidence
   │
   ▼
Database
   │
   ├── Citizen Tracking
   └── Administrator Analytics
```

---

## 13. Data Integrity & Security Considerations

The database implementation should ensure:

* Unique identifiers for stored entities
* Valid relationships between issues and users
* Valid department assignments
* Persistent status history
* Secure handling of authentication credentials
* Controlled access according to user roles
* Reliable storage of issue and resolution evidence

Sensitive authentication credentials should never be stored in plaintext.

---

## 14. Database Requirements Traceability

| Problem Statement Requirement | Database Support                         |
| ----------------------------- | ---------------------------------------- |
| Two-role authentication       | User + Role                              |
| Issue reporting               | Issue                                    |
| Location-based reporting      | Location                                 |
| Photo evidence                | Issue / Resolution Evidence              |
| Duplicate detection           | Issue + Location + timestamps            |
| Department routing            | Department + Issue                       |
| Status workflow               | Status History                           |
| Resolution evidence           | Resolution Evidence                      |
| City map                      | Issue + Location                         |
| Analytics                     | Issue + Department + Status + timestamps |

---

## 15. Implementation Status

This document defines the proposed database structure for Samadhan.

The exact database technology, schema syntax, indexing strategy and implementation details will be finalized as the application development progresses.

---

**Project:** Samadhan
**Event:** HackInMotion 2026
**Theme:** Smart Cities & Civic Tech

# Samadhan: Smart City Issue Intelligence and Resolution Platform

[![HackInMotion 2026](https://img.shields.io/badge/HackInMotion%202026-Smart%20Cities%20%26%20Civic%20Tech-blue.svg)](https://github.com/Harsh20056/HackInMotion-RICR-HIM-1050)
[![GitHub Repository](https://img.shields.io/badge/GitHub-Harsh20056%2FSamadhan--RICR-181717.svg?logo=github)](https://github.com/Harsh20056/HackInMotion-RICR-HIM-1050)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%20%2B%20PostGIS-336791.svg?logo=postgresql)](https://www.postgresql.org/)
[![Node.js](https://img.shields.io/badge/Backend-Express%205%20%7C%20TypeScript-339933.svg?logo=nodedotjs)](https://expressjs.com/)
[![Frontend](https://img.shields.io/badge/Frontend-React%2018%20%7C%20Vite%208%20%7C%20TailwindCSS-61dafb.svg?logo=react)](https://react.dev/)
[![Prisma](https://img.shields.io/badge/ORM-Prisma%20v5-2D3748.svg?logo=prisma)](https://www.prisma.io/)
[![Cloudinary](https://img.shields.io/badge/Media%20Storage-Cloudinary%20Signed%20Direct-3448C5.svg?logo=cloudinary)](https://cloudinary.com/)
[![Leaflet](https://img.shields.io/badge/Mapping-Leaflet%20%2B%20OpenStreetMap-199900.svg?logo=leaflet)](https://leafletjs.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> A production-grade, full-stack civic intelligence platform that transforms municipal complaint management into an accountable, spatially deduplicated, multi-department resolution pipeline.

### 🌐 Live Demo

**[Visit Samadhan →](https://hack-in-motion-ricr-him-1050.vercel.app/)**  
`https://hack-in-motion-ricr-him-1050.vercel.app/`

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Problem Statement and Civic Challenges](#problem-statement-and-civic-challenges)
- [User Experience and Platform Interface](#user-experience-and-platform-interface)
- [System Architecture](#system-architecture)
- [Core Technical Capabilities](#core-technical-capabilities)
  - [Geospatial Deduplication Engine](#1-geospatial-deduplication-engine)
  - [Multi-Department Work Order DAG Engine](#2-multi-department-work-order-dag-engine)
  - [Automated SLA Tracking and Escalation Worker](#3-automated-sla-tracking-and-escalation-worker)
  - [Public Transparency Scorecard and Citizen Verification](#4-public-transparency-scorecard-and-citizen-verification)
  - [AI Classification and Visual Verification Pipeline](#5-ai-classification-and-visual-verification-pipeline)
- [Technology Stack](#technology-stack)
- [Database Schema and Relational Model](#database-schema-and-relational-model)
- [API Architecture and Endpoint Directory](#api-architecture-and-endpoint-directory)
- [Security and Access Control Architecture](#security-and-access-control-architecture)
- [Repository Structure](#repository-structure)
- [Installation and Setup Guide](#installation-and-setup-guide)
  - [Prerequisites](#prerequisites)
  - [Backend Configuration](#backend-configuration)
  - [Frontend Configuration](#frontend-configuration)
- [Verification and Testing Suite](#verification-and-testing-suite)
- [Team and Project Credits](#team-and-project-credits)
- [License](#license)

---

## Executive Summary

Civic grievance redressal systems frequently suffer from structural bottlenecks: opaque ticketing lifecycles, duplicate report accumulation, manual departmental routing, lack of cross-departmental coordination, and zero verifiable proof of resolution.

**Samadhan** bridges citizens and urban local bodies (ULBs) through an enterprise-grade civic lifecycle management platform. By combining **PostGIS spatial indexing**, **dynamic DAG-based departmental routing**, **background SLA escalation workers**, and an **open public accountability scorecard**, Samadhan transitions municipal administration from passive complaint handling to proactive, data-driven governance.

---

## Problem Statement and Civic Challenges

Urban governance infrastructure faces critical systemic issues across citizen reporting and administrative execution:

| Challenge | Impact on Municipal Operations | Samadhan Architectural Solution |
|---|---|---|
| **Opaque Resolution Lifecycle** | Citizens lose visibility after complaint creation, generating distrust and administrative overhead. | Immutable audit trails, append-only status histories, and real-time Server-Sent Events (SSE). |
| **Duplicate Flooding** | High-density civic issues (e.g., major water main breaks) trigger hundreds of redundant tickets. | PostGIS `ST_DWithin` spatial clustering with configurable radius and time windows. |
| **Siloed Departmental Routing** | Complex civic issues require multiple departments (e.g., road repair requiring drainage clearance first). | Directed Acyclic Graph (DAG) work orders with explicit `finish_to_start` dependency constraints. |
| **SLA Violations Without Accountability** | Critical infrastructure tickets languish without automated alerts or supervisory escalation. | Asynchronous `pg-boss` worker performing continuous cron sweeps with tiered escalation matrices. |
| **False Closures** | Tickets are marked resolved without physical verification or citizen confirmation. | Mandatory proof-of-resolution media uploads with citizen dispute and verification voting. |

---

## User Experience and Platform Interface

The platform provides purpose-built, responsive interfaces for citizens, departmental officers, and municipal executives.

### Citizen Portal and Public Reporting Interface

The citizen interface facilitates effortless map-based issue pinpointing, automated reverse geocoding, multi-file evidence upload via Cloudinary, and live status tracking.

<p align="center">
  <img src="assets/hero-landing-page.png" alt="Citizen Landing Page and Issue Submission" width="95%" />
</p>

*Figure 1: Citizen portal overview showing responsive reporting interface, tracking entry points, and public civic statistics.*

---

### Interactive Civic Map and Spatial Issue Tracking

Citizens and administrative staff can visualize city-wide civic incidents rendered through Leaflet and OpenStreetMap, with real-time category filtering, cluster breakdowns, and geographic boundary identification.

<p align="center">
  <img src="assets/civic-map.png" alt="Interactive Civic Map" width="95%" />
</p>

*Figure 2: Interactive map rendering real-time civic incidents, category-coded markers, and detailed status cards.*

---

### Municipal Administration and Department Analytics Dashboard

Department administrators access operational queues, departmental SLA metrics, workload distribution, and resolution performance analytics powered by Recharts directly from live database records.

<p align="center">
  <img src="assets/dashboard-analytics.png" alt="Municipal Analytics and Administration Dashboard" width="95%" />
</p>

*Figure 3: Administrative analytics dashboard featuring issue distribution, resolution velocity, departmental SLA compliance, and geographical hotspot metrics.*

---

## System Architecture

Samadhan operates on a decoupled full-stack architecture designed for high throughput, spatial accuracy, and stateless scalability.

```
+---------------------------------------------------------------------------------------+
|                                    CLIENT LAYER                                       |
|  React 18 + TypeScript + Vite 8 | Tailwind CSS + Radix UI | Leaflet Maps | Recharts   |
+-------------------------------------------+-------------------------------------------+
                                            | HTTPS / REST / SSE
                                            v
+---------------------------------------------------------------------------------------+
|                                  API GATEWAY & ENGINE                                 |
|  Express 5 REST API | Zod Schema Validation | JWT + RBAC Middleware | Pino Logging    |
+----+----------------------+-------------------+-----------------------+---------------+
     |                      |                   |                       |
     v                      v                   v                       v
+---------+         +----------------+    +-----------+         +----------------+
|  Auth   |         | Issues & Work  |    | Spatial   |         | Notifications  |
|  Module |         | Orders (DAG)   |    | Engine    |         | (SSE + Resend) |
+----+----+         +-------+--------+    +-----+-----+         +-------+--------+
     |                      |                   |                       |
     +----------------------+---------+---------+-----------------------+
                                      |
                                      v
+---------------------------------------------------------------------------------------+
|                               PERSISTENCE & SPATIAL LAYER                             |
|  PostgreSQL 15+ with PostGIS Spatial Extensions                                       |
|  - Geography Points (SRID 4326) with GiST Spatial Indexing                            |
|  - Prisma ORM Data Access Layer with Native SQL Spatial Extensions                    |
|  - Append-only Status History and Audit Logs                                          |
+-------------------------------------+-------------------------------------------------+
                                      |
                                      v
+---------------------------------------------------------------------------------------+
|                            BACKGROUND WORKERS & CLOUD SERVICES                        |
|  - pg-boss: Background Job Queue (SLA Sweeper & Escalation Engine)                     |
|  - Cloudinary: Direct Signed Uploads for Citizen Evidence & Resolution Proof          |
|  - Gemini AI Engine: Advisory Multi-Department Breakdown & Evidence Verification     |
+---------------------------------------------------------------------------------------+
```

---

## Core Technical Capabilities

### 1. Geospatial Deduplication Engine

When a citizen files a report, Samadhan executes a PostGIS-backed spatial query before persisting a new primary issue.

- **Spatial Radius Computation:** Uses `ST_DWithin` over native spherical geography coordinates (`SRID 4326`) combined with a temporal filter (`created_at >= NOW() - INTERVAL '72 hours'`).
- **Cluster Association:** If a matching issue in the same category exists within the configured radius (default: 75 meters), the submission is linked as a supporting `IssueReport` under the existing `Issue` record.
- **Support Increment:** The primary issue's `supports_count` is atomically incremented, elevating its operational priority without creating ticket duplication in department queues.

```sql
SELECT id, public_ref, title, status,
       ST_Distance(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_meters
FROM issues
WHERE category_id = $3
  AND status NOT IN ('resolved', 'verified', 'closed', 'rejected')
  AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $4)
  AND created_at >= NOW() - ($5 || ' hours')::INTERVAL
ORDER BY distance_meters ASC
LIMIT 1;
```

---

### 2. Multi-Department Work Order DAG Engine

Complex civic issues often require multi-agency intervention. Rather than hardcoding routing logic into controller files, Samadhan uses a relational rule matrix and dependency graph:

- **Rule-Driven Routing:** The `category_department_rules` table maps issue categories to one or more departments with explicit operational roles (`primary`, `supporting`, `notify`).
- **Sequential and Parallel Dependencies:** Work orders can declare `finish_to_start` or `start_to_start` dependencies on predecessor work orders.
- **Inter-Department Transfers:** Formal transfer requests (`WorkOrderTransfer`) allow staff to request reassignment with supervisor approval workflows and complete audit logging.

```
                          [ Incoming Issue: Water Pipe Burst & Road Cave-In ]
                                                   │
                         ┌─────────────────────────┴─────────────────────────┐
                         ▼                                                   ▼
             [ Primary Work Order ]                                [ Supporting Work Order ]
           Water Supply & Sewerage Board                          Public Works Department (Roads)
                         │                                                   │
                         │ (Execute Pipe Repair)                             │ (BLOCKED until PWD receives
                         │                                                   │  completion signal)
                         ▼                                                   ▼
                 [ Status: Done ] ═══════════════════════════════════► [ Status: In Progress ]
                                         (Dependency Unlocked)         (Execute Road Resurfacing)
```

---

### 3. Automated SLA Tracking and Escalation Worker

Every work order is bounded by an `SlaPolicy` defining acknowledgment deadlines, resolution timeframes, and hierarchical escalation rules.

- **Asynchronous Sweeper:** An in-database `pg-boss` background worker executes every 5 minutes to detect nearing or breached deadlines.
- **Tiered Escalation Matrix:** Automatically escalates breached tickets (`escalation_level` 0 -> 1 -> 2), notifies senior administrators via in-app alerts and transactional email, and logs breach metadata.
- **Grace Windows:** Configurable grace periods (`SLA_GRACE_MINUTES`) prevent premature escalation during edge-of-window operations.

---

### 4. Public Transparency Scorecard and Citizen Verification

To ensure systemic accountability, Samadhan provides an unauthenticated public portal:

- **Department Performance Scorecards:** Live resolution rates, average turnaround times, and SLA compliance percentages calculated across municipal departments.
- **Citizen Verification Voting:** Upon resolution, citizens within the locality can cast verified votes (`confirm` or `dispute`), preventing unilateral administrative closure of unresolved issues.
- **Reopen Pipeline:** If an issue is disputed with cause, it automatically transitions to `reopened`, resetting its workflow queue and notifying oversight authorities.

---

### 5. AI Classification and Visual Verification Pipeline

Samadhan integrates multimodal AI as an advisory verification layer:

- **Automated Categorization:** Analyzes citizen descriptions and uploaded imagery to recommend category classification and urgency scores.
- **Visual Proof Matching:** Evaluates pre-resolution evidence against post-resolution proof photographs to flag discrepancies before administrative sign-off.
- **Full AI Audit Log:** Every invocation records model versions, prompt hashes, latency, token consumption, and whether human staff accepted or modified the recommendation (`coordination_plans` and `ai_calls` tables).

---

## Technology Stack

### Backend Infrastructure

| Domain | Technology / Library | Version / Rationale |
|---|---|---|
| **Runtime Environment** | Node.js | v20 LTS — High-performance asynchronous execution. |
| **API Framework** | Express | v5.1 — Modern REST API framework with native async error handling. |
| **Language** | TypeScript | v5.4 — Strict typing across API contracts, domain entities, and queries. |
| **Database Engine** | PostgreSQL + PostGIS | 15+ / 3.4+ — Relational persistence paired with native spherical spatial indexing (`GiST`). |
| **ORM & Migrations** | Prisma | v5.14 — Type-safe client with native PostGIS raw SQL integration. |
| **Job Queue & Scheduling** | pg-boss | v9.0 — Transactional background job queue hosted directly inside PostgreSQL. |
| **Schema Validation** | Zod | v3.23 — Edge payload validation with inferred TypeScript types. |
| **Authentication & Tokens** | JWT + bcrypt | Short-lived Access (15m) / Long-lived Refresh (30d) + bcrypt hashing. |
| **Structured Logging** | Pino | Structured JSON logging with request tracing and audit correlation. |

---

### Frontend Architecture

| Domain | Technology / Library | Version / Rationale |
|---|---|---|
| **Framework** | React 18 + TypeScript | Component-driven UI architecture with strict type safety. |
| **Build Tooling & Bundler** | Vite 8 + SWC | Lightning-fast development server with dynamic chunk splitting. |
| **Styling & UI Tokens** | Tailwind CSS + Radix UI | Headless accessible components customized into responsive design tokens. |
| **Routing** | React Router v6 | Lazy-loaded client routing with role-based authentication guards. |
| **Geospatial Mapping** | Leaflet + React-Leaflet | Open-source interactive map rendering via OpenStreetMap tiles. |
| **Data Visualization** | Recharts | Isolated charting bundle loaded dynamically via `IntersectionObserver`. |
| **Document Processing** | pdfjs-dist | Client-side document generation and inspection. |
| **Testing Suite** | Vitest + Testing Library | High-speed unit and integration testing sharing the Vite transform pipeline. |

---

### Cloud Services and External Integrations

| Domain | Service / Provider | Purpose and Implementation Details |
|---|---|---|
| **Media & Image Storage** | Cloudinary | Signed direct-from-browser uploads (zero server bandwidth transit) with automated responsive thumbnail delivery. |
| **Geocoding & Spatial Tiles** | OpenStreetMap / Nominatim | Spatial map tile provider and reverse geocoding for human-readable addresses. |
| **Transactional Email** | Resend | Departmental SLA breach alerts and citizen status notification emails. |
| **Multimodal AI Engine** | Google Gemini API | Automated categorization, priority suggestion, and pre/post visual proof matching. |

---

## Database Schema and Relational Model

The database model is built around data-driven routing, spatial constraints, and immutable auditability:

```
                  ┌──────────────────────┐
                  │      Department      │
                  └──────────┬───────────┘
                             │ 1
                             │
                             │ *
                  ┌──────────┴───────────┐
                  │    IssueCategory     │
                  └──────────┬───────────┘
                             │ 1
                             │
                             │ *
┌──────────────┐  1       *  │          *       1  ┌──────────────────────┐
│     User     ├─────────────┼─────────────────────┤      WorkOrder       │
└──────┬───────┘             │                     └──────────┬───────────┘
       │ 1                   │ 1                              │ 1
       │                     │                                │
       │ *                   │                                │ *
┌──────┴─────────────────────┴───┐                 ┌──────────┴───────────┐
│             Issue              │                 │   WorkOrderTransfer  │
│  - location: geography(Point)  │                 │   WorkOrderNote      │
│  - status: IssueStatus enum    │                 │   Escalation         │
└──────┬─────────────────────────┘                 └──────────────────────┘
       │ 1
       │
       ├─────────────────────────────────┬────────────────────────────────┐
       │ *                               │ *                              │ *
┌──────┴───────────────┐  ┌──────────────┴───────────────┐ ┌──────────────┴───────────────┐
│     IssueMedia       │  │      CitizenVerification     │ │     IssueStatusHistory       │
│ (Evidence / Proof)   │  │    (Confirm / Dispute Vote)  │ │   (Immutable Audit Record)   │
└──────────────────────┘  └──────────────────────────────┘ └──────────────────────────────┘
```

---

## API Architecture and Endpoint Directory

All endpoints are versioned and structured around RESTful resource conventions. Protected endpoints enforce bearer token authentication and RBAC validation.

### Public and Authentication Endpoints

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/health` | Public | Service liveness probe. |
| `POST` | `/auth/register` | Public | Register citizen or staff user account. |
| `POST` | `/auth/login` | Public | Authenticate user and issue JWT token pair. |
| `POST` | `/auth/refresh` | Public | Issue a fresh access token using a valid refresh token. |
| `GET` | `/public/scorecard` | Public | Fetch municipal and departmental resolution transparency metrics. |

---

### Issue Management Endpoints

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/issues` | Authenticated | Fetch filtered issues list (scoped by jurisdiction for staff). |
| `POST` | `/issues` | Citizen | Submit a new civic issue with spatial coordinates and category. |
| `GET` | `/issues/map` | Public / Auth | Retrieve spatial issue markers within a geographic bounding box. |
| `GET` | `/issues/:id` | Authenticated | Retrieve complete issue record, status history, and work orders. |
| `POST` | `/issues/:id/support` | Citizen | Register citizen support (upvote) for an open issue. |
| `POST` | `/issues/:id/verify` | Citizen | Cast a confirmation or dispute vote on a resolved issue. |
| `PATCH` | `/issues/:id/status` | Department Admin | Update issue status and append resolution notes. |

---

### Department and Work Order Endpoints

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/departments` | Authenticated | List all active municipal departments and routing rules. |
| `GET` | `/work-orders` | Department Staff | Query work orders assigned to the user's department. |
| `PATCH` | `/work-orders/:id/status` | Department Staff | Advance work order execution state (`in_progress`, `done`). |
| `POST` | `/work-orders/:id/transfers` | Department Staff | Request inter-departmental transfer of an assigned ticket. |
| `POST` | `/uploads/sign` | Authenticated | Generate signed parameters for direct-to-Cloudinary image upload. |

---

## Security and Access Control Architecture

1. **Role-Based Access Control (RBAC) — Two-Role Model:** Samadhan defines exactly **two user roles**:

   | Role | Implementation scopes | What they can do |
   |---|---|---|
   | **Citizen** | `citizen` | Report issues, track own reports, support others' issues, vote on resolution verifications. |
   | **Administrator** | `dept_admin` *(departmental scope)* | Act on issues routed to their department and city only. Cannot reach another department's or city's data. |
   | | `super_admin` *(city-wide scope)* | Full system-wide visibility, routing rule configuration, department management, escalation review. |

   `dept_admin` and `super_admin` are **scope labels** within the single Administrator role — not separate roles. The scope boundary is enforced by `requireDepartmentAccess`, `resolveCityScope`, and `assertCityAccess` middleware rather than being baked into each handler.

2. **Input Validation and Sanitization:** All request payloads are parsed through Zod schemas before reaching business logic. Malformed inputs are rejected with 400 Bad Request error matrices.
3. **Audit Trail Immutability:** Sensitive operational changes (`IssueStatusHistory`, `AuditLog`, `CitizenVerification`) are strictly append-only.
4. **Credential Safety:** Passwords are encrypted using `bcrypt` with work factors calibrated for production defense. Signed upload URLs prevent unauthenticated media delivery.

---

## Repository Structure

```
Samadhan-RICR/
├── backend/                        # Express 5 + TypeScript REST API
│   ├── prisma/
│   │   ├── schema.prisma           # Prisma schema with PostGIS spatial definitions
│   │   └── migrations/             # Migration history
│   ├── src/
│   │   ├── config/                 # Environment validation and Zod configuration
│   │   ├── jobs/                   # pg-boss background workers (SLA sweeps)
│   │   ├── modules/
│   │   │   ├── ai/                 # Gemini classification & visual verification
│   │   │   ├── analytics/          # Departmental aggregation queries
│   │   │   ├── auth/               # JWT authentication & session lifecycle
│   │   │   ├── departments/        # Department registry & routing rules
│   │   │   ├── issues/             # Core issue lifecycle & spatial deduplication
│   │   │   ├── notifications/      # SSE stream & email dispatchers
│   │   │   ├── publicTransparency/ # Public scorecard & verification metrics
│   │   │   ├── sla/                # Policy evaluator & escalation triggers
│   │   │   ├── uploads/            # Cloudinary signature provider
│   │   │   ├── users/              # User profile & jurisdiction scoping
│   │   │   └── workOrders/         # DAG engine & inter-department transfers
│   │   ├── shared/                 # Middleware, database client, logger
│   │   ├── app.ts                  # Express application factory
│   │   └── server.ts               # HTTP server entrypoint
│   └── package.json
│
├── frontend/                       # React 18 + Vite 8 SPA
│   ├── src/
│   │   ├── app/                    # Providers, layouts, and route definitions
│   │   ├── features/
│   │   │   ├── admin/              # Administrative queues & triage panels
│   │   │   ├── ai-assistant/       # AI document & photo analysis tools
│   │   │   ├── auth/               # Login & registration views
│   │   │   ├── civic-map/          # Leaflet geospatial issue map
│   │   │   ├── dashboard/          # Citizen dashboard & activity feeds
│   │   │   ├── issues/             # Issue reporting & detail views
│   │   │   ├── profile/            # User preferences & notification toggles
│   │   │   └── transparency/       # Open municipal performance scorecards
│   │   ├── shared/                 # UI components (Radix), API client, hooks
│   │   └── main.tsx                # Client application root
│   └── package.json
│
├── assets/                         # Application UI screenshots & media
├── docs/                           # Architecture, performance, and tech-stack specifications
├── api-documentation.md            # Comprehensive API reference
├── database-schema.md              # Detailed schema dictionary
└── README.md                       # Project documentation
```

---

## Installation and Setup Guide

### Prerequisites

Ensure the following tools are installed on your host system:
- **Node.js**: v20.x or later
- **npm**: v10.x or later
- **PostgreSQL**: v15 or later with **PostGIS** extension enabled (`CREATE EXTENSION postgis;`)

---

### Backend Configuration

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables by creating a `.env` file based on `.env.example`:
   ```env
   PORT=5000
   NODE_ENV=development
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/samadhan_db?schema=public
   CORS_ORIGIN=http://localhost:5173
   JWT_SECRET=your_secure_jwt_secret_key_min_32_chars
   JWT_REFRESH_SECRET=your_secure_refresh_secret_key_min_32_chars
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   RESEND_API_KEY=re_your_resend_api_key
   DEV_EMAIL_OVERRIDE=developer@yourdomain.com
   DISABLE_JOBS=false
   SLA_GRACE_MINUTES=15
   ```

4. Run database migrations and generate the Prisma client:
   ```bash
   npx prisma migrate dev --name init
   npx prisma generate
   ```

5. (Optional) Seed standard municipal departments and categories:
   ```bash
   npm run seed
   ```

6. Start the backend development server:
   ```bash
   npm run dev
   ```

---

### Frontend Configuration

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure frontend environment variables in `.env`:
   ```env
   VITE_API_URL=http://localhost:5000
   VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name
   ```

4. Start the frontend development server:
   ```bash
   npm run dev
   ```

5. Access the application in your browser at `http://localhost:5173`.

---

## Verification and Testing Suite

The codebase includes automated unit, integration, and schema validation tests across both backend and frontend.

### Executing Backend Tests

```bash
cd backend
npm test
```

### Executing Frontend Tests

```bash
cd frontend
npm test
```

### Verification Checklist

- **Authentication & RBAC:** Verifies token rotation, password hashing, and role isolation between citizens and department administrators.
- **Spatial Deduplication:** Validates that issues within radius thresholds trigger cluster associations rather than duplicate inserts.
- **DAG Work Order Transition:** Confirms that dependent work orders remain locked until prerequisite tasks reach `done` status.
- **SLA Escalation Engine:** Simulates overdue work orders and validates that background sweepers increment escalation tiers and notify stakeholders.

---

## Team and Project Credits

Developed for **HackInMotion 2026** under the **Smart Cities & Civic Tech** track.

### Development Team

- **Muiz Khan** — AI / Machine Learning & Autonomous Workflow Intelligence
- **Harsh Shrivastava** — Frontend Architecture, Interactive Map UI & Client Performance
- **Divyanshu Kubde** — Backend Systems, PostgreSQL/PostGIS Spatial Engine & API Architecture

---

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for complete details.

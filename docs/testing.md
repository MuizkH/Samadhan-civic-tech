# Samadhan — Testing Documentation

> Testing strategy and validation plan for the Samadhan Smart City Issue Reporting & Resolution Platform.

**Event:** HackInMotion 2026  
**Theme:** Smart Cities & Civic Tech

---

## 1. Overview

Samadhan is a two-role civic issue reporting and resolution platform consisting of:

- Citizen-facing functionality
- Administrator-facing functionality
- Backend APIs
- Database persistence
- Map and geolocation functionality
- Image evidence uploads
- Issue routing and lifecycle management
- Analytics

The testing strategy focuses on validating the complete issue lifecycle:

**Report → Detect → Route → Track → Resolve → Verify → Analyze**

The goal is to ensure that the application behaves correctly for both citizens and administrators and handles failure scenarios gracefully.

---

# 2. Testing Objectives

Testing will verify that:

1. Citizens and administrators have the correct permissions.
2. Citizens can successfully report civic issues.
3. Issue locations are correctly captured.
4. Photo evidence can be uploaded.
5. Potential duplicate reports are detected.
6. Issues are routed to the appropriate department.
7. Administrators can manage assigned issues.
8. Issue status transitions work correctly.
9. Citizens can track their reported issues.
10. Resolution evidence is stored correctly.
11. Analytics reflect actual database data.
12. Map functionality behaves correctly.
13. Invalid or unauthorized requests are rejected.
14. Error conditions do not result in blank or broken screens.
15. The application works across desktop and mobile layouts.

---

# 3. User Role Testing

Samadhan has two primary roles:

- Citizen
- City Administrator

Role-based access control must be enforced by the backend and not only by hiding frontend elements.

## Test Cases

| ID | Test Case | Expected Result | Status |
|---|---|---|---|
| AUTH-01 | Citizen creates account | Citizen account is created successfully | ⬜ |
| AUTH-02 | Administrator logs in | Administrator receives admin access | ⬜ |
| AUTH-03 | Citizen logs in | Citizen receives citizen interface | ⬜ |
| AUTH-04 | Citizen attempts to access admin functionality | Access is denied | ⬜ |
| AUTH-05 | Administrator accesses management tools | Access is granted | ⬜ |
| AUTH-06 | Invalid credentials are submitted | Authentication fails with meaningful feedback | ⬜ |
| AUTH-07 | Unauthenticated user accesses protected resource | Authentication is required | ⬜ |

---

# 4. Citizen Issue Reporting Tests

Citizens must be able to report an issue using:

- Map location
- Category
- Description
- Photo evidence

The problem statement specifically requires map-based issue reporting with category, description and photographic evidence.

## Test Cases

| ID | Test Case | Expected Result | Status |
|---|---|---|---|
| ISSUE-01 | Citizen opens report form | Report form loads correctly | ⬜ |
| ISSUE-02 | Citizen selects map location | Location is captured | ⬜ |
| ISSUE-03 | Citizen selects issue category | Selected category is stored | ⬜ |
| ISSUE-04 | Citizen enters description | Description is accepted | ⬜ |
| ISSUE-05 | Citizen uploads valid image | Image is uploaded successfully | ⬜ |
| ISSUE-06 | Citizen submits valid report | Issue is created successfully | ⬜ |
| ISSUE-07 | Required field is missing | Validation message is displayed | ⬜ |
| ISSUE-08 | Invalid image is uploaded | Upload is rejected appropriately | ⬜ |

---

# 5. Duplicate Detection Testing

Before creating a new issue, Samadhan should check whether a similar issue already exists nearby.

Potential duplicate detection is based on factors such as:

- Issue category
- Geographic proximity
- Recent reporting timeframe

## Test Cases

| ID | Scenario | Expected Result | Status |
|---|---|---|---|
| DUP-01 | No similar issue exists | New report is created | ⬜ |
| DUP-02 | Same category + nearby location + recent report | Potential duplicate is flagged | ⬜ |
| DUP-03 | Same category but distant location | Report should not automatically be treated as duplicate | ⬜ |
| DUP-04 | Nearby issue but different category | Report should not automatically be treated as duplicate | ⬜ |
| DUP-05 | Older similar issue exists | Duplicate decision follows configured timeframe | ⬜ |

The exact duplicate-detection algorithm is an implementation detail and should be tested against representative geographic and time-based cases.

---

# 6. Department Routing Testing

Issues should automatically be assigned to the appropriate department based on their category.

### Example

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

# KilowattIQ — Security Architecture & Isolation Model

KilowattIQ implements an enterprise-grade security architecture designed to enforce multi-tenant household data isolation, credential protection, and role-based access control.

---

## 🔒 Security Principles & Implementations

### 1. Database Row Level Security (RLS)
- Every table (`households`, `rooms`, `appliances`, `devices`, `telemetry_live`, `budgets`) includes household ownership columns.
- Supabase RLS policies verify `auth.uid() = user_id` or membership in `household_members`.
- Direct cross-household access is blocked at the database layer.

### 2. Backend Authorization Middleware
- `authMiddleware.ts` parses incoming JWT Bearer tokens.
- Invalid or expired tokens return `401 Unauthorized`.
- Non-admin requests attempting to query households outside their authorized list return `403 Forbidden`.

### 3. Role-Based Access Control (RBAC)
- Endpoints under `/api/v1/admin/*` strictly check `req.user.role === 'ADMIN'`.
- Standard household users receiving `403 Forbidden` if attempting admin access.

### 4. Zero Client Secret Exposure
- `SUPABASE_SERVICE_ROLE_KEY` is restricted strictly to backend Express environment.
- `GEMINI_API_KEY` is initialized exclusively on the Node server.
- `MQTT_PASSWORD` remains server-side inside MQTT adapter services.
- Client bundles contain no secret keys or admin credentials.

### 5. Input Validation
- Endpoint parameters are validated for UUID formats, numerical bounds, and string escaping.
- CSV exports escape double quotes and special characters to prevent CSV injection vulnerabilities.

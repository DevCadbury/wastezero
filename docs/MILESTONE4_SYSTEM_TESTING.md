# Milestone 4 System Testing Checklist

This checklist validates end-to-end integration across milestones.

## 1) User Management Testing

- [ ] Register user account (role=user) from auth page
- [ ] Register volunteer account (role=volunteer)
- [ ] Login with username and email
- [ ] Verify role-based route access (user, volunteer, admin)
- [ ] Suspend a user from admin users page and confirm protected API returns 403
- [ ] Unblock/re-activate user and verify login works again

## 2) Opportunity Management Testing

- [ ] Admin creates an opportunity
- [ ] Opportunity appears in volunteer opportunity listing
- [ ] Admin updates opportunity details and status
- [ ] Admin removes inappropriate opportunity (soft-delete)
- [ ] Admin monitoring page shows application counts per opportunity

## 3) Application Workflow Testing

- [ ] Volunteer applies to an open opportunity
- [ ] Admin sees application in admin opportunities page
- [ ] Admin accepts application and volunteer receives notification
- [ ] Admin rejects application and volunteer receives notification
- [ ] Reports tab shows accepted/rejected/pending counts

## 4) Messaging + Notification Testing

- [ ] User and volunteer exchange messages in real time
- [ ] Notification bell count updates for new events
- [ ] Admin sends system alert broadcast from Admin Panel
- [ ] Alert appears in recipients' notification list

## 5) Admin Dashboard + Reporting

- [ ] Admin dashboard cards show users/volunteers/opportunities/applications
- [ ] Recent activity timeline displays latest admin/user actions
- [ ] Summary report displays monthly application trend
- [ ] User/Opportunity/Application reports filter correctly
- [ ] CSV export works for all report tabs

## 6) Pickup + Illegal Dump Integration

- [ ] Pickup flows still work (open, accepted, completed, cancelled)
- [ ] Illegal dump approval still awards points correctly
- [ ] Existing pickup and waste reports still load correctly

## 7) Deployment Validation (Separate Frontend/Backend)

- [ ] Frontend runtime config points to backend API and socket URLs
- [ ] Backend CORS allows frontend deployment origin
- [ ] Frontend loads without API 404 from wrong origin
- [ ] Authentication token flow works in production
- [ ] Admin routes and reports work from deployed frontend

## Optional Automated Smoke Tests

Use Postman/Newman or a minimal Supertest suite for these critical endpoints:

- GET /api/health
- POST /api/auth/login
- GET /api/admin/stats (admin token)
- GET /api/admin/reports/summary (admin token)
- GET /api/admin/reports/opportunities (admin token)
- GET /api/admin/reports/applications (admin token)
- POST /api/admin/alerts/broadcast (admin token)

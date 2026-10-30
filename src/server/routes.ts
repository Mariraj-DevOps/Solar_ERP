import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { db, logAudit, createNotification, seedComprehensiveDemoData } from './db';
import { computeFinancialSummary, round2 } from '../lib/calculations';
import { getTodayKolkataISO, getWeekBounds } from '../lib/dateUtils';

const JWT_SECRET = process.env.JWT_SECRET || 'erp-super-secure-internal-secret-2026';

export const apiRouter = Router();

// Ensure upload directory exists for attachments
const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// User roles: Master Admin, Secondary Admin / Manager, and Staff (with 'admin' alias for backward compatibility)
export type UserRole = 'master_admin' | 'secondary_admin' | 'staff' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  designation?: string;
  assignedLocation?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function isMasterAdmin(user?: AuthUser): boolean {
  return Boolean(user && (user.role === 'master_admin' || user.role === 'admin'));
}

export function isSecondaryAdmin(user?: AuthUser): boolean {
  return Boolean(user && user.role === 'secondary_admin');
}

export function isAdminAny(user?: AuthUser): boolean {
  return isMasterAdmin(user) || isSecondaryAdmin(user);
}

// Check if user has permission to view/manage given staff data
export function canAccessStaff(user: AuthUser, staffUserId: string): boolean {
  if (isMasterAdmin(user)) return true;
  if (user.id === staffUserId) return true;
  if (isSecondaryAdmin(user)) {
    const row = db.prepare('SELECT 1 FROM secondary_admin_assignments WHERE secondary_admin_id = ? AND staff_user_id = ?').get(user.id, staffUserId);
    return Boolean(row);
  }
  return false;
}

// Get array of staff user IDs that this user is permitted to see
export function getPermittedStaffIds(user: AuthUser): string[] | null {
  if (isMasterAdmin(user)) return null; // null means company-wide
  if (isSecondaryAdmin(user)) {
    const rows = db.prepare('SELECT staff_user_id FROM secondary_admin_assignments WHERE secondary_admin_id = ?').all(user.id) as Array<{ staff_user_id: string }>;
    const list = rows.map(r => r.staff_user_id);
    list.push(user.id);
    return list;
  }
  return [user.id];
}

// Check financial module permission for secondary admin
export function canAccessFinanceModule(user: AuthUser, moduleName: 'petty_cash' | 'office_ledger' | 'weekly_payments' | 'bills'): boolean {
  if (isMasterAdmin(user)) return true;
  if (isSecondaryAdmin(user)) {
    const assignments = db.prepare('SELECT allowed_financial_modules_json FROM secondary_admin_assignments WHERE secondary_admin_id = ?').all(user.id) as Array<{ allowed_financial_modules_json: string }>;
    for (const a of assignments) {
      try {
        const modules = JSON.parse(a.allowed_financial_modules_json || '[]');
        if (Array.isArray(modules) && modules.includes(moduleName)) return true;
      } catch {}
    }
  }
  return false;
}

// Authentication Middleware
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    const userRow = db.prepare('SELECT id, email, full_name, role, status, designation, assigned_location FROM users WHERE id = ?').get(decoded.id) as {
      id: string;
      email: string;
      full_name: string;
      role: UserRole;
      status: string;
      designation?: string;
      assigned_location?: string;
    } | undefined;

    if (!userRow || userRow.status !== 'active') {
      return res.status(401).json({ error: 'User account is deactivated or not found.' });
    }

    req.user = {
      id: userRow.id,
      email: userRow.email,
      fullName: userRow.full_name,
      role: userRow.role,
      designation: userRow.designation,
      assignedLocation: userRow.assigned_location,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session token.' });
  }
}

// Master-Admin Only Middleware
export function requireMasterAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !isMasterAdmin(req.user)) {
    return res.status(403).json({ error: 'Access denied. Master Administrator privileges required.' });
  }
  next();
}

// Admin-any Middleware (Master or Secondary Admin)
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !isAdminAny(req.user)) {
    return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  }
  next();
}

// =========================================================================
// 1. STATUS & SYSTEM INFO
// =========================================================================
apiRouter.get('/status', (req: Request, res: Response) => {
  const stats = {
    serverTimeKolkata: getTodayKolkataISO(),
    storageEngine: 'SQLite WAL (Production Local ERP Database)',
    activeUsers: (db.prepare("SELECT COUNT(*) as c FROM users WHERE status = 'active'").get() as { c: number }).c,
    totalTeams: (db.prepare("SELECT COUNT(*) as c FROM teams WHERE status = 'active'").get() as { c: number }).c,
  };
  res.json(stats);
});

// =========================================================================
// 2. AUTHENTICATION & PROFILE
// =========================================================================
apiRouter.post('/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email) as {
    id: string;
    email: string;
    password_hash: string;
    full_name: string;
    role: UserRole;
    status: string;
    designation?: string;
    assigned_location?: string;
  } | undefined;

  if (!user) {
    return res.status(401).json({ error: 'Invalid email address or password.' });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ error: 'This account has been deactivated by the administrator.' });
  }

  const isPasswordMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isPasswordMatch) {
    return res.status(401).json({ error: 'Invalid email address or password.' });
  }

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  logAudit({
    actorId: user.id,
    actorName: user.full_name,
    actorRole: user.role,
    action: 'USER_LOGIN',
    entityType: 'users',
    entityId: user.id,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      designation: user.designation,
      assignedLocation: user.assigned_location,
    },
  });
});

apiRouter.get('/auth/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

// =========================================================================
// 3. USER MANAGEMENT (Master Admin & Account Maintenance)
// =========================================================================
apiRouter.get('/users', requireAuth, (req: Request, res: Response) => {
  if (isMasterAdmin(req.user)) {
    const users = db.prepare('SELECT id, email, full_name, role, status, designation, assigned_location, assigned_admin_id, created_at, updated_at FROM users ORDER BY created_at ASC').all();
    return res.json(users);
  }

  if (isSecondaryAdmin(req.user)) {
    // Secondary admin sees assigned staff and themselves
    const assigned = db.prepare(`
      SELECT u.id, u.email, u.full_name, u.role, u.status, u.designation, u.assigned_location, u.created_at, u.updated_at
      FROM users u
      JOIN secondary_admin_assignments a ON u.id = a.staff_user_id
      WHERE a.secondary_admin_id = ?
      UNION
      SELECT id, email, full_name, role, status, designation, assigned_location, created_at, updated_at
      FROM users WHERE id = ?
    `).all(req.user!.id, req.user!.id);
    return res.json(assigned);
  }

  // Staff sees only themselves
  const user = db.prepare('SELECT id, email, full_name, role, status, designation, assigned_location, created_at, updated_at FROM users WHERE id = ?').get(req.user!.id);
  res.json(user ? [user] : []);
});

apiRouter.post('/users', requireAuth, requireMasterAdmin, (req: Request, res: Response) => {
  const { email, fullName, role, password, designation, assignedLocation, assignedAdminId } = req.body;
  if (!email || !fullName || !password) {
    return res.status(400).json({ error: 'Email, full name, and password are required.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email);
  if (existing) {
    return res.status(400).json({ error: 'A user with this email already exists.' });
  }

  const id = `usr-${Date.now()}`;
  const now = new Date().toISOString();
  const passwordHash = bcrypt.hashSync(password, 10);
  const userRole = (role === 'master_admin' || role === 'secondary_admin' || role === 'staff') ? role : 'staff';

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status, designation, assigned_location, assigned_admin_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
  `).run(id, email.toLowerCase().trim(), passwordHash, fullName.trim(), userRole, designation || null, assignedLocation || null, assignedAdminId || null, now, now);

  if (assignedAdminId && userRole === 'staff') {
    db.prepare(`
      INSERT OR REPLACE INTO secondary_admin_assignments (
        id, secondary_admin_id, staff_user_id, can_view_reports, can_approve_attendance, can_edit_attendance, allowed_financial_modules_json, can_edit_finance, can_view_details, created_at, updated_at
      ) VALUES (?, ?, ?, 1, 1, 1, '["weekly_payments"]', 0, 1, ?, ?)
    `).run(`assign-${Date.now()}`, assignedAdminId, id, now, now);
  }

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'CREATE_USER',
    entityType: 'users',
    entityId: id,
    newValues: { email, fullName, role: userRole, designation, assignedLocation },
  });

  res.status(201).json({ id, email, fullName, role: userRole, status: 'active' });
});

apiRouter.patch('/users/:id', requireAuth, requireMasterAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { fullName, role, status, password, designation, assignedLocation, assignedAdminId } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as {
    id: string;
    email: string;
    full_name: string;
    role: string;
    status: string;
  } | undefined;

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Prevent admin from locking out the sole active master admin
  if (user.id === req.user!.id && (status === 'inactive' || (role && role !== 'master_admin' && role !== 'admin'))) {
    const adminCount = (db.prepare("SELECT COUNT(*) as c FROM users WHERE (role = 'admin' OR role = 'master_admin') AND status = 'active'").get() as { c: number }).c;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'Cannot deactivate or demote the last remaining active Master Administrator.' });
    }
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (fullName) {
    updates.push('full_name = ?');
    params.push(fullName.trim());
  }
  if (role && (role === 'master_admin' || role === 'secondary_admin' || role === 'staff' || role === 'admin')) {
    updates.push('role = ?');
    params.push(role);
  }
  if (status && (status === 'active' || status === 'inactive')) {
    updates.push('status = ?');
    params.push(status);
  }
  if (designation !== undefined) {
    updates.push('designation = ?');
    params.push(designation);
  }
  if (assignedLocation !== undefined) {
    updates.push('assigned_location = ?');
    params.push(assignedLocation);
  }
  if (assignedAdminId !== undefined) {
    updates.push('assigned_admin_id = ?');
    params.push(assignedAdminId);
  }
  if (password) {
    updates.push('password_hash = ?');
    params.push(bcrypt.hashSync(password, 10));
  }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'UPDATE_USER',
    entityType: 'users',
    entityId: id,
    previousValues: user,
    newValues: { fullName, role, status, designation, assignedLocation },
  });

  res.json({ success: true, message: 'User updated successfully.' });
});

// Secure password reset endpoint for administrators (does not expose previous password)
apiRouter.patch('/users/:id/reset-password', requireAuth, requireMasterAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }

  const user = db.prepare('SELECT id, email, full_name FROM users WHERE id = ?').get(id) as { id: string; email: string; full_name: string } | undefined;
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const hash = bcrypt.hashSync(newPassword, 10);
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, now, id);

  createNotification({
    userId: id,
    title: 'Password Updated',
    message: 'Your account password has been updated by the Master Administrator.',
    type: 'info',
  });

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'RESET_PASSWORD',
    entityType: 'users',
    entityId: id,
    reason: 'Admin initiated password reset',
  });

  res.json({ success: true, message: `Password reset successfully for ${user.full_name}.` });
});

// =========================================================================
// 4. SECONDARY ADMIN ASSIGNMENTS & PERMISSIONS MATRIX
// =========================================================================
apiRouter.get('/secondary-admins', requireAuth, (req: Request, res: Response) => {
  if (!isAdminAny(req.user)) {
    return res.status(403).json({ error: 'Unauthorized.' });
  }

  let secAdminsQuery = "SELECT id, email, full_name, designation, assigned_location, status FROM users WHERE role = 'secondary_admin'";
  const secAdmins = db.prepare(secAdminsQuery).all() as Array<any>;

  const assignments = db.prepare(`
    SELECT a.*, u.full_name as staff_name, u.email as staff_email
    FROM secondary_admin_assignments a
    JOIN users u ON a.staff_user_id = u.id
  `).all() as Array<any>;

  const result = secAdmins.map(admin => ({
    ...admin,
    assignedStaff: assignments
      .filter(a => a.secondary_admin_id === admin.id)
      .map(a => ({
        ...a,
        allowedFinancialModules: JSON.parse(a.allowed_financial_modules_json || '[]'),
      })),
  }));

  res.json(result);
});

apiRouter.post('/secondary-admins/assign', requireAuth, requireMasterAdmin, (req: Request, res: Response) => {
  const {
    secondaryAdminId,
    staffUserId,
    canViewReports = 1,
    canApproveAttendance = 1,
    canEditAttendance = 1,
    allowedFinancialModules = ['weekly_payments'],
    canEditFinance = 0,
    canViewDetails = 1,
  } = req.body;

  if (!secondaryAdminId || !staffUserId) {
    return res.status(400).json({ error: 'Secondary admin and staff user are required.' });
  }

  const id = `assign-${secondaryAdminId}-${staffUserId}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO secondary_admin_assignments (
      id, secondary_admin_id, staff_user_id, can_view_reports, can_approve_attendance, can_edit_attendance,
      allowed_financial_modules_json, can_edit_finance, can_view_details, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(secondary_admin_id, staff_user_id) DO UPDATE SET
      can_view_reports = excluded.can_view_reports,
      can_approve_attendance = excluded.can_approve_attendance,
      can_edit_attendance = excluded.can_edit_attendance,
      allowed_financial_modules_json = excluded.allowed_financial_modules_json,
      can_edit_finance = excluded.can_edit_finance,
      can_view_details = excluded.can_view_details,
      updated_at = excluded.updated_at
  `).run(
    id,
    secondaryAdminId,
    staffUserId,
    canViewReports ? 1 : 0,
    canApproveAttendance ? 1 : 0,
    canEditAttendance ? 1 : 0,
    JSON.stringify(allowedFinancialModules),
    canEditFinance ? 1 : 0,
    canViewDetails ? 1 : 0,
    now,
    now
  );

  // Update staff user's assigned_admin_id
  db.prepare('UPDATE users SET assigned_admin_id = ?, updated_at = ? WHERE id = ?').run(secondaryAdminId, now, staffUserId);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'ASSIGN_SECONDARY_ADMIN',
    entityType: 'secondary_admin_assignments',
    entityId: id,
    newValues: { secondaryAdminId, staffUserId, allowedFinancialModules },
  });

  res.json({ success: true, message: 'Secondary admin permissions and scope updated.' });
});

apiRouter.delete('/secondary-admins/assign/:adminId/:staffId', requireAuth, requireMasterAdmin, (req: Request, res: Response) => {
  const { adminId, staffId } = req.params;
  db.prepare('DELETE FROM secondary_admin_assignments WHERE secondary_admin_id = ? AND staff_user_id = ?').run(adminId, staffId);
  db.prepare('UPDATE users SET assigned_admin_id = NULL WHERE id = ? AND assigned_admin_id = ?').run(staffId, adminId);
  res.json({ success: true, message: 'Assignment removed.' });
});

// =========================================================================
// 5. LABOUR CATEGORIES (WITH STAFF ISOLATION & SHARED TEMPLATES)
// =========================================================================
apiRouter.get('/categories', requireAuth, (req: Request, res: Response) => {
  let categories: any[];
  if (isMasterAdmin(req.user)) {
    categories = db.prepare('SELECT * FROM labour_categories ORDER BY display_order ASC').all();
  } else {
    // Staff and Secondary Admin see shared categories or their own
    categories = db.prepare(`
      SELECT * FROM labour_categories
      WHERE is_shared = 1 OR owner_user_id = ?
      ORDER BY display_order ASC
    `).all(req.user!.id);
  }
  res.json(categories);
});

apiRouter.post('/categories', requireAuth, (req: Request, res: Response) => {
  const { name, code, defaultRate, rateType, displayOrder, isShared } = req.body;
  if (!name || !code) {
    return res.status(400).json({ error: 'Name and Code are required.' });
  }

  const id = `cat-${code.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const sharedFlag = isMasterAdmin(req.user) ? (isShared ? 1 : 0) : 0;

  try {
    db.prepare(`
      INSERT INTO labour_categories (id, name, code, default_rate, rate_type, display_order, is_shared, owner_user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name.trim(),
      code.toUpperCase().trim(),
      Number(defaultRate) || 0,
      rateType || 'daily',
      Number(displayOrder) || 0,
      sharedFlag,
      req.user!.id,
      now
    );

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'CREATE_CATEGORY',
      entityType: 'labour_categories',
      entityId: id,
      newValues: { name, code, defaultRate },
    });

    res.status(201).json({ id, name, code, defaultRate: Number(defaultRate) || 0 });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'A category with this code already exists.' });
    }
    res.status(500).json({ error: err.message || 'Failed to save category.' });
  }
});

// =========================================================================
// 6. TEAMS & TEMPLATES (WITH STAFF ISOLATION)
// =========================================================================
apiRouter.get('/teams', requireAuth, (req: Request, res: Response) => {
  let teams: Array<any>;
  if (isMasterAdmin(req.user)) {
    teams = db.prepare("SELECT * FROM teams WHERE status = 'active' ORDER BY name ASC").all() as Array<any>;
  } else {
    // Staff & Secondary admin see shared teams or their owned teams
    teams = db.prepare(`
      SELECT * FROM teams
      WHERE status = 'active' AND (is_shared = 1 OR owner_user_id = ?)
      ORDER BY name ASC
    `).all(req.user!.id) as Array<any>;
  }

  const teamIds = teams.map(t => t.id);
  let roles: Array<any> = [];
  if (teamIds.length > 0) {
    const placeholders = teamIds.map(() => '?').join(',');
    roles = db.prepare(`
      SELECT r.*, c.name as category_name, c.code as category_code
      FROM team_role_templates r
      JOIN labour_categories c ON r.category_id = c.id
      WHERE r.team_id IN (${placeholders})
    `).all(...teamIds) as Array<any>;
  }

  const fullTeams = teams.map(t => ({
    ...t,
    roles: roles.filter(r => r.team_id === t.id),
  }));

  res.json(fullTeams);
});

apiRouter.post('/teams', requireAuth, (req: Request, res: Response) => {
  const { name, workCategory, locationProject, notes, roles, isShared } = req.body;
  if (!name || !workCategory) {
    return res.status(400).json({ error: 'Team name and work category are required.' });
  }

  const teamId = `team-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const sharedFlag = isMasterAdmin(req.user) ? (isShared ? 1 : 0) : 0;

  const insertTeam = db.prepare(`
    INSERT INTO teams (id, name, work_category, location_project, status, notes, is_shared, owner_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
  `);

  const insertRole = db.prepare(`
    INSERT INTO team_role_templates (id, team_id, category_id, default_rate, rate_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  try {
    const transaction = db.transaction(() => {
      insertTeam.run(teamId, name.trim(), workCategory.trim(), locationProject || null, notes || null, sharedFlag, req.user!.id, now, now);

      if (Array.isArray(roles)) {
        for (const r of roles) {
          if (r.categoryId) {
            const roleId = `role-${teamId}-${r.categoryId}`;
            insertRole.run(roleId, teamId, r.categoryId, Number(r.defaultRate) || 0, r.rateType || 'daily', now);
          }
        }
      }
    });

    transaction();

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'CREATE_TEAM',
      entityType: 'teams',
      entityId: teamId,
      newValues: { name, workCategory, roles },
    });

    res.status(201).json({ id: teamId, name, workCategory, locationProject });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create team.' });
  }
});

apiRouter.put('/teams/:id', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, workCategory, locationProject, status, notes, roles, isShared } = req.body;

  const currentTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as any;
  if (!currentTeam) {
    return res.status(404).json({ error: 'Team not found.' });
  }

  // Check ownership
  if (!isMasterAdmin(req.user) && currentTeam.owner_user_id !== req.user!.id) {
    return res.status(403).json({ error: 'You do not have permission to modify this team.' });
  }

  const now = new Date().toISOString();

  try {
    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE teams
        SET name = ?, work_category = ?, location_project = ?, status = ?, notes = ?, is_shared = ?, updated_at = ?
        WHERE id = ?
      `).run(
        name,
        workCategory,
        locationProject || null,
        status || 'active',
        notes || null,
        isMasterAdmin(req.user) && isShared !== undefined ? (isShared ? 1 : 0) : currentTeam.is_shared,
        now,
        id
      );

      if (Array.isArray(roles)) {
        db.prepare('DELETE FROM team_role_templates WHERE team_id = ?').run(id);
        const insertRole = db.prepare(`
          INSERT INTO team_role_templates (id, team_id, category_id, default_rate, rate_type, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const r of roles) {
          if (r.categoryId) {
            insertRole.run(`role-${id}-${r.categoryId}`, id, r.categoryId, Number(r.defaultRate) || 0, r.rateType || 'daily', now);
          }
        }
      }
    });

    transaction();

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'UPDATE_TEAM',
      entityType: 'teams',
      entityId: id,
      previousValues: currentTeam,
      newValues: { name, workCategory, roles },
    });

    res.json({ success: true, message: 'Team template updated.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update team.' });
  }
});

// Week-specific team snapshot configuration
apiRouter.get('/teams/week/:weekStart', requireAuth, (req: Request, res: Response) => {
  const { weekStart } = req.params;
  const assignments = db.prepare('SELECT * FROM team_week_assignments WHERE week_start_date = ?').all(weekStart);
  res.json(assignments);
});

apiRouter.post('/teams/week/:weekStart', requireAuth, (req: Request, res: Response) => {
  const { weekStart } = req.params;
  const { teamId, customRoleConfig } = req.body;
  const bounds = getWeekBounds(weekStart);
  const now = new Date().toISOString();
  const id = `twa-${weekStart}-${teamId}`;

  db.prepare(`
    INSERT INTO team_week_assignments (id, week_start_date, week_end_date, team_id, custom_role_config_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(week_start_date, team_id) DO UPDATE SET
      custom_role_config_json = excluded.custom_role_config_json
  `).run(id, bounds.startDate, bounds.endDate, teamId, JSON.stringify(customRoleConfig), now);

  res.json({ success: true, message: 'Team week configuration snapshotted.' });
});

// =========================================================================
// 7. DAILY ATTENDANCE (BUG FIXES, ROBUST TRANSACTIONS, RBAC & APPROVALS)
// =========================================================================
apiRouter.get('/attendance', requireAuth, (req: Request, res: Response) => {
  const { weekStart, date, teamId, staffUserId, status } = req.query;

  let query = 'SELECT e.*, u.full_name as staff_name, t.name as team_name FROM attendance_entries e JOIN users u ON e.owner_user_id = u.id JOIN teams t ON e.team_id = t.id WHERE e.is_deleted = 0';
  const params: unknown[] = [];

  // Data isolation
  if (!isMasterAdmin(req.user)) {
    if (isSecondaryAdmin(req.user)) {
      const permittedStaff = getPermittedStaffIds(req.user!);
      if (permittedStaff && permittedStaff.length > 0) {
        const placeholders = permittedStaff.map(() => '?').join(',');
        query += ` AND e.owner_user_id IN (${placeholders})`;
        params.push(...permittedStaff);
      } else {
        query += ' AND e.owner_user_id = ?';
        params.push(req.user!.id);
      }
    } else {
      // Staff sees only their own
      query += ' AND e.owner_user_id = ?';
      params.push(req.user!.id);
    }
  } else if (staffUserId) {
    query += ' AND e.owner_user_id = ?';
    params.push(staffUserId);
  }

  if (weekStart) {
    query += ' AND e.week_start_date = ?';
    params.push(weekStart);
  }
  if (date) {
    query += ' AND e.date = ?';
    params.push(date);
  }
  if (teamId) {
    query += ' AND e.team_id = ?';
    params.push(teamId);
  }
  if (status) {
    query += ' AND e.status = ?';
    params.push(status);
  }

  query += ' ORDER BY e.date ASC, e.created_at ASC';
  const entries = db.prepare(query).all(...params) as Array<any>;

  if (entries.length === 0) {
    return res.json([]);
  }

  const entryIds = entries.map(e => e.id);
  const placeholders = entryIds.map(() => '?').join(',');
  const lines = db.prepare(`SELECT * FROM attendance_lines WHERE attendance_entry_id IN (${placeholders})`).all(...entryIds) as Array<any>;

  const entriesWithLines = entries.map(entry => ({
    ...entry,
    lines: lines.filter(l => l.attendance_entry_id === entry.id),
  }));

  res.json(entriesWithLines);
});

// Create Attendance Entry (Atomic, safe, returns status 201 or actionable error)
apiRouter.post('/attendance', requireAuth, (req: Request, res: Response) => {
  const {
    date,
    teamId,
    locationProject,
    shiftBatch,
    inTime,
    outTime,
    overtimeHours,
    overtimeRate,
    overtimeAmount,
    remarks,
    lines,
    clientRequestId,
  } = req.body;

  if (!date || !teamId) {
    return res.status(400).json({ error: 'Date and Team ID are required.' });
  }

  // Idempotency: verify no duplicate entry submitted with same clientRequestId
  if (clientRequestId) {
    const existingReq = db.prepare('SELECT id FROM attendance_entries WHERE remarks LIKE ?').get(`%req:${clientRequestId}%`) as any;
    if (existingReq) {
      return res.status(200).json({ id: existingReq.id, success: true, message: 'Attendance already recorded.' });
    }
  }

  const weekBounds = getWeekBounds(date);
  const entryId = `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  // Status lifecycle:
  // If Master Admin creates it, it's immediately approved.
  // If Staff or Secondary Admin creates it, it enters pending_approval.
  const initialStatus = isMasterAdmin(req.user) ? 'approved' : 'pending_approval';
  const approverId = isMasterAdmin(req.user) ? req.user!.id : null;
  const approverName = isMasterAdmin(req.user) ? req.user!.fullName : null;
  const approvedAt = isMasterAdmin(req.user) ? now : null;

  const insertEntry = db.prepare(`
    INSERT INTO attendance_entries (
      id, week_start_date, team_id, date, location_project, shift_batch,
      in_time, out_time, overtime_hours, overtime_rate, overtime_amount,
      remarks, status, approved_by, approved_by_name, approved_at,
      owner_user_id, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertLine = db.prepare(`
    INSERT INTO attendance_lines (
      id, attendance_entry_id, category_id, category_name, count, rate, rate_type,
      calculated_amount, final_amount, is_overridden, override_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    const transaction = db.transaction(() => {
      insertEntry.run(
        entryId,
        weekBounds.startDate,
        teamId,
        date,
        locationProject || null,
        shiftBatch || 'Regular',
        inTime || null,
        outTime || null,
        Number(overtimeHours) || 0,
        Number(overtimeRate) || 0,
        Number(overtimeAmount) || 0,
        remarks ? `${remarks} (req:${clientRequestId || 'direct'})` : `(req:${clientRequestId || 'direct'})`,
        initialStatus,
        approverId,
        approverName,
        approvedAt,
        req.user!.id,
        req.user!.id,
        req.user!.id,
        now,
        now
      );

      if (Array.isArray(lines)) {
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineId = `line-${entryId}-${i}`;
          const count = Math.max(0, parseInt(line.count, 10) || 0);
          const rate = Math.max(0, Number(line.rate) || 0);
          const calcAmt = round2(count * rate);
          const finalAmt = line.isOverridden && line.finalAmount !== undefined ? round2(Number(line.finalAmount)) : calcAmt;

          insertLine.run(
            lineId,
            entryId,
            line.categoryId,
            line.categoryName || 'Labour',
            count,
            rate,
            line.rateType || 'daily',
            calcAmt,
            finalAmt,
            line.isOverridden ? 1 : 0,
            line.overrideReason || null
          );
        }
      }
    });

    transaction();

    // Notify assigned approver if pending
    if (initialStatus === 'pending_approval') {
      const assigned = db.prepare('SELECT secondary_admin_id FROM secondary_admin_assignments WHERE staff_user_id = ?').get(req.user!.id) as { secondary_admin_id: string } | undefined;
      const targetAdminId = assigned ? assigned.secondary_admin_id : 'usr-admin-01';
      createNotification({
        userId: targetAdminId,
        title: 'New Attendance Submission',
        message: `${req.user!.fullName} submitted attendance for ${date} awaiting your approval.`,
        type: 'approval',
        link: '/approvals',
      });
    }

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'CREATE_ATTENDANCE',
      entityType: 'attendance_entries',
      entityId: entryId,
      newValues: { date, teamId, linesCount: lines?.length, status: initialStatus },
    });

    res.status(201).json({ id: entryId, success: true, status: initialStatus, message: 'Attendance entry saved successfully.' });
  } catch (err: any) {
    console.error('[ATTENDANCE_SAVE_ERROR]', err.message);
    res.status(500).json({ error: err.message || 'Database error occurred while saving attendance.' });
  }
});

// Update Attendance Entry (With revision workflow and admin modification flags)
apiRouter.put('/attendance/:id', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    locationProject,
    shiftBatch,
    inTime,
    outTime,
    overtimeHours,
    overtimeRate,
    overtimeAmount,
    remarks,
    lines,
    changeReason,
  } = req.body;

  const currentEntry = db.prepare('SELECT * FROM attendance_entries WHERE id = ?').get(id) as any;
  if (!currentEntry) {
    return res.status(404).json({ error: 'Attendance entry not found.' });
  }

  // Permission check
  if (!isMasterAdmin(req.user) && currentEntry.owner_user_id !== req.user!.id && !canAccessStaff(req.user!, currentEntry.owner_user_id)) {
    return res.status(403).json({ error: 'You do not have permission to modify this attendance record.' });
  }

  const now = new Date().toISOString();

  // If entry is approved and edited by staff: MUST follow approval workflow!
  // It creates a proposed revision (status = 'change_pending_approval') with changeReason
  // The current approved values remain active in reports until approved.
  if (currentEntry.status === 'approved' && !isAdminAny(req.user)) {
    if (!changeReason || !changeReason.trim()) {
      return res.status(400).json({ error: 'A mandatory change reason is required when editing approved attendance.' });
    }

    const revisionData = {
      locationProject,
      shiftBatch,
      inTime,
      outTime,
      overtimeHours,
      overtimeRate,
      overtimeAmount,
      remarks,
      lines,
      requestedBy: req.user!.id,
      requestedByName: req.user!.fullName,
      requestedAt: now,
    };

    db.prepare(`
      UPDATE attendance_entries
      SET status = 'change_pending_approval',
          change_reason = ?,
          revision_data_json = ?,
          updated_by = ?,
          updated_at = ?
      WHERE id = ?
    `).run(changeReason.trim(), JSON.stringify(revisionData), req.user!.id, now, id);

    // Notify approver
    createNotification({
      userId: 'usr-admin-01',
      title: 'Attendance Change Request',
      message: `${req.user!.fullName} requested changes to approved attendance on ${currentEntry.date}. Reason: ${changeReason}`,
      type: 'approval',
      link: '/approvals',
    });

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'REQUEST_ATTENDANCE_CHANGE',
      entityType: 'attendance_entries',
      entityId: id,
      reason: changeReason,
      newValues: revisionData,
    });

    return res.json({ success: true, message: 'Proposed changes submitted for approval. Current approved version remains in effect until approved.' });
  }

  // If Admin edited it, or if it was still a draft/pending submission
  const isAdminEdit = isAdminAny(req.user) && req.user!.id !== currentEntry.owner_user_id;

  try {
    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE attendance_entries
        SET location_project = ?, shift_batch = ?, in_time = ?, out_time = ?,
            overtime_hours = ?, overtime_rate = ?, overtime_amount = ?, remarks = ?,
            admin_modified = ?, admin_modified_by = ?, admin_modified_at = ?, admin_modification_reason = ?,
            updated_by = ?, updated_at = ?
        WHERE id = ?
      `).run(
        locationProject || null,
        shiftBatch || 'Regular',
        inTime || null,
        outTime || null,
        Number(overtimeHours) || 0,
        Number(overtimeRate) || 0,
        Number(overtimeAmount) || 0,
        remarks || null,
        isAdminEdit ? 1 : currentEntry.admin_modified,
        isAdminEdit ? req.user!.id : currentEntry.admin_modified_by,
        isAdminEdit ? now : currentEntry.admin_modified_at,
        isAdminEdit ? (changeReason || 'Administrator modified attendance values') : currentEntry.admin_modification_reason,
        req.user!.id,
        now,
        id
      );

      if (Array.isArray(lines)) {
        db.prepare('DELETE FROM attendance_lines WHERE attendance_entry_id = ?').run(id);
        const insertLine = db.prepare(`
          INSERT INTO attendance_lines (
            id, attendance_entry_id, category_id, category_name, count, rate, rate_type,
            calculated_amount, final_amount, is_overridden, override_reason
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineId = `line-${id}-${i}-${Date.now().toString(36)}`;
          const count = Math.max(0, parseInt(line.count, 10) || 0);
          const rate = Math.max(0, Number(line.rate) || 0);
          const calcAmt = round2(count * rate);
          const finalAmt = line.isOverridden && line.finalAmount !== undefined ? round2(Number(line.finalAmount)) : calcAmt;

          insertLine.run(
            lineId,
            id,
            line.categoryId,
            line.categoryName || 'Labour',
            count,
            rate,
            line.rateType || 'daily',
            calcAmt,
            finalAmt,
            line.isOverridden ? 1 : 0,
            line.overrideReason || null
          );
        }
      }
    });

    transaction();

    // If admin altered staff's attendance, notify the staff member
    if (isAdminEdit) {
      createNotification({
        userId: currentEntry.owner_user_id,
        title: 'Attendance Modified by Administrator',
        message: `${req.user!.fullName} modified your attendance entry for ${currentEntry.date}. Reason: ${changeReason || 'Administrative update'}`,
        type: 'modification',
      });
    }

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'UPDATE_ATTENDANCE',
      entityType: 'attendance_entries',
      entityId: id,
      previousValues: currentEntry,
      newValues: { linesCount: lines?.length, adminModified: isAdminEdit },
      reason: changeReason,
    });

    res.json({ success: true, message: 'Attendance entry updated successfully.' });
  } catch (err: any) {
    console.error('[ATTENDANCE_UPDATE_ERROR]', err.message);
    res.status(500).json({ error: err.message || 'Failed to update attendance entry.' });
  }
});

// Approval Queue endpoint for authorized admins
apiRouter.get('/approvals/queue', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const permittedStaff = getPermittedStaffIds(req.user!);

  let query = `
    SELECT e.*, u.full_name as staff_name, t.name as team_name
    FROM attendance_entries e
    JOIN users u ON e.owner_user_id = u.id
    JOIN teams t ON e.team_id = t.id
    WHERE e.is_deleted = 0 AND (e.status = 'pending_approval' OR e.status = 'change_pending_approval')
  `;
  const params: unknown[] = [];

  if (permittedStaff && permittedStaff.length > 0) {
    const placeholders = permittedStaff.map(() => '?').join(',');
    query += ` AND e.owner_user_id IN (${placeholders})`;
    params.push(...permittedStaff);
  }

  query += ' ORDER BY e.created_at ASC';
  const entries = db.prepare(query).all(...params) as Array<any>;

  const entryIds = entries.map(e => e.id);
  let lines: Array<any> = [];
  if (entryIds.length > 0) {
    const placeholders = entryIds.map(() => '?').join(',');
    lines = db.prepare(`SELECT * FROM attendance_lines WHERE attendance_entry_id IN (${placeholders})`).all(...entryIds) as Array<any>;
  }

  const result = entries.map(e => ({
    ...e,
    lines: lines.filter(l => l.attendance_entry_id === e.id),
    revisionData: e.revision_data_json ? JSON.parse(e.revision_data_json) : null,
  }));

  res.json(result);
});

// Approve Attendance or Proposed Revision
apiRouter.post('/attendance/:id/approve', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const entry = db.prepare('SELECT * FROM attendance_entries WHERE id = ?').get(id) as any;
  if (!entry) return res.status(404).json({ error: 'Attendance entry not found.' });

  // Approver cannot approve their own entry
  if (entry.owner_user_id === req.user!.id && !isMasterAdmin(req.user)) {
    return res.status(403).json({ error: 'You cannot approve your own attendance submission.' });
  }

  const now = new Date().toISOString();

  // If approving a proposed revision:
  if (entry.status === 'change_pending_approval' && entry.revision_data_json) {
    try {
      const revision = JSON.parse(entry.revision_data_json);
      const transaction = db.transaction(() => {
        db.prepare(`
          UPDATE attendance_entries
          SET location_project = ?, shift_batch = ?, in_time = ?, out_time = ?,
              overtime_hours = ?, overtime_rate = ?, overtime_amount = ?, remarks = ?,
              status = 'approved', approved_by = ?, approved_by_name = ?, approved_at = ?,
              revision_data_json = NULL, change_reason = NULL, updated_at = ?
          WHERE id = ?
        `).run(
          revision.locationProject || null,
          revision.shiftBatch || 'Regular',
          revision.inTime || null,
          revision.outTime || null,
          Number(revision.overtimeHours) || 0,
          Number(revision.overtimeRate) || 0,
          Number(revision.overtimeAmount) || 0,
          revision.remarks || null,
          req.user!.id,
          req.user!.fullName,
          now,
          now,
          id
        );

        if (Array.isArray(revision.lines)) {
          db.prepare('DELETE FROM attendance_lines WHERE attendance_entry_id = ?').run(id);
          const insertLine = db.prepare(`
            INSERT INTO attendance_lines (
              id, attendance_entry_id, category_id, category_name, count, rate, rate_type,
              calculated_amount, final_amount, is_overridden, override_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (let i = 0; i < revision.lines.length; i++) {
            const line = revision.lines[i];
            const lineId = `line-${id}-${i}-${Date.now().toString(36)}`;
            insertLine.run(
              lineId,
              id,
              line.categoryId,
              line.categoryName || 'Labour',
              Math.max(0, parseInt(line.count, 10) || 0),
              Math.max(0, Number(line.rate) || 0),
              line.rateType || 'daily',
              line.calculatedAmount || 0,
              line.finalAmount || 0,
              line.isOverridden ? 1 : 0,
              line.overrideReason || null
            );
          }
        }
      });
      transaction();
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to apply revision: ' + err.message });
    }
  } else {
    // Normal approval
    db.prepare(`
      UPDATE attendance_entries
      SET status = 'approved', approved_by = ?, approved_by_name = ?, approved_at = ?, updated_at = ?
      WHERE id = ?
    `).run(req.user!.id, req.user!.fullName, now, now, id);
  }

  createNotification({
    userId: entry.owner_user_id,
    title: 'Attendance Approved',
    message: `Your attendance submission for ${entry.date} has been approved by ${req.user!.fullName}.`,
    type: 'approval',
  });

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'APPROVE_ATTENDANCE',
    entityType: 'attendance_entries',
    entityId: id,
  });

  res.json({ success: true, message: 'Attendance approved successfully.' });
});

// Reject Attendance or Proposed Revision
apiRouter.post('/attendance/:id/reject', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A mandatory rejection reason is required.' });
  }

  const entry = db.prepare('SELECT * FROM attendance_entries WHERE id = ?').get(id) as any;
  if (!entry) return res.status(404).json({ error: 'Attendance entry not found.' });

  const now = new Date().toISOString();

  // If rejecting proposed revision, keep previous approved values!
  if (entry.status === 'change_pending_approval') {
    db.prepare(`
      UPDATE attendance_entries
      SET status = 'approved',
          revision_data_json = NULL,
          rejection_reason = ?,
          updated_at = ?
      WHERE id = ?
    `).run(`Revision rejected: ${reason.trim()}`, now, id);
  } else {
    db.prepare(`
      UPDATE attendance_entries
      SET status = 'rejected',
          rejection_reason = ?,
          updated_at = ?
      WHERE id = ?
    `).run(reason.trim(), now, id);
  }

  createNotification({
    userId: entry.owner_user_id,
    title: 'Attendance Rejected',
    message: `Your attendance submission for ${entry.date} was rejected. Reason: ${reason.trim()}`,
    type: 'rejection',
  });

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'REJECT_ATTENDANCE',
    entityType: 'attendance_entries',
    entityId: id,
    reason: reason.trim(),
  });

  res.json({ success: true, message: 'Attendance rejected.' });
});

apiRouter.delete('/attendance/:id', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const currentEntry = db.prepare('SELECT * FROM attendance_entries WHERE id = ?').get(id) as any;
  if (!currentEntry) {
    return res.status(404).json({ error: 'Attendance entry not found.' });
  }

  if (!isMasterAdmin(req.user) && currentEntry.owner_user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Unauthorized to delete this record.' });
  }

  db.prepare('UPDATE attendance_entries SET is_deleted = 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'DELETE_ATTENDANCE',
    entityType: 'attendance_entries',
    entityId: id,
    previousValues: currentEntry,
  });

  res.json({ success: true, message: 'Attendance entry deleted.' });
});

// =========================================================================
// 8. ADDITIONAL CHARGES & FINANCIAL ADJUSTMENTS
// =========================================================================
apiRouter.get('/charges', requireAuth, (req: Request, res: Response) => {
  const { weekStart, teamId, staffUserId } = req.query;
  let query = 'SELECT c.*, u.full_name as staff_name, t.name as team_name FROM additional_charges c JOIN users u ON c.owner_user_id = u.id JOIN teams t ON c.team_id = t.id WHERE c.is_deleted = 0';
  const params: unknown[] = [];

  if (!isMasterAdmin(req.user)) {
    if (isSecondaryAdmin(req.user)) {
      const permitted = getPermittedStaffIds(req.user!);
      if (permitted && permitted.length > 0) {
        query += ` AND c.owner_user_id IN (${permitted.map(() => '?').join(',')})`;
        params.push(...permitted);
      }
    } else {
      query += ' AND c.owner_user_id = ?';
      params.push(req.user!.id);
    }
  } else if (staffUserId) {
    query += ' AND c.owner_user_id = ?';
    params.push(staffUserId);
  }

  if (weekStart) {
    query += ' AND c.week_start_date = ?';
    params.push(weekStart);
  }
  if (teamId) {
    query += ' AND c.team_id = ?';
    params.push(teamId);
  }

  query += ' ORDER BY c.created_at ASC';
  const charges = db.prepare(query).all(...params);
  res.json(charges);
});

apiRouter.post('/charges', requireAuth, (req: Request, res: Response) => {
  const {
    teamId,
    weekStartDate,
    date,
    category,
    description,
    quantity,
    unit,
    rate,
    amount,
    remarks,
    isOverridden,
    overrideReason,
  } = req.body;

  if (!teamId || !weekStartDate || !category || !description) {
    return res.status(400).json({ error: 'Team, week, category, and description are required.' });
  }

  const id = `chg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const qty = quantity !== undefined && quantity !== null && quantity !== '' ? Number(quantity) : null;
  const r = rate !== undefined && rate !== null && rate !== '' ? Number(rate) : null;

  let calculatedAmt = 0;
  if (qty !== null && r !== null) {
    calculatedAmt = round2(qty * r);
  } else {
    calculatedAmt = round2(Number(amount) || 0);
  }

  const finalAmt = isOverridden && amount !== undefined ? round2(Number(amount)) : calculatedAmt;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO additional_charges (
      id, team_id, week_start_date, date, category, description,
      quantity, unit, rate, calculated_amount, final_amount,
      is_overridden, override_reason, remarks, owner_user_id, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    teamId,
    weekStartDate,
    date || null,
    category.trim(),
    description.trim(),
    qty,
    unit || null,
    r,
    calculatedAmt,
    finalAmt,
    isOverridden ? 1 : 0,
    overrideReason || null,
    remarks || null,
    req.user!.id,
    req.user!.id,
    now
  );

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'CREATE_ADDITIONAL_CHARGE',
    entityType: 'additional_charges',
    entityId: id,
    newValues: { category, description, calculatedAmt, finalAmt },
  });

  res.status(201).json({ id, success: true, message: 'Additional charge added.' });
});

apiRouter.delete('/charges/:id', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const charge = db.prepare('SELECT * FROM additional_charges WHERE id = ?').get(id) as any;
  if (!charge) return res.status(404).json({ error: 'Charge not found.' });

  if (!isMasterAdmin(req.user) && charge.owner_user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Unauthorized.' });
  }

  db.prepare('UPDATE additional_charges SET is_deleted = 1 WHERE id = ?').run(id);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'DELETE_ADDITIONAL_CHARGE',
    entityType: 'additional_charges',
    entityId: id,
    previousValues: charge,
  });

  res.json({ success: true, message: 'Charge removed.' });
});

apiRouter.get('/adjustments', requireAuth, (req: Request, res: Response) => {
  const { weekStart, teamId, staffUserId } = req.query;
  let query = 'SELECT a.*, u.full_name as staff_name, t.name as team_name FROM financial_adjustments a JOIN users u ON a.owner_user_id = u.id JOIN teams t ON a.team_id = t.id WHERE a.is_deleted = 0';
  const params: unknown[] = [];

  if (!isMasterAdmin(req.user)) {
    if (isSecondaryAdmin(req.user)) {
      const permitted = getPermittedStaffIds(req.user!);
      if (permitted && permitted.length > 0) {
        query += ` AND a.owner_user_id IN (${permitted.map(() => '?').join(',')})`;
        params.push(...permitted);
      }
    } else {
      query += ' AND a.owner_user_id = ?';
      params.push(req.user!.id);
    }
  } else if (staffUserId) {
    query += ' AND a.owner_user_id = ?';
    params.push(staffUserId);
  }

  if (weekStart) {
    query += ' AND a.week_start_date = ?';
    params.push(weekStart);
  }
  if (teamId) {
    query += ' AND a.team_id = ?';
    params.push(teamId);
  }

  query += ' ORDER BY a.date ASC, a.created_at ASC';
  const adjustments = db.prepare(query).all(...params);
  res.json(adjustments);
});

apiRouter.post('/adjustments', requireAuth, (req: Request, res: Response) => {
  const {
    teamId,
    weekStartDate,
    date,
    adjustmentType,
    description,
    amount,
    ratePercentage,
    baseAmount,
  } = req.body;

  if (!teamId || !weekStartDate || !adjustmentType || !description || amount === undefined) {
    return res.status(400).json({ error: 'Team, week, type, description, and amount are required.' });
  }

  const id = `adj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO financial_adjustments (
      id, team_id, week_start_date, date, adjustment_type, description,
      amount, rate_percentage, base_amount, owner_user_id, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    teamId,
    weekStartDate,
    date || getTodayKolkataISO(),
    adjustmentType,
    description.trim(),
    round2(Number(amount)),
    ratePercentage ? Number(ratePercentage) : null,
    baseAmount ? Number(baseAmount) : null,
    req.user!.id,
    req.user!.id,
    now
  );

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'CREATE_FINANCIAL_ADJUSTMENT',
    entityType: 'financial_adjustments',
    entityId: id,
    newValues: { adjustmentType, description, amount },
  });

  res.status(201).json({ id, success: true, message: 'Adjustment saved.' });
});

apiRouter.delete('/adjustments/:id', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const adj = db.prepare('SELECT * FROM financial_adjustments WHERE id = ?').get(id) as any;
  if (!adj) return res.status(404).json({ error: 'Adjustment not found.' });

  if (!isMasterAdmin(req.user) && adj.owner_user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Unauthorized.' });
  }

  db.prepare('UPDATE financial_adjustments SET is_deleted = 1 WHERE id = ?').run(id);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'DELETE_FINANCIAL_ADJUSTMENT',
    entityType: 'financial_adjustments',
    entityId: id,
    previousValues: adj,
  });

  res.json({ success: true, message: 'Adjustment removed.' });
});

// =========================================================================
// 9. SUPPLIER & CONTRACTOR BILLS
// =========================================================================
apiRouter.get('/supplier-bills', requireAuth, (req: Request, res: Response) => {
  const { weekStart } = req.query;
  let query = 'SELECT * FROM supplier_bills WHERE is_deleted = 0';
  const params: unknown[] = [];
  if (weekStart) {
    query += ' AND week_start_date = ?';
    params.push(weekStart);
  }
  const bills = db.prepare(query).all(...params);
  res.json(bills);
});

apiRouter.post('/supplier-bills', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const { weekStartDate, supplierName, workDescription, grossAmount, advancePaid, remarks } = req.body;
  if (!weekStartDate || !supplierName || !workDescription || grossAmount === undefined) {
    return res.status(400).json({ error: 'Parameters missing.' });
  }

  const id = `sb-${Date.now()}`;
  const now = new Date().toISOString();
  const gross = round2(Number(grossAmount));
  const advance = round2(Number(advancePaid) || 0);
  const netPayable = round2(gross - advance);

  db.prepare(`
    INSERT INTO supplier_bills (
      id, week_start_date, supplier_name, work_description, gross_amount, advance_paid, net_payable, remarks, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, weekStartDate, supplierName.trim(), workDescription.trim(), gross, advance, netPayable, remarks || null, req.user!.id, now);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'CREATE_SUPPLIER_BILL',
    entityType: 'supplier_bills',
    entityId: id,
    newValues: { supplierName, gross, advance, netPayable },
  });

  res.status(201).json({ id, grossAmount: gross, advancePaid: advance, netPayable });
});

apiRouter.delete('/supplier-bills/:id', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const bill = db.prepare('SELECT * FROM supplier_bills WHERE id = ?').get(id);
  if (!bill) return res.status(404).json({ error: 'Bill not found.' });

  db.prepare('UPDATE supplier_bills SET is_deleted = 1 WHERE id = ?').run(id);
  res.json({ success: true, message: 'Supplier bill removed.' });
});

// =========================================================================
// 10. ATTACHMENT & DOCUMENT MANAGEMENT
// =========================================================================
apiRouter.get('/attachments', requireAuth, (req: Request, res: Response) => {
  const { recordType, recordId, staffUserId, teamId, weekStart } = req.query;
  let query = 'SELECT a.*, u.full_name as owner_name FROM attachments a JOIN users u ON a.owner_user_id = u.id WHERE 1=1';
  const params: unknown[] = [];

  if (!isMasterAdmin(req.user)) {
    if (isSecondaryAdmin(req.user)) {
      const permitted = getPermittedStaffIds(req.user!);
      if (permitted && permitted.length > 0) {
        query += ` AND a.owner_user_id IN (${permitted.map(() => '?').join(',')})`;
        params.push(...permitted);
      }
    } else {
      query += ' AND a.owner_user_id = ?';
      params.push(req.user!.id);
    }
  } else if (staffUserId) {
    query += ' AND a.owner_user_id = ?';
    params.push(staffUserId);
  }

  if (recordType) {
    query += ' AND a.record_type = ?';
    params.push(recordType);
  }
  if (recordId) {
    query += ' AND a.record_id = ?';
    params.push(recordId);
  }
  if (teamId) {
    query += ' AND a.team_id = ?';
    params.push(teamId);
  }
  if (weekStart) {
    query += ' AND a.week_start_date = ?';
    params.push(weekStart);
  }

  query += ' ORDER BY a.created_at DESC';
  const list = db.prepare(query).all(...params);
  res.json(list);
});

apiRouter.post('/attachments', requireAuth, (req: Request, res: Response) => {
  const {
    recordType = 'general',
    recordId,
    fileName,
    fileSize,
    mimeType,
    fileDataBase64,
    description,
    teamId,
    date,
    weekStartDate,
  } = req.body;

  if (!fileName || !fileDataBase64) {
    return res.status(400).json({ error: 'File name and file content are required.' });
  }

  // Validate allowed extensions
  const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.xls'];
  const ext = path.extname(fileName).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return res.status(400).json({ error: 'Only PDF, JPG, PNG, and XLSX files are supported.' });
  }

  const id = `attch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const storedFilename = `${id}${ext}`;
  const localFilePath = path.join(uploadsDir, storedFilename);

  // Write base64 buffer to disk
  try {
    const buffer = Buffer.from(fileDataBase64.replace(/^data:.*?;base64,/, ''), 'base64');
    fs.writeFileSync(localFilePath, buffer);

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO attachments (
        id, record_type, record_id, file_name, file_size, mime_type, file_path, description,
        owner_user_id, uploaded_by, uploaded_by_name, team_id, date, week_start_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      recordType,
      recordId || null,
      fileName,
      fileSize || buffer.length,
      mimeType || 'application/octet-stream',
      storedFilename,
      description || null,
      req.user!.id,
      req.user!.id,
      req.user!.fullName,
      teamId || null,
      date || null,
      weekStartDate || null,
      now
    );

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'UPLOAD_ATTACHMENT',
      entityType: 'attachments',
      entityId: id,
      newValues: { fileName, recordType, recordId },
    });

    res.status(201).json({ id, fileName, success: true, message: 'Attachment saved successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save attachment file: ' + err.message });
  }
});

apiRouter.get('/attachments/:id/download', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as any;
  if (!attachment) return res.status(404).json({ error: 'Attachment not found.' });

  // Security check: staff cannot access another staff member's attachment
  if (!canAccessStaff(req.user!, attachment.owner_user_id)) {
    return res.status(403).json({ error: 'Unauthorized to download this attachment.' });
  }

  const fullPath = path.join(uploadsDir, attachment.file_path);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Physical file not found.' });
  }

  res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${attachment.file_name}"`);
  const stream = fs.createReadStream(fullPath);
  stream.pipe(res);
});

apiRouter.delete('/attachments/:id', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as any;
  if (!attachment) return res.status(404).json({ error: 'Attachment not found.' });

  if (!isMasterAdmin(req.user) && attachment.owner_user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Unauthorized to delete this attachment.' });
  }

  try {
    const fullPath = path.join(uploadsDir, attachment.file_path);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch {}

  db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
  res.json({ success: true, message: 'Attachment removed.' });
});

// =========================================================================
// 11. WEEKLY PAYMENTS & PAYMENT TRACKER
// =========================================================================
apiRouter.get('/payments', requireAuth, (req: Request, res: Response) => {
  const { weekStart, teamId, status, staffUserId } = req.query;

  let query = `
    SELECT p.*, t.name as team_name, u.full_name as staff_name
    FROM weekly_payments p
    JOIN teams t ON p.team_id = t.id
    JOIN users u ON p.staff_user_id = u.id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (!isMasterAdmin(req.user)) {
    if (isSecondaryAdmin(req.user)) {
      const permitted = getPermittedStaffIds(req.user!);
      if (permitted && permitted.length > 0) {
        query += ` AND p.staff_user_id IN (${permitted.map(() => '?').join(',')})`;
        params.push(...permitted);
      }
    } else {
      query += ' AND p.staff_user_id = ?';
      params.push(req.user!.id);
    }
  } else if (staffUserId) {
    query += ' AND p.staff_user_id = ?';
    params.push(staffUserId);
  }

  if (weekStart) {
    query += ' AND p.week_start_date = ?';
    params.push(weekStart);
  }
  if (teamId) {
    query += ' AND p.team_id = ?';
    params.push(teamId);
  }
  if (status) {
    query += ' AND p.status = ?';
    params.push(status);
  }

  query += ' ORDER BY p.week_start_date DESC, p.created_at DESC';
  const payments = db.prepare(query).all(...params);
  res.json(payments);
});

// Mark as Paid or Partial Payment for a Team's Weekly Report
apiRouter.post('/payments/mark-paid', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const {
    weekStartDate,
    teamId,
    staffUserId,
    grossAmount = 0,
    chargesAmount = 0,
    deductionsAmount = 0,
    netPayable = 0,
    amountPaid = 0,
    paymentDate,
    paymentMethod = 'Bank Transfer',
    voucherRef,
    voucherAttachmentId,
    notes,
  } = req.body;

  if (!weekStartDate || !teamId || !staffUserId || amountPaid === undefined) {
    return res.status(400).json({ error: 'Week, team, staff, and payment amount are required.' });
  }

  const net = round2(Number(netPayable));
  const paid = round2(Number(amountPaid));
  let status = 'Pending';
  if (paid >= net && net > 0) {
    status = 'Paid';
  } else if (paid > 0) {
    status = 'Partially Paid';
  } else {
    status = 'Not Paid';
  }

  const id = `pmt-${weekStartDate}-${teamId}-${staffUserId}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO weekly_payments (
      id, week_start_date, team_id, staff_user_id, gross_amount, charges_amount,
      deductions_amount, net_payable, amount_paid, status, payment_date,
      payment_method, voucher_ref, voucher_attachment_id, notes, marked_by, marked_by_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(week_start_date, team_id, staff_user_id) DO UPDATE SET
      gross_amount = excluded.gross_amount,
      charges_amount = excluded.charges_amount,
      deductions_amount = excluded.deductions_amount,
      net_payable = excluded.net_payable,
      amount_paid = excluded.amount_paid,
      status = excluded.status,
      payment_date = excluded.payment_date,
      payment_method = excluded.payment_method,
      voucher_ref = excluded.voucher_ref,
      voucher_attachment_id = excluded.voucher_attachment_id,
      notes = excluded.notes,
      marked_by = excluded.marked_by,
      marked_by_name = excluded.marked_by_name,
      updated_at = excluded.updated_at
  `).run(
    id,
    weekStartDate,
    teamId,
    staffUserId,
    round2(Number(grossAmount)),
    round2(Number(chargesAmount)),
    round2(Number(deductionsAmount)),
    net,
    paid,
    status,
    paymentDate || getTodayKolkataISO(),
    paymentMethod,
    voucherRef || null,
    voucherAttachmentId || null,
    notes || null,
    req.user!.id,
    req.user!.fullName,
    now,
    now
  );

  createNotification({
    userId: staffUserId,
    title: 'Payment Status Updated',
    message: `Payment for week starting ${weekStartDate} has been recorded as ${status} (₹${paid} settled).`,
    type: 'payment',
  });

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'MARK_WEEKLY_PAYMENT',
    entityType: 'weekly_payments',
    entityId: id,
    newValues: { status, amountPaid: paid, netPayable: net, voucherRef },
  });

  res.json({ success: true, status, amountPaid: paid, netPayable: net, message: `Payment recorded as ${status}.` });
});

// Historical unpaid balances across prior weeks
apiRouter.get('/payments/historical-outstanding', requireAuth, (req: Request, res: Response) => {
  const { currentWeekStart, staffUserId } = req.query;

  let query = `
    SELECT p.*, t.name as team_name, u.full_name as staff_name
    FROM weekly_payments p
    JOIN teams t ON p.team_id = t.id
    JOIN users u ON p.staff_user_id = u.id
    WHERE (p.status = 'Pending' OR p.status = 'Partially Paid' OR p.status = 'Not Paid')
  `;
  const params: unknown[] = [];

  if (currentWeekStart) {
    query += ' AND p.week_start_date < ?';
    params.push(currentWeekStart);
  }

  if (!isMasterAdmin(req.user)) {
    if (isSecondaryAdmin(req.user)) {
      const permitted = getPermittedStaffIds(req.user!);
      if (permitted && permitted.length > 0) {
        query += ` AND p.staff_user_id IN (${permitted.map(() => '?').join(',')})`;
        params.push(...permitted);
      }
    } else {
      query += ' AND p.staff_user_id = ?';
      params.push(req.user!.id);
    }
  } else if (staffUserId) {
    query += ' AND p.staff_user_id = ?';
    params.push(staffUserId);
  }

  query += ' ORDER BY p.week_start_date ASC';
  const outstanding = db.prepare(query).all(...params);
  res.json(outstanding);
});

// =========================================================================
// 12. MASTER-ADMIN ACCOUNTS LEDGER (RESTRICTED COMPANY-WIDE RUNNING LEDGER)
// =========================================================================
apiRouter.get('/office-ledger', requireAuth, (req: Request, res: Response) => {
  if (!isMasterAdmin(req.user) && !canAccessFinanceModule(req.user!, 'office_ledger')) {
    return res.status(403).json({ error: 'Access restricted to Master Administrator or authorized accounts managers.' });
  }

  const { startDate, endDate, category } = req.query;
  let query = 'SELECT * FROM office_ledger_entries WHERE 1=1';
  const params: unknown[] = [];

  if (startDate) {
    query += ' AND entry_date >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND entry_date <= ?';
    params.push(endDate);
  }
  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }

  query += ' ORDER BY entry_date ASC, created_at ASC';
  const entries = db.prepare(query).all(...params) as Array<any>;

  // Compute running balance dynamically from start
  let running = 0;
  const withRunning = entries.map(e => {
    if (e.entry_type === 'credit') {
      running = round2(running + e.amount);
    } else {
      running = round2(running - e.amount);
    }
    return { ...e, runningBalance: running };
  });

  res.json(withRunning);
});

apiRouter.post('/office-ledger', requireAuth, (req: Request, res: Response) => {
  if (!isMasterAdmin(req.user) && !canAccessFinanceModule(req.user!, 'office_ledger')) {
    return res.status(403).json({ error: 'Access restricted to Master Administrator.' });
  }

  const {
    entryDate,
    referenceNo,
    category,
    description,
    entryType, // 'debit' or 'credit'
    amount,
    paymentMode,
    relatedTeamId,
    relatedStaffId,
    notes,
  } = req.body;

  if (!entryDate || !category || !description || !entryType || amount === undefined) {
    return res.status(400).json({ error: 'Date, category, description, entry type, and amount are required.' });
  }

  const id = `ledg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO office_ledger_entries (
      id, entry_date, reference_no, category, description, entry_type, amount,
      payment_mode, related_team_id, related_staff_id, notes, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entryDate,
    referenceNo || null,
    category.trim(),
    description.trim(),
    entryType,
    round2(Number(amount)),
    paymentMode || 'Bank Transfer',
    relatedTeamId || null,
    relatedStaffId || null,
    notes || null,
    req.user!.id,
    now
  );

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'CREATE_OFFICE_LEDGER_ENTRY',
    entityType: 'office_ledger_entries',
    entityId: id,
    newValues: { category, entryType, amount },
  });

  res.status(201).json({ id, success: true, message: 'Ledger entry recorded.' });
});

// =========================================================================
// 13. EXCEL-BASED PETTY CASH MODULE ("Petty Cash - Oct 2026" / "for software.xlsx")
// =========================================================================
apiRouter.get('/petty-cash', requireAuth, (req: Request, res: Response) => {
  if (!isMasterAdmin(req.user) && !canAccessFinanceModule(req.user!, 'petty_cash')) {
    return res.status(403).json({ error: 'Access restricted to authorized administrators.' });
  }

  const { month, year, date } = req.query;

  // Retrieve configured opening balances from settings
  const openingRow = db.prepare("SELECT value_json FROM company_settings WHERE key = 'petty_cash_opening'").get() as { value_json: string } | undefined;
  const openingConfig = openingRow ? JSON.parse(openingRow.value_json) : { openingInAccount: 75000, openingInHand: 25000 };

  let query = 'SELECT * FROM petty_cash_entries WHERE 1=1';
  const params: unknown[] = [];

  if (date) {
    query += ' AND date = ?';
    params.push(date);
  } else if (month && year) {
    const mStr = String(month).padStart(2, '0');
    query += ' AND date >= ? AND date <= ?';
    params.push(`${year}-${mStr}-01`);
    params.push(`${year}-${mStr}-31`);
  }

  query += ' ORDER BY date ASC, serial_no ASC, created_at ASC';
  const entries = db.prepare(query).all(...params) as Array<any>;

  // Group by date and calculate daily ledger balances matching "for software.xlsx":
  // Total Credit Received that day - Total Debit Paid that day = Day Balance
  // Running Account Balance and Running Cash in Hand Balance
  let runningAccount = openingConfig.openingInAccount || 0;
  let runningHand = openingConfig.openingInHand || 0;

  // Compute daily summaries and running balances
  const enrichedEntries = entries.map(e => {
    const cred = round2(Number(e.credit_amount) || 0);
    const deb = round2(Number(e.debit_amount) || 0);
    const online = round2(Number(e.online_amount) || 0);

    // Movement: online affects account; cash affects hand
    if (e.channel === 'online' || e.channel === 'account') {
      runningAccount = round2(runningAccount + cred - deb);
    } else {
      runningHand = round2(runningHand + cred - deb);
    }

    const dayBal = round2(cred - deb);

    return {
      ...e,
      dayBalance: dayBal,
      cashInAccount: runningAccount,
      cashInHand: runningHand,
      totalFunds: round2(runningAccount + runningHand),
    };
  });

  res.json({
    openingBalances: openingConfig,
    entries: enrichedEntries,
    currentAccountBalance: runningAccount,
    currentHandBalance: runningHand,
    totalAvailableFunds: round2(runningAccount + runningHand),
  });
});

apiRouter.post('/petty-cash', requireAuth, (req: Request, res: Response) => {
  if (!isMasterAdmin(req.user) && !canAccessFinanceModule(req.user!, 'petty_cash')) {
    return res.status(403).json({ error: 'Access restricted to authorized administrators.' });
  }

  const {
    date,
    serialNo,
    description,
    creditAmount = 0,
    debitAmount = 0,
    onlineAmount = 0,
    channel = 'cash',
    relatedTeamId,
    relatedStaffId,
    notes,
  } = req.body;

  if (!date || !description) {
    return res.status(400).json({ error: 'Date and description are required.' });
  }

  const id = `pc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const cAmt = round2(Number(creditAmount) || 0);
  const dAmt = round2(Number(debitAmount) || 0);
  const onl = round2(Number(onlineAmount) || 0);

  db.prepare(`
    INSERT INTO petty_cash_entries (
      id, date, serial_no, description, credit_amount, debit_amount, online_amount,
      channel, related_team_id, related_staff_id, notes, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    date,
    serialNo || null,
    description.trim(),
    cAmt,
    dAmt,
    onl,
    channel,
    relatedTeamId || null,
    relatedStaffId || null,
    notes || null,
    req.user!.id,
    now,
    now
  );

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'CREATE_PETTY_CASH_ENTRY',
    entityType: 'petty_cash_entries',
    entityId: id,
    newValues: { date, description, creditAmount: cAmt, debitAmount: dAmt, channel },
  });

  res.status(201).json({ id, success: true, message: 'Petty cash transaction recorded.' });
});

apiRouter.delete('/petty-cash/:id', requireAuth, (req: Request, res: Response) => {
  if (!isMasterAdmin(req.user) && !canAccessFinanceModule(req.user!, 'petty_cash')) {
    return res.status(403).json({ error: 'Access restricted.' });
  }

  const { id } = req.params;
  db.prepare('DELETE FROM petty_cash_entries WHERE id = ?').run(id);
  res.json({ success: true, message: 'Petty cash entry removed.' });
});

// =========================================================================
// 14. IN-APP PERSISTENT NOTIFICATIONS
// =========================================================================
apiRouter.get('/notifications', requireAuth, (req: Request, res: Response) => {
  const notifs = db.prepare(`
    SELECT * FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(req.user!.id);

  const unreadCount = (db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user!.id) as { c: number }).c;

  res.json({ notifications: notifs, unreadCount });
});

apiRouter.patch('/notifications/:id/read', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, req.user!.id);
  res.json({ success: true });
});

apiRouter.post('/notifications/read-all', requireAuth, (req: Request, res: Response) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
  res.json({ success: true });
});

// =========================================================================
// 15. TEAM MERGING (MODE A & MODE B)
// =========================================================================
apiRouter.get('/merges/summary-groups', requireAuth, (req: Request, res: Response) => {
  const { weekStart } = req.query;
  let query = 'SELECT * FROM summary_merge_groups';
  const params: unknown[] = [];
  if (weekStart) {
    query += ' WHERE week_start_date = ?';
    params.push(weekStart);
  }
  const groups = db.prepare(query).all(...params) as Array<{
    id: string;
    week_start_date: string;
    group_name: string;
    team_ids_json: string;
    created_by: string;
    created_at: string;
  }>;

  const parsed = groups.map(g => ({
    ...g,
    teamIds: JSON.parse(g.team_ids_json || '[]'),
  }));
  res.json(parsed);
});

apiRouter.post('/merges/summary-groups', requireAuth, (req: Request, res: Response) => {
  const { weekStartDate, groupName, teamIds } = req.body;
  if (!weekStartDate || !groupName || !Array.isArray(teamIds) || teamIds.length < 2) {
    return res.status(400).json({ error: 'Week start date, group name, and at least 2 teams are required.' });
  }

  const id = `smg-${Date.now()}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO summary_merge_groups (id, week_start_date, group_name, team_ids_json, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, weekStartDate, groupName.trim(), JSON.stringify(teamIds), req.user!.id, now);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'CREATE_SUMMARY_MERGE_GROUP',
    entityType: 'summary_merge_groups',
    entityId: id,
    newValues: { groupName, teamIds },
  });

  res.status(201).json({ id, success: true, message: 'Summary merge group created.' });
});

apiRouter.delete('/merges/summary-groups/:id', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  db.prepare('DELETE FROM summary_merge_groups WHERE id = ?').run(id);
  res.json({ success: true, message: 'Summary merge group deleted.' });
});

apiRouter.post('/merges/attendance/execute', requireAuth, (req: Request, res: Response) => {
  const { sourceTeamIds, destinationTeamId, weekStartDate, reason } = req.body;
  if (!Array.isArray(sourceTeamIds) || !destinationTeamId || !weekStartDate) {
    return res.status(400).json({ error: 'Parameters missing.' });
  }

  const placeholders = sourceTeamIds.map(() => '?').join(',');
  const entriesToMerge = db.prepare(`
    SELECT id, team_id FROM attendance_entries
    WHERE team_id IN (${placeholders}) AND week_start_date = ? AND is_deleted = 0
  `).all(...sourceTeamIds, weekStartDate) as Array<{ id: string; team_id: string }>;

  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    for (const entry of entriesToMerge) {
      db.prepare(`
        UPDATE attendance_entries
        SET team_id = ?, is_merged = 1, merged_into_id = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
      `).run(destinationTeamId, destinationTeamId, req.user!.id, now, entry.id);
    }
  });

  transaction();

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'MERGE_ATTENDANCE_ENTRIES',
    entityType: 'attendance_entries',
    entityId: destinationTeamId,
    reason: reason || 'Consolidation of team attendance records',
    newValues: { sourceTeamIds, destinationTeamId, mergedCount: entriesToMerge.length },
  });

  res.json({ success: true, message: `Successfully merged ${entriesToMerge.length} attendance entries into destination team.` });
});

// =========================================================================
// 16. REPORTS (WEEKLY & MONTHLY — APPROVAL-ENFORCED & SCOPED)
// =========================================================================
apiRouter.get('/reports/weekly', requireAuth, (req: Request, res: Response) => {
  const { weekStart, staffUserId } = req.query;
  const targetDate = typeof weekStart === 'string' && weekStart ? weekStart : getTodayKolkataISO();
  const bounds = getWeekBounds(targetDate);

  // Determine staff scoping
  let targetStaffId: string | null = null;
  if (!isMasterAdmin(req.user)) {
    if (isSecondaryAdmin(req.user)) {
      if (staffUserId && canAccessStaff(req.user!, String(staffUserId))) {
        targetStaffId = String(staffUserId);
      }
    } else {
      targetStaffId = req.user!.id;
    }
  } else if (staffUserId) {
    targetStaffId = String(staffUserId);
  }

  // 1. Fetch teams
  const allTeams = db.prepare("SELECT * FROM teams WHERE status = 'active'").all() as Array<any>;

  // 2. Fetch attendance entries
  let attQuery = 'SELECT * FROM attendance_entries WHERE week_start_date = ? AND is_deleted = 0';
  const attParams: unknown[] = [bounds.startDate];

  if (targetStaffId) {
    attQuery += ' AND owner_user_id = ?';
    attParams.push(targetStaffId);
  } else if (isSecondaryAdmin(req.user)) {
    const permitted = getPermittedStaffIds(req.user!);
    if (permitted && permitted.length > 0) {
      attQuery += ` AND owner_user_id IN (${permitted.map(() => '?').join(',')})`;
      attParams.push(...permitted);
    }
  }

  attQuery += ' ORDER BY date ASC';
  const allEntries = db.prepare(attQuery).all(...attParams) as Array<any>;

  // CRITICAL REQUIREMENT:
  // "Attendance in pending or rejected states does not enter approved payable totals."
  // "Pending submissions and revisions are tracked separately."
  const approvedEntries = allEntries.filter(e => e.status === 'approved' || e.status === 'change_pending_approval');
  const pendingEntries = allEntries.filter(e => e.status === 'pending_approval');
  const rejectedEntries = allEntries.filter(e => e.status === 'rejected');

  const entryIds = approvedEntries.map(e => e.id);
  let lines: Array<any> = [];
  if (entryIds.length > 0) {
    const placeholders = entryIds.map(() => '?').join(',');
    lines = db.prepare(`SELECT * FROM attendance_lines WHERE attendance_entry_id IN (${placeholders})`).all(...entryIds) as Array<any>;
  }

  // 3. Additional charges
  let chgQuery = 'SELECT * FROM additional_charges WHERE week_start_date = ? AND is_deleted = 0';
  const chgParams: unknown[] = [bounds.startDate];
  if (targetStaffId) {
    chgQuery += ' AND owner_user_id = ?';
    chgParams.push(targetStaffId);
  }
  const charges = db.prepare(chgQuery).all(...chgParams) as Array<any>;

  // 4. Financial adjustments
  let adjQuery = 'SELECT * FROM financial_adjustments WHERE week_start_date = ? AND is_deleted = 0';
  const adjParams: unknown[] = [bounds.startDate];
  if (targetStaffId) {
    adjQuery += ' AND owner_user_id = ?';
    adjParams.push(targetStaffId);
  }
  const adjustments = db.prepare(adjQuery).all(...adjParams) as Array<any>;

  // 5. Supplier bills
  const supplierBills = db.prepare('SELECT * FROM supplier_bills WHERE week_start_date = ? AND is_deleted = 0').all(bounds.startDate) as Array<any>;

  // 6. Summary merge groups
  const mergeGroups = db.prepare('SELECT * FROM summary_merge_groups WHERE week_start_date = ?').all(bounds.startDate) as Array<any>;

  // 7. Payment status records for this week
  let pmtQuery = 'SELECT * FROM weekly_payments WHERE week_start_date = ?';
  const pmtParams: unknown[] = [bounds.startDate];
  if (targetStaffId) {
    pmtQuery += ' AND staff_user_id = ?';
    pmtParams.push(targetStaffId);
  }
  const weekPayments = db.prepare(pmtQuery).all(...pmtParams) as Array<any>;

  // Build team-wise breakdown using ONLY approved entries
  const teamSummaries = allTeams.map(team => {
    const teamEntries = approvedEntries.filter(e => e.team_id === team.id);
    const teamPendingEntries = pendingEntries.filter(e => e.team_id === team.id);
    const teamEntryIds = teamEntries.map(e => e.id);
    const teamLines = lines.filter(l => teamEntryIds.includes(l.attendance_entry_id));
    const teamCharges = charges.filter(c => c.team_id === team.id);
    const teamAdjustments = adjustments.filter(a => a.team_id === team.id);

    const labourAmounts = teamLines.map(l => l.final_amount);
    const overtimeAmounts = teamEntries.map(e => e.overtime_amount || 0);
    const chargeAmounts = teamCharges.map(c => c.final_amount);

    const credits = teamAdjustments.filter(a => a.adjustment_type === 'credit' || a.adjustment_type === 'addition').map(a => a.amount);
    const deductions = teamAdjustments.filter(a => a.adjustment_type === 'fixed_deduction' || a.adjustment_type === 'percentage_deduction').map(a => a.amount);
    const advancesApplied = teamAdjustments.filter(a => a.adjustment_type === 'advance_deduction').map(a => a.amount);

    const summary = computeFinancialSummary({
      labourAmounts,
      overtimeAmounts,
      additionalChargeAmounts: chargeAmounts,
      credits,
      deductions,
      advancesApplied,
    });

    const paymentRecord = weekPayments.find(p => p.team_id === team.id);

    return {
      teamId: team.id,
      teamName: team.name,
      workCategory: team.work_category,
      entriesCount: teamEntries.length,
      pendingCount: teamPendingEntries.length,
      linesCount: teamLines.length,
      chargesCount: teamCharges.length,
      adjustmentsCount: teamAdjustments.length,
      paymentStatus: paymentRecord?.status || 'Pending',
      amountPaid: paymentRecord?.amount_paid || 0,
      paymentRecord,
      ...summary,
      entries: teamEntries.map(e => ({
        ...e,
        lines: teamLines.filter(l => l.attendance_entry_id === e.id),
      })),
      pendingEntries: teamPendingEntries,
      charges: teamCharges,
      adjustments: teamAdjustments,
    };
  }).filter(t => t.entriesCount > 0 || t.pendingCount > 0 || t.chargesCount > 0 || t.adjustmentsCount > 0);

  // Grand totals
  const grandLabour = teamSummaries.reduce((sum, t) => sum + t.labourSubtotal, 0);
  const grandOvertime = teamSummaries.reduce((sum, t) => sum + t.overtimeSubtotal, 0);
  const grandCharges = teamSummaries.reduce((sum, t) => sum + t.additionalChargesSubtotal, 0);
  const grandGross = teamSummaries.reduce((sum, t) => sum + t.grossAmount, 0) + supplierBills.reduce((sum, b) => sum + b.gross_amount, 0);
  const grandCredits = teamSummaries.reduce((sum, t) => sum + t.creditsSubtotal, 0);
  const grandDeductions = teamSummaries.reduce((sum, t) => sum + t.deductionsSubtotal, 0);
  const grandAdvances = teamSummaries.reduce((sum, t) => sum + t.advancesAppliedSubtotal, 0) + supplierBills.reduce((sum, b) => sum + b.advance_paid, 0);
  const grandPayable = teamSummaries.reduce((sum, t) => sum + t.finalPayable, 0) + supplierBills.reduce((sum, b) => sum + b.net_payable, 0);
  const grandPaid = weekPayments.reduce((sum, p) => sum + (p.amount_paid || 0), 0);
  const grandOutstanding = round2(grandPayable - grandPaid);

  res.json({
    weekBounds: bounds,
    teamSummaries,
    supplierBills,
    mergeGroups: mergeGroups.map(g => ({ ...g, teamIds: JSON.parse(g.team_ids_json || '[]') })),
    pendingSubmissionsCount: pendingEntries.length,
    rejectedSubmissionsCount: rejectedEntries.length,
    grandTotals: {
      labour: round2(grandLabour),
      overtime: round2(grandOvertime),
      additionalCharges: round2(grandCharges),
      gross: round2(grandGross),
      credits: round2(grandCredits),
      deductions: round2(grandDeductions),
      advancesApplied: round2(grandAdvances),
      finalPayable: round2(grandPayable),
      paid: round2(grandPaid),
      outstanding: grandOutstanding,
    },
  });
});

apiRouter.get('/reports/monthly', requireAuth, (req: Request, res: Response) => {
  const { year, month, staffUserId } = req.query;
  const y = parseInt(String(year), 10) || new Date().getFullYear();
  const m = parseInt(String(month), 10) || (new Date().getMonth() + 1);

  const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  let query = "SELECT e.*, t.name as team_name, t.work_category FROM attendance_entries e JOIN teams t ON e.team_id = t.id WHERE e.date >= ? AND e.date <= ? AND e.is_deleted = 0 AND (e.status = 'approved' OR e.status = 'change_pending_approval')";
  const params: unknown[] = [startDate, endDate];

  if (!isMasterAdmin(req.user)) {
    if (isSecondaryAdmin(req.user)) {
      const permitted = getPermittedStaffIds(req.user!);
      if (permitted && permitted.length > 0) {
        query += ` AND e.owner_user_id IN (${permitted.map(() => '?').join(',')})`;
        params.push(...permitted);
      }
    } else {
      query += ' AND e.owner_user_id = ?';
      params.push(req.user!.id);
    }
  } else if (staffUserId) {
    query += ' AND e.owner_user_id = ?';
    params.push(staffUserId);
  }

  query += ' ORDER BY e.date ASC';
  const entries = db.prepare(query).all(...params) as Array<any>;

  const entryIds = entries.map(e => e.id);
  let lines: Array<any> = [];
  if (entryIds.length > 0) {
    const placeholders = entryIds.map(() => '?').join(',');
    lines = db.prepare(`SELECT * FROM attendance_lines WHERE attendance_entry_id IN (${placeholders})`).all(...entryIds) as Array<any>;
  }

  const charges = db.prepare('SELECT * FROM additional_charges WHERE date >= ? AND date <= ? AND is_deleted = 0').all(startDate, endDate) as Array<any>;
  const adjustments = db.prepare('SELECT * FROM financial_adjustments WHERE date >= ? AND date <= ? AND is_deleted = 0').all(startDate, endDate) as Array<any>;

  const totalLabour = round2(lines.reduce((acc, l) => acc + (l.final_amount || 0), 0));
  const totalOvertime = round2(entries.reduce((acc, e) => acc + (e.overtime_amount || 0), 0));
  const totalCharges = round2(charges.reduce((acc, c) => acc + (c.final_amount || 0), 0));
  const gross = round2(totalLabour + totalOvertime + totalCharges);

  const credits = round2(adjustments.filter(a => a.adjustment_type === 'credit' || a.adjustment_type === 'addition').reduce((acc, a) => acc + a.amount, 0));
  const deductions = round2(adjustments.filter(a => a.adjustment_type === 'fixed_deduction' || a.adjustment_type === 'percentage_deduction').reduce((acc, a) => acc + a.amount, 0));
  const advances = round2(adjustments.filter(a => a.adjustment_type === 'advance_deduction').reduce((acc, a) => acc + a.amount, 0));
  const payable = round2(gross + credits - deductions - advances);

  // Group by team
  const teamsMap = new Map<string, any>();
  for (const entry of entries) {
    if (!teamsMap.has(entry.team_id)) {
      teamsMap.set(entry.team_id, {
        teamId: entry.team_id,
        teamName: entry.team_name,
        workCategory: entry.work_category,
        daysCount: 0,
        manDays: 0,
        labourSubtotal: 0,
        overtimeSubtotal: 0,
        chargesSubtotal: 0,
        deductionsSubtotal: 0,
        grossAmount: 0,
        finalPayable: 0,
      });
    }
    const t = teamsMap.get(entry.team_id);
    t.daysCount += 1;
    t.overtimeSubtotal = round2(t.overtimeSubtotal + (entry.overtime_amount || 0));

    const entryLines = lines.filter(l => l.attendance_entry_id === entry.id);
    for (const l of entryLines) {
      t.manDays += Number(l.count) || 0;
      t.labourSubtotal = round2(t.labourSubtotal + (l.final_amount || 0));
    }
  }

  // Add charges & adjustments per team
  for (const c of charges) {
    if (teamsMap.has(c.team_id)) {
      const t = teamsMap.get(c.team_id);
      t.chargesSubtotal = round2(t.chargesSubtotal + (c.final_amount || 0));
    }
  }
  for (const a of adjustments) {
    if (teamsMap.has(a.team_id)) {
      const t = teamsMap.get(a.team_id);
      if (a.adjustment_type === 'fixed_deduction' || a.adjustment_type === 'percentage_deduction' || a.adjustment_type === 'advance_deduction') {
        t.deductionsSubtotal = round2(t.deductionsSubtotal + (a.amount || 0));
      }
    }
  }

  const teamSummaries = Array.from(teamsMap.values()).map(t => {
    const g = round2(t.labourSubtotal + t.overtimeSubtotal + t.chargesSubtotal);
    const p = round2(g - t.deductionsSubtotal);
    return { ...t, grossAmount: g, finalPayable: p };
  });

  // Group by labour category
  const categoryMap = new Map<string, any>();
  for (const line of lines) {
    if (!categoryMap.has(line.category_id)) {
      categoryMap.set(line.category_id, {
        categoryId: line.category_id,
        categoryName: line.category_name,
        totalCount: 0,
        totalAmount: 0,
      });
    }
    const cat = categoryMap.get(line.category_id);
    cat.totalCount += Number(line.count) || 0;
    cat.totalAmount = round2(cat.totalAmount + (line.final_amount || 0));
  }
  const categoryBreakdown = Array.from(categoryMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);

  res.json({
    month: m,
    year: y,
    startDate,
    endDate,
    totals: { totalLabour, totalOvertime, totalCharges, gross, credits, deductions, advances, payable },
    teamSummaries,
    categoryBreakdown,
    entriesCount: entries.length,
    chargesCount: charges.length,
  });
});

// =========================================================================
// 17. AUDIT LOGS & SETTINGS
// =========================================================================
apiRouter.get('/audit', requireAuth, (req: Request, res: Response) => {
  const { limit, entityType, actorId } = req.query;
  const lim = parseInt(String(limit), 10) || 100;

  let query = 'SELECT * FROM audit_logs';
  const conditions: string[] = [];
  const params: unknown[] = [];

  // Scoping: Staff cannot modify audit and sees only their actions
  if (!isAdminAny(req.user)) {
    conditions.push('actor_id = ?');
    params.push(req.user!.id);
  }

  if (entityType) {
    conditions.push('entity_type = ?');
    params.push(entityType);
  }
  if (actorId && isMasterAdmin(req.user)) {
    conditions.push('actor_id = ?');
    params.push(actorId);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(lim);

  const logs = db.prepare(query).all(...params);
  res.json(logs);
});

apiRouter.get('/settings', requireAuth, (req: Request, res: Response) => {
  const settingsRows = db.prepare('SELECT * FROM company_settings').all() as Array<{ key: string; value_json: string }>;
  const settings: Record<string, any> = {};
  for (const row of settingsRows) {
    try {
      settings[row.key] = JSON.parse(row.value_json);
    } catch {
      settings[row.key] = row.value_json;
    }
  }
  res.json(settings);
});

apiRouter.post('/settings', requireAuth, requireMasterAdmin, (req: Request, res: Response) => {
  const { key, value } = req.body;
  if (!key || value === undefined) {
    return res.status(400).json({ error: 'Key and value are required.' });
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO company_settings (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), now);

  logAudit({
    actorId: req.user!.id,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'UPDATE_SETTINGS',
    entityType: 'company_settings',
    entityId: key,
    newValues: { key, value },
  });

  res.json({ success: true, message: 'Settings saved.' });
});

// Seed sample data on demand
apiRouter.post('/seed-sample-data', requireAuth, requireMasterAdmin, (req: Request, res: Response) => {
  try {
    seedComprehensiveDemoData(true);
    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'SEED_SAMPLE_DATA',
      entityType: 'system',
      entityId: 'sample-data',
      reason: 'User requested sample data generation',
    });
    res.json({ success: true, message: 'Comprehensive sample data seeded successfully for all modules.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to seed sample data: ' + err.message });
  }
});


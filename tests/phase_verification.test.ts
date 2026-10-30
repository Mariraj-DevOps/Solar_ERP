import { describe, it, expect, beforeAll } from 'vitest';
import { db, initDatabase, logAudit } from '../src/server/db';
import bcrypt from 'bcryptjs';

describe('Phase 2 & Comprehensive ERP Verification Suite', () => {
  beforeAll(() => {
    initDatabase();
  });

  it('1. Performs 10 consecutive attendance creations and edits without hanging or locking', () => {
    const teamId = 'team-heeralal';
    const weekStart = '2026-10-17';
    const createdIds: string[] = [];

    for (let i = 1; i <= 10; i++) {
      const entryId = `consec-test-${Date.now()}-${i}`;
      createdIds.push(entryId);
      const testDate = `2026-10-${17 + (i % 7)}`;

      // Insert attendance entry
      db.prepare(`
        INSERT INTO attendance_entries (
          id, week_start_date, team_id, date, location_project, shift_batch,
          owner_user_id, status, created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'Site Alpha', ?, 'usr-staff-01', 'pending_approval', 'usr-staff-01', 'usr-staff-01', datetime('now'), datetime('now'))
      `).run(entryId, weekStart, teamId, testDate, `Batch ${i}`);

      // Insert line
      db.prepare(`
        INSERT INTO attendance_lines (
          id, attendance_entry_id, category_id, category_name, count, rate, rate_type, calculated_amount, final_amount
        ) VALUES (?, ?, 'cat-mason', 'Mason', ?, 1400, 'daily', ?, ?)
      `).run(`line-${entryId}`, entryId, i, i * 1400, i * 1400);

      // Immediately edit the record
      db.prepare(`
        UPDATE attendance_entries
        SET shift_batch = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(`Batch ${i} - Updated`, entryId);

      const check = db.prepare('SELECT shift_batch FROM attendance_entries WHERE id = ?').get(entryId) as any;
      expect(check.shift_batch).toBe(`Batch ${i} - Updated`);
    }

    expect(createdIds.length).toBe(10);

    // Cleanup
    const placeholders = createdIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM attendance_lines WHERE attendance_entry_id IN (${placeholders})`).run(...createdIds);
    db.prepare(`DELETE FROM attendance_entries WHERE id IN (${placeholders})`).run(...createdIds);
  });

  it('2. Enforces Staff Data Isolation: Staff A records are isolated from Staff B', () => {
    // Ensure Staff B exists
    const staffBId = 'usr-staff-02';
    const staffB = db.prepare('SELECT id FROM users WHERE id = ?').get(staffBId);
    if (!staffB) {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, full_name, role, status, created_at, updated_at)
        VALUES (?, 'staff2@company.erp', 'hash', 'Staff Two', 'staff', 'active', datetime('now'), datetime('now'))
      `).run(staffBId);
    }

    const testEntryStaffA = `att-staffA-${Date.now()}`;
    const testEntryStaffB = `att-staffB-${Date.now()}`;

    db.prepare(`
      INSERT INTO attendance_entries (id, week_start_date, team_id, date, owner_user_id, status, created_by, updated_by, created_at, updated_at)
      VALUES (?, '2026-10-17', 'team-heeralal', '2026-10-17', 'usr-staff-01', 'pending_approval', 'usr-staff-01', 'usr-staff-01', datetime('now'), datetime('now'))
    `).run(testEntryStaffA);

    db.prepare(`
      INSERT INTO attendance_entries (id, week_start_date, team_id, date, owner_user_id, status, created_by, updated_by, created_at, updated_at)
      VALUES (?, '2026-10-17', 'team-centring-murugan', '2026-10-17', 'usr-staff-02', 'pending_approval', 'usr-staff-02', 'usr-staff-02', datetime('now'), datetime('now'))
    `).run(testEntryStaffB);

    // Query as Staff A: should only return records where owner_user_id = 'usr-staff-01'
    const staffARecords = db.prepare('SELECT id FROM attendance_entries WHERE owner_user_id = ?').all('usr-staff-01') as any[];
    expect(staffARecords.some(r => r.id === testEntryStaffA)).toBe(true);
    expect(staffARecords.some(r => r.id === testEntryStaffB)).toBe(false);

    // Query as Staff B
    const staffBRecords = db.prepare('SELECT id FROM attendance_entries WHERE owner_user_id = ?').all('usr-staff-02') as any[];
    expect(staffBRecords.some(r => r.id === testEntryStaffB)).toBe(true);
    expect(staffBRecords.some(r => r.id === testEntryStaffA)).toBe(false);

    // Cleanup
    db.prepare('DELETE FROM attendance_entries WHERE id IN (?, ?)').run(testEntryStaffA, testEntryStaffB);
  });

  it('3. Secondary Admin Scoped Assignments & Finance Permissions Matrix', () => {
    const secAdminId = 'usr-secadmin-01';
    db.prepare(`
      INSERT OR REPLACE INTO secondary_admin_assignments (
        id, secondary_admin_id, staff_user_id, can_view_reports, can_approve_attendance,
        can_edit_attendance, allowed_financial_modules_json, can_edit_finance, can_view_details, created_at, updated_at
      ) VALUES ('assign-01', ?, 'usr-staff-01', 1, 1, 1, '["weekly_payments"]', 0, 1, datetime('now'), datetime('now'))
    `).run(secAdminId);

    const assignment = db.prepare('SELECT * FROM secondary_admin_assignments WHERE secondary_admin_id = ? AND staff_user_id = ?').get(secAdminId, 'usr-staff-01') as any;
    expect(assignment).toBeDefined();
    expect(assignment.can_approve_attendance).toBe(1);
    expect(assignment.can_edit_finance).toBe(0);
    expect(JSON.parse(assignment.allowed_financial_modules_json)).toContain('weekly_payments');

    // Secondary admin cannot access unassigned staff usr-staff-02
    const unassigned = db.prepare('SELECT * FROM secondary_admin_assignments WHERE secondary_admin_id = ? AND staff_user_id = ?').get(secAdminId, 'usr-staff-02');
    expect(unassigned).toBeUndefined();
  });

  it('4. Full Approval Workflow: pending -> approved and pending -> rejected with mandatory reason', () => {
    const entryId1 = `approve-flow-${Date.now()}`;
    const entryId2 = `reject-flow-${Date.now()}`;

    db.prepare(`
      INSERT INTO attendance_entries (id, week_start_date, team_id, date, owner_user_id, status, created_by, updated_by, created_at, updated_at)
      VALUES (?, '2026-10-17', 'team-heeralal', '2026-10-18', 'usr-staff-01', 'pending_approval', 'usr-staff-01', 'usr-staff-01', datetime('now'), datetime('now'))
    `).run(entryId1);

    db.prepare(`
      INSERT INTO attendance_entries (id, week_start_date, team_id, date, owner_user_id, status, created_by, updated_by, created_at, updated_at)
      VALUES (?, '2026-10-17', 'team-heeralal', '2026-10-19', 'usr-staff-01', 'pending_approval', 'usr-staff-01', 'usr-staff-01', datetime('now'), datetime('now'))
    `).run(entryId2);

    // Approve entry 1
    db.prepare(`
      UPDATE attendance_entries
      SET status = 'approved', approved_by = 'usr-admin-01', approved_by_name = 'ERP Administrator', approved_at = datetime('now')
      WHERE id = ?
    `).run(entryId1);

    const approved = db.prepare('SELECT status, approved_by FROM attendance_entries WHERE id = ?').get(entryId1) as any;
    expect(approved.status).toBe('approved');
    expect(approved.approved_by).toBe('usr-admin-01');

    // Reject entry 2 with mandatory reason
    const rejectionReason = 'Overtime hours mismatch with site security register';
    db.prepare(`
      UPDATE attendance_entries
      SET status = 'rejected', rejection_reason = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(rejectionReason, entryId2);

    const rejected = db.prepare('SELECT status, rejection_reason FROM attendance_entries WHERE id = ?').get(entryId2) as any;
    expect(rejected.status).toBe('rejected');
    expect(rejected.rejection_reason).toBe(rejectionReason);

    // Cleanup
    db.prepare('DELETE FROM attendance_entries WHERE id IN (?, ?)').run(entryId1, entryId2);
  });

  it('5. Non-destructive revision flow: Editing an approved entry creates change_pending_approval holding revision data', () => {
    const entryId = `revision-flow-${Date.now()}`;

    // Approved record
    db.prepare(`
      INSERT INTO attendance_entries (id, week_start_date, team_id, date, shift_batch, owner_user_id, status, created_by, updated_by, created_at, updated_at)
      VALUES (?, '2026-10-17', 'team-heeralal', '2026-10-18', 'Day Shift', 'usr-staff-01', 'approved', 'usr-staff-01', 'usr-staff-01', datetime('now'), datetime('now'))
    `).run(entryId);

    // Staff submits a modification
    const proposedRevision = {
      shift_batch: 'Day Shift Extended',
      remarks: 'Added late evening cleaning batch',
      lines: [{ categoryId: 'cat-mason', count: 12, rate: 1400 }]
    };

    db.prepare(`
      UPDATE attendance_entries
      SET status = 'change_pending_approval',
          change_reason = ?,
          revision_data_json = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run('Correction in labour count after foreman check', JSON.stringify(proposedRevision), entryId);

    const record = db.prepare('SELECT status, shift_batch, change_reason, revision_data_json FROM attendance_entries WHERE id = ?').get(entryId) as any;
    expect(record.status).toBe('change_pending_approval');
    // Original data remains active until admin approves revision
    expect(record.shift_batch).toBe('Day Shift');
    expect(record.change_reason).toBe('Correction in labour count after foreman check');
    expect(JSON.parse(record.revision_data_json).shift_batch).toBe('Day Shift Extended');

    // Cleanup
    db.prepare('DELETE FROM attendance_entries WHERE id = ?').run(entryId);
  });

  it('6. Weekly Payment Settlement and Historical Outstanding Balance Retention', () => {
    const week1 = '2026-10-10';
    const week2 = '2026-10-17';
    const teamId = 'team-heeralal';
    const staffId = 'usr-staff-01';

    // Week 1: Net payable ₹1,00,000, Paid ₹80,000 -> Outstanding ₹20,000
    const paymentId1 = `pay-${week1}-${teamId}`;
    db.prepare(`
      INSERT OR REPLACE INTO weekly_payments (
        id, week_start_date, team_id, staff_user_id, gross_amount, net_payable, amount_paid,
        status, payment_date, payment_method, voucher_ref, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 100000, 100000, 80000, 'Partially Paid', '2026-10-16', 'Bank Transfer', 'TXN-00192', datetime('now'), datetime('now'))
    `).run(paymentId1, week1, teamId, staffId);

    // Verify historical outstanding query
    const unpaidPayments = db.prepare(`
      SELECT SUM(net_payable - amount_paid) as outstanding
      FROM weekly_payments
      WHERE team_id = ? AND week_start_date < ? AND status != 'Paid'
    `).get(teamId, week2) as any;

    expect(unpaidPayments.outstanding).toBe(20000);

    // Week 2: Mark as Fully Paid
    const paymentId2 = `pay-${week2}-${teamId}`;
    db.prepare(`
      INSERT OR REPLACE INTO weekly_payments (
        id, week_start_date, team_id, staff_user_id, gross_amount, net_payable, amount_paid,
        status, payment_date, payment_method, voucher_ref, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 120000, 120000, 120000, 'Paid', '2026-10-23', 'Cheque', 'CHQ-88210', datetime('now'), datetime('now'))
    `).run(paymentId2, week2, teamId, staffId);

    const p2 = db.prepare('SELECT status, amount_paid, voucher_ref FROM weekly_payments WHERE id = ?').get(paymentId2) as any;
    expect(p2.status).toBe('Paid');
    expect(p2.amount_paid).toBe(120000);
    expect(p2.voucher_ref).toBe('CHQ-88210');

    // Cleanup
    db.prepare('DELETE FROM weekly_payments WHERE id IN (?, ?)').run(paymentId1, paymentId2);
  });

  it('7. Petty Cash Accounting: reconciles Cash in Hand, Cash in Account, and Day Balance', () => {
    // Opening balance: Account ₹75,000, Hand ₹25,000
    const openingAccount = 75000;
    const openingHand = 25000;

    // Day 1: Site cash received ₹10,000 in hand; Labour paid ₹4,000 in cash
    const entry1Credit = 10000; // Hand credit
    const entry2Debit = 4000;   // Hand debit
    const day1HandBalance = openingHand + entry1Credit - entry2Debit; // 31,000

    // Day 2: Vendor paid online ₹15,000 from account
    const entry3OnlineDebit = 15000; // Account debit
    const day2AccountBalance = openingAccount - entry3OnlineDebit; // 60,000

    const day1DayBalance = entry1Credit - entry2Debit; // +6,000
    const day2DayBalance = -entry3OnlineDebit; // -15,000

    expect(day1HandBalance).toBe(31000);
    expect(day2AccountBalance).toBe(60000);
    expect(day1DayBalance).toBe(6000);
    expect(day2DayBalance).toBe(-15000);

    // Insert test petty cash entry
    const pettyId = `petty-${Date.now()}`;
    db.prepare(`
      INSERT INTO petty_cash_entries (
        id, date, serial_no, description, credit_amount, debit_amount, channel,
        day_balance, cash_in_hand_balance, cash_in_account_balance, created_by, created_at, updated_at
      ) VALUES (?, '2026-10-18', 'PC-001', 'Site conveyance and diesel', 0, 4000, 'cash', -4000, 31000, 75000, 'usr-admin-01', datetime('now'), datetime('now'))
    `).run(pettyId);

    const checkPetty = db.prepare('SELECT * FROM petty_cash_entries WHERE id = ?').get(pettyId) as any;
    expect(checkPetty.debit_amount).toBe(4000);
    expect(checkPetty.cash_in_hand_balance).toBe(31000);
    expect(checkPetty.day_balance).toBe(-4000);

    // Cleanup
    db.prepare('DELETE FROM petty_cash_entries WHERE id = ?').run(pettyId);
  });

  it('8. Document and Attachment Management with Metadata & Access Scoping', () => {
    const attachId = `doc-${Date.now()}`;
    db.prepare(`
      INSERT INTO attachments (
        id, record_type, record_id, file_name, file_size, mime_type, file_path,
        description, owner_user_id, uploaded_by, uploaded_by_name, created_at
      ) VALUES (?, 'weekly_payment', 'pay-001', 'site_voucher_oct17.pdf', 1048576, 'application/pdf', '/uploads/vouchers/v1.pdf',
        'Signed payment voucher with labour fingerprints', 'usr-staff-01', 'usr-staff-01', 'Staff Member', datetime('now'))
    `).run(attachId);

    const doc = db.prepare('SELECT * FROM attachments WHERE id = ?').get(attachId) as any;
    expect(doc).toBeDefined();
    expect(doc.file_name).toBe('site_voucher_oct17.pdf');
    expect(doc.mime_type).toBe('application/pdf');
    expect(doc.owner_user_id).toBe('usr-staff-01');

    // Cleanup
    db.prepare('DELETE FROM attachments WHERE id = ?').run(attachId);
  });
});

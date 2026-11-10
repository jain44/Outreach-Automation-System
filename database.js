const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_FILE = path.join(__dirname, 'leads.db');
const LEADS_JSON = path.join(__dirname, 'leads.json');

// Initialize database
const db = new DatabaseSync(DB_FILE);

// Set WAL mode or normal pragmas for fast performance and reliability
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    businessName TEXT NOT NULL,
    category TEXT,
    contactPerson TEXT,
    phone TEXT,
    email TEXT,
    city TEXT,
    address TEXT,
    rating REAL DEFAULT 4.8,
    reviewsCount INTEGER DEFAULT 0,
    stage TEXT DEFAULT 'new',
    offeredProduct TEXT,
    nextFollowUp TEXT,
    notes TEXT,
    mapsUrl TEXT,
    lastContactDate TEXT,
    createdAt TEXT,
    updatedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT,
    categoryMatch TEXT,
    channel TEXT,
    subject TEXT,
    body TEXT,
    updatedAt TEXT
  );
`);

// Prepared statements for Leads
const stmtGetAllLeads = db.prepare('SELECT * FROM leads ORDER BY rowid DESC');
const stmtGetLeadById = db.prepare('SELECT * FROM leads WHERE id = ?');
const stmtDeleteLead = db.prepare('DELETE FROM leads WHERE id = ?');
const stmtClearAllLeads = db.prepare('DELETE FROM leads');

const stmtUpsertLead = db.prepare(`
  INSERT INTO leads (
    id, businessName, category, contactPerson, phone, email, city, address,
    rating, reviewsCount, stage, offeredProduct, nextFollowUp, notes, mapsUrl,
    lastContactDate, createdAt, updatedAt
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?
  )
  ON CONFLICT(id) DO UPDATE SET
    businessName = excluded.businessName,
    category = excluded.category,
    contactPerson = excluded.contactPerson,
    phone = excluded.phone,
    email = excluded.email,
    city = excluded.city,
    address = excluded.address,
    rating = excluded.rating,
    reviewsCount = excluded.reviewsCount,
    stage = excluded.stage,
    offeredProduct = excluded.offeredProduct,
    nextFollowUp = excluded.nextFollowUp,
    notes = excluded.notes,
    mapsUrl = excluded.mapsUrl,
    lastContactDate = excluded.lastContactDate,
    updatedAt = excluded.updatedAt
`);

// Prepared statements for Templates
const stmtGetAllTemplates = db.prepare('SELECT * FROM templates');
const stmtClearAllTemplates = db.prepare('DELETE FROM templates');
const stmtUpsertTemplate = db.prepare(`
  INSERT INTO templates (id, name, categoryMatch, channel, subject, body, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    categoryMatch = excluded.categoryMatch,
    channel = excluded.channel,
    subject = excluded.subject,
    body = excluded.body,
    updatedAt = excluded.updatedAt
`);

function backupToJsonFile() {
  try {
    const all = stmtGetAllLeads.all();
    fs.writeFileSync(LEADS_JSON, JSON.stringify(all, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write JSON backup', err);
  }
}

function getAllLeads() {
  return stmtGetAllLeads.all();
}

function getLeadById(id) {
  return stmtGetLeadById.get(id);
}

function upsertLead(l) {
  const now = new Date().toISOString();
  stmtUpsertLead.run(
    l.id || ('lead_' + Date.now()),
    l.businessName || 'Unnamed Business',
    l.category || 'General Business',
    l.contactPerson || 'Business Owner / Director',
    l.phone || '',
    l.email || '',
    l.city || 'Local Area',
    l.address || '',
    Number(l.rating) || 4.8,
    Number(l.reviewsCount) || 0,
    l.stage || 'new',
    l.offeredProduct || 'Custom Software & Automation',
    l.nextFollowUp || '',
    l.notes || '',
    l.mapsUrl || '',
    l.lastContactDate || '',
    l.createdAt || now.split('T')[0],
    now
  );
  backupToJsonFile();
  return getLeadById(l.id);
}

function saveAllLeads(leadsArray) {
  if (!Array.isArray(leadsArray)) return [];
  const now = new Date().toISOString();

  // Clear existing and insert in a single transaction
  stmtClearAllLeads.run();
  for (const l of leadsArray) {
    stmtUpsertLead.run(
      l.id || ('lead_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6)),
      l.businessName || 'Unnamed Business',
      l.category || 'General Business',
      l.contactPerson || 'Business Owner / Director',
      l.phone || '',
      l.email || '',
      l.city || 'Local Area',
      l.address || '',
      Number(l.rating) || 4.8,
      Number(l.reviewsCount) || 0,
      l.stage || 'new',
      l.offeredProduct || 'Custom Software & Automation',
      l.nextFollowUp || '',
      l.notes || '',
      l.mapsUrl || '',
      l.lastContactDate || '',
      l.createdAt || now.split('T')[0],
      now
    );
  }
  backupToJsonFile();
  return stmtGetAllLeads.all();
}

function deleteLead(id) {
  stmtDeleteLead.run(id);
  backupToJsonFile();
  return { success: true, id };
}

function clearAllLeads() {
  stmtClearAllLeads.run();
  backupToJsonFile();
  return { success: true };
}

// Templates operations
function getAllTemplates() {
  return stmtGetAllTemplates.all();
}

function saveAllTemplates(templatesArray) {
  if (!Array.isArray(templatesArray)) return [];
  const now = new Date().toISOString();
  stmtClearAllTemplates.run();
  for (const t of templatesArray) {
    stmtUpsertTemplate.run(
      t.id,
      t.name || 'Custom Template',
      t.categoryMatch || 'Other',
      t.channel || 'whatsapp',
      t.subject || '',
      t.body || '',
      now
    );
  }
  return stmtGetAllTemplates.all();
}

// Auto seed templates if empty or missing new categories
function initDatabase() {
  try {
    const sampleDataPath = path.join(__dirname, 'sampleData.js');
    if (fs.existsSync(sampleDataPath)) {
      const content = fs.readFileSync(sampleDataPath, 'utf-8');
      const match = content.match(/const\s+DEFAULT_TEMPLATES\s*=\s*(\[[\s\S]*?\]);/);
      if (match) {
        const templates = eval(match[1]);
        if (Array.isArray(templates)) {
          const tplCount = db.prepare('SELECT COUNT(*) as count FROM templates').get();
          if (!tplCount || tplCount.count < templates.length) {
            saveAllTemplates(templates);
            console.log(`✅ Seeded ${templates.length} industry-specific templates into SQLite database.`);
          }
        }
      }
    }
  } catch (e) {
    console.warn('Could not seed default templates:', e.message);
  }

  // Check if leads table is empty but leads.json has data
  const leadCount = db.prepare('SELECT COUNT(*) as count FROM leads').get();
  if (leadCount && leadCount.count === 0 && fs.existsSync(LEADS_JSON)) {
    try {
      const raw = fs.readFileSync(LEADS_JSON, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        saveAllLeads(parsed);
        console.log(`✅ Migrated ${parsed.length} leads from leads.json into SQLite database.`);
      }
    } catch (_) {}
  }
}

initDatabase();

module.exports = {
  db,
  DB_FILE,
  getAllLeads,
  getLeadById,
  upsertLead,
  saveAllLeads,
  deleteLead,
  clearAllLeads,
  getAllTemplates,
  saveAllTemplates
};

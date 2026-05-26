const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const db = require('./database');
const analysis = require('./analysis');

const app = express();
app.use(cors());
app.use(express.json());

// Because we'll use Netlify redirects (/api/* -> /.netlify/functions/api/:splat)
// the base route here corresponds to whatever comes after /api.
// Actually, it's safer to just handle the full paths, or just use a router
const router = express.Router();

router.get('/health', async (req, res) => {
  res.json({ status: "healthy", db: process.env.DATABASE_URL ? "configured" : "missing" });
});

router.get('/v1/questions', async (req, res) => {
  try {
    const q = await db.getQuestionsFromDb();
    res.json(q);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/v1/sessions', async (req, res) => {
  try {
    const { session_id, student_name, student_grade, student_section } = req.body;
    await db.createSession(session_id, student_name, student_grade, student_section);
    res.json({ status: "success" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/v1/responses/submit', async (req, res) => {
  try {
    const { session_id, answers } = req.body;
    if (!session_id || !answers) {
      return res.status(400).json({ error: "Missing session_id or answers" });
    }
    for (const [qId, ansText] of Object.entries(answers)) {
      await db.saveResponse(session_id, parseInt(qId), ansText);
    }
    await db.completeSession(session_id);
    res.json({ status: "success" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/v1/analytics', async (req, res) => {
  try {
    const grade = req.query.grade ? parseInt(req.query.grade) : null;
    const section = req.query.section || null;
    
    const count = await db.getCompletedSessionsCount(grade, section);
    const responses = await db.getAllCompletedResponses(grade, section);
    const questions = await db.getQuestionsFromDb();
    
    const quant = analysis.analyzeQuantitative(responses, questions);
    const qual = analysis.analyzeQualitative(responses, questions);
    
    res.json({
      total_completed: count,
      quantitative: quant,
      qualitative: qual
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/v1/submissions', async (req, res) => {
  try {
    const grade = req.query.grade ? parseInt(req.query.grade) : null;
    const section = req.query.section || null;
    
    const submissions = await db.getDetailedSubmissions(grade, section);
    res.json(submissions);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Use the router
app.use('/api', router);
app.use('/', router);

// Initialize DB safely on boot
db.initDb().catch(console.error);

// Add basePath to handle Netlify's endpoint routing correctly
module.exports.handler = serverless(app, { basePath: '/.netlify/functions/api' });
